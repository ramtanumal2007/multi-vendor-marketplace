-- ==============================================================================
-- Migration: 20261001000000_seller_workflow_lifecycle_fix.sql
-- Description: Complete Seller Approval / Rejection / Correction Workflow Fix
--   1. Adds is_push_ready & push_payload columns to public.seller_notifications if missing.
--   2. Adds rejection_reason, rejection_note, correction_reason, correction_note,
--      reviewed_at, and resubmitted_at to public.seller_profiles.
--   3. Relaxes valid_events constraint and adds audit columns to public.seller_application_events:
--      previous_status, new_status, actor_id, admin_reason, admin_note.
--   4. Updates approve_seller RPC:
--      - Fixes missing column crash (is_push_ready).
--      - Supports approval from pending, under_review, correction_required, rejected.
--      - Updates existing stores without duplicating records.
--   5. Updates reject_seller RPC:
--      - Accepts p_reason and p_note.
--      - Saves reason and note on seller_profiles and seller_application_events.
--      - Synchronizes store status to 'rejected'.
--      - Sends notification to seller.
--   6. Updates return_for_correction RPC:
--      - Accepts p_comment, p_reason, p_note.
--      - Saves correction reason and note.
--      - Updates store status.
--      - Sends notification to seller.
--   7. Adds reconsider_seller RPC:
--      - Reconsiders rejected or suspended seller back to under_review.
--      - Updates store status.
--      - Logs audit event and notifies seller.
--   8. Updates resubmit_application RPC:
--      - Transitions seller to under_review.
--      - Updates seller_profiles and stores contact info.
--      - Records resubmitted_at.
--      - Logs audit event and notifies seller.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. Ensure seller_notifications has required columns
-- ------------------------------------------------------------------------------
ALTER TABLE public.seller_notifications ADD COLUMN IF NOT EXISTS is_push_ready BOOLEAN DEFAULT false;
ALTER TABLE public.seller_notifications ADD COLUMN IF NOT EXISTS push_payload JSONB;

-- ------------------------------------------------------------------------------
-- 2. Add structured decision & audit fields to seller_profiles
-- ------------------------------------------------------------------------------
ALTER TABLE public.seller_profiles ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE public.seller_profiles ADD COLUMN IF NOT EXISTS rejection_note TEXT;
ALTER TABLE public.seller_profiles ADD COLUMN IF NOT EXISTS correction_reason TEXT;
ALTER TABLE public.seller_profiles ADD COLUMN IF NOT EXISTS correction_note TEXT;
ALTER TABLE public.seller_profiles ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE public.seller_profiles ADD COLUMN IF NOT EXISTS resubmitted_at TIMESTAMPTZ;

-- ------------------------------------------------------------------------------
-- 3. Extend seller_application_events for comprehensive audit trail
-- ------------------------------------------------------------------------------
ALTER TABLE public.seller_application_events DROP CONSTRAINT IF EXISTS valid_events;
ALTER TABLE public.seller_application_events ADD COLUMN IF NOT EXISTS previous_status TEXT;
ALTER TABLE public.seller_application_events ADD COLUMN IF NOT EXISTS new_status TEXT;
ALTER TABLE public.seller_application_events ADD COLUMN IF NOT EXISTS actor_id UUID;
ALTER TABLE public.seller_application_events ADD COLUMN IF NOT EXISTS admin_reason TEXT;
ALTER TABLE public.seller_application_events ADD COLUMN IF NOT EXISTS admin_note TEXT;

