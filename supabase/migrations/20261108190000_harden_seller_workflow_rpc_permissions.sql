-- Harden seller workflow RPC permissions.
-- Remove execution access from PUBLIC and anon.
-- Preserve access for authenticated users and service_role.

REVOKE EXECUTE ON FUNCTION public.approve_seller(UUID)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_seller(UUID)
TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.reconsider_seller(UUID, TEXT)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconsider_seller(UUID, TEXT)
TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.reject_seller(UUID)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_seller(UUID)
TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.reject_seller(UUID, TEXT, TEXT)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_seller(UUID, TEXT, TEXT)
TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.return_for_correction(UUID, TEXT)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.return_for_correction(UUID, TEXT)
TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.return_for_correction(UUID, TEXT, TEXT, TEXT)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.return_for_correction(UUID, TEXT, TEXT, TEXT)
TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.suspend_seller(UUID)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suspend_seller(UUID)
TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.resubmit_application(TEXT, TEXT, TEXT, TEXT, TEXT)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resubmit_application(TEXT, TEXT, TEXT, TEXT, TEXT)
TO authenticated, service_role;
