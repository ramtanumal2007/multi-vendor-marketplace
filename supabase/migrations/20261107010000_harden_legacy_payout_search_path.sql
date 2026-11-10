BEGIN;

ALTER FUNCTION public.request_seller_payout_atomic_legacy(numeric, text, uuid, text)
SET search_path TO pg_catalog, public;

REVOKE ALL ON FUNCTION public.request_seller_payout_atomic_legacy(numeric, text, uuid, text)
FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
