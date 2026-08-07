-- ==============================================================================
-- PHASE 2: SELLER PORTAL MODERATION EXTENSION
-- ==============================================================================

BEGIN;

-- 1. SELLER ID GENERATION
CREATE SEQUENCE IF NOT EXISTS public.seller_id_seq START 1;

ALTER TABLE public.seller_profiles
ADD COLUMN IF NOT EXISTS seller_id_code TEXT UNIQUE;

-- 2. STATUS CONSTRAINT UPDATE
ALTER TABLE public.seller_profiles DROP CONSTRAINT IF EXISTS seller_profiles_verification_status_check;
ALTER TABLE public.seller_profiles ADD CONSTRAINT seller_profiles_verification_status_check CHECK (verification_status IN ('pending', 'under_review', 'correction_required', 'approved', 'rejected', 'suspended'));

-- 3. EVENT HISTORY TABLE
CREATE TABLE IF NOT EXISTS public.seller_application_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID REFERENCES public.seller_profiles(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    admin_comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_events CHECK (event_type IN (
        'under_review', 'correction_requested', 
        'resubmitted', 'approved', 'rejected', 'suspended', 'restored'
    ))
);

ALTER TABLE public.seller_application_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sellers can view own events" ON public.seller_application_events;
DROP POLICY IF EXISTS "Admins can view all events" ON public.seller_application_events;

CREATE POLICY "Sellers can view own events" ON public.seller_application_events FOR SELECT USING (seller_id = auth.uid());
CREATE POLICY "Admins can view all events" ON public.seller_application_events FOR SELECT USING (public.is_admin());
-- Insert/Update/Delete implicitly denied via RLS

-- 4. SECURITY TIGHTENING
-- Prevent sellers from changing verification_status, seller_id_code, role directly
CREATE OR REPLACE FUNCTION public.protect_seller_moderation() RETURNS TRIGGER AS $$
BEGIN
    IF NOT public.is_admin() THEN
        IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
            RAISE EXCEPTION 'Unauthorized: Moderation status changes are restricted to Administrators.';
        END IF;
        
        IF NEW.seller_id_code IS DISTINCT FROM OLD.seller_id_code THEN
            RAISE EXCEPTION 'Unauthorized: Seller ID modifications are restricted to Administrators.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Restrict direct RLS updates to pending state only
DROP POLICY IF EXISTS "Sellers can update own seller profile" ON public.seller_profiles;
CREATE POLICY "Sellers can update own seller profile" ON public.seller_profiles 
FOR UPDATE USING (auth.uid() = id AND verification_status = 'pending') 
WITH CHECK (auth.uid() = id);

-- 5. NEW RPCs
CREATE OR REPLACE FUNCTION public.return_for_correction(p_seller_id UUID, p_comment TEXT) RETURNS BOOLEAN AS $$
DECLARE
    v_current_status TEXT;
    v_updated INT;
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    IF p_comment IS NULL OR trim(p_comment) = '' THEN
        RAISE EXCEPTION 'A correction comment is required.';
    END IF;
    
    SELECT verification_status INTO v_current_status FROM public.seller_profiles WHERE id = p_seller_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Seller profile not found.'; END IF;
    IF v_current_status NOT IN ('pending', 'under_review') THEN
        RAISE EXCEPTION 'Invalid transition: Cannot return for correction from status %', v_current_status;
    END IF;

    UPDATE public.seller_profiles SET verification_status = 'correction_required' WHERE id = p_seller_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'Failed to update seller profile.'; END IF;

    INSERT INTO public.seller_application_events (seller_id, event_type, admin_comment) 
    VALUES (p_seller_id, 'correction_requested', p_comment);
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.return_for_correction(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.return_for_correction(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.resubmit_application(p_business_name TEXT, p_contact_name TEXT, p_phone TEXT, p_business_email TEXT, p_business_type TEXT) RETURNS BOOLEAN AS $$
DECLARE
    v_seller_id UUID := auth.uid();
    v_current_status TEXT;
    v_updated INT;
BEGIN
    SELECT verification_status INTO v_current_status FROM public.seller_profiles WHERE id = v_seller_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Seller profile not found.'; END IF;
    IF v_current_status != 'correction_required' THEN
        RAISE EXCEPTION 'Invalid transition: Cannot resubmit from status %', v_current_status;
    END IF;

    UPDATE public.seller_profiles 
    SET business_name = p_business_name,
        contact_name = p_contact_name,
        phone = p_phone,
        business_email = p_business_email,
        business_type = p_business_type,
        verification_status = 'under_review'
    WHERE id = v_seller_id;
    
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'Failed to update seller profile.'; END IF;

    INSERT INTO public.seller_application_events (seller_id, event_type) 
    VALUES (v_seller_id, 'resubmitted');
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.resubmit_application(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resubmit_application(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- 6. EXTEND EXISTING RPCs
CREATE OR REPLACE FUNCTION public.approve_seller(p_seller_id UUID) RETURNS BOOLEAN AS $$
DECLARE
    v_current_status TEXT;
    v_seller_id_code TEXT;
    v_updated INT;
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    
    SELECT verification_status, seller_id_code INTO v_current_status, v_seller_id_code FROM public.seller_profiles WHERE id = p_seller_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Seller profile not found.'; END IF;
    IF v_current_status NOT IN ('pending', 'under_review') THEN
        RAISE EXCEPTION 'Invalid transition: Cannot approve a seller with status %', v_current_status;
    END IF;

    IF v_seller_id_code IS NULL THEN
        v_seller_id_code := 'SLR-' || LPAD(nextval('public.seller_id_seq')::TEXT, 6, '0');
    END IF;

    UPDATE public.seller_profiles 
    SET verification_status = 'approved',
        seller_id_code = v_seller_id_code
    WHERE id = p_seller_id;
    
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'Failed to update seller profile.'; END IF;

    UPDATE public.profiles SET role = 'seller' WHERE id = p_seller_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'Failed to update user profile role.'; END IF;
    
    INSERT INTO public.seller_application_events (seller_id, event_type) 
    VALUES (p_seller_id, 'approved');

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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

    UPDATE public.seller_profiles SET verification_status = 'rejected' WHERE id = p_seller_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'Failed to update seller profile.'; END IF;

    UPDATE public.profiles SET role = 'customer' WHERE id = p_seller_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'Failed to update user profile role.'; END IF;
    
    INSERT INTO public.seller_application_events (seller_id, event_type) 
    VALUES (p_seller_id, 'rejected');

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 7. BACKFILL EXISTING APPROVED SELLERS
UPDATE public.seller_profiles 
SET seller_id_code = 'SLR-' || LPAD(nextval('public.seller_id_seq')::TEXT, 6, '0') 
WHERE verification_status = 'approved' AND seller_id_code IS NULL;

COMMIT;
