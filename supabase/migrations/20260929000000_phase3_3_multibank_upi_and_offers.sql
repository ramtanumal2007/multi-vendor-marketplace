-- ==============================================================================
-- VENDOSMITH PHASE 3.3 MIGRATION: MULTI-BANK, SELLER UPI & MEMBERSHIP OFFERS
-- File: 20260929000000_phase3_3_multibank_upi_and_offers.sql
-- Description:
--   1. Adds upi_id and upi_qr_url to public.seller_profiles.
--   2. Adds offer pricing & promotional fields to public.marketplace_fee_rules.
--   3. Upgrades verify_seller_bank_account:
--      - Admin approval does NOT automatically demote or archive existing primary accounts.
--      - If a verified primary account already exists, the newly verified account is non-primary.
--      - If no primary exists yet, the first verified account becomes primary by default.
--      - Does not touch or archive any other verified bank accounts.
--   4. Creates set_primary_seller_bank_account RPC:
--      - Seller-only atomic primary account selection among verified accounts.
--      - Exactly one primary account per seller; demotes previous primary without archiving.
--      - Only accounts with status = 'verified' can be set as primary.
--   5. Upgrades admin_get_all_bank_accounts to include seller UPI details.
--   6. Upgrades admin_update_membership_plan to accept and audit offer fields.
-- ==============================================================================

BEGIN;

-- 1. ADD UPI COLUMNS TO SELLER_PROFILES
ALTER TABLE public.seller_profiles
ADD COLUMN IF NOT EXISTS upi_id TEXT,
ADD COLUMN IF NOT EXISTS upi_qr_url TEXT;


-- 2. ADD OFFER PRICING COLUMNS TO MARKETPLACE_FEE_RULES
ALTER TABLE public.marketplace_fee_rules
ADD COLUMN IF NOT EXISTS original_monthly_price NUMERIC,
ADD COLUMN IF NOT EXISTS offer_monthly_price NUMERIC,
ADD COLUMN IF NOT EXISTS original_yearly_price NUMERIC,
ADD COLUMN IF NOT EXISTS offer_yearly_price NUMERIC,
ADD COLUMN IF NOT EXISTS offer_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS offer_label TEXT DEFAULT 'Special Offer',
ADD COLUMN IF NOT EXISTS offer_badge TEXT DEFAULT 'Limited Time',
ADD COLUMN IF NOT EXISTS offer_valid_until TIMESTAMPTZ;


