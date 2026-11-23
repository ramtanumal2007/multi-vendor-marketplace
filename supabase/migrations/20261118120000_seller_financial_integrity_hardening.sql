-- ==============================================================================
-- VENDOSMITH: SELLER FINANCIAL INTEGRITY & PAYOUT HARDENING
-- Migration: 20261118120000_seller_financial_integrity_hardening.sql
-- Description:
--   1. Finding 1: Implements atomic seller refund deduction RPC (debit_seller_balance_for_refund_atomic).
--   2. Finding 2: Implements atomic order cancellation settlement reversal RPC (adjust_seller_settlement_for_cancellation_atomic).
--   3. Finding 3: Adds funds_released tracking to seller_payout_requests and fixes reopen double-debit in admin_reopen_payout_request_atomic.
--   4. Finding 4: Implements atomic admin credit to seller balances (admin_credit_seller_balance_atomic).
--   5. Finding 6: Eliminates non-deterministic timestamps in payout ledger idempotency keys.
--   6. Finding 7: Scopes sync_seller_order_settlements_atomic to per-order execution on order triggers.
-- ==============================================================================

-- 1. ADD FUNDS_RELEASED TO SELLER_PAYOUT_REQUESTS
ALTER TABLE public.seller_payout_requests 
ADD COLUMN IF NOT EXISTS funds_released BOOLEAN NOT NULL DEFAULT true;

