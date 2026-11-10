BEGIN;

-- Restrict admin helper execution
REVOKE EXECUTE ON FUNCTION public.is_admin()
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_admin()
TO authenticated, service_role;

-- Restrict seller orders RPC execution
REVOKE EXECUTE ON FUNCTION public.get_seller_orders()
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_seller_orders()
TO authenticated, service_role;

-- Restrict delivery confirmation RPC execution
REVOKE EXECUTE ON FUNCTION public.confirm_order_delivery(UUID, TEXT, UUID)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.confirm_order_delivery(UUID, TEXT, UUID)
TO authenticated, service_role;

COMMIT;