-- ==============================================================================
-- VENDOSMITH PHASE 3.1 ADMIN OPERATIONS & MEMBERSHIP PLAN MANAGER MIGRATION
-- File: 20260928010000_phase3_1_admin_bank_and_plans.sql
-- Description:
--   1. Creates public.finance_audit_logs for immutable financial & compliance tracking.
--   2. Updates public.seller_bank_accounts:
--      - Adds correction_reason and admin_notes columns.
--      - Updates status constraint to include 'correction_required'.
--   3. Upgrades public.marketplace_fee_rules:
--      - Adds display_name, description, active, max_products, storage_limit_mb,
--        admin_users_limit, seller_coupons_enabled, bulk_csv_enabled,
--        ranking_boost_level, billing_duration, grace_period_days, updated_by.
--      - Seeds authoritative values for BASIC, PRO, BUSINESS.
--   4. Hardens and upgrades verify_seller_bank_account RPC for APPROVE/CORRECTION/REJECT.
--   5. Upgrades get_seller_bank_accounts to expose correction reasons & admin notes to seller.
--   6. Adds admin_get_all_bank_accounts RPC for secure verification center list.
--   7. Adds admin_update_membership_plan RPC with audit logging and financial bounds checking.
--   8. Connects activate_seller_membership_subscription to live marketplace_fee_rules.
-- ==============================================================================

-- 1. FINANCE AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.finance_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.profiles(id),
    action_type TEXT NOT NULL,
    target_entity TEXT NOT NULL,
    target_id UUID,
    old_values JSONB,
    new_values JSONB,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_audit_actor ON public.finance_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_finance_audit_action ON public.finance_audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_finance_audit_target ON public.finance_audit_logs(target_entity, target_id);
CREATE INDEX IF NOT EXISTS idx_finance_audit_created ON public.finance_audit_logs(created_at DESC);

ALTER TABLE public.finance_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view finance audit logs" ON public.finance_audit_logs;
CREATE POLICY "Admins can view finance audit logs" 
ON public.finance_audit_logs 
FOR SELECT 
USING (public.is_admin());

DROP POLICY IF EXISTS "Admins and service_role can insert finance audit logs" ON public.finance_audit_logs;
CREATE POLICY "Admins and service_role can insert finance audit logs" 
ON public.finance_audit_logs 
FOR INSERT 
WITH CHECK (public.is_admin() OR auth.role() = 'service_role');


-- 2. UPDATE SELLER_BANK_ACCOUNTS TABLE
ALTER TABLE public.seller_bank_accounts
ADD COLUMN IF NOT EXISTS correction_reason TEXT,
ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- Update status constraint to include 'correction_required'
DO $$
BEGIN
    ALTER TABLE public.seller_bank_accounts 
    DROP CONSTRAINT IF EXISTS seller_bank_accounts_status_check;

    ALTER TABLE public.seller_bank_accounts 
    ADD CONSTRAINT seller_bank_accounts_status_check 
    CHECK (status IN ('pending', 'verified', 'rejected', 'archived', 'correction_required'));
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;


-- 3. UPGRADE MARKETPLACE_FEE_RULES TABLE
ALTER TABLE public.marketplace_fee_rules
ADD COLUMN IF NOT EXISTS display_name TEXT,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS max_products INT,
ADD COLUMN IF NOT EXISTS storage_limit_mb INT NOT NULL DEFAULT 500,
ADD COLUMN IF NOT EXISTS admin_users_limit INT DEFAULT 1,
ADD COLUMN IF NOT EXISTS seller_coupons_enabled BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS bulk_csv_enabled BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS ranking_boost_level TEXT NOT NULL DEFAULT 'Standard',
ADD COLUMN IF NOT EXISTS billing_duration TEXT NOT NULL DEFAULT 'Monthly / Yearly',
ADD COLUMN IF NOT EXISTS grace_period_days INT NOT NULL DEFAULT 7,
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id);

