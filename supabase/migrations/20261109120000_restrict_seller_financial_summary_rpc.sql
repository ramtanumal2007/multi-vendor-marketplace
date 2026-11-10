-- Restrict seller financial summary RPC to trusted server-side calls.
-- The API route authenticates the user and passes the authenticated user's ID.

REVOKE EXECUTE ON FUNCTION public.get_seller_financial_summary(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_seller_financial_summary(uuid)
TO service_role;
