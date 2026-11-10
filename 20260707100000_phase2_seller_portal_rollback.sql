-- ==============================================================================
-- PHASE 2: SELLER PORTAL MODERATION EXTENSION (ROLLBACK)
-- ==============================================================================

BEGIN;

-- 1. REVERT EXTENDED RPCs (Approve/Reject)
CREATE OR REPLACE FUNCTION public.approve_seller(p_seller_id UUID) RETURNS BOOLEAN AS $$
DECLARE
    v_current_status TEXT;
    v_updated INT;
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    
    SELECT verification_status INTO v_current_status FROM public.seller_profiles WHERE id = p_seller_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Seller profile not found.'; END IF;
    IF v_current_status NOT IN ('pending', 'under_review') THEN
        RAISE EXCEPTION 'Invalid transition: Cannot approve a seller with status %', v_current_status;
    END IF;

    UPDATE public.seller_profiles SET verification_status = 'approved' WHERE id = p_seller_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'Failed to update seller profile.'; END IF;

    UPDATE public.profiles SET role = 'seller' WHERE id = p_seller_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'Failed to update user profile role.'; END IF;
    
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
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. DROP NEW RPCs
DROP FUNCTION IF EXISTS public.resubmit_application(TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.return_for_correction(UUID, TEXT);

-- 3. REVERT DATA
UPDATE public.seller_profiles SET verification_status = 'under_review' WHERE verification_status = 'correction_required';

-- 4. REVERT SECURITY TIGHTENING
CREATE OR REPLACE FUNCTION public.protect_seller_moderation() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.verification_status IS DISTINCT FROM OLD.verification_status AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Moderation status changes are restricted to Administrators.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS "Sellers can update own seller profile" ON public.seller_profiles;
CREATE POLICY "Sellers can update own seller profile" ON public.seller_profiles 
FOR UPDATE USING (auth.uid() = id) 
WITH CHECK (auth.uid() = id);

-- 5. DROP EVENT HISTORY TABLE & POLICIES
DROP POLICY IF EXISTS "Sellers can view own events" ON public.seller_application_events;
DROP POLICY IF EXISTS "Admins can view all events" ON public.seller_application_events;
DROP TABLE IF EXISTS public.seller_application_events;

-- 6. REVERT STATUS CONSTRAINT
ALTER TABLE public.seller_profiles DROP CONSTRAINT IF EXISTS seller_profiles_verification_status_check;
ALTER TABLE public.seller_profiles ADD CONSTRAINT seller_profiles_verification_status_check CHECK (verification_status IN ('pending', 'under_review', 'approved', 'rejected', 'suspended'));

-- 7. DROP SELLER ID
ALTER TABLE public.seller_profiles DROP COLUMN IF EXISTS seller_id_code;
DROP SEQUENCE IF EXISTS public.seller_id_seq;

COMMIT;
