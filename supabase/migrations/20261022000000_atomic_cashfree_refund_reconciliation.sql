-- ==============================================================================
-- VENDOSMITH: ATOMIC CASHFREE REFUND RECONCILIATION & ROW LOCKING
-- Migration: 20261022000000_atomic_cashfree_refund_reconciliation.sql
-- Description:
--   1. Provides reconcile_cashfree_refund_atomic RPC with row-level locks
--      (SELECT FOR UPDATE on orders and order_cancellations) to eliminate race
--      conditions from concurrent Cashfree refund webhooks.
--   2. Enforces exact integer paise arithmetic with zero slack.
--   3. Maintains event-level idempotency (keyed to refund_id / cf_refund_id).
--   4. Preserves order_payment_status_check constraint ('pending', 'paid', 'failed', 'refunded').
--   5. Automatically persists cumulative refund records, remaining balance, and audit logs.
--   6. Hardened privilege security (restricted exclusively to service_role).
--   7. Strictly rejects non-positive/NaN amounts and unpaid/failed order refunds.
--   8. Deterministically selects cancellation records and prevents duplicate audit logs.
-- ==============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.reconcile_cashfree_refund_atomic(
    p_order_id UUID,
    p_refund_id TEXT,
    p_cf_refund_id TEXT,
    p_refund_amount NUMERIC,
    p_refund_arn TEXT DEFAULT NULL,
    p_refund_status TEXT DEFAULT 'SUCCESS',
    p_event_type TEXT DEFAULT 'REFUND_STATUS_WEBHOOK',
    p_refund_note TEXT DEFAULT NULL,
    p_timestamp TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_order RECORD;
    v_cancellation RECORD;
    v_clean_amount NUMERIC(12, 2);
    v_clean_ref_id TEXT;
    v_clean_cf_ref_id TEXT;
    v_current_ref_key TEXT;
    v_order_total_paise BIGINT;
    v_refund_amount_paise BIGINT;
    v_prev_cumulative_paise BIGINT := 0;
    v_new_cumulative_paise BIGINT := 0;
    v_is_fully_refunded BOOLEAN := FALSE;
    v_recorded_refunds JSONB := '[]'::jsonb;
    v_refund_item JSONB;
    v_existing_item JSONB;
    v_already_processed BOOLEAN := FALSE;
    v_audit_row RECORD;
    v_audit_vals JSONB;
    v_audit_ref_id TEXT;
    v_new_meta JSONB;
BEGIN
    -- 1. Sanitize & Validate Inputs
    v_clean_ref_id := NULLIF(TRIM(p_refund_id), '');
    v_clean_cf_ref_id := NULLIF(TRIM(p_cf_refund_id), '');
    v_current_ref_key := COALESCE(v_clean_ref_id, v_clean_cf_ref_id);

    IF v_current_ref_key IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'MISSING_REFUND_IDENTIFIER',
            'message', 'Refund webhook missing refund_id or cf_refund_id.'
        );
    END IF;

    -- Strict check for NULL, zero, negative, or NaN refund amount
    IF p_refund_amount IS NULL OR p_refund_amount <= 0 OR p_refund_amount = 'NaN'::numeric THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INVALID_REFUND_AMOUNT',
            'message', 'Refund amount must be a strictly positive finite number.'
        );
    END IF;

    v_clean_amount := ROUND(p_refund_amount, 2);
    IF v_clean_amount <= 0 OR v_clean_amount = 'NaN'::numeric THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INVALID_REFUND_AMOUNT',
            'message', 'Refund amount rounded to paise must be strictly greater than zero.'
        );
    END IF;

    -- 2. Strict Row-Level Lock on Orders (prevents concurrent webhook race)
    SELECT id, order_number, total, payment_status
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'ORDER_NOT_FOUND',
            'message', 'Target order not found for refund reconciliation.'
        );
    END IF;

    -- Invariant: An order that was never paid (or failed) cannot be refunded
    IF v_order.payment_status NOT IN ('paid', 'refunded') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'ORDER_NOT_PAID',
            'message', 'Cannot reconcile refund for order with payment status: ' || COALESCE(v_order.payment_status, 'unknown') || '. Only paid orders can be refunded.'
        );
    END IF;

    -- 3. Deterministic Row-Level Lock on Order Cancellations
    -- Priority: full order cancellation (order_item_id IS NULL) first, then latest by cancelled_at
    SELECT id, metadata
    INTO v_cancellation
    FROM public.order_cancellations
    WHERE order_id = p_order_id
    ORDER BY (order_item_id IS NULL) DESC, cancelled_at DESC, id DESC
    LIMIT 1
    FOR UPDATE;

    -- 4. Reconstruct previously confirmed refunds
    IF v_cancellation.id IS NOT NULL AND (v_cancellation.metadata->'successful_refunds') IS NOT NULL THEN
        IF jsonb_typeof(v_cancellation.metadata->'successful_refunds') = 'array' THEN
            v_recorded_refunds := v_cancellation.metadata->'successful_refunds';
        END IF;
    END IF;

    -- Also check finance_audit_logs for confirmed refunds
    FOR v_audit_row IN
        SELECT new_values
        FROM public.finance_audit_logs
        WHERE target_entity = 'orders'
          AND target_id = p_order_id
          AND action_type IN ('CASHFREE_REFUND_CONFIRMED', 'CASHFREE_PARTIAL_REFUND_CONFIRMED')
    LOOP
        v_audit_vals := COALESCE(v_audit_row.new_values, '{}'::jsonb);
        v_audit_ref_id := COALESCE(v_audit_vals->>'refundId', v_audit_vals->>'cfRefundId');
        
        IF v_audit_ref_id IS NOT NULL AND v_audit_ref_id <> '' THEN
            -- Check if already present in v_recorded_refunds
            SELECT bool_or(
                (elem->>'refund_id' = v_audit_ref_id) OR 
                (elem->>'cf_refund_id' = v_audit_ref_id)
            ) INTO v_already_processed
            FROM jsonb_array_elements(v_recorded_refunds) AS elem;

            IF v_already_processed IS NOT TRUE THEN
                v_recorded_refunds := v_recorded_refunds || jsonb_build_array(jsonb_build_object(
                    'refund_id', v_audit_ref_id,
                    'cf_refund_id', v_audit_vals->>'cfRefundId',
                    'amount', (v_audit_vals->>'refundAmount')::numeric,
                    'arn', v_audit_vals->>'refundArn',
                    'status', 'SUCCESS',
                    'confirmed_at', COALESCE(v_audit_vals->>'timestamp', NOW()::text)
                ));
            END IF;
        END IF;
    END LOOP;

    -- 5. Calculate previous cumulative amount in integer paise
    SELECT COALESCE(SUM(ROUND(((elem->>'amount')::numeric) * 100)), 0)::bigint
    INTO v_prev_cumulative_paise
    FROM jsonb_array_elements(v_recorded_refunds) AS elem;

    -- 6. Event-level Idempotency Check
    SELECT bool_or(
        (v_clean_ref_id IS NOT NULL AND (elem->>'refund_id' = v_clean_ref_id OR elem->>'cf_refund_id' = v_clean_ref_id)) OR
        (v_clean_cf_ref_id IS NOT NULL AND (elem->>'cf_refund_id' = v_clean_cf_ref_id OR elem->>'refund_id' = v_clean_cf_ref_id))
    ) INTO v_already_processed
    FROM jsonb_array_elements(v_recorded_refunds) AS elem;

    IF v_already_processed IS TRUE THEN
        RETURN jsonb_build_object(
            'success', true,
            'received', true,
            'already_processed', true,
            'order_id', p_order_id,
            'refund_id', v_current_ref_key,
            'cumulative_refund_amount', ROUND(v_prev_cumulative_paise::numeric / 100, 2)
        );
    END IF;

    -- If order is already fully refunded:
    IF v_order.payment_status = 'refunded' THEN
        RETURN jsonb_build_object(
            'success', true,
            'received', true,
            'already_refunded', true,
            'order_id', p_order_id,
            'refund_id', v_current_ref_key
        );
    END IF;

    -- 7. Exact Integer Paise Arithmetic
    v_order_total_paise := ROUND(v_order.total * 100);
    v_refund_amount_paise := ROUND(v_clean_amount * 100);
    v_new_cumulative_paise := v_prev_cumulative_paise + v_refund_amount_paise;

    -- Over-refund check with ZERO slack
    IF v_new_cumulative_paise > v_order_total_paise THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'CUMULATIVE_EXCEEDS_TOTAL',
            'message', 'Cumulative refund amount exceeds authoritative order total.'
        );
    END IF;

    -- 8. Process SUCCESS refund
    IF p_refund_status = 'SUCCESS' OR p_event_type = 'REFUND_SUCCESS_WEBHOOK' THEN
        v_is_fully_refunded := (v_new_cumulative_paise >= v_order_total_paise);

        -- Build this refund item
        v_refund_item := jsonb_build_object(
            'refund_id', COALESCE(v_clean_ref_id, v_clean_cf_ref_id, 'ref_' || EXTRACT(EPOCH FROM NOW())::text),
            'cf_refund_id', v_clean_cf_ref_id,
            'amount', v_clean_amount,
            'arn', p_refund_arn,
            'status', 'SUCCESS',
            'confirmed_at', p_timestamp::text
        );

        v_recorded_refunds := v_recorded_refunds || jsonb_build_array(v_refund_item);

        -- Transition orders.payment_status to 'refunded' ONLY if authoritative cumulative total is reached
        IF v_is_fully_refunded THEN
            UPDATE public.orders
            SET payment_status = 'refunded',
                updated_at = p_timestamp
            WHERE id = p_order_id;
        END IF;

        -- Update order_cancellations metadata
        IF v_cancellation.id IS NOT NULL THEN
            v_new_meta := COALESCE(v_cancellation.metadata, '{}'::jsonb);
            v_new_meta := v_new_meta || jsonb_build_object(
                'successful_refunds', v_recorded_refunds,
                'cumulative_refund_amount', ROUND(v_new_cumulative_paise::numeric / 100, 2),
                'remaining_refundable_amount', GREATEST(0, ROUND((v_order_total_paise - v_new_cumulative_paise)::numeric / 100, 2)),
                'gateway_refund_status', CASE WHEN v_is_fully_refunded THEN 'SUCCESS' ELSE 'PARTIAL_SUCCESS' END,
                'gateway_refund_arn', COALESCE(p_refund_arn, v_new_meta->>'gateway_refund_arn'),
                'gateway_refund_id', v_current_ref_key,
                'gateway_refund_amount', ROUND(v_new_cumulative_paise::numeric / 100, 2),
                'gateway_refund_confirmed_at', p_timestamp::text
            );

            UPDATE public.order_cancellations
            SET metadata = v_new_meta
            WHERE id = v_cancellation.id;
        END IF;

        -- Insert finance_audit_logs
        INSERT INTO public.finance_audit_logs (
            action_type,
            target_entity,
            target_id,
            notes,
            new_values
        ) VALUES (
            CASE WHEN v_is_fully_refunded THEN 'CASHFREE_REFUND_CONFIRMED' ELSE 'CASHFREE_PARTIAL_REFUND_CONFIRMED' END,
            'orders',
            p_order_id,
            v_current_ref_key,
            jsonb_build_object(
                'orderId', p_order_id,
                'orderNumber', v_order.order_number,
                'refundId', v_clean_ref_id,
                'cfRefundId', v_clean_cf_ref_id,
                'refundAmount', v_clean_amount,
                'cumulativeRefundAmount', ROUND(v_new_cumulative_paise::numeric / 100, 2),
                'orderTotal', v_order.total,
                'isFullyRefunded', v_is_fully_refunded,
                'refundArn', p_refund_arn,
                'status', 'SUCCESS',
                'timestamp', p_timestamp::text
            )
        );

        RETURN jsonb_build_object(
            'success', true,
            'received', true,
            'refunded', v_is_fully_refunded,
            'is_partial', NOT v_is_fully_refunded,
            'status', 'SUCCESS',
            'order_id', p_order_id,
            'refund_id', v_current_ref_key,
            'cumulative_refund_amount', ROUND(v_new_cumulative_paise::numeric / 100, 2),
            'remaining_amount', GREATEST(0, ROUND((v_order_total_paise - v_new_cumulative_paise)::numeric / 100, 2))
        );
    END IF;

    -- 9. Handle PENDING refund
    IF p_refund_status = 'PENDING' THEN
        -- Prevent duplicate PENDING audit log entries on retries
        SELECT EXISTS (
            SELECT 1 FROM public.finance_audit_logs
            WHERE target_entity = 'orders'
              AND target_id = p_order_id
              AND action_type = 'CASHFREE_REFUND_PENDING'
              AND (notes = v_current_ref_key OR (new_values->>'refundId' = v_clean_ref_id OR new_values->>'cfRefundId' = v_clean_cf_ref_id))
        ) INTO v_already_processed;

        IF v_already_processed IS TRUE THEN
            RETURN jsonb_build_object(
                'success', true,
                'received', true,
                'already_processed', true,
                'status', 'PENDING',
                'order_id', p_order_id,
                'refund_id', v_current_ref_key
            );
        END IF;

        IF v_cancellation.id IS NOT NULL THEN
            UPDATE public.order_cancellations
            SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'gateway_refund_status', 'PENDING',
                'gateway_refund_id', v_current_ref_key
            )
            WHERE id = v_cancellation.id;
        END IF;

        INSERT INTO public.finance_audit_logs (
            action_type,
            target_entity,
            target_id,
            notes,
            new_values
        ) VALUES (
            'CASHFREE_REFUND_PENDING',
            'orders',
            p_order_id,
            v_current_ref_key,
            jsonb_build_object(
                'orderId', p_order_id,
                'refundId', v_clean_ref_id,
                'cfRefundId', v_clean_cf_ref_id,
                'refundAmount', v_clean_amount,
                'status', 'PENDING',
                'timestamp', p_timestamp::text
            )
        );

        RETURN jsonb_build_object(
            'success', true,
            'received', true,
            'refunded', false,
            'status', 'PENDING',
            'order_id', p_order_id
        );
    END IF;

    -- 10. Handle FAILED or CANCELLED refund
    IF p_refund_status IN ('FAILED', 'CANCELLED') OR p_event_type = 'REFUND_FAILED_WEBHOOK' THEN
        -- Prevent duplicate FAILED audit log entries on retries
        SELECT EXISTS (
            SELECT 1 FROM public.finance_audit_logs
            WHERE target_entity = 'orders'
              AND target_id = p_order_id
              AND action_type = 'CASHFREE_REFUND_FAILED'
              AND (notes = v_current_ref_key OR (new_values->>'refundId' = v_clean_ref_id OR new_values->>'cfRefundId' = v_clean_cf_ref_id))
        ) INTO v_already_processed;

        IF v_already_processed IS TRUE THEN
            RETURN jsonb_build_object(
                'success', true,
                'received', true,
                'already_processed', true,
                'status', 'FAILED',
                'order_id', p_order_id,
                'refund_id', v_current_ref_key
            );
        END IF;

        IF v_cancellation.id IS NOT NULL THEN
            UPDATE public.order_cancellations
            SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'gateway_refund_status', 'FAILED',
                'gateway_refund_failure_reason', COALESCE(p_refund_note, 'Gateway refund declined by bank'),
                'gateway_refund_id', v_current_ref_key
            )
            WHERE id = v_cancellation.id;
        END IF;

        INSERT INTO public.finance_audit_logs (
            action_type,
            target_entity,
            target_id,
            notes,
            new_values
        ) VALUES (
            'CASHFREE_REFUND_FAILED',
            'orders',
            p_order_id,
            v_current_ref_key,
            jsonb_build_object(
                'orderId', p_order_id,
                'refundId', v_clean_ref_id,
                'cfRefundId', v_clean_cf_ref_id,
                'refundAmount', v_clean_amount,
                'status', 'FAILED',
                'reason', p_refund_note,
                'timestamp', p_timestamp::text
            )
        );

        RETURN jsonb_build_object(
            'success', true,
            'received', true,
            'refunded', false,
            'status', 'FAILED',
            'order_id', p_order_id
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'received', true,
        'unclassified_refund_status', p_refund_status,
        'order_id', p_order_id
    );
END;
$function$;

-- Revoke all permissions from public, anon, and authenticated roles
REVOKE ALL ON FUNCTION public.reconcile_cashfree_refund_atomic(
    UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.reconcile_cashfree_refund_atomic(
    UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ
) FROM anon;

REVOKE ALL ON FUNCTION public.reconcile_cashfree_refund_atomic(
    UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ
) FROM authenticated;

-- Grant EXECUTE exclusively to service_role (server-side webhook route handler)
GRANT EXECUTE ON FUNCTION public.reconcile_cashfree_refund_atomic(
    UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ
) TO service_role;

COMMIT;
