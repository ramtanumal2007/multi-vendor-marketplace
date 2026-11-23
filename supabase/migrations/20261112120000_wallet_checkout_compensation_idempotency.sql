-- Idempotent compensation for checkout orders whose wallet debit failed.
-- This migration is intentionally NOT applied by this script.
BEGIN;

CREATE TABLE IF NOT EXISTS public.order_stock_restorations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  product_id UUID NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  inventory_tracked BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_stock_restorations_order_product_key UNIQUE (order_id, product_id)
);

ALTER TABLE public.order_stock_restorations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.order_stock_restorations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.order_stock_restorations TO service_role;

CREATE OR REPLACE FUNCTION public.compensate_order_wallet_debit_failure(
  p_order_id UUID,
  p_coupon_code TEXT DEFAULT NULL,
  p_failure_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_coupon public.coupons%ROWTYPE;
  v_item RECORD;
  v_product public.products%ROWTYPE;
  v_code TEXT;
  v_times_used INTEGER;
  v_usage_count INTEGER;
  v_new_times_used INTEGER;
  v_new_usage_count INTEGER;
  v_ledger_id UUID;
  v_restored_count INTEGER := 0;
  v_already_count INTEGER := 0;
BEGIN
  -- Serialize all retries and other order transitions.
  SELECT *
    INTO v_order
    FROM public.orders
   WHERE id = p_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_FOUND');
  END IF;

  -- Legacy cancelled orders predate this idempotency ledger. Their stock may
  -- already have been restored by the old application path, so never infer
  -- that they need another restoration. Only retries carrying this migration's
  -- completion marker may return an idempotent success.
  IF upper(COALESCE(v_order.internal_status, '')) = 'CANCELLED' THEN
    IF position('[WALLET_DEBIT_COMPENSATION_V1]' IN COALESCE(v_order.notes, '')) > 0 THEN
      RETURN jsonb_build_object(
        'success', true,
        'code', 'ALREADY_COMPENSATED',
        'already_processed', true,
        'order_id', p_order_id,
        'stock_restoration_new', 0,
        'stock_restoration_already_done', 0
      );
    END IF;

    INSERT INTO public.finance_audit_logs (
      actor_id, action_type, target_entity, target_id, notes, new_values
    ) VALUES (
      NULL, 'LEGACY_CANCELLED_ORDER_REQUIRES_REVIEW', 'orders', p_order_id,
      'Wallet-debit compensation was not run because this order was already cancelled before the idempotent compensation marker existed. Stock may already have been restored by the legacy flow; manual reconciliation is required.',
      jsonb_build_object('internal_status', v_order.internal_status, 'notes', v_order.notes)
    );

    RETURN jsonb_build_object(
      'success', false,
      'code', 'LEGACY_CANCELLED_REQUIRES_REVIEW',
      'message', 'Order was already cancelled before idempotent compensation; stock was not changed.'
    );
  END IF;

  IF COALESCE(v_order.delivered_at, NULL) IS NOT NULL
     OR upper(COALESCE(v_order.internal_status, '')) IN
        ('SHIPPED', 'IN TRANSIT', 'OUT FOR DELIVERY', 'DELIVERED')
     OR lower(COALESCE(v_order.fulfillment_status, '')) IN
        ('shipped', 'in_transit', 'out_for_delivery', 'delivered', 'fulfilled') THEN
    RETURN jsonb_build_object('success', false, 'code', 'ORDER_ALREADY_DISPATCHED');
  END IF;

  IF position('[PAYMENT_REVIEW_REQUIRED]' IN COALESCE(v_order.notes, '')) > 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'PAYMENT_REVIEW_REQUIRED');
  END IF;

  v_code := NULLIF(upper(btrim(COALESCE(p_coupon_code, v_order.coupon_code))), '');

  IF p_coupon_code IS NOT NULL
     AND NULLIF(upper(btrim(p_coupon_code)), '') IS DISTINCT FROM
         NULLIF(upper(btrim(v_order.coupon_code)), '') THEN
    RETURN jsonb_build_object('success', false, 'code', 'COUPON_CODE_MISMATCH');
  END IF;

  -- Lock and validate coupon before making any stock/order changes.
  IF v_code IS NOT NULL THEN
    SELECT *
      INTO v_coupon
      FROM public.coupons
     WHERE upper(code) = v_code
     FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.finance_audit_logs (
        actor_id, action_type, target_entity, target_id, notes, new_values
      ) VALUES (
        NULL, 'COUPON_RECORD_MISSING', 'orders', p_order_id,
        'Coupon record missing during wallet-debit compensation.',
        jsonb_build_object('coupon_code', v_code, 'order_id', p_order_id)
      );
      RETURN jsonb_build_object('success', false, 'code', 'COUPON_NOT_FOUND');
    END IF;

    v_times_used := COALESCE(v_coupon.times_used, 0);
    v_usage_count := COALESCE(v_coupon.usage_count, 0);

    IF v_times_used <= 0 THEN
      INSERT INTO public.finance_audit_logs (
        actor_id, action_type, target_entity, target_id, old_values, notes
      ) VALUES (
        NULL, 'COUPON_COUNTER_UNDERFLOW_ANOMALY', 'coupons', v_coupon.id,
        jsonb_build_object('times_used', v_coupon.times_used, 'usage_count', v_coupon.usage_count),
        'Coupon redemption counter was not decremented because times_used was already zero.'
      );
      RETURN jsonb_build_object('success', false, 'code', 'COUPON_COUNTER_UNDERFLOW');
    END IF;

    v_new_times_used := v_times_used - 1;
    IF v_usage_count = v_times_used AND v_usage_count > 0 THEN
      v_new_usage_count := v_usage_count - 1;
    ELSE
      v_new_usage_count := v_usage_count;
    END IF;
  END IF;

  -- Restore only products whose inventory was tracked at checkout.
  -- The unique ledger row and stock increment share this transaction.
  FOR v_item IN
    SELECT oi.product_id, SUM(oi.quantity)::INTEGER AS quantity
      FROM public.order_items AS oi
     WHERE oi.order_id = p_order_id
     GROUP BY oi.product_id
     ORDER BY oi.product_id
  LOOP
    IF v_item.product_id IS NULL OR v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'INVALID_ORDER_ITEM_FOR_STOCK_RESTORATION';
    END IF;

    SELECT *
      INTO v_product
      FROM public.products
     WHERE id = v_item.product_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCT_NOT_FOUND_DURING_STOCK_RESTORATION: %', v_item.product_id;
    END IF;

    IF v_product.track_inventory IS NULL THEN
      RAISE EXCEPTION 'TRACK_INVENTORY_NULL_FAIL_CLOSED: %', v_item.product_id;
    END IF;

    INSERT INTO public.order_stock_restorations (
      order_id, product_id, quantity, inventory_tracked
    ) VALUES (
      p_order_id, v_item.product_id, v_item.quantity, v_product.track_inventory
    )
    ON CONFLICT (order_id, product_id) DO NOTHING
    RETURNING id INTO v_ledger_id;

    IF v_ledger_id IS NULL THEN
      SELECT id INTO v_ledger_id
        FROM public.order_stock_restorations
       WHERE order_id = p_order_id
         AND product_id = v_item.product_id
         AND quantity = v_item.quantity
         AND inventory_tracked = v_product.track_inventory;

      IF v_ledger_id IS NULL THEN
        RAISE EXCEPTION 'STOCK_RESTORATION_LEDGER_MISMATCH: order %, product %',
          p_order_id, v_item.product_id;
      END IF;

      v_already_count := v_already_count + 1;
    ELSE
      IF v_product.track_inventory THEN
        UPDATE public.products
           SET stock_quantity = COALESCE(stock_quantity, 0) + v_item.quantity
         WHERE id = v_item.product_id;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'STOCK_UPDATE_FAILED: %', v_item.product_id;
        END IF;
      END IF;

      v_restored_count := v_restored_count + 1;
    END IF;
  END LOOP;

  -- Persist cancellation before coupon release (same transaction).
  UPDATE public.orders
     SET payment_status = 'failed',
         internal_status = 'CANCELLED',
         wallet_amount_applied = 0,
         cancelled_at = COALESCE(cancelled_at, NOW()),
         notes = concat_ws(
           E'\n',
           NULLIF(notes, ''),
           '[WALLET_DEBIT_COMPENSATION_V1]',
           NULLIF(p_failure_note, '')
         )
   WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_CANCELLATION_UPDATE_FAILED';
  END IF;

  IF v_code IS NOT NULL THEN
    UPDATE public.coupons
       SET times_used = v_new_times_used,
           usage_count = v_new_usage_count
     WHERE id = v_coupon.id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'COUPON_COUNTER_UPDATE_FAILED: %', v_coupon.id;
    END IF;

    UPDATE public.orders
       SET coupon_code = NULL,
           discount_amount = 0
     WHERE id = p_order_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'stock_restoration_new', v_restored_count,
    'stock_restoration_already_done', v_already_count,
    'coupon_released', (v_code IS NOT NULL)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.compensate_order_wallet_debit_failure(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compensate_order_wallet_debit_failure(UUID, TEXT, TEXT)
  TO service_role;

COMMIT;
