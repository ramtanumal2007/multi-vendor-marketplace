-- ==============================================================================
-- VENDOSMITH: ATOMIC CUSTOMER WALLET OPERATIONS & LEDGER INTEGRITY
-- Migration: 20261021000000_atomic_customer_wallet_operations.sql
-- Description:
--   1. debit_customer_wallet_atomic:
--      - Enforces strict row-level lock (FOR UPDATE) preventing race conditions
--      - Validates sufficient balance
--      - Checks idempotency key before balance modification
--      - Inserts wallet_transactions ledger row in same atomic transaction
--      - If ledger insert fails, entire operation rolls back (no phantom debits)
--   2. credit_customer_wallet_atomic:
--      - Atomic lock, balance increment, and ledger insert with idempotency
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. ATOMIC WALLET DEBIT PROCEDURE
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.debit_customer_wallet_atomic(
    p_customer_id UUID,
    p_amount NUMERIC,
    p_type TEXT DEFAULT 'WALLET_DEBIT',
    p_reference_type TEXT DEFAULT 'order',
    p_reference_id TEXT DEFAULT NULL,
    p_description TEXT DEFAULT 'Wallet debit',
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_wallet_id UUID;
    v_current_balance NUMERIC(12, 2);
    v_new_balance NUMERIC(12, 2);
    v_clean_amount NUMERIC(12, 2);
    v_clean_idemp TEXT;
    v_existing_tx RECORD;
    v_tx_id UUID;
BEGIN
    -- Validate amount
    v_clean_amount := ROUND(p_amount, 2);
    IF v_clean_amount <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INVALID_AMOUNT',
            'message', 'Debit amount must be greater than zero.'
        );
    END IF;

    -- Validate type and reference_type
    IF p_type NOT IN ('WALLET_DEBIT', 'WALLET_USED_FOR_REPLACEMENT', 'ADMIN_ADJUSTMENT') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INVALID_TYPE',
            'message', 'Invalid transaction type for wallet debit.'
        );
    END IF;

    IF p_reference_type NOT IN ('order', 'replacement_request', 'return_request', 'admin_action') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INVALID_REFERENCE_TYPE',
            'message', 'Invalid reference type for wallet debit.'
        );
    END IF;

    -- 1. Idempotency Check
    v_clean_idemp := NULLIF(TRIM(COALESCE(p_idempotency_key, '')), '');
    IF v_clean_idemp IS NOT NULL THEN
        SELECT id, balance_after INTO v_existing_tx
        FROM public.wallet_transactions
        WHERE idempotency_key = v_clean_idemp
        LIMIT 1;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', true,
                'is_duplicate', true,
                'transaction_id', v_existing_tx.id,
                'balance', v_existing_tx.balance_after,
                'message', 'Duplicate request detected via idempotency key.'
            );
        END IF;
    END IF;

    -- 2. Lock the wallet row FOR UPDATE
    SELECT id, balance INTO v_wallet_id, v_current_balance
    FROM public.customer_wallets
    WHERE customer_id = p_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        -- Create wallet if missing
        INSERT INTO public.customer_wallets (customer_id, balance, currency)
        VALUES (p_customer_id, 0.00, 'INR')
        ON CONFLICT (customer_id) DO NOTHING;

        SELECT id, balance INTO v_wallet_id, v_current_balance
        FROM public.customer_wallets
        WHERE customer_id = p_customer_id
        FOR UPDATE;
    END IF;

    -- 3. Enforce Sufficient Balance
    IF v_current_balance < v_clean_amount THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INSUFFICIENT_FUNDS',
            'message', 'Insufficient wallet balance. Available: ₹' || v_current_balance || ', Required: ₹' || v_clean_amount,
            'current_balance', v_current_balance
        );
    END IF;

    -- 4. Calculate new balance
    v_new_balance := ROUND(v_current_balance - v_clean_amount, 2);

    -- 5. Update wallet balance
    UPDATE public.customer_wallets
    SET balance = v_new_balance,
        updated_at = NOW()
    WHERE id = v_wallet_id;

    -- 6. Insert ledger transaction
    INSERT INTO public.wallet_transactions (
        wallet_id,
        customer_id,
        type,
        amount,
        direction,
        balance_after,
        reference_type,
        reference_id,
        description,
        idempotency_key
    ) VALUES (
        v_wallet_id,
        p_customer_id,
        p_type,
        v_clean_amount,
        'debit',
        v_new_balance,
        p_reference_type,
        COALESCE(p_reference_id, 'manual'),
        COALESCE(p_description, 'Wallet debit'),
        v_clean_idemp
    )
    RETURNING id INTO v_tx_id;

    RETURN jsonb_build_object(
        'success', true,
        'is_duplicate', false,
        'transaction_id', v_tx_id,
        'balance', v_new_balance,
        'previous_balance', v_current_balance
    );