-- ==============================================================================
-- 2. ATOMIC RPC: DEBIT SELLER BALANCE FOR REFUND (FINDING 1)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.debit_seller_balance_for_refund_atomic(
    p_return_request_id UUID,
    p_order_id UUID,
    p_order_item_id UUID,
    p_seller_id UUID,
    p_deduction_paise BIGINT,
    p_customer_refund_paise BIGINT,
    p_admin_id UUID,
    p_returned_qty INT,
    p_total_qty INT,
    p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existing_tx RECORD;
    v_settlement RECORD;
    v_seller_bal RECORD;
    v_new_avail_paise BIGINT;
    v_is_released BOOLEAN := false;
BEGIN
    IF p_idempotency_key IS NULL OR TRIM(p_idempotency_key) = '' THEN
        RAISE EXCEPTION 'Idempotency key is required' USING ERRCODE = '22000';
    END IF;

    -- 1. Idempotency Check
    SELECT id, available_balance_after_paise INTO v_existing_tx
    FROM public.seller_ledger_entries
    WHERE idempotency_key = TRIM(p_idempotency_key);

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'is_duplicate', true,
            'transaction_id', v_existing_tx.id,
            'available_balance_after', ROUND(v_existing_tx.available_balance_after_paise / 100.0, 2),
            'message', 'Refund deduction already processed'
        );
    END IF;

    -- 2. Lock settlement row
    SELECT * INTO v_settlement
    FROM public.seller_settlements
    WHERE order_item_id = p_order_item_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Seller settlement not found for order item %', p_order_item_id USING ERRCODE = 'P0002';
    END IF;

    -- Re-check idempotency under settlement row lock to handle concurrent arrivals
    SELECT id, available_balance_after_paise INTO v_existing_tx
    FROM public.seller_ledger_entries
    WHERE idempotency_key = TRIM(p_idempotency_key);

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'is_duplicate', true,
            'transaction_id', v_existing_tx.id,
            'available_balance_after', ROUND(v_existing_tx.available_balance_after_paise / 100.0, 2),
            'message', 'Refund deduction already processed'
        );
    END IF;

    -- Ensure seller matches
    IF v_settlement.seller_id != p_seller_id THEN
        RAISE EXCEPTION 'Settlement seller mismatch' USING ERRCODE = '22000';
    END IF;

    -- 3. Lock seller balance row
    INSERT INTO public.seller_balances (seller_id, pending_balance, available_balance, locked_balance, lifetime_earned, lifetime_withdrawn)
    VALUES (p_seller_id, 0.00, 0.00, 0.00, 0.00, 0.00)
    ON CONFLICT (seller_id) DO NOTHING;

    SELECT * INTO v_seller_bal
    FROM public.seller_balances
    WHERE seller_id = p_seller_id
    FOR UPDATE;

    v_is_released := (v_settlement.settlement_status = 'eligible_released');

    IF v_is_released THEN
        -- Settlement was already released to available balance: debit available balance (deficit allowed)
        v_new_avail_paise := ROUND(v_seller_bal.available_balance * 100)::BIGINT - p_deduction_paise;

        UPDATE public.seller_balances
        SET available_balance = ROUND(v_new_avail_paise / 100.0, 2),
            updated_at = NOW()
        WHERE seller_id = p_seller_id;

        UPDATE public.seller_settlements
        SET settlement_status = 'refunded_adjusted',
            refunded_amount_paise = COALESCE(refunded_amount_paise, 0) + p_customer_refund_paise,
            net_seller_payable_paise = GREATEST(0, net_seller_payable_paise - p_deduction_paise),
            updated_at = NOW()
        WHERE id = v_settlement.id;

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
            actor_id,
            actor_type,
            metadata
        ) VALUES (
            p_seller_id,
            p_order_id,
            p_order_item_id,
            v_settlement.id,
            'REFUND_DEDUCTION',
            'debit',
            p_deduction_paise,
            'available',
            v_new_avail_paise,
            TRIM(p_idempotency_key),
            'Refund deduction for return request ' || p_return_request_id || ' (' || p_returned_qty || '/' || p_total_qty || ' units)',
            p_admin_id,
            'admin',
            jsonb_build_object(
                'return_request_id', p_return_request_id,
                'customer_refund_paise', p_customer_refund_paise,
                'seller_deduction_paise', p_deduction_paise,
                'returned_quantity', p_returned_qty,
                'total_quantity', p_total_qty
            )
        );
    ELSE
        -- Settlement is still pending or on hold: adjust settlement without debiting available balance
        v_new_avail_paise := ROUND(v_seller_bal.available_balance * 100)::BIGINT;

        UPDATE public.seller_settlements
        SET settlement_status = 'refunded_adjusted',
            refunded_amount_paise = COALESCE(refunded_amount_paise, 0) + p_customer_refund_paise,
            net_seller_payable_paise = GREATEST(0, net_seller_payable_paise - p_deduction_paise),
            updated_at = NOW()
        WHERE id = v_settlement.id;

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
            actor_id,
            actor_type,
            metadata
        ) VALUES (
            p_seller_id,
            p_order_id,
            p_order_item_id,
            v_settlement.id,
            'REFUND_DEDUCTION',
            'neutral',
            p_deduction_paise,
            'pending',
            v_new_avail_paise,
            TRIM(p_idempotency_key),
            'Held settlement adjusted for return request ' || p_return_request_id || ' (' || p_returned_qty || '/' || p_total_qty || ' units)',
            p_admin_id,
            'admin',
            jsonb_build_object(
                'return_request_id', p_return_request_id,
                'customer_refund_paise', p_customer_refund_paise,
                'seller_deduction_paise', p_deduction_paise,
                'previous_settlement_status', v_settlement.settlement_status,
                'returned_quantity', p_returned_qty,
                'total_quantity', p_total_qty
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'is_duplicate', false,
        'is_released', v_is_released,
        'deduction_rupees', ROUND(p_deduction_paise / 100.0, 2),
        'new_available_balance', ROUND(v_new_avail_paise / 100.0, 2)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.debit_seller_balance_for_refund_atomic FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.debit_seller_balance_for_refund_atomic TO service_role;


-- ==============================================================================
-- 3. ATOMIC RPC: REVERSE SELLER SETTLEMENT FOR CANCELLATION (FINDING 2)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.adjust_seller_settlement_for_cancellation_atomic(
    p_order_id UUID,
    p_admin_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT 'Order cancelled'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_settlement RECORD;
    v_seller_bal RECORD;
    v_new_avail_paise BIGINT;
    v_deduction_paise BIGINT;
    v_idemp_key TEXT;
    v_reversed_count INT := 0;
    v_total_reversed_paise BIGINT := 0;
BEGIN
    FOR v_settlement IN
        SELECT *
        FROM public.seller_settlements
        WHERE order_id = p_order_id
        FOR UPDATE
    LOOP
        IF v_settlement.settlement_status = 'eligible_released' THEN
            -- Funds were already released: reverse them from seller available balance
            v_deduction_paise := v_settlement.net_seller_payable_paise;
            v_idemp_key := 'CANCELLATION_ADJUSTMENT_' || v_settlement.id;

            IF NOT EXISTS (SELECT 1 FROM public.seller_ledger_entries WHERE idempotency_key = v_idemp_key) THEN
                SELECT * INTO v_seller_bal
                FROM public.seller_balances
                WHERE seller_id = v_settlement.seller_id
                FOR UPDATE;

                v_new_avail_paise := ROUND(v_seller_bal.available_balance * 100)::BIGINT - v_deduction_paise;

                UPDATE public.seller_balances
                SET available_balance = ROUND(v_new_avail_paise / 100.0, 2),
                    lifetime_earned = ROUND((v_seller_bal.lifetime_earned * 100 - v_deduction_paise) / 100.0, 2),
                    updated_at = NOW()
                WHERE seller_id = v_settlement.seller_id;

                UPDATE public.seller_settlements
                SET settlement_status = 'cancelled',
                    refunded_amount_paise = v_settlement.gross_amount_paise,
                    net_seller_payable_paise = 0,
                    updated_at = NOW()
                WHERE id = v_settlement.id;

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
                    actor_id,
                    actor_type
                ) VALUES (
                    v_settlement.seller_id,
                    v_settlement.order_id,
                    v_settlement.order_item_id,
                    v_settlement.id,
                    'CANCELLATION_ADJUSTMENT',
                    'debit',
                    v_deduction_paise,
                    'available',
                    v_new_avail_paise,
                    v_idemp_key,
                    'Order #' || v_settlement.order_number || ' cancelled after release: ' || COALESCE(p_reason, 'Cancellation adjustment'),
                    p_admin_id,
                    CASE WHEN p_admin_id IS NOT NULL THEN 'admin' ELSE 'system' END
                );

                v_reversed_count := v_reversed_count + 1;
                v_total_reversed_paise := v_total_reversed_paise + v_deduction_paise;
            END IF;
        ELSIF v_settlement.settlement_status IN ('on_hold', 'pending_delivery') THEN
            -- Funds were not yet released: cancel settlement to prevent release
            UPDATE public.seller_settlements
            SET settlement_status = 'cancelled',
                updated_at = NOW()
            WHERE id = v_settlement.id;

            v_reversed_count := v_reversed_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'reversed_items_count', v_reversed_count,
        'total_reversed_rupees', ROUND(v_total_reversed_paise / 100.0, 2)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_seller_settlement_for_cancellation_atomic FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_seller_settlement_for_cancellation_atomic TO service_role;


-- ==============================================================================
-- 4. ATOMIC RPC: ADMIN CREDIT SELLER BALANCE (FINDING 4)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.admin_credit_seller_balance_atomic(
    p_seller_id UUID,
    p_amount_rupees NUMERIC,
    p_reason TEXT,
    p_admin_id UUID,
    p_admin_email TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_amount NUMERIC(12, 2);
    v_amount_paise BIGINT;
    v_idemp_key TEXT;
    v_existing_tx RECORD;
    v_seller_bal RECORD;
    v_new_avail_paise BIGINT;
    v_tx_id UUID;
BEGIN
    v_clean_amount := ROUND(p_amount_rupees, 2);
    IF v_clean_amount <= 0 THEN
        RAISE EXCEPTION 'Credit amount must be positive' USING ERRCODE = '22000';
    END IF;
    IF v_clean_amount > 50000.00 THEN
        RAISE EXCEPTION 'Credit amount exceeds maximum allowed single adjustment limit of ₹50,000.00' USING ERRCODE = '22000';
    END IF;
    v_amount_paise := ROUND(v_clean_amount * 100)::BIGINT;

    v_idemp_key := TRIM(COALESCE(p_idempotency_key, 'ADMIN_CREDIT_SELLER_' || p_seller_id || '_' || gen_random_uuid()::TEXT));

    -- Idempotency check
    SELECT id, available_balance_after_paise INTO v_existing_tx
    FROM public.seller_ledger_entries
    WHERE idempotency_key = v_idemp_key;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'is_duplicate', true,
            'transaction_id', v_existing_tx.id,
            'new_balance', ROUND(v_existing_tx.available_balance_after_paise / 100.0, 2),
            'amount', v_clean_amount,
            'message', 'Admin credit already processed'
        );
    END IF;

    -- Lock seller balances
    INSERT INTO public.seller_balances (seller_id, pending_balance, available_balance, locked_balance, lifetime_earned, lifetime_withdrawn)
    VALUES (p_seller_id, 0.00, 0.00, 0.00, 0.00, 0.00)
    ON CONFLICT (seller_id) DO NOTHING;

    SELECT * INTO v_seller_bal
    FROM public.seller_balances
    WHERE seller_id = p_seller_id
    FOR UPDATE;

    v_new_avail_paise := ROUND(v_seller_bal.available_balance * 100)::BIGINT + v_amount_paise;

    UPDATE public.seller_balances
    SET available_balance = ROUND(v_new_avail_paise / 100.0, 2),
        lifetime_earned = ROUND((v_seller_bal.lifetime_earned * 100 + v_amount_paise) / 100.0, 2),
        updated_at = NOW()
    WHERE seller_id = p_seller_id;

    INSERT INTO public.seller_ledger_entries (
        seller_id,
        entry_type,
        direction,
        amount_paise,
        balance_type,
        available_balance_after_paise,
        idempotency_key,
        description,
        actor_id,
        actor_type,
        metadata
    ) VALUES (
        p_seller_id,
        'ADMIN_ADJUSTMENT',
        'credit',
        v_amount_paise,
        'available',
        v_new_avail_paise,
        v_idemp_key,
        'Admin manual credit: ' || TRIM(p_reason) || ' (Authorized by ' || COALESCE(p_admin_email, p_admin_id::TEXT) || ')',
        p_admin_id,
        'admin',
        jsonb_build_object('reason', TRIM(p_reason), 'admin_email', p_admin_email)
    ) RETURNING id INTO v_tx_id;

    RETURN jsonb_build_object(
        'success', true,
        'is_duplicate', false,
        'transaction_id', v_tx_id,
        'amount', v_clean_amount,
        'previous_balance', v_seller_bal.available_balance,
        'new_balance', ROUND(v_new_avail_paise / 100.0, 2),
        'recipient_id', p_seller_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_credit_seller_balance_atomic FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_credit_seller_balance_atomic TO service_role;


-- ==============================================================================
-- 5. FIX PAYOUT REJECTION, FAILURE & REOPEN ATOMIC RPCS (FINDINGS 3 & 6)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.admin_fail_payout_transfer_atomic(
    p_payout_id UUID,
    p_failure_reason TEXT,
    p_release_funds BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_id UUID;
    v_payout RECORD;
    v_seller_bal RECORD;
    v_new_available_paise BIGINT;
    v_new_locked_paise BIGINT;
    v_release_seq INT;
    v_idemp_key TEXT;
BEGIN
    v_admin_id := auth.uid();
    IF v_admin_id IS NULL THEN
        BEGIN
            v_admin_id := ((current_setting('request.jwt.claims', true)::jsonb)->>'sub')::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_admin_id := NULL;
        END;
    END IF;

    IF NOT public.is_admin() AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_admin_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only marketplace administrators can record payout failures' USING ERRCODE = '42501';
    END IF;

    IF p_failure_reason IS NULL OR TRIM(p_failure_reason) = '' THEN
        RAISE EXCEPTION 'A mandatory failure reason is required' USING ERRCODE = '22000';
    END IF;

    SELECT * INTO v_payout
    FROM public.seller_payout_requests
    WHERE id = p_payout_id
    FOR UPDATE;

    IF v_payout IS NULL THEN
        RAISE EXCEPTION 'Payout request not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_payout.status NOT IN ('approved', 'processing') THEN
        RAISE EXCEPTION 'Cannot record failure for payout in % state. Payout must be in approved or processing state', v_payout.status USING ERRCODE = '22000';
    END IF;

    UPDATE public.seller_payout_requests
    SET status = 'failed',
        failed_at = NOW(),
        failure_reason = TRIM(p_failure_reason),
        funds_released = p_release_funds,
        updated_at = NOW()
    WHERE id = p_payout_id;

    IF p_release_funds THEN
        SELECT * INTO v_seller_bal
        FROM public.seller_balances
        WHERE seller_id = v_payout.seller_id
        FOR UPDATE;

        v_new_available_paise := ROUND((v_seller_bal.available_balance * 100) + v_payout.amount_paise)::BIGINT;
        v_new_locked_paise := GREATEST(0, ROUND((v_seller_bal.locked_balance * 100) - v_payout.amount_paise)::BIGINT);

        UPDATE public.seller_balances
        SET available_balance = ROUND(v_new_available_paise / 100.0, 2),
            locked_balance = ROUND(v_new_locked_paise / 100.0, 2),
            updated_at = NOW()
        WHERE seller_id = v_payout.seller_id;

        SELECT COUNT(*) + 1 INTO v_release_seq
        FROM public.seller_ledger_entries
        WHERE payout_request_id = p_payout_id AND entry_type = 'PAYOUT_RESERVATION_RELEASED';

        v_idemp_key := 'PAYOUT_FAIL_REL_' || p_payout_id || '_v' || v_release_seq;

        INSERT INTO public.seller_ledger_entries (
            seller_id,
            payout_request_id,
            entry_type,
            direction,
            amount_paise,
            balance_type,
            available_balance_after_paise,
            idempotency_key,
            description,
            actor_id,
            actor_type,
            metadata
        ) VALUES (
            v_payout.seller_id,
            p_payout_id,
            'PAYOUT_RESERVATION_RELEASED',
            'credit',
            v_payout.amount_paise,
            'available',
            v_new_available_paise,
            v_idemp_key,
            'Payout #' || v_payout.payout_number || ' transfer failed: ' || TRIM(p_failure_reason) || ' (Funds restored)',
            v_admin_id,
            'admin',
            jsonb_build_object('failure_reason', TRIM(p_failure_reason))
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'payout_id', p_payout_id,
        'status', 'failed',
        'funds_released', p_release_funds,
        'message', 'Transfer failure recorded.'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reopen_payout_request_atomic(
    p_payout_id UUID,
    p_reason TEXT,
    p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_id UUID;
    v_payout RECORD;
    v_seller_bal RECORD;
    v_new_available_paise BIGINT;
    v_new_locked_paise BIGINT;
    v_clean_reason TEXT;
    v_old_status TEXT;
    v_reopen_seq INT;
    v_idemp_key TEXT;
BEGIN
    v_admin_id := auth.uid();
    IF v_admin_id IS NULL THEN
        BEGIN
            v_admin_id := ((current_setting('request.jwt.claims', true)::jsonb)->>'sub')::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_admin_id := NULL;
        END;
    END IF;

    IF NOT public.is_admin() AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_admin_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only marketplace administrators can reopen payout requests' USING ERRCODE = '42501';
    END IF;

    v_clean_reason := TRIM(COALESCE(p_reason, ''));
    IF char_length(v_clean_reason) < 3 THEN
        RAISE EXCEPTION 'A mandatory justification reason is required to reopen a payout request' USING ERRCODE = '22000';
    END IF;

    SELECT * INTO v_payout
    FROM public.seller_payout_requests
    WHERE id = p_payout_id
    FOR UPDATE;

    IF NOT FOUND OR v_payout.id IS NULL THEN
        RAISE EXCEPTION 'Payout request not found' USING ERRCODE = 'P0002';
    END IF;

    v_old_status := v_payout.status;
    IF v_old_status NOT IN ('rejected', 'failed') THEN
        RAISE EXCEPTION 'Only rejected or failed payout requests can be reopened. Current status: %', v_old_status USING ERRCODE = '22000';
    END IF;

    SELECT * INTO v_seller_bal
    FROM public.seller_balances
    WHERE seller_id = v_payout.seller_id
    FOR UPDATE;

    -- If funds were released upon failure/rejection, we must re-reserve them from available balance!
    -- If funds were NOT released (held), they are already in locked_balance! Do NOT debit available balance again!
    IF v_payout.funds_released THEN
        IF v_seller_bal.available_balance < v_payout.amount THEN
            RAISE EXCEPTION 'Cannot reopen payout request: Seller current available balance (₹%) is insufficient to reserve payout amount of ₹%', 
                v_seller_bal.available_balance, v_payout.amount USING ERRCODE = '22000';
        END IF;

        v_new_available_paise := ROUND((v_seller_bal.available_balance * 100) - v_payout.amount_paise)::BIGINT;
        v_new_locked_paise := ROUND((v_seller_bal.locked_balance * 100) + v_payout.amount_paise)::BIGINT;

        UPDATE public.seller_balances
        SET available_balance = ROUND(v_new_available_paise / 100.0, 2),
            locked_balance = ROUND(v_new_locked_paise / 100.0, 2),
            updated_at = NOW()
        WHERE seller_id = v_payout.seller_id;

        SELECT COUNT(*) + 1 INTO v_reopen_seq
        FROM public.seller_ledger_entries
        WHERE payout_request_id = p_payout_id AND entry_type = 'PAYOUT_RESERVED';

        v_idemp_key := 'PAYOUT_REOPEN_RES_' || v_payout.id || '_v' || v_reopen_seq;

        INSERT INTO public.seller_ledger_entries (
            seller_id,
            payout_request_id,
            entry_type,
            direction,
            amount_paise,
            balance_type,
            available_balance_after_paise,
            idempotency_key,
            description,
            actor_id,
            actor_type,
            metadata
        ) VALUES (
            v_payout.seller_id,
            v_payout.id,
            'PAYOUT_RESERVED',
            'debit',
            v_payout.amount_paise,
            'available',
            v_new_available_paise,
            v_idemp_key,
            'Payout request #' || v_payout.payout_number || ' reopened from ' || v_old_status || ': ' || v_clean_reason || ' (Funds re-reserved for review)',
            v_admin_id,
            'admin',
            jsonb_build_object('previous_status', v_old_status, 'reason', v_clean_reason)
        );
    ELSE
        -- Funds remained in locked_balance; no balance mutation required
        v_new_available_paise := ROUND(v_seller_bal.available_balance * 100)::BIGINT;
        v_new_locked_paise := ROUND(v_seller_bal.locked_balance * 100)::BIGINT;
    END IF;

    UPDATE public.seller_payout_requests
    SET status = 'pending',
        funds_released = false, -- funds are held for review
        rejection_reason = NULL,
        failure_reason = NULL,
        rejected_at = NULL,
        rejected_by = NULL,
        failed_at = NULL,
        admin_notes = COALESCE(admin_notes || E'\n', '') || '[REOPENED ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS') || ']: ' || v_clean_reason || COALESCE(' (' || p_admin_notes || ')', ''),
        updated_at = NOW()
    WHERE id = p_payout_id;

    RETURN jsonb_build_object(
        'success', true,
        'payout_id', v_payout.id,
        'payout_number', v_payout.payout_number,
        'status', 'pending',
        'previous_status', v_old_status,
        'amount', v_payout.amount,
        'remaining_available_balance', ROUND(v_new_available_paise / 100.0, 2),
        'reserved_balance', ROUND(v_new_locked_paise / 100.0, 2)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_payout_request_atomic(
    p_payout_id UUID,
    p_action TEXT,
    p_reason TEXT DEFAULT NULL,
    p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_id UUID;
    v_payout RECORD;
    v_seller_bal RECORD;
    v_action TEXT;
    v_new_available_paise BIGINT;
    v_new_locked_paise BIGINT;
    v_rej_seq INT;
    v_idemp_key TEXT;
BEGIN
    v_admin_id := auth.uid();
    IF v_admin_id IS NULL THEN
        BEGIN
            v_admin_id := ((current_setting('request.jwt.claims', true)::jsonb)->>'sub')::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_admin_id := NULL;
        END;
    END IF;

    IF NOT public.is_admin() AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_admin_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only marketplace administrators can review payout requests' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_payout
    FROM public.seller_payout_requests
    WHERE id = p_payout_id
    FOR UPDATE;

    IF v_payout IS NULL THEN
        RAISE EXCEPTION 'Payout request not found' USING ERRCODE = 'P0002';
    END IF;

    v_action := UPPER(TRIM(p_action));

    IF v_action = 'APPROVE' THEN
        IF v_payout.status != 'pending' THEN
            RAISE EXCEPTION 'Only pending payout requests can be approved. Current status: %', v_payout.status USING ERRCODE = '22000';
        END IF;

        UPDATE public.seller_payout_requests
        SET status = 'approved',
            approved_at = NOW(),
            approved_by = v_admin_id,
            admin_notes = COALESCE(p_admin_notes, admin_notes),
            updated_at = NOW()
        WHERE id = p_payout_id;

        RETURN jsonb_build_object(
            'success', true,
            'payout_id', v_payout.id,
            'payout_number', v_payout.payout_number,
            'status', 'approved'
        );

    ELSIF v_action = 'REJECT' THEN
        IF v_payout.status NOT IN ('pending', 'approved') THEN
            RAISE EXCEPTION 'Cannot reject payout request in % state', v_payout.status USING ERRCODE = '22000';
        END IF;

        IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
            RAISE EXCEPTION 'A mandatory rejection reason is required' USING ERRCODE = '22000';
        END IF;

        SELECT * INTO v_seller_bal
        FROM public.seller_balances
        WHERE seller_id = v_payout.seller_id
        FOR UPDATE;

        v_new_available_paise := ROUND((v_seller_bal.available_balance * 100) + v_payout.amount_paise)::BIGINT;
        v_new_locked_paise := GREATEST(0, ROUND((v_seller_bal.locked_balance * 100) - v_payout.amount_paise)::BIGINT);

        UPDATE public.seller_balances
        SET available_balance = ROUND(v_new_available_paise / 100.0, 2),
            locked_balance = ROUND(v_new_locked_paise / 100.0, 2),
            updated_at = NOW()
        WHERE seller_id = v_payout.seller_id;

        UPDATE public.seller_payout_requests
        SET status = 'rejected',
            funds_released = true,
            rejected_at = NOW(),
            rejected_by = v_admin_id,
            rejection_reason = TRIM(p_reason),
            admin_notes = COALESCE(p_admin_notes, admin_notes),
            updated_at = NOW()
        WHERE id = p_payout_id;

        SELECT COUNT(*) + 1 INTO v_rej_seq
        FROM public.seller_ledger_entries
        WHERE payout_request_id = v_payout.id AND entry_type = 'PAYOUT_RESERVATION_RELEASED';

        v_idemp_key := 'PAYOUT_REJ_REL_' || v_payout.id || '_v' || v_rej_seq;

        INSERT INTO public.seller_ledger_entries (
            seller_id,
            payout_request_id,
            entry_type,
            direction,
            amount_paise,
            balance_type,
            available_balance_after_paise,
            idempotency_key,
            description,
            actor_id,
            actor_type,
            metadata
        ) VALUES (
            v_payout.seller_id,
            v_payout.id,
            'PAYOUT_RESERVATION_RELEASED',
            'credit',
            v_payout.amount_paise,
            'available',
            v_new_available_paise,
            v_idemp_key,
            'Payout request #' || v_payout.payout_number || ' rejected: ' || TRIM(p_reason) || ' (Funds released back to balance)',
            v_admin_id,
            'admin',
            jsonb_build_object('reason', TRIM(p_reason))
        );

        RETURN jsonb_build_object(
            'success', true,
            'payout_id', v_payout.id,
            'payout_number', v_payout.payout_number,
            'status', 'rejected',
            'restored_balance', ROUND(v_new_available_paise / 100.0, 2)
        );
    ELSE
        RAISE EXCEPTION 'Invalid review action. Must be APPROVE or REJECT' USING ERRCODE = '22000';
    END IF;
END;
$$;


-- ==============================================================================
-- 6. SCOPED PER-ORDER SETTLEMENT SYNC & TRIGGER (FINDING 7)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.sync_seller_order_settlements_atomic(p_order_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order_item RECORD;
    v_seller_id UUID;
    v_membership_plan TEXT;
    v_comm_rate NUMERIC(6, 4) := 0.1200;
    v_gst_rate NUMERIC(6, 4) := 0.1800;
    v_tcs_rate NUMERIC(6, 4) := 0.0050;
    v_tds_rate NUMERIC(6, 4) := 0.0010;
    v_hold_days INT := 7;
    v_platform_absorbs_coupon BOOLEAN := true;
    
    v_unit_price_paise BIGINT;
    v_gross_amount_paise BIGINT;
    v_coupon_allocated_paise BIGINT := 0;
    v_commission_amount_paise BIGINT := 0;
    v_gst_on_comm_paise BIGINT := 0;
    v_tcs_paise BIGINT := 0;
    v_tds_paise BIGINT := 0;
    v_net_seller_payable_paise BIGINT := 0;
    v_order_delivered_at TIMESTAMPTZ;
    v_hold_until TIMESTAMPTZ := NULL;
    v_is_cod BOOLEAN := false;
    v_is_cod_reconciled BOOLEAN := false;
    v_target_status TEXT := 'pending_delivery';
    v_synced_count INT := 0;
BEGIN
    FOR v_order_item IN 
        SELECT 
            oi.id AS item_id,
            oi.order_id,
            oi.store_id,
            oi.product_id,
            oi.order_item_code,
            oi.title,
            oi.sku,
            oi.quantity,
            oi.unit_price,
            oi.line_total,
            o.order_number,
            o.payment_method,
            o.payment_status,
            o.fulfillment_status,
            o.subtotal AS order_subtotal,
            o.discount_amount AS order_discount_amount,
            o.created_at AS order_created_at,
            o.updated_at AS order_updated_at,
            o.delivered_at AS order_delivered_at,
            s.seller_id AS store_seller_id,
            sp.membership_plan AS seller_membership_plan
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        LEFT JOIN public.stores s ON s.id = oi.store_id
        LEFT JOIN public.seller_profiles sp ON sp.id = s.seller_id
        WHERE s.seller_id IS NOT NULL
          AND (p_order_id IS NULL OR o.id = p_order_id)
    LOOP
        v_seller_id := v_order_item.store_seller_id;
        v_membership_plan := COALESCE(v_order_item.seller_membership_plan, 'BASIC');

        SELECT 
            COALESCE(commission_rate, 0.1200),
            COALESCE(gst_rate, 0.1800),
            COALESCE(tcs_rate, 0.0050),
            COALESCE(tds_rate, 0.0010),
            COALESCE(escrow_hold_days, 7),
            COALESCE(platform_absorbs_coupons, true)
        INTO 
            v_comm_rate,
            v_gst_rate,
            v_tcs_rate,
            v_tds_rate,
            v_hold_days,
            v_platform_absorbs_coupon
        FROM public.marketplace_fee_rules
        WHERE membership_plan = v_membership_plan
        LIMIT 1;

        v_unit_price_paise := ROUND(COALESCE(v_order_item.unit_price, 0) * 100)::BIGINT;
        v_gross_amount_paise := ROUND(COALESCE(v_order_item.line_total, v_order_item.unit_price * v_order_item.quantity) * 100)::BIGINT;

        IF COALESCE(v_order_item.order_subtotal, 0) > 0 AND COALESCE(v_order_item.order_discount_amount, 0) > 0 THEN
            v_coupon_allocated_paise := ROUND(
                (v_order_item.line_total / v_order_item.order_subtotal) * (v_order_item.order_discount_amount * 100)
            )::BIGINT;
        ELSE
            v_coupon_allocated_paise := 0;
        END IF;

        v_commission_amount_paise := ROUND(v_gross_amount_paise * v_comm_rate)::BIGINT;
        v_gst_on_comm_paise := ROUND(v_commission_amount_paise * v_gst_rate)::BIGINT;
        v_tcs_paise := ROUND(v_gross_amount_paise * v_tcs_rate)::BIGINT;
        v_tds_paise := ROUND(v_gross_amount_paise * v_tds_rate)::BIGINT;

        v_net_seller_payable_paise := v_gross_amount_paise - v_commission_amount_paise - v_gst_on_comm_paise - v_tcs_paise - v_tds_paise;
        IF v_net_seller_payable_paise < 0 THEN
            v_net_seller_payable_paise := 0;
        END IF;

        v_order_delivered_at := v_order_item.order_delivered_at;
        IF v_order_delivered_at IS NULL AND LOWER(v_order_item.fulfillment_status) = 'delivered' THEN
            v_order_delivered_at := v_order_item.order_updated_at;
        END IF;

        v_is_cod := UPPER(v_order_item.payment_method) = 'COD';
        IF v_is_cod THEN
            SELECT EXISTS(
                SELECT 1 FROM public.cod_order_remittances WHERE order_id = v_order_item.order_id
            ) INTO v_is_cod_reconciled;
        ELSE
            v_is_cod_reconciled := true;
        END IF;

        IF v_order_delivered_at IS NOT NULL THEN
            v_hold_until := v_order_delivered_at + (v_hold_days || ' days')::INTERVAL;
        ELSE
            v_hold_until := NULL;
        END IF;

        IF LOWER(v_order_item.fulfillment_status) = 'cancelled' THEN
            v_target_status := 'cancelled';
        ELSIF LOWER(v_order_item.fulfillment_status) = 'delivered' THEN
            IF v_is_cod AND NOT v_is_cod_reconciled THEN
                v_target_status := 'pending_delivery';
            ELSE
                IF v_hold_until IS NOT NULL AND v_hold_until <= NOW() THEN
                    v_target_status := 'eligible_released';
                ELSE
                    v_target_status := 'on_hold';
                END IF;
            END IF;
        ELSE
            v_target_status := 'pending_delivery';
        END IF;

        INSERT INTO public.seller_settlements (
            seller_id,
            order_id,
            order_item_id,
            order_number,
            order_item_code,
            product_id,
            product_title,
            sku,
            quantity,
            unit_price_paise,
            gross_amount_paise,
            product_discount_paise,
            platform_coupon_paise,
            seller_discount_paise,
            commission_rate,
            commission_amount_paise,
            gst_rate,
            gst_on_commission_paise,
            tcs_rate,
            tcs_amount_paise,
            tds_rate,
            tds_amount_paise,
            shipping_charge_paise,
            shipping_borne_by,
            refunded_amount_paise,
            net_seller_payable_paise,
            payment_method,
            payment_status,
            fulfillment_status,
            delivered_at,
            hold_until,
            cod_reconciled,
            cod_reconciled_at,
            settlement_status,
            updated_at
        ) VALUES (
            v_seller_id,
            v_order_item.order_id,
            v_order_item.item_id,
            v_order_item.order_number,
            v_order_item.order_item_code,
            v_order_item.product_id,
            v_order_item.title,
            v_order_item.sku,
            v_order_item.quantity,
            v_unit_price_paise,
            v_gross_amount_paise,
            0,
            v_coupon_allocated_paise,
            0,
            v_comm_rate,
            v_commission_amount_paise,
            v_gst_rate,
            v_gst_on_comm_paise,
            v_tcs_rate,
            v_tcs_paise,
            v_tds_rate,
            v_tds_paise,
            0,
            'platform',
            0,
            v_net_seller_payable_paise,
            v_order_item.payment_method,
            v_order_item.payment_status,
            v_order_item.fulfillment_status,
            v_order_delivered_at,
            v_hold_until,
            v_is_cod_reconciled,
            CASE WHEN v_is_cod_reconciled THEN NOW() ELSE NULL END,
            v_target_status,
            NOW()
        )
        ON CONFLICT (order_item_id) DO UPDATE SET
            payment_status = EXCLUDED.payment_status,
            fulfillment_status = EXCLUDED.fulfillment_status,
            delivered_at = COALESCE(seller_settlements.delivered_at, EXCLUDED.delivered_at),
            hold_until = COALESCE(seller_settlements.hold_until, EXCLUDED.hold_until),
            cod_reconciled = EXCLUDED.cod_reconciled,
            cod_reconciled_at = COALESCE(seller_settlements.cod_reconciled_at, EXCLUDED.cod_reconciled_at),
            settlement_status = CASE 
                WHEN seller_settlements.settlement_status = 'eligible_released' THEN 'eligible_released'
                WHEN seller_settlements.settlement_status = 'refunded_adjusted' THEN 'refunded_adjusted'
                ELSE EXCLUDED.settlement_status 
            END,
            updated_at = NOW();

        v_synced_count := v_synced_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'synced_items_count', v_synced_count,
        'order_id', p_order_id,
        'timestamp', NOW()
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_order_status_sync_settlement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM public.sync_seller_order_settlements_atomic(NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_sync_settlement ON public.orders;
CREATE TRIGGER trg_orders_sync_settlement
AFTER UPDATE OF payment_status, fulfillment_status, delivered_at ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_order_status_sync_settlement();

REVOKE ALL ON FUNCTION public.sync_seller_order_settlements_atomic(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_seller_order_settlements_atomic(UUID) TO authenticated, service_role;
