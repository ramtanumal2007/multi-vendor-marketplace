-- Restrict seller onboarding RPC to authenticated users.
REVOKE EXECUTE ON FUNCTION public.submit_seller_onboarding(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.submit_seller_onboarding(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;
