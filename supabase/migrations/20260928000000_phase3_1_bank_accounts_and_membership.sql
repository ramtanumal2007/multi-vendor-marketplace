-- ==============================================================================
-- VENDOSMITH PHASE 3.1 MIGRATION: SELLER BANK ACCOUNTS & MEMBERSHIP UPGRADE
-- File: 20260928000000_phase3_1_bank_accounts_and_membership.sql
-- Description:
--   1. Enables pgcrypto extension.
--   2. Creates public.seller_bank_accounts with AES-256-GCM encryption, masking, and RLS.
--   3. Creates public.marketplace_fee_rules with configurable rates.
--   4. Creates public.seller_subscription_invoices for PRO/BUSINESS Cashfree billing.
--   5. Creates public.seller_balances and backfills zero balances for existing sellers.
--   6. Enforces database-level catalog limit trigger on public.products for BASIC sellers.
--   7. Adds hardened, least-privilege RPCs for secure bank operations & membership lifecycle.
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. SELLER BANK ACCOUNTS TABLE
CREATE TABLE IF NOT EXISTS public.seller_bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID NOT NULL REFERENCES public.seller_profiles(id) ON DELETE CASCADE,
    encrypted_account_number TEXT NOT NULL, -- Reversible AES-256-GCM ciphertext (iv:authTag:encryptedHex)
    account_number_last4 TEXT NOT NULL CHECK (char_length(account_number_last4) = 4),
    account_holder_name TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    branch_name TEXT,
    ifsc_code TEXT NOT NULL CHECK (ifsc_code ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
    account_type TEXT DEFAULT 'CURRENT' CHECK (account_type IN ('SAVINGS', 'CURRENT')),
    is_primary BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected', 'archived')),
    rejection_reason TEXT,
    verified_at TIMESTAMPTZ,
    verified_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seller_bank_accounts_seller_id ON public.seller_bank_accounts(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_bank_accounts_status ON public.seller_bank_accounts(status);

-- Partial Unique Index: Exactly one verified primary account per seller
CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_verified_primary 
ON public.seller_bank_accounts (seller_id) 
WHERE (status = 'verified' AND is_primary = true);

-- Updated_at trigger for seller_bank_accounts
DROP TRIGGER IF EXISTS trg_seller_bank_accounts_updated_at ON public.seller_bank_accounts;
CREATE TRIGGER trg_seller_bank_accounts_updated_at 
BEFORE UPDATE ON public.seller_bank_accounts 
FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

-- Enable RLS on seller_bank_accounts
ALTER TABLE public.seller_bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sellers can view own bank accounts" ON public.seller_bank_accounts;
CREATE POLICY "Sellers can view own bank accounts" 
ON public.seller_bank_accounts 
FOR SELECT 
USING (seller_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Sellers can insert own bank accounts" ON public.seller_bank_accounts;
CREATE POLICY "Sellers can insert own bank accounts" 
ON public.seller_bank_accounts 
FOR INSERT 
WITH CHECK (seller_id = auth.uid() AND status = 'pending' AND is_primary = false);

DROP POLICY IF EXISTS "Admins have full access to bank accounts" ON public.seller_bank_accounts;
CREATE POLICY "Admins have full access to bank accounts" 
ON public.seller_bank_accounts 
FOR ALL 
USING (public.is_admin());


-- 3. MARKETPLACE FEE RULES TABLE
CREATE TABLE IF NOT EXISTS public.marketplace_fee_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    membership_plan TEXT NOT NULL UNIQUE CHECK (membership_plan IN ('BASIC', 'PRO', 'BUSINESS')),
    commission_rate NUMERIC(5, 4) NOT NULL, -- e.g. 0.1200 for 12%, 0.0800 for 8%, 0.0500 for 5%
    gst_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.1800, -- 18% GST on services
    tcs_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.0050, -- 0.50% total TCS under Sec 52 (0.25% CGST + 0.25% SGST)
    tds_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.0010, -- 0.10% total TDS under Sec 194-O
    min_payout_amount NUMERIC(12, 2) NOT NULL DEFAULT 1000.00,
    escrow_hold_days INT NOT NULL DEFAULT 7,
    platform_absorbs_coupons BOOLEAN NOT NULL DEFAULT true,
    monthly_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    yearly_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed launch default fee rules
INSERT INTO public.marketplace_fee_rules (
    membership_plan, commission_rate, gst_rate, tcs_rate, tds_rate, 
    min_payout_amount, escrow_hold_days, platform_absorbs_coupons, 
    monthly_price, yearly_price
) VALUES 
('BASIC', 0.1200, 0.1800, 0.0050, 0.0010, 1000.00, 7, true, 0.00, 0.00),
('PRO', 0.0800, 0.1800, 0.0050, 0.0010, 1000.00, 7, true, 1999.00, 19999.00),
('BUSINESS', 0.0500, 0.1800, 0.0050, 0.0010, 1000.00, 7, true, 4999.00, 49999.00)
ON CONFLICT (membership_plan) DO UPDATE SET
    commission_rate = EXCLUDED.commission_rate,
    gst_rate = EXCLUDED.gst_rate,
    tcs_rate = EXCLUDED.tcs_rate,
    tds_rate = EXCLUDED.tds_rate,
    min_payout_amount = EXCLUDED.min_payout_amount,
    escrow_hold_days = EXCLUDED.escrow_hold_days,
    platform_absorbs_coupons = EXCLUDED.platform_absorbs_coupons,
    monthly_price = EXCLUDED.monthly_price,
    yearly_price = EXCLUDED.yearly_price,
    updated_at = NOW();

ALTER TABLE public.marketplace_fee_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read fee rules" ON public.marketplace_fee_rules;
CREATE POLICY "Authenticated users can read fee rules" 
ON public.marketplace_fee_rules 
FOR SELECT 
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can modify fee rules" ON public.marketplace_fee_rules;
CREATE POLICY "Admins can modify fee rules" 
ON public.marketplace_fee_rules 
FOR ALL 
USING (public.is_admin());


-- 4. SELLER SUBSCRIPTION INVOICES TABLE
CREATE TABLE IF NOT EXISTS public.seller_subscription_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID NOT NULL REFERENCES public.seller_profiles(id) ON DELETE CASCADE,
    plan TEXT NOT NULL CHECK (plan IN ('PRO', 'BUSINESS')),
    billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('MONTHLY', 'YEARLY')),
    base_amount NUMERIC(12, 2) NOT NULL CHECK (base_amount > 0),
    tax_amount NUMERIC(12, 2) NOT NULL CHECK (tax_amount >= 0),
    total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount > 0),
    cashfree_order_id TEXT UNIQUE NOT NULL,
    payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed')),
    payment_reference TEXT,
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seller_sub_inv_seller_id ON public.seller_subscription_invoices(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_sub_inv_status ON public.seller_subscription_invoices(payment_status);

ALTER TABLE public.seller_subscription_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sellers can view own subscription invoices" ON public.seller_subscription_invoices;
CREATE POLICY "Sellers can view own subscription invoices" 
ON public.seller_subscription_invoices 
FOR SELECT 
USING (seller_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Admins have full access to subscription invoices" ON public.seller_subscription_invoices;
CREATE POLICY "Admins have full access to subscription invoices" 
ON public.seller_subscription_invoices 
FOR ALL 
USING (public.is_admin());


-- 5. SELLER BALANCES TABLE & SEEDING (Requirement 7)
CREATE TABLE IF NOT EXISTS public.seller_balances (
    seller_id UUID PRIMARY KEY REFERENCES public.seller_profiles(id) ON DELETE RESTRICT,
    pending_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    available_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    locked_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    lifetime_earned NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    lifetime_withdrawn NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.seller_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sellers can view own balance" ON public.seller_balances;
CREATE POLICY "Sellers can view own balance" 
ON public.seller_balances 
FOR SELECT 
USING (seller_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Admins can manage balances" ON public.seller_balances;
CREATE POLICY "Admins can manage balances" 
ON public.seller_balances 
FOR ALL 
USING (public.is_admin());

-- Backfill zero balance for all existing approved sellers
INSERT INTO public.seller_balances (seller_id, pending_balance, available_balance, locked_balance)
SELECT id, 0.00, 0.00, 0.00 
FROM public.seller_profiles
ON CONFLICT (seller_id) DO NOTHING;


-- 6. SECURE RPC: ADD SELLER BANK ACCOUNT (SEC-02: Reversibly Encrypted Payload)
CREATE OR REPLACE FUNCTION public.add_seller_bank_account(
    p_account_holder_name TEXT,
    p_bank_name TEXT,
    p_branch_name TEXT,
    p_ifsc_code TEXT,
    p_encrypted_account_number TEXT,
    p_account_number_last4 TEXT,
    p_account_type TEXT DEFAULT 'CURRENT'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_seller_id UUID;
    v_clean_ifsc TEXT;
    v_last4 TEXT;
    v_account_type TEXT;
    v_new_id UUID;
BEGIN
    v_seller_id := auth.uid();
    IF v_seller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User not authenticated' USING ERRCODE = '42501';
    END IF;

    -- Verify caller is an approved seller
    IF NOT EXISTS (
        SELECT 1 FROM public.seller_profiles 
        WHERE id = v_seller_id AND verification_status = 'approved'
    ) AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only approved sellers can register bank accounts' USING ERRCODE = '42501';
    END IF;

    -- Clean & Validate IFSC
    v_clean_ifsc := UPPER(TRIM(p_ifsc_code));
    IF v_clean_ifsc !~ '^[A-Z]{4}0[A-Z0-9]{6}$' THEN
        RAISE EXCEPTION 'Invalid IFSC code format. Expected 11 characters, 5th character must be zero' USING ERRCODE = '22000';
    END IF;

    -- Validate Last4
    v_last4 := TRIM(p_account_number_last4);
    IF char_length(v_last4) != 4 OR v_last4 !~ '^[0-9]{4}$' THEN
        RAISE EXCEPTION 'Invalid last 4 digits of bank account' USING ERRCODE = '22000';
    END IF;

    -- Validate Encrypted Payload Presence
    IF p_encrypted_account_number IS NULL OR char_length(TRIM(p_encrypted_account_number)) < 20 THEN
        RAISE EXCEPTION 'Invalid encrypted account payload' USING ERRCODE = '22000';
    END IF;

    -- Account Type Validation
    v_account_type := UPPER(TRIM(COALESCE(p_account_type, 'CURRENT')));
    IF v_account_type NOT IN ('SAVINGS', 'CURRENT') THEN
        v_account_type := 'CURRENT';
    END IF;

    -- Insert new pending bank account
    INSERT INTO public.seller_bank_accounts (
        seller_id,
        encrypted_account_number,
        account_number_last4,
        account_holder_name,
        bank_name,
        branch_name,
        ifsc_code,
        account_type,
        is_primary,
        status
    ) VALUES (
        v_seller_id,
        p_encrypted_account_number,
        v_last4,
        TRIM(p_account_holder_name),
        TRIM(p_bank_name),
        TRIM(COALESCE(p_branch_name, '')),
        v_clean_ifsc,
        v_account_type,
        false, -- Pending accounts are never primary until verified
        'pending'
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', true,
        'account_id', v_new_id,
        'account_number_last4', v_last4,
        'bank_name', TRIM(p_bank_name),
        'status', 'pending',
        'message', 'Bank account submitted for verification. An admin will review and verify your details.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.add_seller_bank_account(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_seller_bank_account(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- 7. SECURE RPC: GET SELLER BANK ACCOUNTS (MASKED VIEW)
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
        sba.verified_at,
        sba.created_at
    FROM public.seller_bank_accounts sba
    WHERE sba.seller_id = v_seller_id
    ORDER BY sba.is_primary DESC, sba.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_seller_bank_accounts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_seller_bank_accounts() TO authenticated;


-- 8. SECURE RPC: ADMIN VERIFY / REJECT BANK ACCOUNT
CREATE OR REPLACE FUNCTION public.verify_seller_bank_account(
    p_account_id UUID,
    p_action TEXT,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_account RECORD;
    v_action TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only marketplace administrators can verify bank accounts' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_account 
    FROM public.seller_bank_accounts 
    WHERE id = p_account_id 
    FOR UPDATE;

    IF v_account IS NULL THEN
        RAISE EXCEPTION 'Bank account not found' USING ERRCODE = 'P0002';
    END IF;

    v_action := UPPER(TRIM(p_action));

    IF v_action = 'VERIFY' THEN
        -- 1. Archive any existing verified primary accounts for this seller
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
            verified_by = auth.uid(),
            rejection_reason = NULL,
            updated_at = NOW()
        WHERE id = p_account_id;

        RETURN jsonb_build_object('success', true, 'status', 'verified', 'is_primary', true);

    ELSIF v_action = 'REJECT' THEN
        UPDATE public.seller_bank_accounts
        SET status = 'rejected',
            is_primary = false,
            rejection_reason = COALESCE(p_reason, 'Verification rejected by administrator'),
            updated_at = NOW()
        WHERE id = p_account_id;

        RETURN jsonb_build_object('success', true, 'status', 'rejected', 'is_primary', false);

    ELSE
        RAISE EXCEPTION 'Invalid action. Must be VERIFY or REJECT' USING ERRCODE = '22000';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_seller_bank_account(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_seller_bank_account(UUID, TEXT, TEXT) TO authenticated;


-- 9. SECURE RPC: ACTIVATE SELLER MEMBERSHIP (SEC-01: Restricted to service_role Only)
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
    v_period_start TIMESTAMPTZ;
    v_period_end TIMESTAMPTZ;
    v_max_products INT;
    v_storage_mb INT;
    v_admin_users INT;
BEGIN
    -- Defense-in-depth: Reject client-side authenticated invocation unless admin
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

    -- Idempotency check: If already paid and active, return without duplicate operations
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

    -- Set tier limits
    IF v_invoice.plan = 'BUSINESS' THEN
        v_max_products := NULL; -- unlimited
        v_storage_mb := 102400;  -- 100 GB
        v_admin_users := NULL;  -- unlimited
    ELSIF v_invoice.plan = 'PRO' THEN
        v_max_products := NULL; -- unlimited
        v_storage_mb := 10240;   -- 10 GB
        v_admin_users := 5;
    ELSE
        v_max_products := 10;
        v_storage_mb := 500;
        v_admin_users := 1;
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

-- SEC-01 & SEC-06: Revoke execution from PUBLIC and normal authenticated users.
REVOKE ALL ON FUNCTION public.activate_seller_membership_subscription(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activate_seller_membership_subscription(TEXT, TEXT) FROM authenticated;
REVOKE ALL ON FUNCTION public.activate_seller_membership_subscription(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.activate_seller_membership_subscription(TEXT, TEXT) TO service_role;


-- 10. SECURE RPC: CHECK & ENFORCE SELLER MEMBERSHIP STATUS (SEC-04: Ownership Guard)
CREATE OR REPLACE FUNCTION public.check_seller_membership_status(p_seller_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile RECORD;
    v_now TIMESTAMPTZ := NOW();
    v_status TEXT;
    v_plan TEXT;
    v_is_grace BOOLEAN := false;
BEGIN
    -- SEC-04: Authenticated sellers may check ONLY their own ID. Admins may check any seller.
    IF auth.uid() IS NOT NULL AND auth.uid() != p_seller_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: You can only check your own membership status' 
        USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_profile 
    FROM public.seller_profiles 
    WHERE id = p_seller_id 
    FOR UPDATE;

    IF v_profile IS NULL THEN
        RETURN jsonb_build_object('error', 'Seller profile not found');
    END IF;

    v_status := v_profile.membership_status;
    v_plan := v_profile.membership_plan;

    -- If on a paid plan with an expiry date
    IF v_plan IN ('PRO', 'BUSINESS') AND v_profile.membership_expires_at IS NOT NULL THEN
        IF v_now > v_profile.membership_expires_at THEN
            -- Check if within 7-day grace period
            IF v_now <= (v_profile.membership_expires_at + INTERVAL '7 days') THEN
                v_status := 'past_due';
                v_is_grace := true;
                
                UPDATE public.seller_profiles
                SET membership_status = 'past_due',
                    updated_at = NOW()
                WHERE id = p_seller_id;
            ELSE
                -- Grace period elapsed: downgrade to BASIC
                -- Existing products and orders are NEVER deleted or cancelled!
                v_status := 'expired';
                v_plan := 'BASIC';
                v_is_grace := false;

                UPDATE public.seller_profiles
                SET membership_plan = 'BASIC',
                    membership_status = 'expired',
                    max_products = 10,
                    storage_limit_mb = 500,
                    admin_users_limit = 1,
                    updated_at = NOW()
                WHERE id = p_seller_id;

                INSERT INTO public.seller_membership_history (
                    seller_id, plan, status, started_at, ended_at, amount_paid
                ) VALUES (
                    p_seller_id, 'BASIC', 'downgraded_from_expired', v_now, NULL, 0.00
                );
            END IF;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'plan', v_plan,
        'status', v_status,
        'expires_at', v_profile.membership_expires_at,
        'is_in_grace_period', v_is_grace
    );
END;
$$;

REVOKE ALL ON FUNCTION public.check_seller_membership_status(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_seller_membership_status(UUID) TO authenticated, service_role;


-- 11. SECURE BATCH RPC: PROCESS ALL EXPIRED MEMBERSHIPS (SEC-03: Scheduled Cron Task)
CREATE OR REPLACE FUNCTION public.process_all_expired_memberships()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_past_due_count INT := 0;
    v_downgraded_count INT := 0;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    -- 1. Active PRO/BUSINESS past expiry date -> past_due (Grace period)
    WITH updated_past_due AS (
        UPDATE public.seller_profiles
        SET membership_status = 'past_due',
            updated_at = v_now
        WHERE membership_plan IN ('PRO', 'BUSINESS')
          AND membership_expires_at IS NOT NULL
          AND v_now > membership_expires_at
          AND v_now <= (membership_expires_at + INTERVAL '7 days')
          AND membership_status != 'past_due'
        RETURNING id
    )
    SELECT COUNT(*) INTO v_past_due_count FROM updated_past_due;

    -- 2. Sellers past 7-day grace period -> Downgrade to BASIC (expired)
    -- Existing products and orders are NEVER deleted or cancelled!
    WITH updated_expired AS (
        UPDATE public.seller_profiles
        SET membership_plan = 'BASIC',
            membership_status = 'expired',
            max_products = 10,
            storage_limit_mb = 500,
            admin_users_limit = 1,
            updated_at = v_now
        WHERE membership_plan IN ('PRO', 'BUSINESS')
          AND membership_expires_at IS NOT NULL
          AND v_now > (membership_expires_at + INTERVAL '7 days')
        RETURNING id
    )
    SELECT COUNT(*) INTO v_downgraded_count FROM updated_expired;

    RETURN jsonb_build_object(
        'success', true,
        'marked_past_due', v_past_due_count,
        'downgraded_to_basic', v_downgraded_count,
        'processed_at', v_now
    );
END;
$$;

REVOKE ALL ON FUNCTION public.process_all_expired_memberships() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_all_expired_memberships() FROM authenticated;
REVOKE ALL ON FUNCTION public.process_all_expired_memberships() FROM anon;
GRANT EXECUTE ON FUNCTION public.process_all_expired_memberships() TO service_role;


-- 12. SECURE TRIGGER: ENFORCE BASIC 10-PRODUCT LIMIT SERVER-SIDE (SEC-05)
CREATE OR REPLACE FUNCTION public.enforce_seller_product_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_seller_id UUID;
    v_plan TEXT;
    v_max_products INT;
    v_current_count INT;
BEGIN
    -- Admins are exempt from catalog limits
    IF public.is_admin() THEN
        RETURN NEW;
    END IF;

    -- Identify the seller owning the store
    SELECT s.seller_id, COALESCE(sp.membership_plan, 'BASIC'), COALESCE(sp.max_products, 10)
    INTO v_seller_id, v_plan, v_max_products
    FROM public.stores s
    JOIN public.seller_profiles sp ON sp.id = s.seller_id
    WHERE s.id = NEW.store_id;

    IF v_seller_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- PRO and BUSINESS have max_products = NULL (unlimited)
    IF v_plan IN ('PRO', 'BUSINESS') AND v_max_products IS NULL THEN
        RETURN NEW;
    END IF;

    -- For BASIC (or any plan with an enforced numeric maximum)
    IF v_max_products IS NOT NULL THEN
        SELECT COUNT(*) INTO v_current_count
        FROM public.products
        WHERE store_id = NEW.store_id;

        IF v_current_count >= v_max_products THEN
            RAISE EXCEPTION 'Product catalog limit reached (%/% items) for % plan. Please upgrade your membership tier to list additional products.',
                v_current_count, v_max_products, v_plan
            USING ERRCODE = 'P0001';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_seller_product_limit ON public.products;
CREATE TRIGGER trg_enforce_seller_product_limit
BEFORE INSERT ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.enforce_seller_product_limit();