-- Backfill initial metadata for launch plans
UPDATE public.marketplace_fee_rules
SET display_name = 'Basic Starter',
    description = 'Essential toolkit for new sellers starting their eCommerce venture. Zero upfront costs.',
    active = true,
    max_products = 10,
    storage_limit_mb = 500,
    admin_users_limit = 1,
    seller_coupons_enabled = false,
    bulk_csv_enabled = false,
    ranking_boost_level = 'Standard',
    billing_duration = 'Free Lifetime',
    grace_period_days = 7
WHERE membership_plan = 'BASIC' AND (display_name IS NULL OR display_name = '');

UPDATE public.marketplace_fee_rules
SET display_name = 'Professional Growth',
    description = 'Ideal for scaling brands requiring unlimited product catalog, bulk tools, and lower commission.',
    active = true,
    max_products = NULL,
    storage_limit_mb = 10240, -- 10 GB
    admin_users_limit = 5,
    seller_coupons_enabled = true,
    bulk_csv_enabled = true,
    ranking_boost_level = 'High',
    billing_duration = 'Monthly / Yearly',
    grace_period_days = 7
WHERE membership_plan = 'PRO' AND (display_name IS NULL OR display_name = '');

UPDATE public.marketplace_fee_rules
SET display_name = 'Enterprise Business',
    description = 'Maximum performance tier offering our lowest 5% commission rate, dedicated support, and top ranking boost.',
    active = true,
    max_products = NULL,
    storage_limit_mb = 102400, -- 100 GB
    admin_users_limit = NULL,
    seller_coupons_enabled = true,
    bulk_csv_enabled = true,
    ranking_boost_level = 'Priority Boost',
    billing_duration = 'Monthly / Yearly',
    grace_period_days = 7
WHERE membership_plan = 'BUSINESS' AND (display_name IS NULL OR display_name = '');


