BEGIN;

REVOKE EXECUTE ON FUNCTION public.request_seller_payout_atomic(numeric, text, uuid, text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.request_seller_payout_atomic(numeric, text, uuid, text)
TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.admin_reopen_payout_request_atomic(uuid, text, text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_reopen_payout_request_atomic(uuid, text, text)
TO authenticated, service_role;

COMMIT;