-- 3. UPGRADE VERIFY_SELLER_BANK_ACCOUNT RPC (PRESERVE PRIMARY, NO AUTO-ARCHIVE)
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
    v_existing_primary UUID;
    v_make_primary BOOLEAN;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only marketplace administrators can verify or reject bank accounts' 
        USING ERRCODE = '42501';
    END IF;

    v_actor_id := auth.uid();
    v_action := UPPER(TRIM(p_action));

    -- Acquire row lock on target bank account
    SELECT * INTO v_account 
    FROM public.seller_bank_accounts 
    WHERE id = p_account_id 
    FOR UPDATE;

    IF v_account IS NULL THEN
        RAISE EXCEPTION 'Bank account not found' USING ERRCODE = 'P0002';
    END IF;

    -- Action: APPROVE / VERIFY
    IF v_action IN ('VERIFY', 'APPROVE') THEN
        -- Check if seller ALREADY has an active verified primary account
        SELECT id INTO v_existing_primary
        FROM public.seller_bank_accounts
        WHERE seller_id = v_account.seller_id
          AND id != p_account_id
          AND status = 'verified'
          AND is_primary = true
        LIMIT 1;

        -- If a primary already exists, this new verified account is NOT primary.
        -- If no primary exists yet, this account becomes primary.
        IF v_existing_primary IS NOT NULL THEN
            v_make_primary := false;
        ELSE
            v_make_primary := true;
        END IF;

        -- Update ONLY the target account. DO NOT touch or archive any other accounts!
        UPDATE public.seller_bank_accounts
        SET status = 'verified',
            is_primary = v_make_primary,
            verified_at = NOW(),
            verified_by = v_actor_id,
            rejection_reason = NULL,
            correction_reason = NULL,
            admin_notes = COALESCE(p_admin_note, admin_notes),
            updated_at = NOW()
        WHERE id = p_account_id;

        -- Immutable audit log
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
                'existing_primary_id', v_existing_primary
            ),
            jsonb_build_object(
                'status', 'verified',
                'is_primary', v_make_primary,
                'bank_name', v_account.bank_name,
                'last4', v_account.account_number_last4
            ),
            COALESCE(
                p_admin_note, 
                CASE 
                    WHEN v_make_primary THEN 'Bank account verified and set as default primary payout destination'
                    ELSE 'Bank account verified (secondary account; existing primary account preserved)'
                END
            )
        );

        -- In-app notification to seller
        BEGIN
            INSERT INTO public.seller_notifications (
                seller_id, title, message, type, priority, link_url
            ) VALUES (
                v_account.seller_id,
                'Bank Account Verified',
                CASE 
                    WHEN v_make_primary THEN 'Your bank account (' || v_account.bank_name || ' ending in ' || v_account.account_number_last4 || ') has been verified and set as your primary payout destination.'
                    ELSE 'Your bank account (' || v_account.bank_name || ' ending in ' || v_account.account_number_last4 || ') has been verified. You may designate it as primary at any time in your Payment Details.'
                END,
                'system',
                'high',
                '/seller/bank-account'
            );
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;

        RETURN jsonb_build_object(
            'success', true,
            'action', 'APPROVE',
            'status', 'verified',
            'is_primary', v_make_primary,
            'existing_primary_preserved', v_existing_primary
        );

    -- Action: RETURN FOR CORRECTION
    ELSIF v_action IN ('RETURN_FOR_CORRECTION', 'CORRECTION') THEN
        IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
            RAISE EXCEPTION 'A correction reason is required when returning bank account for correction' 
            USING ERRCODE = '22000';
        END IF;

        -- Update ONLY the target account. If it was primary, remove primary flag.
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
            jsonb_build_object('status', v_account.status, 'is_primary', v_account.is_primary),
            jsonb_build_object('status', 'correction_required', 'is_primary', false, 'reason', p_reason),
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

        -- Update ONLY the target account. If it was primary, remove primary flag.
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
            jsonb_build_object('status', v_account.status, 'is_primary', v_account.is_primary),
            jsonb_build_object('status', 'rejected', 'is_primary', false, 'reason', p_reason),
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


-- 4. NEW RPC: SET PRIMARY SELLER BANK ACCOUNT (SELLER-ONLY ATOMIC SWITCH)
DROP FUNCTION IF EXISTS public.set_primary_seller_bank_account(UUID);

