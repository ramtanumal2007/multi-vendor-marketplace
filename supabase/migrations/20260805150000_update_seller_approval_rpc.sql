-- ==============================================================================
-- REVISED MIGRATION: ATOMIC SELLER ONBOARDING & STORE-SYNCHRONIZED APPROVAL RPCs
-- Incorporates full security hardening, status transition protection, and slug uniqueness.
-- DO NOT EXECUTE AUTOMATICALLY. Run manually in Supabase SQL Editor.
-- ==============================================================================

BEGIN;

-- 1. OPTIONAL: ENSURE UNIQUE CONSTRAINT ON STORES.SELLER_ID IF NOT ALREADY PRESENT
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'stores_seller_id_key' AND conrelid = 'public.stores'::regclass
    ) THEN
        -- Only add if no duplicate seller_ids exist
        IF (SELECT COUNT(*) FROM (SELECT seller_id FROM public.stores GROUP BY seller_id HAVING COUNT(*) > 1) duplicates) = 0 THEN
            ALTER TABLE public.stores ADD CONSTRAINT stores_seller_id_key UNIQUE (seller_id);
        END IF;
    END IF;
END $$;


-- 2. HARDENED ATOMIC SELLER ONBOARDING RPC
CREATE OR REPLACE FUNCTION public.submit_seller_onboarding(
    p_business_name TEXT,
    p_contact_name TEXT,
    p_phone TEXT,
    p_business_email TEXT,
    p_business_type TEXT,
    p_store_name TEXT DEFAULT NULL,
    p_store_description TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_existing_status TEXT;
    v_clean_store_name TEXT;
    v_base_slug TEXT;
    v_final_slug TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF p_business_name IS NULL OR trim(p_business_name) = '' THEN
        RAISE EXCEPTION 'Business name is required.';
    END IF;

    -- Check existing status to prevent approved or suspended sellers from resetting their status
    SELECT verification_status INTO v_existing_status 
    FROM public.seller_profiles 
    WHERE id = v_user_id FOR UPDATE;

    IF v_existing_status IN ('approved', 'suspended', 'rejected') THEN
        RAISE EXCEPTION 'Onboarding cannot be re-submitted for a seller with status %.', v_existing_status;
    END IF;

    -- Upsert seller profile safely
    INSERT INTO public.seller_profiles (
        id,
        business_name,
        contact_name,
        phone,
        business_email,
        business_type,
        verification_status
    ) VALUES (
        v_user_id,
        p_business_name,
        p_contact_name,
        p_phone,
        p_business_email,
        p_business_type,
        'pending'
    )
    ON CONFLICT (id) DO UPDATE SET
        business_name = EXCLUDED.business_name,
        contact_name = EXCLUDED.contact_name,
        phone = EXCLUDED.phone,
        business_email = EXCLUDED.business_email,
        business_type = EXCLUDED.business_type,
        verification_status = 'pending',
        updated_at = NOW();

    -- Generate store name and cryptographically unique slug
    v_clean_store_name := COALESCE(NULLIF(trim(p_store_name), ''), p_business_name);
    v_base_slug := lower(regexp_replace(v_clean_store_name, '[^a-zA-Z0-9]+', '-', 'g'));
    v_base_slug := regexp_replace(v_base_slug, '(^-|-$)+', '', 'g');
    IF v_base_slug = '' THEN v_base_slug := 'seller-store'; END IF;
    
    v_final_slug := v_base_slug || '-' || substring(md5(random()::text || clock_timestamp()::text) from 1 for 8);

    -- Create or update seller's initial store tied strictly to auth.uid()
    IF EXISTS (SELECT 1 FROM public.stores WHERE seller_id = v_user_id) THEN
        UPDATE public.stores
        SET name = v_clean_store_name,
            description = COALESCE(p_store_description, description),
            phone = COALESCE(p_phone, phone),
            email = COALESCE(p_business_email, email),
            status = 'pending',
            updated_at = NOW()
        WHERE seller_id = v_user_id;
    ELSE
        INSERT INTO public.stores (
            seller_id,
            name,
            slug,
            description,
            phone,
            email,
            status
        ) VALUES (
            v_user_id,
            v_clean_store_name,
            v_final_slug,
            p_store_description,
            p_phone,
            p_business_email,
            'pending'
        );
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.submit_seller_onboarding(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_seller_onboarding(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- 3. HARDENED APPROVE_SELLER RPC
CREATE OR REPLACE FUNCTION public.approve_seller(p_seller_id UUID) RETURNS BOOLEAN AS $$
DECLARE
    v_current_status TEXT;
    v_business_name TEXT;
    v_seller_id_code TEXT;
    v_updated INT;
    v_store_count INT;
    v_base_slug TEXT;
    v_final_slug TEXT;
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    
    SELECT verification_status, business_name, seller_id_code 
    INTO v_current_status, v_business_name, v_seller_id_code 
    FROM public.seller_profiles 
    WHERE id = p_seller_id FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Seller profile not found.'; END IF;
    IF v_current_status NOT IN ('pending', 'under_review') THEN
        RAISE EXCEPTION 'Invalid transition: Cannot approve a seller with status %', v_current_status;
    END IF;

    -- Generate seller_id_code if not yet assigned
    IF v_seller_id_code IS NULL THEN
        v_seller_id_code := 'SLR-' || LPAD(nextval('public.seller_id_seq')::TEXT, 6, '0');
    END IF;

    -- Update seller profile
    UPDATE public.seller_profiles 
    SET verification_status = 'approved',
        seller_id_code = v_seller_id_code,
        updated_at = NOW()
    WHERE id = p_seller_id;
    
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'Failed to update seller profile.'; END IF;

    -- Update profile role to seller
    UPDATE public.profiles SET role = 'seller', updated_at = NOW() WHERE id = p_seller_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'Failed to update user profile role.'; END IF;
    
    -- Synchronize store status strictly for this seller
    UPDATE public.stores 
    SET status = 'approved', updated_at = NOW()
    WHERE seller_id = p_seller_id AND status IN ('draft', 'pending', 'under_review');

    GET DIAGNOSTICS v_store_count = ROW_COUNT;

    -- If no store existed for this seller, auto-create one strictly for p_seller_id
    IF v_store_count = 0 THEN
      SELECT COUNT(*) INTO v_store_count FROM public.stores WHERE seller_id = p_seller_id AND status = 'approved';
      IF v_store_count = 0 THEN
        v_base_slug := lower(regexp_replace(COALESCE(v_business_name, 'seller-store'), '[^a-zA-Z0-9]+', '-', 'g'));
        v_base_slug := regexp_replace(v_base_slug, '(^-|-$)+', '', 'g');
        IF v_base_slug = '' THEN v_base_slug := 'seller-store'; END IF;
        v_final_slug := v_base_slug || '-' || substring(md5(random()::text || clock_timestamp()::text) from 1 for 8);

        INSERT INTO public.stores (seller_id, name, slug, status)
        VALUES (
          p_seller_id,
          COALESCE(v_business_name, 'Official Store'),
          v_final_slug,
          'approved'
        );
      END IF;
    END IF;

    INSERT INTO public.seller_application_events (seller_id, event_type) 
    VALUES (p_seller_id, 'approved');

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.approve_seller(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_seller(UUID) TO authenticated;


-- 4. HARDENED REJECT_SELLER RPC
CREATE OR REPLACE FUNCTION public.reject_seller(p_seller_id UUID) RETURNS BOOLEAN AS $$
DECLARE
    v_current_status TEXT;
    v_updated INT;
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    
    SELECT verification_status INTO v_current_status FROM public.seller_profiles WHERE id = p_seller_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Seller profile not found.'; END IF;
    IF v_current_status NOT IN ('pending', 'under_review') THEN
        RAISE EXCEPTION 'Invalid transition: Cannot reject a seller with status %', v_current_status;
    END IF;

    UPDATE public.seller_profiles SET verification_status = 'rejected', updated_at = NOW() WHERE id = p_seller_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'Failed to update seller profile.'; END IF;

    UPDATE public.profiles SET role = 'customer', updated_at = NOW() WHERE id = p_seller_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'Failed to update user profile role.'; END IF;

    -- Synchronize seller's stores
    UPDATE public.stores SET status = 'rejected', updated_at = NOW() WHERE seller_id = p_seller_id;
    
    INSERT INTO public.seller_application_events (seller_id, event_type) 
    VALUES (p_seller_id, 'rejected');

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.reject_seller(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_seller(UUID) TO authenticated;


-- 5. HARDENED SUSPEND_SELLER RPC
CREATE OR REPLACE FUNCTION public.suspend_seller(p_seller_id UUID) RETURNS BOOLEAN AS $$
DECLARE
    v_current_status TEXT;
    v_updated INT;
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    
    SELECT verification_status INTO v_current_status FROM public.seller_profiles WHERE id = p_seller_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Seller profile not found.'; END IF;
    IF v_current_status != 'approved' THEN
        RAISE EXCEPTION 'Invalid transition: Can only suspend an approved seller (current: %)', v_current_status;
    END IF;

    UPDATE public.seller_profiles SET verification_status = 'suspended', updated_at = NOW() WHERE id = p_seller_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'Failed to update seller profile.'; END IF;

    UPDATE public.profiles SET role = 'customer', updated_at = NOW() WHERE id = p_seller_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'Failed to update user profile role.'; END IF;

    -- Synchronize seller's stores
    UPDATE public.stores SET status = 'suspended', updated_at = NOW() WHERE seller_id = p_seller_id;

    INSERT INTO public.seller_application_events (seller_id, event_type) 
    VALUES (p_seller_id, 'suspended');

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.suspend_seller(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suspend_seller(UUID) TO authenticated;

COMMIT;