-- ------------------------------------------------------------------------------
-- 4. HARDENED & FIXED approve_seller RPC
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_seller(p_seller_id UUID) RETURNS BOOLEAN AS $$
DECLARE
    v_current_status TEXT;
    v_business_name TEXT;
    v_seller_id_code TEXT;
    v_updated INT;
    v_store_count INT;
    v_base_slug TEXT;
    v_final_slug TEXT;
    v_achieve_id UUID;
    v_cert_num TEXT;
    v_ver_id TEXT;
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized: Administrator privileges required.' USING ERRCODE = '42501'; END IF;
    
    SELECT verification_status, business_name, seller_id_code 
    INTO v_current_status, v_business_name, v_seller_id_code 
    FROM public.seller_profiles 
    WHERE id = p_seller_id FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Seller profile not found for ID %.', p_seller_id; END IF;
    IF v_current_status NOT IN ('pending', 'under_review', 'correction_required', 'rejected') THEN
        RAISE EXCEPTION 'Invalid transition: Cannot approve a seller with status %', v_current_status;
    END IF;

    -- Generate sequential seller_id_code if not yet assigned
    IF v_seller_id_code IS NULL THEN
        v_seller_id_code := 'SLR-' || LPAD(nextval('public.seller_id_seq')::TEXT, 6, '0');
    END IF;

    -- Update seller profile
    UPDATE public.seller_profiles 
    SET verification_status = 'approved',
        seller_id_code = v_seller_id_code,
        approved_at = COALESCE(approved_at, NOW()),
        reviewed_at = NOW(),
        seller_level = 'Verified Seller',
        seller_score = GREATEST(seller_score, 75),
        membership_plan = COALESCE(membership_plan, 'BASIC'),
        membership_status = COALESCE(membership_status, 'active'),
        membership_started_at = COALESCE(membership_started_at, NOW()),
        max_products = COALESCE(max_products, 10),
        storage_limit_mb = COALESCE(storage_limit_mb, 500),
        admin_users_limit = COALESCE(admin_users_limit, 1),
        rejection_reason = NULL,
        rejection_note = NULL,
        correction_reason = NULL,
        correction_note = NULL,
        updated_at = NOW()
    WHERE id = p_seller_id;
    
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'Failed to update seller profile.'; END IF;

    -- Update user profile role to seller
    UPDATE public.profiles SET role = 'seller', updated_at = NOW() WHERE id = p_seller_id;
    
    -- Synchronize existing store for this seller (prevent duplicate stores)
    UPDATE public.stores 
    SET status = 'approved', updated_at = NOW()
    WHERE seller_id = p_seller_id;

    GET DIAGNOSTICS v_store_count = ROW_COUNT;

    -- Only if no store exists at all for this seller, auto-create one
    IF v_store_count = 0 THEN
        v_base_slug := lower(regexp_replace(COALESCE(v_business_name, 'seller-store'), '[^a-zA-Z0-9]+', '-', 'g'));
        v_base_slug := regexp_replace(v_base_slug, '(^-|-$)+', '', 'g');
        IF v_base_slug = '' THEN v_base_slug := 'seller-store'; END IF;
        v_final_slug := v_base_slug || '-' || substring(md5(random()::text || clock_timestamp()::text) from 1 for 8);

        INSERT INTO public.stores (seller_id, name, slug, status)
        VALUES (p_seller_id, COALESCE(v_business_name, 'Official Store'), v_final_slug, 'approved');
    END IF;

    -- Membership History Entry
    INSERT INTO public.seller_membership_history (seller_id, plan, status, started_at)
    VALUES (p_seller_id, 'BASIC', 'active', NOW());

    -- Certificate Registry Entry
    v_cert_num := 'CERT-' || v_seller_id_code || '-' || TO_CHAR(NOW(), 'YYYY');
    v_ver_id := 'VER-' || UPPER(SUBSTRING(MD5(p_seller_id::text || NOW()::text) FROM 1 FOR 8));
    INSERT INTO public.seller_certificate_registry (seller_id, certificate_number, verification_id, status)
    VALUES (p_seller_id, v_cert_num, v_ver_id, 'active')
    ON CONFLICT (certificate_number) DO NOTHING;

    -- Audit trail event
    INSERT INTO public.seller_application_events (
        seller_id, event_type, previous_status, new_status, actor_id, admin_comment
    ) VALUES (
        p_seller_id, 'approved', v_current_status, 'approved', auth.uid(), 'Seller application approved by administrator'
    );

    -- Welcome notification (using verified safe columns)
    INSERT INTO public.seller_notifications (seller_id, title, message, type, priority, link_url)
    VALUES (
        p_seller_id, 
        'Application Approved! 🎉', 
        'Congratulations! Your seller application has been approved. You are now a Verified Seller.', 
        'approval',
        'high',
        '/seller'
    );

    -- Auto-unlock STORE_APPROVED achievement
    SELECT id INTO v_achieve_id FROM public.seller_achievements WHERE code = 'STORE_APPROVED';
    IF v_achieve_id IS NOT NULL THEN
        INSERT INTO public.seller_unlocked_achievements (seller_id, achievement_id) 
        VALUES (p_seller_id, v_achieve_id) ON CONFLICT DO NOTHING;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.approve_seller(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_seller(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. HARDENED reject_seller RPC
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_seller(
    p_seller_id UUID,
    p_reason TEXT DEFAULT NULL,
    p_note TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_current_status TEXT;
    v_final_reason TEXT;
    v_final_note TEXT;
    v_full_comment TEXT;
    v_updated INT;
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized: Administrator privileges required.' USING ERRCODE = '42501'; END IF;

    v_final_reason := COALESCE(NULLIF(trim(p_reason), ''), 'Application does not meet current marketplace criteria.');
    v_final_note := NULLIF(trim(p_note), '');

    IF v_final_note IS NOT NULL AND v_final_note != '' THEN
        v_full_comment := v_final_reason || E'\n\nAdmin Note: ' || v_final_note;
    ELSE
        v_full_comment := v_final_reason;
    END IF;
    
    SELECT verification_status INTO v_current_status FROM public.seller_profiles WHERE id = p_seller_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Seller profile not found for ID %.', p_seller_id; END IF;
    IF v_current_status NOT IN ('pending', 'under_review', 'correction_required', 'rejected') THEN
        RAISE EXCEPTION 'Invalid transition: Cannot reject a seller with status %', v_current_status;
    END IF;

    UPDATE public.seller_profiles 
    SET verification_status = 'rejected',
        rejection_reason = v_final_reason,
        rejection_note = v_final_note,
        reviewed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_seller_id;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'Failed to update seller profile.'; END IF;

    -- Demote role to customer
    UPDATE public.profiles SET role = 'customer', updated_at = NOW() WHERE id = p_seller_id;

    -- Synchronize seller's stores
    UPDATE public.stores SET status = 'rejected', updated_at = NOW() WHERE seller_id = p_seller_id;
    
    -- Audit trail
    INSERT INTO public.seller_application_events (
        seller_id, event_type, previous_status, new_status, actor_id, admin_reason, admin_note, admin_comment
    ) VALUES (
        p_seller_id, 'rejected', v_current_status, 'rejected', auth.uid(), v_final_reason, v_final_note, v_full_comment
    );

    -- Seller notification
    INSERT INTO public.seller_notifications (
        seller_id, title, message, type, priority, link_url
    ) VALUES (
        p_seller_id,
        'Seller Application Update: Rejected',
        'Your seller application was not approved. Reason: ' || v_final_reason || CASE WHEN v_final_note IS NOT NULL THEN ' Note: ' || v_final_note ELSE '' END,
        'warning',
        'high',
        '/seller/tracking'
    );

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.reject_seller(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_seller(UUID, TEXT, TEXT) TO authenticated;

-- Overload for backward compatibility with single argument
CREATE OR REPLACE FUNCTION public.reject_seller(p_seller_id UUID) RETURNS BOOLEAN AS $$
BEGIN
    RETURN public.reject_seller(p_seller_id, 'Application does not meet current marketplace criteria.', NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.reject_seller(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_seller(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. HARDENED return_for_correction RPC
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.return_for_correction(
    p_seller_id UUID,
    p_comment TEXT DEFAULT NULL,
    p_reason TEXT DEFAULT NULL,
    p_note TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_current_status TEXT;
    v_final_reason TEXT;
    v_final_note TEXT;
    v_full_comment TEXT;
    v_updated INT;
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized: Administrator privileges required.' USING ERRCODE = '42501'; END IF;

    v_final_reason := COALESCE(NULLIF(trim(p_reason), ''), NULLIF(trim(p_comment), ''));
    v_final_note := NULLIF(trim(p_note), '');

    IF v_final_reason IS NULL THEN
        RAISE EXCEPTION 'A correction reason is required.';
    END IF;

    IF v_final_note IS NOT NULL AND v_final_note != '' THEN
        v_full_comment := v_final_reason || E'\n\nAdmin Note: ' || v_final_note;
    ELSE
        v_full_comment := v_final_reason;
    END IF;
    
    SELECT verification_status INTO v_current_status FROM public.seller_profiles WHERE id = p_seller_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Seller profile not found for ID %.', p_seller_id; END IF;
    IF v_current_status NOT IN ('pending', 'under_review', 'correction_required', 'rejected') THEN
        RAISE EXCEPTION 'Invalid transition: Cannot return for correction from status %', v_current_status;
    END IF;

    UPDATE public.seller_profiles 
    SET verification_status = 'correction_required',
        correction_reason = v_final_reason,
        correction_note = v_final_note,
        reviewed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_seller_id;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'Failed to update seller profile.'; END IF;

    -- Update store status
    UPDATE public.stores 
    SET status = 'pending', updated_at = NOW() 
    WHERE seller_id = p_seller_id AND status != 'approved';

    -- Audit trail
    INSERT INTO public.seller_application_events (
        seller_id, event_type, previous_status, new_status, actor_id, admin_reason, admin_note, admin_comment
    ) VALUES (
        p_seller_id, 'correction_requested', v_current_status, 'correction_required', auth.uid(), v_final_reason, v_final_note, v_full_comment
    );

    -- Seller notification
    INSERT INTO public.seller_notifications (
        seller_id, title, message, type, priority, link_url
    ) VALUES (
        p_seller_id,
        'Action Required: Application Corrections Needed',
        'Your seller application requires corrections. Reason: ' || v_final_reason || CASE WHEN v_final_note IS NOT NULL THEN ' Note: ' || v_final_note ELSE '' END,
        'warning',
        'high',
        '/seller/tracking'
    );
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.return_for_correction(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.return_for_correction(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- Overload for backward compatibility with 2 arguments
CREATE OR REPLACE FUNCTION public.return_for_correction(p_seller_id UUID, p_comment TEXT) RETURNS BOOLEAN AS $$
BEGIN
    RETURN public.return_for_correction(p_seller_id, p_comment, p_comment, NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.return_for_correction(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.return_for_correction(UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 7. NEW reconsider_seller RPC (Allows Admin to reconsider rejected or suspended seller)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconsider_seller(
    p_seller_id UUID,
    p_note TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_current_status TEXT;
    v_updated INT;
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized: Administrator privileges required.' USING ERRCODE = '42501'; END IF;
    
    SELECT verification_status INTO v_current_status 
    FROM public.seller_profiles 
    WHERE id = p_seller_id FOR UPDATE;
    
    IF NOT FOUND THEN RAISE EXCEPTION 'Seller profile not found for ID %.', p_seller_id; END IF;
    IF v_current_status NOT IN ('rejected', 'suspended', 'correction_required', 'pending') THEN
        RAISE EXCEPTION 'Invalid transition: Can only reconsider a seller with status rejected, suspended, or pending (current: %)', v_current_status;
    END IF;

    UPDATE public.seller_profiles 
    SET verification_status = 'under_review',
        reviewed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_seller_id;
    
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'Failed to update seller profile.'; END IF;

    -- Update store status to under_review
    UPDATE public.stores 
    SET status = 'under_review', updated_at = NOW() 
    WHERE seller_id = p_seller_id AND status != 'approved';

    -- Audit trail
    INSERT INTO public.seller_application_events (
        seller_id, event_type, previous_status, new_status, actor_id, admin_note, admin_comment
    ) VALUES (
        p_seller_id, 'reconsidered', v_current_status, 'under_review', auth.uid(), p_note, COALESCE(p_note, 'Application reconsidered by administrator and moved to Under Review')
    );

    -- Seller notification
    INSERT INTO public.seller_notifications (
        seller_id, title, message, type, priority, link_url
    ) VALUES (
        p_seller_id,
        'Application Under Reconsideration',
        COALESCE(p_note, 'Your seller application is being reconsidered by our team and is now Under Review.'),
        'system',
        'high',
        '/seller/tracking'
    );

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.reconsider_seller(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconsider_seller(UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 8. HARDENED resubmit_application RPC
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resubmit_application(
    p_business_name TEXT,
    p_contact_name TEXT,
    p_phone TEXT,
    p_business_email TEXT,
    p_business_type TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_seller_id UUID := auth.uid();
    v_current_status TEXT;
    v_updated INT;
BEGIN
    IF v_seller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT verification_status INTO v_current_status FROM public.seller_profiles WHERE id = v_seller_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Seller profile not found.'; END IF;
    IF v_current_status NOT IN ('correction_required', 'pending', 'under_review') THEN
        RAISE EXCEPTION 'Invalid transition: Cannot resubmit application with status %', v_current_status;
    END IF;

    UPDATE public.seller_profiles 
    SET business_name = COALESCE(NULLIF(trim(p_business_name), ''), business_name),
        contact_name = COALESCE(NULLIF(trim(p_contact_name), ''), contact_name),
        phone = COALESCE(NULLIF(trim(p_phone), ''), phone),
        business_email = COALESCE(NULLIF(trim(p_business_email), ''), business_email),
        business_type = COALESCE(NULLIF(trim(p_business_type), ''), business_type),
        verification_status = 'under_review',
        resubmitted_at = NOW(),
        updated_at = NOW()
    WHERE id = v_seller_id;
    
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'Failed to update seller profile.'; END IF;

    -- Update store contact info and status to under_review
    UPDATE public.stores 
    SET name = COALESCE(NULLIF(trim(p_business_name), ''), name),
        phone = COALESCE(NULLIF(trim(p_phone), ''), phone),
        email = COALESCE(NULLIF(trim(p_business_email), ''), email),
        status = 'under_review',
        updated_at = NOW()
    WHERE seller_id = v_seller_id;

    -- Audit trail
    INSERT INTO public.seller_application_events (
        seller_id, event_type, previous_status, new_status, actor_id, admin_comment
    ) VALUES (
        v_seller_id, 'resubmitted', v_current_status, 'under_review', v_seller_id, 'Seller updated and resubmitted application for review'
    );

    -- Seller confirmation notification
    INSERT INTO public.seller_notifications (
        seller_id, title, message, type, priority, link_url
    ) VALUES (
        v_seller_id,
        'Application Resubmitted Successfully',
        'Your updated seller application has been received and is now Under Review.',
        'system',
        'medium',
        '/seller/tracking'
    );
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.resubmit_application(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resubmit_application(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMIT;