CREATE OR REPLACE FUNCTION public.set_primary_seller_bank_account(
    p_account_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_seller_id UUID;
    v_target_account RECORD;
    v_previous_primary UUID;
BEGIN
    v_seller_id := auth.uid();
    IF v_seller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User not authenticated' USING ERRCODE = '42501';
    END IF;

    -- Lock target account and verify seller ownership
    SELECT * INTO v_target_account
    FROM public.seller_bank_accounts
    WHERE id = p_account_id
    FOR UPDATE;

    IF v_target_account IS NULL THEN
        RAISE EXCEPTION 'Bank account not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_target_account.seller_id != v_seller_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: You do not own this bank account' USING ERRCODE = '42501';
    END IF;

    -- Critical business logic: ONLY verified accounts can be designated as primary
    IF v_target_account.status != 'verified' THEN
        RAISE EXCEPTION 'Only verified bank accounts can be designated as the primary payout destination. Current status: %', v_target_account.status
        USING ERRCODE = '22000';
    END IF;

    -- If already primary, no-op return
    IF v_target_account.is_primary = true THEN
        RETURN jsonb_build_object(
            'success', true,
            'message', 'This account is already your active primary payout destination.',
            'account_id', p_account_id
        );
    END IF;

    -- Find current primary account for this seller
    SELECT id INTO v_previous_primary
    FROM public.seller_bank_accounts
    WHERE seller_id = v_target_account.seller_id
      AND is_primary = true
      AND id != p_account_id
    LIMIT 1;

    -- Demote other accounts to non-primary (WITHOUT archiving!)
    UPDATE public.seller_bank_accounts
    SET is_primary = false,
        updated_at = NOW()
    WHERE seller_id = v_target_account.seller_id
      AND id != p_account_id
      AND is_primary = true;

    -- Promote selected target account to primary
    UPDATE public.seller_bank_accounts
    SET is_primary = true,
        updated_at = NOW()
    WHERE id = p_account_id;

    -- Immutable audit log
    INSERT INTO public.finance_audit_logs (
        actor_id,
        action_type,
        target_entity,
        target_id,
        old_values,
        new_values,
        notes
    ) VALUES (
        v_seller_id,
        'SELLER_PRIMARY_BANK_ACCOUNT_CHANGED',
        'seller_bank_accounts',
        p_account_id,
        jsonb_build_object(
            'previous_primary_account_id', v_previous_primary
        ),
        jsonb_build_object(
            'new_primary_account_id', p_account_id,
            'bank_name', v_target_account.bank_name,
            'last4', v_target_account.account_number_last4
        ),
        'Seller designated account ' || v_target_account.bank_name || ' (ending in ' || v_target_account.account_number_last4 || ') as primary payout destination'
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Primary payout account updated successfully.',
        'account_id', p_account_id,
        'previous_primary_id', v_previous_primary
    );
END;
$$;

REVOKE ALL ON FUNCTION public.set_primary_seller_bank_account(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_primary_seller_bank_account(UUID) TO authenticated;


-- 5. UPGRADE ADMIN_GET_ALL_BANK_ACCOUNTS RPC (INCLUDE SELLER UPI ID & QR)
DROP FUNCTION IF EXISTS public.admin_get_all_bank_accounts();

CREATE OR REPLACE FUNCTION public.admin_get_all_bank_accounts()
RETURNS TABLE (
    id UUID,
    seller_id UUID,
    seller_business_name TEXT,
    seller_contact_name TEXT,
    seller_email TEXT,
    seller_upi_id TEXT,
    seller_upi_qr_url TEXT,
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
        sp.upi_id AS seller_upi_id,
        sp.upi_qr_url AS seller_upi_qr_url,
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


-- 6. UPGRADE ADMIN_UPDATE_MEMBERSHIP_PLAN RPC (WITH OFFER PRICING SUPPORT)
DROP FUNCTION IF EXISTS public.admin_update_membership_plan(
    TEXT, TEXT, TEXT, BOOLEAN, NUMERIC, NUMERIC, INT, INT, INT, BOOLEAN, BOOLEAN, TEXT, NUMERIC, TEXT, INT, NUMERIC, INT, NUMERIC, NUMERIC, NUMERIC
);
DROP FUNCTION IF EXISTS public.admin_update_membership_plan(
    TEXT, TEXT, TEXT, BOOLEAN, NUMERIC, NUMERIC, INT, INT, INT, BOOLEAN, BOOLEAN, TEXT, NUMERIC, TEXT, INT, NUMERIC, INT, NUMERIC, NUMERIC, NUMERIC,
    NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, TEXT, TEXT, TIMESTAMPTZ
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
    p_tds_rate NUMERIC,
    p_original_monthly_price NUMERIC DEFAULT NULL,
    p_offer_monthly_price NUMERIC DEFAULT NULL,
    p_original_yearly_price NUMERIC DEFAULT NULL,
    p_offer_yearly_price NUMERIC DEFAULT NULL,
    p_offer_enabled BOOLEAN DEFAULT false,
    p_offer_label TEXT DEFAULT 'Special Offer',
    p_offer_badge TEXT DEFAULT 'Limited Time',
    p_offer_valid_until TIMESTAMPTZ DEFAULT NULL
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

    -- Validate offer pricing when enabled
    IF p_offer_enabled = true THEN
        IF p_offer_monthly_price IS NOT NULL AND p_offer_monthly_price < 0 THEN
            RAISE EXCEPTION 'Offer monthly price cannot be negative' USING ERRCODE = '22000';
        END IF;
        IF p_offer_yearly_price IS NOT NULL AND p_offer_yearly_price < 0 THEN
            RAISE EXCEPTION 'Offer yearly price cannot be negative' USING ERRCODE = '22000';
        END IF;
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
        original_monthly_price = p_original_monthly_price,
        offer_monthly_price = p_offer_monthly_price,
        original_yearly_price = p_original_yearly_price,
        offer_yearly_price = p_offer_yearly_price,
        offer_enabled = COALESCE(p_offer_enabled, false),
        offer_label = TRIM(COALESCE(p_offer_label, 'Special Offer')),
        offer_badge = TRIM(COALESCE(p_offer_badge, 'Limited Time')),
        offer_valid_until = p_offer_valid_until,
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
            'offer_enabled', p_offer_enabled,
            'original_monthly_price', p_original_monthly_price,
            'offer_monthly_price', p_offer_monthly_price,
            'original_yearly_price', p_original_yearly_price,
            'offer_yearly_price', p_offer_yearly_price,
            'offer_label', p_offer_label,
            'offer_badge', p_offer_badge,
            'offer_valid_until', p_offer_valid_until,
            'commission_rate', p_commission_rate,
            'gst_rate', p_gst_rate
        ),
        'Admin updated plan ' || v_target_plan || ' (offers and limits updated)'
    );

    RETURN jsonb_build_object(
        'success', true,
        'plan', v_target_plan,
        'updated_at', NOW()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_membership_plan(
    TEXT, TEXT, TEXT, BOOLEAN, NUMERIC, NUMERIC, INT, INT, INT, BOOLEAN, BOOLEAN, TEXT, NUMERIC, TEXT, INT, NUMERIC, INT, NUMERIC, NUMERIC, NUMERIC,
    NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, TEXT, TEXT, TIMESTAMPTZ
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_update_membership_plan(
    TEXT, TEXT, TEXT, BOOLEAN, NUMERIC, NUMERIC, INT, INT, INT, BOOLEAN, BOOLEAN, TEXT, NUMERIC, TEXT, INT, NUMERIC, INT, NUMERIC, NUMERIC, NUMERIC,
    NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, TEXT, TEXT, TIMESTAMPTZ
) TO authenticated;

-- 7. ENSURE SECURE PRIVATE STORAGE BUCKET FOR SELLER PAYMENT DOCUMENTS / QR CODES
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'seller-payment-docs',
    'seller-payment-docs',
    false,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS "Admin full access seller-payment-docs storage" ON storage.objects;
DROP POLICY IF EXISTS "Approved Sellers insert own seller-payment-docs storage" ON storage.objects;
DROP POLICY IF EXISTS "Approved Sellers select own seller-payment-docs storage" ON storage.objects;
DROP POLICY IF EXISTS "Approved Sellers update own seller-payment-docs storage" ON storage.objects;
DROP POLICY IF EXISTS "Approved Sellers delete own seller-payment-docs storage" ON storage.objects;

CREATE POLICY "Admin full access seller-payment-docs storage" ON storage.objects
FOR ALL TO authenticated
USING (bucket_id = 'seller-payment-docs' AND public.is_admin())
WITH CHECK (bucket_id = 'seller-payment-docs' AND public.is_admin());

CREATE POLICY "Approved Sellers insert own seller-payment-docs storage" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'seller-payment-docs' AND
    (
        (storage.foldername(name))[1] = auth.uid()::text OR
        ((storage.foldername(name))[1] = 'seller' AND (storage.foldername(name))[2] = auth.uid()::text)
    ) AND
    EXISTS (
        SELECT 1 FROM public.seller_profiles
        WHERE id = auth.uid() AND verification_status = 'approved'
    )
);

CREATE POLICY "Approved Sellers select own seller-payment-docs storage" ON storage.objects
FOR SELECT TO authenticated
USING (
    bucket_id = 'seller-payment-docs' AND
    (
        (storage.foldername(name))[1] = auth.uid()::text OR
        ((storage.foldername(name))[1] = 'seller' AND (storage.foldername(name))[2] = auth.uid()::text)
    )
);

CREATE POLICY "Approved Sellers update own seller-payment-docs storage" ON storage.objects
FOR UPDATE TO authenticated
USING (
    bucket_id = 'seller-payment-docs' AND
    (
        (storage.foldername(name))[1] = auth.uid()::text OR
        ((storage.foldername(name))[1] = 'seller' AND (storage.foldername(name))[2] = auth.uid()::text)
    )
)
WITH CHECK (
    bucket_id = 'seller-payment-docs' AND
    (
        (storage.foldername(name))[1] = auth.uid()::text OR
        ((storage.foldername(name))[1] = 'seller' AND (storage.foldername(name))[2] = auth.uid()::text)
    )
);

CREATE POLICY "Approved Sellers delete own seller-payment-docs storage" ON storage.objects
FOR DELETE TO authenticated
USING (
    bucket_id = 'seller-payment-docs' AND
    (
        (storage.foldername(name))[1] = auth.uid()::text OR
        ((storage.foldername(name))[1] = 'seller' AND (storage.foldername(name))[2] = auth.uid()::text)
    )
);

COMMIT;