-- 4. HARDENED RPC: VERIFY / RETURN FOR CORRECTION / REJECT BANK ACCOUNT
DROP FUNCTION IF EXISTS public.verify_seller_bank_account(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.verify_seller_bank_account(UUID, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.verify_seller_bank_account(
    p_account_id UUID,
    p_action TEXT,
    p_reason TEXT DEFAULT NULL,
    p_admin_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_account RECORD;
    v_action TEXT;
    v_actor_id UUID;
    v_previous_primary UUID;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only marketplace administrators can verify or reject bank accounts' 
        USING ERRCODE = '42501';
    END IF;

    v_actor_id := auth.uid();
    v_action := UPPER(TRIM(p_action));

    -- Acquire row lock
    SELECT * INTO v_account 
    FROM public.seller_bank_accounts 
    WHERE id = p_account_id 
    FOR UPDATE;

    IF v_account IS NULL THEN
        RAISE EXCEPTION 'Bank account not found' USING ERRCODE = 'P0002';
    END IF;

    -- Action: APPROVE / VERIFY
    IF v_action IN ('VERIFY', 'APPROVE') THEN
        -- Find previous verified primary account if any
        SELECT id INTO v_previous_primary
        FROM public.seller_bank_accounts
        WHERE seller_id = v_account.seller_id
          AND id != p_account_id
          AND status = 'verified'
          AND is_primary = true
        LIMIT 1;

        -- 1. Atomically archive existing verified primary accounts
        UPDATE public.seller_bank_accounts
        SET is_primary = false,
            status = 'archived',
            updated_at = NOW()
        WHERE seller_id = v_account.seller_id 
          AND id != p_account_id 
          AND status = 'verified';

        -- 2. Mark this account verified & primary
        UPDATE public.seller_bank_accounts
        SET status = 'verified',
            is_primary = true,
            verified_at = NOW(),
            verified_by = v_actor_id,
            rejection_reason = NULL,
            correction_reason = NULL,
            admin_notes = COALESCE(p_admin_note, admin_notes),
            updated_at = NOW()
        WHERE id = p_account_id;

        -- 3. Immutable audit log
        INSERT INTO public.finance_audit_logs (
            actor_id, action_type, target_entity, target_id, old_values, new_values, notes
        ) VALUES (
            v_actor_id,
            'BANK_ACCOUNT_VERIFIED',
            'seller_bank_accounts',
            p_account_id,
            jsonb_build_object(
                'status', v_account.status,
                'is_primary', v_account.is_primary,
                'archived_previous_account_id', v_previous_primary
            ),
            jsonb_build_object(
                'status', 'verified',
                'is_primary', true,
                'bank_name', v_account.bank_name,
                'last4', v_account.account_number_last4
            ),
            COALESCE(p_admin_note, 'Bank account verified and set as primary payout destination')
        );

        -- 4. In-app notification to seller
        BEGIN
            INSERT INTO public.seller_notifications (
                seller_id, title, message, type, priority, link_url
            ) VALUES (
                v_account.seller_id,
                'Bank Account Verified',
                'Your bank account (' || v_account.bank_name || ' ending in ' || v_account.account_number_last4 || ') has been verified and set as your primary payout account.',
                'system',
                'high',
                '/seller/bank-account'
            );
        EXCEPTION WHEN OTHERS THEN
            NULL; -- Keep bank verification atomic even if notification table structure differs
        END;

        RETURN jsonb_build_object(
            'success', true,
            'action', 'APPROVE',
            'status', 'verified',
            'is_primary', true,
            'archived_previous_account_id', v_previous_primary
        );

    -- Action: RETURN FOR CORRECTION
    ELSIF v_action IN ('RETURN_FOR_CORRECTION', 'CORRECTION') THEN
        IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
            RAISE EXCEPTION 'A correction reason is required when returning bank account for correction' 
            USING ERRCODE = '22000';
        END IF;

        UPDATE public.seller_bank_accounts
        SET status = 'correction_required',
            is_primary = false,
            correction_reason = TRIM(p_reason),
            admin_notes = COALESCE(p_admin_note, admin_notes),
            updated_at = NOW()
        WHERE id = p_account_id;

        -- Immutable audit log
        INSERT INTO public.finance_audit_logs (
            actor_id, action_type, target_entity, target_id, old_values, new_values, notes
        ) VALUES (
            v_actor_id,
            'BANK_ACCOUNT_RETURNED_FOR_CORRECTION',
            'seller_bank_accounts',
            p_account_id,
            jsonb_build_object('status', v_account.status),
            jsonb_build_object('status', 'correction_required', 'reason', p_reason),
            p_admin_note
        );

        -- In-app notification to seller
        BEGIN
            INSERT INTO public.seller_notifications (
                seller_id, title, message, type, priority, link_url
            ) VALUES (
                v_account.seller_id,
                'Bank Account Correction Required',
                'Action Required: Your bank account details need correction. Reason: ' || TRIM(p_reason) || '. Please review and resubmit.',
                'system',
                'high',
                '/seller/bank-account'
            );
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;

        RETURN jsonb_build_object(
            'success', true,
            'action', 'RETURN_FOR_CORRECTION',
            'status', 'correction_required',
            'reason', p_reason
        );

    -- Action: REJECT
    ELSIF v_action = 'REJECT' THEN
        IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
            RAISE EXCEPTION 'A rejection reason is required when rejecting a bank account' 
            USING ERRCODE = '22000';
        END IF;

        UPDATE public.seller_bank_accounts
        SET status = 'rejected',
            is_primary = false,
            rejection_reason = TRIM(p_reason),
            admin_notes = COALESCE(p_admin_note, admin_notes),
            updated_at = NOW()
        WHERE id = p_account_id;

        -- Immutable audit log
        INSERT INTO public.finance_audit_logs (
            actor_id, action_type, target_entity, target_id, old_values, new_values, notes
        ) VALUES (
            v_actor_id,
            'BANK_ACCOUNT_REJECTED',
            'seller_bank_accounts',
            p_account_id,
            jsonb_build_object('status', v_account.status),
            jsonb_build_object('status', 'rejected', 'reason', p_reason),
            p_admin_note
        );

        -- In-app notification to seller
        BEGIN
            INSERT INTO public.seller_notifications (
                seller_id, title, message, type, priority, link_url
            ) VALUES (
                v_account.seller_id,
                'Bank Account Verification Rejected',
                'Your bank account submission was rejected. Reason: ' || TRIM(p_reason) || '. You may submit an updated account anytime.',
                'system',
                'high',
                '/seller/bank-account'
            );
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;

        RETURN jsonb_build_object(
            'success', true,
            'action', 'REJECT',
            'status', 'rejected',
            'reason', p_reason
        );

    ELSE
        RAISE EXCEPTION 'Invalid action. Must be APPROVE, RETURN_FOR_CORRECTION, or REJECT' USING ERRCODE = '22000';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_seller_bank_account(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_seller_bank_account(UUID, TEXT, TEXT, TEXT) TO authenticated;


-- 5. UPGRADED RPC: GET SELLER BANK ACCOUNTS (MASKED VIEW)
DROP FUNCTION IF EXISTS public.get_seller_bank_accounts();
CREATE OR REPLACE FUNCTION public.get_seller_bank_accounts()
RETURNS TABLE (
    id UUID,
    account_holder_name TEXT,
    bank_name TEXT,
    branch_name TEXT,
    ifsc_code TEXT,
    account_number_last4 TEXT,
    account_type TEXT,
    is_primary BOOLEAN,
    status TEXT,
    rejection_reason TEXT,
    correction_reason TEXT,
    admin_notes TEXT,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_seller_id UUID;
BEGIN
    v_seller_id := auth.uid();
    IF v_seller_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT 
        sba.id,
        sba.account_holder_name,
        sba.bank_name,
        sba.branch_name,
        sba.ifsc_code,
        sba.account_number_last4,
        sba.account_type,
        sba.is_primary,
        sba.status,
        sba.rejection_reason,
        sba.correction_reason,
        sba.admin_notes,
        sba.verified_at,
        sba.created_at
    FROM public.seller_bank_accounts sba
    WHERE sba.seller_id = v_seller_id
    ORDER BY sba.is_primary DESC, sba.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_seller_bank_accounts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_seller_bank_accounts() TO authenticated;


-- 6. SECURE RPC: ADMIN GET ALL BANK ACCOUNTS (WITH SELLER & STORE DETAILS)
DROP FUNCTION IF EXISTS public.admin_get_all_bank_accounts();
CREATE OR REPLACE FUNCTION public.admin_get_all_bank_accounts()
RETURNS TABLE (
    id UUID,
    seller_id UUID,
    seller_business_name TEXT,
    seller_contact_name TEXT,
    seller_email TEXT,
    store_id UUID,
    store_name TEXT,
    store_slug TEXT,
    account_holder_name TEXT,
    bank_name TEXT,
    branch_name TEXT,
    ifsc_code TEXT,
    account_number_last4 TEXT,
    account_type TEXT,
    is_primary BOOLEAN,
    status TEXT,
    rejection_reason TEXT,
    correction_reason TEXT,
    admin_notes TEXT,
    verified_at TIMESTAMPTZ,
    verified_by UUID,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only marketplace administrators can inspect all bank accounts' 
        USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT 
        sba.id,
        sba.seller_id,
        sp.business_name AS seller_business_name,
        sp.contact_name AS seller_contact_name,
        sp.business_email AS seller_email,
        st.id AS store_id,
        st.name AS store_name,
        st.slug AS store_slug,
        sba.account_holder_name,
        sba.bank_name,
        sba.branch_name,
        sba.ifsc_code,
        sba.account_number_last4,
        sba.account_type,
        sba.is_primary,
        sba.status,
        sba.rejection_reason,
        sba.correction_reason,
        sba.admin_notes,
        sba.verified_at,
        sba.verified_by,
        sba.created_at,
        sba.updated_at
    FROM public.seller_bank_accounts sba
    JOIN public.seller_profiles sp ON sp.id = sba.seller_id
    LEFT JOIN LATERAL (
        SELECT s.id, s.name, s.slug 
        FROM public.stores s 
        WHERE s.seller_id = sp.id 
        ORDER BY s.created_at ASC 
        LIMIT 1
    ) st ON true
    ORDER BY 
        CASE 
            WHEN sba.status = 'pending' THEN 1
            WHEN sba.status = 'correction_required' THEN 2
            WHEN sba.status = 'verified' THEN 3
            ELSE 4
        END,
        sba.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_all_bank_accounts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_all_bank_accounts() TO authenticated;


-- 7. SECURE RPC: ADMIN UPDATE MEMBERSHIP PLAN (WITH VALIDATION & AUDIT)
DROP FUNCTION IF EXISTS public.admin_update_membership_plan(
    TEXT, TEXT, TEXT, BOOLEAN, NUMERIC, NUMERIC, INT, INT, INT, BOOLEAN, BOOLEAN, TEXT, NUMERIC, TEXT, INT, NUMERIC, INT, NUMERIC, NUMERIC, NUMERIC
);
CREATE OR REPLACE FUNCTION public.admin_update_membership_plan(
    p_plan TEXT,
    p_display_name TEXT,
    p_description TEXT,
    p_active BOOLEAN,
    p_monthly_price NUMERIC,
    p_yearly_price NUMERIC,
    p_max_products INT,
    p_storage_limit_mb INT,
    p_admin_users_limit INT,
    p_seller_coupons_enabled BOOLEAN,
    p_bulk_csv_enabled BOOLEAN,
    p_ranking_boost_level TEXT,
    p_commission_rate NUMERIC,
    p_billing_duration TEXT,
    p_grace_period_days INT,
    p_min_payout_amount NUMERIC,
    p_escrow_hold_days INT,
    p_gst_rate NUMERIC,
    p_tcs_rate NUMERIC,
    p_tds_rate NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_old RECORD;
    v_actor_id UUID;
    v_target_plan TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only marketplace administrators can modify membership plan rules' 
        USING ERRCODE = '42501';
    END IF;

    v_actor_id := auth.uid();
    v_target_plan := UPPER(TRIM(p_plan));

    -- Lock row
    SELECT * INTO v_old
    FROM public.marketplace_fee_rules
    WHERE membership_plan = v_target_plan
    FOR UPDATE;

    IF v_old IS NULL THEN
        RAISE EXCEPTION 'Membership plan rule for % not found', v_target_plan USING ERRCODE = 'P0002';
    END IF;

    -- Strict validation bounds
    IF p_monthly_price < 0 OR p_yearly_price < 0 THEN
        RAISE EXCEPTION 'Pricing cannot be negative' USING ERRCODE = '22000';
    END IF;
    IF p_commission_rate < 0 OR p_commission_rate > 1 THEN
        RAISE EXCEPTION 'Commission rate must be between 0.00 and 1.00 (e.g. 0.08 for 8%%)' USING ERRCODE = '22000';
    END IF;
    IF p_gst_rate < 0 OR p_gst_rate > 1 THEN
        RAISE EXCEPTION 'GST rate must be between 0.00 and 1.00' USING ERRCODE = '22000';
    END IF;
    IF p_tcs_rate < 0 OR p_tcs_rate > 1 THEN
        RAISE EXCEPTION 'TCS rate must be between 0.00 and 1.00' USING ERRCODE = '22000';
    END IF;
    IF p_tds_rate < 0 OR p_tds_rate > 1 THEN
        RAISE EXCEPTION 'TDS rate must be between 0.00 and 1.00' USING ERRCODE = '22000';
    END IF;
    IF p_min_payout_amount < 0 THEN
        RAISE EXCEPTION 'Minimum payout amount cannot be negative' USING ERRCODE = '22000';
    END IF;
    IF p_escrow_hold_days < 0 THEN
        RAISE EXCEPTION 'Escrow hold days cannot be negative' USING ERRCODE = '22000';
    END IF;
    IF p_grace_period_days < 0 THEN
        RAISE EXCEPTION 'Grace period days cannot be negative' USING ERRCODE = '22000';
    END IF;

    -- Apply update
    UPDATE public.marketplace_fee_rules
    SET display_name = TRIM(p_display_name),
        description = TRIM(p_description),
        active = COALESCE(p_active, true),
        monthly_price = p_monthly_price,
        yearly_price = p_yearly_price,
        max_products = p_max_products,
        storage_limit_mb = p_storage_limit_mb,
        admin_users_limit = p_admin_users_limit,
        seller_coupons_enabled = p_seller_coupons_enabled,
        bulk_csv_enabled = p_bulk_csv_enabled,
        ranking_boost_level = TRIM(p_ranking_boost_level),
        commission_rate = p_commission_rate,
        billing_duration = TRIM(p_billing_duration),
        grace_period_days = p_grace_period_days,
        min_payout_amount = p_min_payout_amount,
        escrow_hold_days = p_escrow_hold_days,
        gst_rate = p_gst_rate,
        tcs_rate = p_tcs_rate,
        tds_rate = p_tds_rate,
        updated_by = v_actor_id,
        updated_at = NOW()
    WHERE membership_plan = v_target_plan;

    -- Create audit log
    INSERT INTO public.finance_audit_logs (
        actor_id,
        action_type,
        target_entity,
        target_id,
        old_values,
        new_values,
        notes
    ) VALUES (
        v_actor_id,
        'MEMBERSHIP_PLAN_UPDATED',
        'marketplace_fee_rules',
        v_old.id,
        to_jsonb(v_old),
        jsonb_build_object(
            'membership_plan', v_target_plan,
            'display_name', p_display_name,
            'monthly_price', p_monthly_price,
            'yearly_price', p_yearly_price,
            'max_products', p_max_products,
            'storage_limit_mb', p_storage_limit_mb,
            'admin_users_limit', p_admin_users_limit,
            'seller_coupons_enabled', p_seller_coupons_enabled,
            'bulk_csv_enabled', p_bulk_csv_enabled,
            'ranking_boost_level', p_ranking_boost_level,
            'commission_rate', p_commission_rate,
            'billing_duration', p_billing_duration,
            'grace_period_days', p_grace_period_days,
            'min_payout_amount', p_min_payout_amount,
            'escrow_hold_days', p_escrow_hold_days,
            'gst_rate', p_gst_rate,
            'tcs_rate', p_tcs_rate,
            'tds_rate', p_tds_rate,
            'active', p_active
        ),
        'Admin updated plan ' || v_target_plan
    );

    RETURN jsonb_build_object(
        'success', true,
        'plan', v_target_plan,
        'updated_at', NOW()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_membership_plan(
    TEXT, TEXT, TEXT, BOOLEAN, NUMERIC, NUMERIC, INT, INT, INT, BOOLEAN, BOOLEAN, TEXT, NUMERIC, TEXT, INT, NUMERIC, INT, NUMERIC, NUMERIC, NUMERIC
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_update_membership_plan(
    TEXT, TEXT, TEXT, BOOLEAN, NUMERIC, NUMERIC, INT, INT, INT, BOOLEAN, BOOLEAN, TEXT, NUMERIC, TEXT, INT, NUMERIC, INT, NUMERIC, NUMERIC, NUMERIC
) TO authenticated;


-- 8. UPGRADE: ACTIVATE MEMBERSHIP SUBSCRIPTION USING LIVE FEE RULES
DROP FUNCTION IF EXISTS public.activate_seller_membership_subscription(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.activate_seller_membership_subscription(
    p_cashfree_order_id TEXT,
    p_payment_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invoice RECORD;
    v_fee_rule RECORD;
    v_period_start TIMESTAMPTZ;
    v_period_end TIMESTAMPTZ;
    v_max_products INT;
    v_storage_mb INT;
    v_admin_users INT;
BEGIN
    -- Defense-in-depth: Reject direct client-side authenticated invocation unless admin
    IF auth.role() = 'authenticated' AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Direct client activation is prohibited. Upgrades must be verified via server gateway.'
        USING ERRCODE = '42501';
    END IF;

    -- Look up subscription invoice with row lock
    SELECT * INTO v_invoice 
    FROM public.seller_subscription_invoices 
    WHERE cashfree_order_id = p_cashfree_order_id 
    FOR UPDATE;

    IF v_invoice IS NULL THEN
        RAISE EXCEPTION 'Subscription invoice not found for order %', p_cashfree_order_id USING ERRCODE = 'P0002';
    END IF;

    -- Idempotency check: If already paid and active, return safely
    IF v_invoice.payment_status = 'paid' THEN
        RETURN jsonb_build_object(
            'success', true,
            'message', 'Subscription already activated',
            'plan', v_invoice.plan,
            'period_end', v_invoice.period_end
        );
    END IF;

    v_period_start := NOW();
    IF v_invoice.billing_cycle = 'YEARLY' THEN
        v_period_end := v_period_start + INTERVAL '365 days';
    ELSE
        v_period_end := v_period_start + INTERVAL '30 days';
    END IF;

    -- Dynamically pull limits from authoritative marketplace_fee_rules
    SELECT max_products, storage_limit_mb, admin_users_limit
    INTO v_max_products, v_storage_mb, v_admin_users
    FROM public.marketplace_fee_rules
    WHERE membership_plan = v_invoice.plan;

    -- Fallbacks if fee rule row not yet configured
    IF NOT FOUND THEN
        IF v_invoice.plan = 'BUSINESS' THEN
            v_max_products := NULL;
            v_storage_mb := 102400;
            v_admin_users := NULL;
        ELSIF v_invoice.plan = 'PRO' THEN
            v_max_products := NULL;
            v_storage_mb := 10240;
            v_admin_users := 5;
        ELSE
            v_max_products := 10;
            v_storage_mb := 500;
            v_admin_users := 1;
        END IF;
    END IF;

    -- 1. Update Invoice to paid
    UPDATE public.seller_subscription_invoices
    SET payment_status = 'paid',
        payment_reference = COALESCE(p_payment_reference, cashfree_order_id),
        period_start = v_period_start,
        period_end = v_period_end,
        updated_at = NOW()
    WHERE id = v_invoice.id;

    -- 2. Update Seller Profile
    UPDATE public.seller_profiles
    SET membership_plan = v_invoice.plan,
        membership_status = 'active',
        membership_started_at = v_period_start,
        membership_expires_at = v_period_end,
        max_products = v_max_products,
        storage_limit_mb = v_storage_mb,
        admin_users_limit = v_admin_users,
        updated_at = NOW()
    WHERE id = v_invoice.seller_id;

    -- 3. Log to membership history
    INSERT INTO public.seller_membership_history (
        seller_id,
        plan,
        status,
        started_at,
        ended_at,
        amount_paid,
        created_at
    ) VALUES (
        v_invoice.seller_id,
        v_invoice.plan,
        'active',
        v_period_start,
        v_period_end,
        v_invoice.total_amount,
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'plan', v_invoice.plan,
        'billing_cycle', v_invoice.billing_cycle,
        'period_start', v_period_start,
        'period_end', v_period_end,
        'amount_paid', v_invoice.total_amount
    );
END;
$$;

REVOKE ALL ON FUNCTION public.activate_seller_membership_subscription(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activate_seller_membership_subscription(TEXT, TEXT) FROM authenticated;
REVOKE ALL ON FUNCTION public.activate_seller_membership_subscription(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.activate_seller_membership_subscription(TEXT, TEXT) TO service_role;
