BEGIN;

-- Restrict wallet debit to trusted server-side service role
REVOKE EXECUTE ON FUNCTION
public.debit_customer_wallet_atomic(uuid,numeric,text,text,text,text,text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
public.debit_customer_wallet_atomic(uuid,numeric,text,text,text,text,text)
TO service_role;

-- Restrict wallet credit to trusted server-side service role
REVOKE EXECUTE ON FUNCTION
public.credit_customer_wallet_atomic(uuid,numeric,text,text,text,text,text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
public.credit_customer_wallet_atomic(uuid,numeric,text,text,text,text,text)
TO service_role;

COMMIT;
