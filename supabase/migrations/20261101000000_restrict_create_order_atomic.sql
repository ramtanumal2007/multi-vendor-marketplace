BEGIN;

-- Block direct RPC access from public and client-side roles
REVOKE EXECUTE
ON FUNCTION public.create_order_atomic(TEXT, JSONB, JSONB)
FROM PUBLIC, anon, authenticated;

-- Allow trusted server-side execution
GRANT EXECUTE
ON FUNCTION public.create_order_atomic(TEXT, JSONB, JSONB)
TO service_role;

COMMIT;