EXCEPTION WHEN OTHERS THEN
    -- In PostgreSQL, any unhandled error inside a transaction automatically rolls back.
    -- We re-raise or return structured failure
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLSTATE,
        'message', 'Atomic wallet debit transaction failed: ' || SQLERRM
    );
END;
$function$;

-- ------------------------------------------------------------------------------
-- 2. ATOMIC WALLET CREDIT PROCEDURE
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_customer_wallet_atomic(
    p_customer_id UUID,
    p_amount NUMERIC,
    p_type TEXT DEFAULT 'ADMIN_ADJUSTMENT',
    p_reference_type TEXT DEFAULT 'admin_action',
    p_reference_id TEXT DEFAULT NULL,
    p_description TEXT DEFAULT 'Wallet credit',
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_wallet_id UUID;
    v_current_balance NUMERIC(12, 2);
    v_new_balance NUMERIC(12, 2);
    v_clean_amount NUMERIC(12, 2);
    v_clean_idemp TEXT;
    v_existing_tx RECORD;
    v_tx_id UUID;
BEGIN
    v_clean_amount := ROUND(p_amount, 2);
    IF v_clean_amount <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INVALID_AMOUNT',
            'message', 'Credit amount must be greater than zero.'
        );
    END IF;

    -- 1. Idempotency Check
    v_clean_idemp := NULLIF(TRIM(COALESCE(p_idempotency_key, '')), '');
    IF v_clean_idemp IS NOT NULL THEN
        SELECT id, balance_after INTO v_existing_tx
        FROM public.wallet_transactions
        WHERE idempotency_key = v_clean_idemp
        LIMIT 1;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', true,
                'is_duplicate', true,
                'transaction_id', v_existing_tx.id,
                'balance', v_existing_tx.balance_after,
                'message', 'Duplicate request detected via idempotency key.'
            );
        END IF;
    END IF;

    -- 2. Lock the wallet row FOR UPDATE
    SELECT id, balance INTO v_wallet_id, v_current_balance
    FROM public.customer_wallets
    WHERE customer_id = p_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.customer_wallets (customer_id, balance, currency)
        VALUES (p_customer_id, 0.00, 'INR')
        ON CONFLICT (customer_id) DO NOTHING;

        SELECT id, balance INTO v_wallet_id, v_current_balance
        FROM public.customer_wallets
        WHERE customer_id = p_customer_id
        FOR UPDATE;
    END IF;

    v_new_balance := ROUND(v_current_balance + v_clean_amount, 2);

    UPDATE public.customer_wallets
    SET balance = v_new_balance,
        updated_at = NOW()
    WHERE id = v_wallet_id;

    INSERT INTO public.wallet_transactions (
        wallet_id,
        customer_id,
        type,
        amount,
        direction,
        balance_after,
        reference_type,
        reference_id,
        description,
        idempotency_key
    ) VALUES (
        v_wallet_id,
        p_customer_id,
        p_type,
        v_clean_amount,
        'credit',
        v_new_balance,
        p_reference_type,
        COALESCE(p_reference_id, 'manual'),
        COALESCE(p_description, 'Wallet credit'),
        v_clean_idemp
    )
    RETURNING id INTO v_tx_id;

    RETURN jsonb_build_object(
        'success', true,
        'is_duplicate', false,
        'transaction_id', v_tx_id,
        'balance', v_new_balance,
        'previous_balance', v_current_balance
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLSTATE,
        'message', 'Atomic wallet credit transaction failed: ' || SQLERRM
    );
END;
$function$;

-- Permissions
REVOKE EXECUTE ON FUNCTION public.debit_customer_wallet_atomic FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.debit_customer_wallet_atomic TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.credit_customer_wallet_atomic FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.credit_customer_wallet_atomic TO authenticated, service_role;

COMMIT;
