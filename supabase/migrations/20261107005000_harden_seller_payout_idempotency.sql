BEGIN;

ALTER FUNCTION public.request_seller_payout_atomic(numeric, text, uuid, text)
RENAME TO request_seller_payout_atomic_legacy;

REVOKE ALL ON FUNCTION public.request_seller_payout_atomic_legacy(numeric, text, uuid, text)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.request_seller_payout_atomic(
    p_amount_rupees numeric,
    p_destination_type text,
    p_bank_account_id uuid DEFAULT NULL::uuid,
    p_idempotency_key text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_seller_id UUID;
    v_clean_amount NUMERIC(12, 2);
    v_amount_paise BIGINT;
    v_dest_type TEXT;
    v_idemp_key TEXT;
    v_existing RECORD;
    v_bank_id UUID;
    v_bank_status TEXT;
    v_upi_id TEXT;
BEGIN
    v_seller_id := auth.uid();

    IF v_seller_id IS NULL THEN
        BEGIN
            v_seller_id :=
                ((current_setting('request.jwt.claims', true)::jsonb)->>'sub')::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_seller_id := NULL;
        END;
    END IF;

    IF v_seller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User not authenticated'
            USING ERRCODE = '42501';
    END IF;

    IF p_amount_rupees IS NULL
       OR p_amount_rupees::TEXT IN ('NaN', 'Infinity', '-Infinity') THEN
        RAISE EXCEPTION 'Invalid payout amount'
            USING ERRCODE = '22000';
    END IF;

    v_clean_amount := ROUND(p_amount_rupees, 2);

    IF v_clean_amount < 10.00 THEN
        RAISE EXCEPTION 'Minimum payout amount is ₹10.00'
            USING ERRCODE = '22000';
    END IF;

    v_amount_paise := ROUND(v_clean_amount * 100)::BIGINT;

    v_dest_type := UPPER(TRIM(COALESCE(p_destination_type, '')));

    IF v_dest_type NOT IN ('BANK_ACCOUNT', 'UPI') THEN
        RAISE EXCEPTION 'Invalid payout destination'
            USING ERRCODE = '22000';
    END IF;

    IF p_idempotency_key IS NOT NULL
       AND TRIM(p_idempotency_key) = '' THEN
        RAISE EXCEPTION 'Idempotency key cannot be empty'
            USING ERRCODE = '22000';
    END IF;

    IF p_idempotency_key IS NOT NULL
       AND LENGTH(TRIM(p_idempotency_key)) > 200 THEN
        RAISE EXCEPTION 'Idempotency key is too long'
            USING ERRCODE = '22000';
    END IF;

    v_idemp_key := COALESCE(
        NULLIF(TRIM(p_idempotency_key), ''),
        'PAYOUT_REQ_' || v_seller_id || '_' || gen_random_uuid()::TEXT
    );

    -- Serialize all requests using the same key.
    PERFORM pg_advisory_xact_lock(57421, hashtext(v_idemp_key));

    -- Resolve and lock the effective payout destination.
    IF v_dest_type = 'BANK_ACCOUNT' THEN

        IF p_bank_account_id IS NULL THEN
            SELECT id, status
            INTO v_bank_id, v_bank_status
            FROM public.seller_bank_accounts
            WHERE seller_id = v_seller_id
              AND status = 'verified'
              AND is_primary = true
            LIMIT 1
            FOR SHARE;

            IF NOT FOUND OR v_bank_id IS NULL THEN
                SELECT id, status
                INTO v_bank_id, v_bank_status
                FROM public.seller_bank_accounts
                WHERE seller_id = v_seller_id
                  AND status = 'verified'
                ORDER BY created_at DESC
                LIMIT 1
                FOR SHARE;
            END IF;
        ELSE
            SELECT id, status
            INTO v_bank_id, v_bank_status
            FROM public.seller_bank_accounts
            WHERE id = p_bank_account_id
              AND seller_id = v_seller_id
            FOR SHARE;
        END IF;

        IF NOT FOUND OR v_bank_id IS NULL THEN
            RAISE EXCEPTION 'No verified bank account found'
                USING ERRCODE = 'P0002';
        END IF;

        IF v_bank_status IS DISTINCT FROM 'verified' THEN
            RAISE EXCEPTION 'Selected bank account is not verified'
                USING ERRCODE = '22000';
        END IF;

    ELSE
        SELECT upi_id
        INTO v_upi_id
        FROM public.seller_profiles
        WHERE id = v_seller_id
        FOR SHARE;

        IF NOT FOUND OR v_upi_id IS NULL OR TRIM(v_upi_id) = '' THEN
            RAISE EXCEPTION 'No registered UPI ID found'
                USING ERRCODE = '22000';
        END IF;
    END IF;

    -- Find an earlier request using this key.
    SELECT
        id,
        payout_number,
        status,
        amount,
        amount_paise,
        seller_id,
        destination_type,
        bank_account_id,
        destination_snapshot
    INTO v_existing
    FROM public.seller_payout_requests
    WHERE idempotency_key = v_idemp_key
    FOR UPDATE;

    IF FOUND THEN

        IF v_existing.seller_id IS DISTINCT FROM v_seller_id THEN
            RAISE EXCEPTION 'Idempotency key already in use'
                USING ERRCODE = '23505';
        END IF;

        IF v_existing.amount_paise IS DISTINCT FROM v_amount_paise
           OR v_existing.destination_type IS DISTINCT FROM v_dest_type
           OR (
                v_dest_type = 'BANK_ACCOUNT'
                AND v_existing.bank_account_id IS DISTINCT FROM v_bank_id
           )
           OR (
                v_dest_type = 'UPI'
                AND (v_existing.destination_snapshot ->> 'upi_id')
                    IS DISTINCT FROM v_upi_id
           ) THEN
            RAISE EXCEPTION 'Idempotency key was already used with different payout details'
                USING ERRCODE = '22000';
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'is_duplicate', true,
            'payout_id', v_existing.id,
            'payout_number', v_existing.payout_number,
            'amount', v_existing.amount,
            'status', v_existing.status,
            'message', 'Payout request already registered'
        );
    END IF;

    -- Invoke the original atomic reservation implementation.
    RETURN public.request_seller_payout_atomic_legacy(
        v_clean_amount,
        v_dest_type,
        CASE
            WHEN v_dest_type = 'BANK_ACCOUNT' THEN v_bank_id
            ELSE NULL
        END,
        v_idemp_key
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.request_seller_payout_atomic(numeric, text, uuid, text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.request_seller_payout_atomic(numeric, text, uuid, text)
TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

