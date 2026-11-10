-- ==============================================================================
-- MIGRATION: ADD UNSUSPEND_SELLER RPC FUNCTION FOR ADMIN REACTIVATION
-- Uses strict public.is_admin() security definer pattern.
-- Restores seller_profiles status to 'approved', profiles role to 'seller',
-- and stores status to 'approved' atomically.
-- ==============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.unsuspend_seller(p_seller_id UUID) RETURNS BOOLEAN AS $$
DECLARE
    v_current_status TEXT;
    v_updated INT;
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    
    SELECT verification_status INTO v_current_status FROM public.seller_profiles WHERE id = p_seller_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Seller profile not found.'; END IF;
    IF v_current_status != 'suspended' THEN
        RAISE EXCEPTION 'Invalid transition: Can only unsuspend a suspended seller (current: %)', v_current_status;
    END IF;

    UPDATE public.seller_profiles SET verification_status = 'approved', updated_at = NOW() WHERE id = p_seller_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'Failed to update seller profile.'; END IF;

    UPDATE public.profiles SET role = 'seller', updated_at = NOW() WHERE id = p_seller_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'Failed to update user profile role.'; END IF;

    -- Synchronize seller's stores
    UPDATE public.stores SET status = 'approved', updated_at = NOW() WHERE seller_id = p_seller_id;

    INSERT INTO public.seller_application_events (seller_id, event_type) 
    VALUES (p_seller_id, 'unsuspended');

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.unsuspend_seller(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unsuspend_seller(UUID) TO authenticated;

COMMIT;
