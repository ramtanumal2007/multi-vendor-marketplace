BEGIN;

REVOKE EXECUTE ON FUNCTION public.process_settlement_hold_releases_atomic()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.process_settlement_hold_releases_atomic()
TO service_role;

REVOKE EXECUTE ON FUNCTION public.sync_seller_order_settlements_atomic()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sync_seller_order_settlements_atomic()
TO service_role;

COMMIT;