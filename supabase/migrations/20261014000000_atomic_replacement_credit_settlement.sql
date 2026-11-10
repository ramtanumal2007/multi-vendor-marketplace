-- ==============================================================================
-- VENDOSMITH: ATOMIC FULL-TENDER REPLACEMENT CREDIT SETTLEMENT RPC
-- Migration: 20261014000000_atomic_replacement_credit_settlement.sql
-- Description:
--   Implements settle_replacement_credit_atomic(UUID, UUID, TEXT, TEXT)
--   Guarantees all-or-nothing atomicity, historical pricing integrity, and full-tender reconciliation:
--     1. Strict Caller Authentication:
--        - Evaluates PostgREST JWT claims (v_jwt_role) or session_user.
--        - Restricted exclusively to service_role (backend API routes) or postgres (direct superuser).
--        - Explicitly revoked from PUBLIC, anon, and authenticated client roles.
--        - Enforces verified admin profile for p_actor_id (disallowing NULL or non-admin).
--     2. Historical Order-Item Pricing:
--        - Queries public.order_items using return_requests.order_item_id, order_id, and product_id.
--        - Uses persisted historical unit_price. Never queries mutable products.price.
--        - Safely fails if historical records are missing or inconsistent.
--     3. Full-Tender Accounting Reconciliation:
--        - Reconciles eligible original value against actual wallet debits and COD/gateway tender.
--        - Validates that recorded tenders cover the net order obligation without double-counting.
--        - Fails safely if recorded tender totals do not reconcile.
--     4. Consistent Status & Audit Behavior:
--        - Atomically validates permitted transitions (REPLACEMENT_DELIVERED / REPLACEMENT_CLOSED).
--        - Atomically updates return_requests.status and records identical new_status in return_audit_logs.
--     5. Atomicity & Idempotency:
--        - Exclusively locks return_requests and customer_wallets rows with FOR UPDATE.
--        - If remaining_credit_due = 0, exits cleanly without creating unused wallets or mutating status.
--        - Increments wallet balance, inserts uniquely-keyed ledger row, updates refund_details,
--          and writes audit log in one single database transaction.
--
-- CRITICAL SAFETY NOTICE:
-- Prepared for local code hardening and architectural verification.
-- DO NOT EXECUTE REMOTELY WITHOUT SEPARATE AUTHORIZATION.
-- ==============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.settle_replacement_credit_atomic(
    p_return_request_id UUID,
    p_actor_id UUID,
    p_notes TEXT DEFAULT NULL,
    p_target_status TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_jwt_claims JSONB := NULL;
    v_jwt_role TEXT := NULL;
    v_is_authorized_caller BOOLEAN := false;
    v_return_request RECORD;
    v_wallet RECORD;
    v_order RECORD;
    v_orig_order_item RECORD;
    v_order_wallet_debits NUMERIC(12, 2) := 0.00;
    v_cod_or_gateway_tender NUMERIC(12, 2) := 0.00;
    v_total_tender_recorded NUMERIC(12, 2) := 0.00;
    v_order_subtotal NUMERIC(12, 2) := 0.00;
    v_order_discount NUMERIC(12, 2) := 0.00;
    v_net_order_obligation NUMERIC(12, 2) := 0.00;
    v_already_credited NUMERIC(12, 2) := 0.00;
    v_item_unit_price NUMERIC(12, 2) := 0.00;
    v_purchased_qty INT := 1;
    v_returned_qty INT := 1;
    v_gross_subtotal NUMERIC(12, 2) := 0.00;
    v_allocated_coupon NUMERIC(12, 2) := 0.00;
    v_net_eligible NUMERIC(12, 2) := 0.00;
    v_replacement_total NUMERIC(12, 2) := 0.00;
    v_calculated_diff NUMERIC(12, 2) := 0.00;
    v_total_credit_due NUMERIC(12, 2) := 0.00;
    v_remaining_credit_due NUMERIC(12, 2) := 0.00;
    v_new_balance NUMERIC(12, 2) := 0.00;
    v_final_status TEXT;
    v_transaction_id UUID;
    v_idemp_key TEXT;
    v_existing_tx RECORD;
    v_refund_details JSONB;
BEGIN
    -- 1. Strict Caller Authentication & Authorization
    BEGIN
        v_jwt_claims := current_setting('request.jwt.claims', true)::jsonb;
        v_jwt_role := v_jwt_claims->>'role';
    EXCEPTION WHEN OTHERS THEN
        v_jwt_role := NULL;
    END;

    IF v_jwt_role IS NULL THEN
        v_jwt_role := auth.role();
    END IF;

    -- Caller MUST be service_role (trusted Next.js API route) or session_user must be postgres/supabase_admin (direct superuser session)
    v_is_authorized_caller := (v_jwt_role = 'service_role') OR (session_user IN ('postgres', 'supabase_admin'));

    IF NOT v_is_authorized_caller THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Forbidden: settle_replacement_credit_atomic can only be executed by authorized service_role'
        );
    END IF;

    -- Actor ID cannot be NULL: must be a validated admin profile UUID
    IF p_actor_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Unauthorized: Admin actor ID (p_actor_id) is strictly required'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor_id AND role = 'admin') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Unauthorized: Actor profile does not have admin privileges'
        );
    END IF;

    -- 2. Exclusively lock the return request row
    SELECT * INTO v_return_request
    FROM public.return_requests
    WHERE id = p_return_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Return request not found');
    END IF;

    IF v_return_request.request_type <> 'replacement' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request is not a replacement');
    END IF;

    -- 3. Validate permitted return status transitions and lifecycle integrity
    IF p_target_status IS NOT NULL AND p_target_status <> v_return_request.status THEN
        IF p_target_status = 'REPLACEMENT_DELIVERED' THEN
            IF v_return_request.status NOT IN (
                'REPLACEMENT_APPROVED',
                'OLD_PRODUCT_PICKUP_PENDING',
                'OLD_PRODUCT_PICKED_UP',
                'OLD_PRODUCT_RECEIVED',
                'REPLACEMENT_ORDER_CREATED',
                'REPLACEMENT_DISPATCHED',
                'REPLACEMENT_OUT_FOR_DELIVERY',
                'REPLACEMENT_DELIVERED'
            ) THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Lifecycle violation: Cannot transition replacement from ' || v_return_request.status || ' to ' || p_target_status
                );
            END IF;
        ELSIF p_target_status = 'REPLACEMENT_CLOSED' THEN
            IF v_return_request.status NOT IN (
                'REPLACEMENT_ORDER_CREATED',
                'REPLACEMENT_DELIVERED',
                'REPLACEMENT_CLOSED'
            ) THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Lifecycle violation: Cannot transition replacement from ' || v_return_request.status || ' to ' || p_target_status
                );
            END IF;
        ELSE
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Invalid target status: settle_replacement_credit_atomic only supports transitions to REPLACEMENT_DELIVERED or REPLACEMENT_CLOSED'
            );
        END IF;
        v_final_status := p_target_status;
    ELSE
        -- No target status provided or target equals current status: maintain actual status
        v_final_status := v_return_request.status;
        IF v_final_status NOT IN ('REPLACEMENT_DELIVERED', 'REPLACEMENT_CLOSED') THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Invalid status: replacement credit can only be settled in REPLACEMENT_DELIVERED or REPLACEMENT_CLOSED status (current: ' || v_return_request.status || ')'
            );
        END IF;
    END IF;

    -- 4. Fetch original order details
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = v_return_request.order_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Historical integrity violation: Original order not found for return request');
    END IF;

    -- 5. Fetch historical original order item pricing (DO NOT use current products.price)
    IF v_return_request.order_item_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Historical integrity violation: Return request is missing order_item_id link'
        );
    END IF;

    SELECT * INTO v_orig_order_item
    FROM public.order_items
    WHERE id = v_return_request.order_item_id
      AND order_id = v_return_request.order_id
      AND product_id = v_return_request.product_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Historical integrity violation: Original order item not found or does not match return request order and product'
        );
    END IF;

    IF v_orig_order_item.unit_price IS NULL OR v_orig_order_item.unit_price <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Historical integrity violation: Original order item unit price is missing or invalid'
        );
    END IF;

    v_item_unit_price := v_orig_order_item.unit_price;
    v_purchased_qty := GREATEST(1, COALESCE(v_orig_order_item.quantity, v_return_request.quantity, 1));
    v_returned_qty := LEAST(v_purchased_qty, GREATEST(1, COALESCE(v_return_request.quantity, 1)));
    v_gross_subtotal := ROUND(v_item_unit_price * v_returned_qty, 2);

    -- 6. Full-Tender Accounting Reconciliation
    v_order_subtotal := COALESCE(v_order.subtotal, 0.00);
    v_order_discount := COALESCE(v_order.discount_amount, 0.00);
    -- Net order obligation across all items including delivery and tax
    v_net_order_obligation := GREATEST(0.00, v_order_subtotal - v_order_discount + COALESCE(v_order.shipping_cost, 0.00) + COALESCE(v_order.tax_amount, 0.00));

    -- Fail safely if order payment was aborted, failed, or cancelled (case-insensitive check)
    IF LOWER(COALESCE(v_order.payment_status, '')) IN ('failed', 'cancelled') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Payment integrity violation: Original order payment status is ' || v_order.payment_status
        );
    END IF;

    -- Calculate net wallet debits applied to the original order (accounting for any checkout reversals)
    SELECT COALESCE(SUM(
        CASE 
            WHEN direction = 'debit' THEN amount
            WHEN direction = 'credit' THEN -amount
            ELSE 0.00
        END
    ), 0.00) INTO v_order_wallet_debits
    FROM public.wallet_transactions
    WHERE reference_type = 'order'
      AND reference_id = v_return_request.order_id::TEXT
      AND type IN ('WALLET_DEBIT', 'REFUND_WALLET_CREDIT');

    -- Reconcile COD / gateway tender without double-counting:
    -- Case 1: If v_order_wallet_debits > 0 and v_order.total equals v_net_order_obligation,
    -- then v_order.total ALREADY represents the full order obligation inclusive of wallet tender.
    -- In that case, adding wallet debits to v_order.total would double-count!
    IF v_order_wallet_debits > 0.00 AND ABS(v_order.total - v_net_order_obligation) <= 0.05 THEN
        v_cod_or_gateway_tender := GREATEST(0.00, v_order.total - v_order_wallet_debits);
        v_total_tender_recorded := v_order.total;
    -- Case 2: v_order.total is the net remainder payable after wallet debit deduction (Vendosmith standard checkout)
    ELSIF ABS((v_order_wallet_debits + v_order.total) - v_net_order_obligation) <= 0.05 THEN
        v_cod_or_gateway_tender := GREATEST(0.00, v_order.total);
        v_total_tender_recorded := ROUND(v_order_wallet_debits + v_cod_or_gateway_tender, 2);
    -- Case 3: Zero wallet debits, tender is 100% gateway / COD
    ELSIF v_order_wallet_debits = 0.00 AND ABS(v_order.total - v_net_order_obligation) <= 0.05 THEN
        v_cod_or_gateway_tender := v_order.total;
        v_total_tender_recorded := v_order.total;
    ELSE
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Tender reconciliation failure: Recorded tenders (Wallet: ₹' || v_order_wallet_debits || ', Order Total: ₹' || v_order.total || ') do not reconcile with net order obligation (₹' || v_net_order_obligation || ')'
        );
    END IF;

    -- Proportional coupon discount allocation for returned units
    IF v_order_subtotal > 0 THEN
        v_allocated_coupon := ROUND(LEAST(v_gross_subtotal, (v_gross_subtotal / v_order_subtotal) * v_order_discount), 2);
    ELSE
        v_allocated_coupon := 0.00;
    END IF;

    -- Net eligible original value funded across both wallet and gateway/COD tenders
    v_net_eligible := GREATEST(0.00, v_gross_subtotal - v_allocated_coupon);

    -- Ensure eligible value does not exceed recorded tender total (if discrepancy, fail safely)
    IF v_net_eligible > (v_total_tender_recorded + 0.05) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Tender reconciliation failure: Net eligible value (₹' || v_net_eligible || ') exceeds total recorded tenders (₹' || v_total_tender_recorded || ')'
        );
    END IF;

    -- 7. Calculate replacement package total from persisted order items (no guessing)
    IF v_return_request.replacement_order_id IS NOT NULL THEN
        SELECT COALESCE(SUM(COALESCE(line_total, unit_price * quantity)), 0.00)
        INTO v_replacement_total
        FROM public.order_items
        WHERE order_id = v_return_request.replacement_order_id;
    END IF;

    -- Fallback to refund_details snapshot if replacement order items not populated
    IF v_replacement_total = 0.00 AND v_return_request.refund_details IS NOT NULL THEN
        v_replacement_total := COALESCE(
            (v_return_request.refund_details->>'replacementSubtotal')::NUMERIC,
            0.00
        );
    END IF;

    IF v_replacement_total <= 0.00 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Historical integrity violation: Replacement package items or subtotal not found or invalid'
        );
    END IF;

    -- 8. Reconcile existing replacement credits strictly for this request
    SELECT COALESCE(SUM(amount), 0.00) INTO v_already_credited
    FROM public.wallet_transactions
    WHERE reference_type = 'replacement_request'
      AND reference_id = p_return_request_id::TEXT
      AND type = 'REPLACEMENT_PRICE_DIFFERENCE_CREDIT'
      AND direction = 'credit';

    -- 9. Differential and credit settlement
    v_calculated_diff := ROUND(v_replacement_total - v_net_eligible, 2);
    v_total_credit_due := CASE WHEN v_calculated_diff < 0 THEN ABS(v_calculated_diff) ELSE 0.00 END;

    -- Detect ledger conflicts where already credited exceeds credit due
    IF v_already_credited > (v_total_credit_due + 0.05) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Ledger conflict: Already credited amount (₹' || v_already_credited || ') exceeds total credit due (₹' || v_total_credit_due || ')'
        );
    END IF;

    v_remaining_credit_due := GREATEST(0.00, v_total_credit_due - v_already_credited);

    -- 10. Idempotency Check: if credit is already satisfied or no credit due, exit cleanly without touching wallets
    IF v_remaining_credit_due = 0.00 THEN
        -- If status transition was requested and validated, update status atomically
        IF v_final_status <> v_return_request.status THEN
            UPDATE public.return_requests
            SET status = v_final_status,
                updated_at = NOW()
            WHERE id = p_return_request_id;

            INSERT INTO public.return_audit_logs (
                return_request_id,
                actor_type,
                actor_id,
                action,
                previous_status,
                new_status,
                notes,
                metadata,
                created_at
            ) VALUES (
                p_return_request_id,
                'admin',
                p_actor_id,
                'ADMIN_STATUS_UPDATE_' || v_final_status,
                v_return_request.status,
                v_final_status,
                COALESCE(p_notes, 'Replacement status transitioned to ' || v_final_status || ' (no credit due)'),
                jsonb_build_object(
                    'already_credited', v_already_credited,
                    'execution_mode', 'DATABASE_RPC_ATOMIC'
                ),
                NOW()
            );
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'credited', false,
            'is_duplicate', true,
            'already_credited', v_already_credited,
            'credited_amount', 0.00,
            'final_status', v_final_status,
            'message', 'Replacement credit already satisfied or no credit due'
        );
    END IF;

    -- 11. Lock or lazy-create customer wallet row only when credit is genuinely due
    SELECT * INTO v_wallet
    FROM public.customer_wallets
    WHERE customer_id = v_return_request.customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.customer_wallets (customer_id, balance, currency)
        VALUES (v_return_request.customer_id, 0.00, 'INR')
        RETURNING * INTO v_wallet;
    END IF;

    -- 12. Construct deterministic, versioned idempotency key
    v_idemp_key := CASE 
        WHEN v_already_credited = 0.00 THEN 'REPL_DIFF_' || p_return_request_id::TEXT
        ELSE 'REPL_DIFF_SUPP_' || p_return_request_id::TEXT || '_' || TRIM(TO_CHAR(v_remaining_credit_due, '999999990.00'))
    END;

    -- Verify idempotency key on ledger
    SELECT * INTO v_existing_tx
    FROM public.wallet_transactions
    WHERE idempotency_key = v_idemp_key;

    IF FOUND THEN
        -- Reconcile existing ledger transaction against this return request, customer, and wallet
        IF v_existing_tx.customer_id <> v_return_request.customer_id OR
           v_existing_tx.wallet_id <> v_wallet.id OR
           v_existing_tx.type <> 'REPLACEMENT_PRICE_DIFFERENCE_CREDIT' OR
           v_existing_tx.direction <> 'credit' OR
           v_existing_tx.reference_type <> 'replacement_request' OR
           v_existing_tx.reference_id <> p_return_request_id::TEXT OR
           v_existing_tx.amount <> v_remaining_credit_due THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Ledger reconciliation conflict: Existing transaction for idempotency key ' || v_idemp_key || ' does not reconcile with return request or credit due'
            );
        END IF;

        -- Reconcile actual wallet balance: must be non-negative
        IF v_wallet.balance < 0.00 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Ledger reconciliation conflict: Customer wallet balance is invalid (' || v_wallet.balance || ')'
            );
        END IF;

        -- If status update requested and not yet set, update status and audit trail atomically
        IF v_final_status <> v_return_request.status THEN
            UPDATE public.return_requests
            SET status = v_final_status,
                updated_at = NOW()
            WHERE id = p_return_request_id;

            INSERT INTO public.return_audit_logs (
                return_request_id,
                actor_type,
                actor_id,
                action,
                previous_status,
                new_status,
                notes,
                metadata,
                created_at
            ) VALUES (
                p_return_request_id,
                'admin',
                p_actor_id,
                'ADMIN_STATUS_UPDATE_' || v_final_status,
                v_return_request.status,
                v_final_status,
                COALESCE(p_notes, 'Replacement status transitioned to ' || v_final_status || ' (reconciled idempotent replay)'),
                jsonb_build_object(
                    'is_duplicate', true,
                    'transaction_id', v_existing_tx.id,
                    'already_credited', v_already_credited,
                    'execution_mode', 'DATABASE_RPC_ATOMIC'
                ),
                NOW()
            );
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'credited', false,
            'is_duplicate', true,
            'already_credited', v_already_credited,
            'credited_amount', 0.00,
            'current_balance', v_wallet.balance,
            'transaction_id', v_existing_tx.id,
            'final_status', v_final_status,
            'message', 'Idempotent replay verified: existing ledger transaction and wallet balance reconciled'
        );
    END IF;

    -- 13. Atomically increment wallet balance
    UPDATE public.customer_wallets
    SET balance = balance + v_remaining_credit_due,
        updated_at = NOW()
    WHERE id = v_wallet.id
    RETURNING balance INTO v_new_balance;

    -- 14. Atomically insert uniquely-keyed ledger transaction with duplicate-key conflict reconciliation
    BEGIN
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
            idempotency_key,
            created_at
        ) VALUES (
            v_wallet.id,
            v_return_request.customer_id,
            'REPLACEMENT_PRICE_DIFFERENCE_CREDIT',
            v_remaining_credit_due,
            'credit',
            v_new_balance,
            'replacement_request',
            p_return_request_id::TEXT,
            CASE 
                WHEN v_already_credited = 0.00 THEN 'Wallet credit for price difference on replacement request #' || v_return_request.return_number
                ELSE 'Supplemental wallet credit for price difference adjustment on replacement request #' || v_return_request.return_number
            END,
            v_idemp_key,
            NOW()
        ) RETURNING id INTO v_transaction_id;
    EXCEPTION WHEN unique_violation THEN
        -- Roll back the balance increment performed in step 13
        UPDATE public.customer_wallets
        SET balance = balance - v_remaining_credit_due,
            updated_at = NOW()
        WHERE id = v_wallet.id
        RETURNING balance INTO v_wallet.balance;

        -- Re-fetch and strictly reconcile the conflicting ledger transaction
        SELECT * INTO v_existing_tx
        FROM public.wallet_transactions
        WHERE idempotency_key = v_idemp_key;

        IF NOT FOUND OR
           v_existing_tx.customer_id <> v_return_request.customer_id OR
           v_existing_tx.wallet_id <> v_wallet.id OR
           v_existing_tx.type <> 'REPLACEMENT_PRICE_DIFFERENCE_CREDIT' OR
           v_existing_tx.direction <> 'credit' OR
           v_existing_tx.reference_type <> 'replacement_request' OR
           v_existing_tx.reference_id <> p_return_request_id::TEXT OR
           v_existing_tx.amount <> v_remaining_credit_due THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Duplicate-key conflict: Existing ledger transaction could not be reconciled for key ' || v_idemp_key
            );
        END IF;

        IF v_wallet.balance < 0.00 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Duplicate-key conflict: Wallet balance reconciliation failed'
            );
        END IF;

        -- Atomically update return request status and audit trail if requested
        IF v_final_status <> v_return_request.status THEN
            UPDATE public.return_requests
            SET status = v_final_status,
                updated_at = NOW()
            WHERE id = p_return_request_id;

            INSERT INTO public.return_audit_logs (
                return_request_id,
                actor_type,
                actor_id,
                action,
                previous_status,
                new_status,
                notes,
                metadata,
                created_at
            ) VALUES (
                p_return_request_id,
                'admin',
                p_actor_id,
                'ADMIN_STATUS_UPDATE_' || v_final_status,
                v_return_request.status,
                v_final_status,
                COALESCE(p_notes, 'Replacement status transitioned to ' || v_final_status || ' (reconciled duplicate conflict replay)'),
                jsonb_build_object(
                    'is_duplicate', true,
                    'transaction_id', v_existing_tx.id,
                    'execution_mode', 'DATABASE_RPC_ATOMIC'
                ),
                NOW()
            );
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'credited', false,
            'is_duplicate', true,
            'already_credited', v_already_credited + v_remaining_credit_due,
            'credited_amount', 0.00,
            'current_balance', v_wallet.balance,
            'transaction_id', v_existing_tx.id,
            'final_status', v_final_status,
            'message', 'Duplicate-key conflict resolved: ledger transaction and wallet balance reconciled'
        );
    END;

    -- 15. Atomically update return request status and refund details
    v_refund_details := COALESCE(v_return_request.refund_details, '{}'::jsonb) || jsonb_build_object(
        'walletCreditStatus', 'CREDITED',
        'walletCreditedAt', NOW(),
        'originalEligibleValue', v_net_eligible,
        'replacementSubtotal', v_replacement_total,
        'calculatedPriceDifference', v_calculated_diff,
        'totalCreditDue', v_total_credit_due,
        'alreadyCreditedAmount', v_already_credited + v_remaining_credit_due,
        'remainingCreditDue', 0.00,
        'walletCreditTransactionId', v_transaction_id,
        'tenderBreakdown', jsonb_build_object(
            'walletDebitTender', v_order_wallet_debits,
            'codOrGatewayTender', v_cod_or_gateway_tender,
            'totalTenderRecorded', v_total_tender_recorded,
            'orderSubtotal', v_order_subtotal,
            'orderDiscount', v_order_discount
        )
    );

    UPDATE public.return_requests
    SET status = v_final_status,
        replacement_price_difference = v_calculated_diff,
        refund_details = v_refund_details,
        updated_at = NOW()
    WHERE id = p_return_request_id;

    -- 16. Atomically record audit log with matching new_status
    INSERT INTO public.return_audit_logs (
        return_request_id,
        actor_type,
        actor_id,
        action,
        previous_status,
        new_status,
        notes,
        metadata,
        created_at
    ) VALUES (
        p_return_request_id,
        'admin',
        p_actor_id,
        'REPLACEMENT_CREDIT_DISBURSED',
        v_return_request.status,
        v_final_status,
        COALESCE(p_notes, 'Atomic supplemental replacement credit processed via settle_replacement_credit_atomic'),
        jsonb_build_object(
            'transaction_id', v_transaction_id,
            'credited_amount', v_remaining_credit_due,
            'balance_after', v_new_balance,
            'idempotency_key', v_idemp_key,
            'execution_mode', 'DATABASE_RPC_ATOMIC'
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'credited', true,
        'credited_amount', v_remaining_credit_due,
        'transaction_id', v_transaction_id,
        'balance_before', v_wallet.balance,
        'balance_after', v_new_balance,
        'total_credit_due', v_total_credit_due,
        'already_credited', v_already_credited + v_remaining_credit_due,
        'final_status', v_final_status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Revoke all permissions from public, anon, and authenticated
REVOKE ALL ON FUNCTION public.settle_replacement_credit_atomic(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settle_replacement_credit_atomic(UUID, UUID, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.settle_replacement_credit_atomic(UUID, UUID, TEXT, TEXT) FROM authenticated;

-- Grant EXECUTE exclusively to service_role (server-side Next.js backend)
GRANT EXECUTE ON FUNCTION public.settle_replacement_credit_atomic(UUID, UUID, TEXT, TEXT) TO service_role;

COMMIT;
