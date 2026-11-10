BEGIN;

CREATE OR REPLACE FUNCTION public.process_settlement_hold_releases_atomic()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_settlement RECORD;
    v_seller RECORD;
    v_released_count INT := 0;
    v_total_released_paise BIGINT := 0;
    v_idemp_key TEXT;
    v_new_available_paise BIGINT;
BEGIN
    UPDATE public.seller_settlements
    SET settlement_status = 'eligible_released',
        settled_at = NOW(),
        updated_at = NOW()
    WHERE settlement_status = 'on_hold'
      AND hold_until IS NOT NULL
      AND hold_until <= NOW()
      AND (UPPER(payment_method) != 'COD' OR cod_reconciled = true)
      AND NOT EXISTS (
          SELECT 1
          FROM public.return_requests rr
          WHERE rr.order_item_id = seller_settlements.order_item_id
            AND rr.status IN (
                'REFUND_APPROVED',
                'REFUND_PROCESSING',
                'REFUND_COMPLETED',
                'REPLACEMENT_DELIVERED'
            )
      );

    FOR v_settlement IN
        SELECT
            s.*,
            COALESCE(sb.available_balance, 0.00) AS current_avail_num
        FROM public.seller_settlements s
        LEFT JOIN public.seller_balances sb
            ON sb.seller_id = s.seller_id
        WHERE s.settlement_status = 'eligible_released'
          AND NOT EXISTS (
              SELECT 1
              FROM public.seller_ledger_entries le
              WHERE le.idempotency_key = 'HOLD_RELEASE_' || s.id
          )
          AND NOT EXISTS (
              SELECT 1
              FROM public.return_requests rr
              WHERE rr.order_item_id = s.order_item_id
                AND rr.status IN (
                    'REFUND_APPROVED',
                    'REFUND_PROCESSING',
                    'REFUND_COMPLETED',
                    'REPLACEMENT_DELIVERED'
                )
          )
        FOR UPDATE OF s
    LOOP
        v_idemp_key := 'HOLD_RELEASE_' || v_settlement.id;

        INSERT INTO public.seller_balances (
            seller_id,
            pending_balance,
            available_balance,
            locked_balance,
            lifetime_earned,
            lifetime_withdrawn
        )
        VALUES (
            v_settlement.seller_id,
            0.00,
            0.00,
            0.00,
            0.00,
            0.00
        )
        ON CONFLICT (seller_id) DO NOTHING;

        SELECT *
        INTO v_seller
        FROM public.seller_balances
        WHERE seller_id = v_settlement.seller_id
        FOR UPDATE;

        v_new_available_paise :=
            ROUND((v_seller.available_balance * 100)
            + v_settlement.net_seller_payable_paise)::BIGINT;

        UPDATE public.seller_balances
        SET available_balance = ROUND(v_new_available_paise / 100.0, 2),
            lifetime_earned = ROUND(
                (lifetime_earned * 100
                + v_settlement.net_seller_payable_paise) / 100.0, 2
            ),
            updated_at = NOW()
        WHERE seller_id = v_settlement.seller_id;

        INSERT INTO public.seller_ledger_entries (
            seller_id,
            order_id,
            order_item_id,
            settlement_id,
            entry_type,
            direction,
            amount_paise,
            balance_type,
            available_balance_after_paise,
            idempotency_key,
            description,
            actor_type
        )
        VALUES (
            v_settlement.seller_id,
            v_settlement.order_id,
            v_settlement.order_item_id,
            v_settlement.id,
            'HOLD_RELEASE',
            'credit',
            v_settlement.net_seller_payable_paise,
            'available',
            v_new_available_paise,
            v_idemp_key,
            '7-day hold released for order #'
                || v_settlement.order_number
                || ' ('
                || v_settlement.product_title
                || ')',
            'system'
        )
        ON CONFLICT (idempotency_key) DO NOTHING;

        v_released_count := v_released_count + 1;
        v_total_released_paise :=
            v_total_released_paise
            + v_settlement.net_seller_payable_paise;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'released_count', v_released_count,
        'total_released_rupees',
            ROUND(v_total_released_paise / 100.0, 2)
    );
END;
$function$;

REVOKE EXECUTE
ON FUNCTION public.process_settlement_hold_releases_atomic()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.process_settlement_hold_releases_atomic()
TO service_role;

COMMIT;