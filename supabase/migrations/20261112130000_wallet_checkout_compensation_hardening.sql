-- VENDOSMITH: harden wallet-debit failure compensation.
-- This is a follow-up migration. Creating this file does NOT apply it.
-- Apply only after a separate reviewed deployment approval.

BEGIN;

-- Snapshot whether inventory was tracked when each order item was inserted.
-- Historical rows remain NULL intentionally and are handled as manual review.
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS inventory_tracked_at_checkout BOOLEAN;

CREATE OR REPLACE FUNCTION public.set_order_item_inventory_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_track_inventory BOOLEAN;
BEGIN
  IF NEW.product_id IS NULL THEN
    RAISE EXCEPTION 'ORDER_ITEM_PRODUCT_REQUIRED_FOR_INVENTORY_SNAPSHOT';
  END IF;

  SELECT p.track_inventory
    INTO v_track_inventory
    FROM public.products AS p
   WHERE p.id = NEW.product_id
   FOR KEY SHARE;

  IF NOT FOUND OR v_track_inventory IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_INVENTORY_SETTING_MISSING: %', NEW.product_id;
  END IF;

  -- Never trust a value supplied by the caller; derive it from products.
  NEW.inventory_tracked_at_checkout := v_track_inventory;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_order_item_inventory_snapshot
  ON public.order_items;

CREATE TRIGGER trg_set_order_item_inventory_snapshot
BEFORE INSERT ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.set_order_item_inventory_snapshot();

CREATE TABLE IF NOT EXISTS public.order_stock_restorations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  product_id UUID NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  inventory_tracked BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_stock_restorations_order_product_key
    UNIQUE (order_id, product_id)
);

ALTER TABLE public.order_stock_restorations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.order_stock_restorations
  FROM PUBLIC, anon, authenticated;
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
  v_code TEXT;
  v_times_used INTEGER;
  v_usage_count INTEGER;
  v_ledger_id UUID;
  v_restored_count INTEGER := 0;
  v_already_count INTEGER := 0;
  v_item_count INTEGER := 0;
BEGIN
  -- Serialize compensation retries and order-state transitions.
  SELECT *
    INTO v_order
    FROM public.orders
   WHERE id = p_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_FOUND');
  END IF;

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
      NULL,
      'LEGACY_CANCELLED_ORDER_REQUIRES_REVIEW',
      'orders',
      p_order_id,
      'Compensation skipped: order was already cancelled before the idempotency marker. Stock may already have been restored; manual reconciliation is required.',
      jsonb_build_object(
        'internal_status', v_order.internal_status,
        'notes', v_order.notes
      )
    );

    RETURN jsonb_build_object(
      'success', false,
      'code', 'LEGACY_CANCELLED_REQUIRES_REVIEW',
      'message', 'Order was already cancelled; stock was not changed.'
    );
  END IF;

  IF v_order.delivered_at IS NOT NULL
     OR upper(COALESCE(v_order.internal_status, '')) IN
        ('SHIPPED', 'IN TRANSIT', 'OUT FOR DELIVERY', 'DELIVERED')
     OR lower(COALESCE(v_order.fulfillment_status, '')) IN
        ('shipped', 'in_transit', 'out_for_delivery', 'delivered', 'fulfilled') THEN
    RETURN jsonb_build_object('success', false, 'code', 'ORDER_ALREADY_DISPATCHED');
  END IF;

  IF position('[PAYMENT_REVIEW_REQUIRED]' IN COALESCE(v_order.notes, '')) > 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'PAYMENT_REVIEW_REQUIRED');
  END IF;

  -- Require at least one valid order item and a complete, consistent
  -- checkout-time inventory snapshot. Never infer historical state.
  SELECT COUNT(*)::INTEGER
    INTO v_item_count
    FROM public.order_items AS oi
   WHERE oi.order_id = p_order_id;

  IF v_item_count = 0 THEN
    INSERT INTO public.finance_audit_logs (
      actor_id, action_type, target_entity, target_id, notes, new_values
    ) VALUES (
      NULL, 'ORDER_ITEMS_MISSING_FOR_COMPENSATION', 'orders', p_order_id,
      'Compensation stopped because the order has no order_items rows.',
      jsonb_build_object('order_id', p_order_id)
    );
    RETURN jsonb_build_object('success', false, 'code', 'ORDER_ITEMS_MISSING');
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.order_items AS oi
     WHERE oi.order_id = p_order_id
       AND (
         oi.product_id IS NULL
         OR oi.quantity IS NULL
         OR oi.quantity <= 0
         OR oi.inventory_tracked_at_checkout IS NULL
       )
  ) THEN
    INSERT INTO public.finance_audit_logs (
      actor_id, action_type, target_entity, target_id, notes, new_values
    ) VALUES (
      NULL, 'ORDER_ITEM_SNAPSHOT_REQUIRES_REVIEW', 'orders', p_order_id,
      'Compensation stopped because one or more order items have a missing product, invalid quantity, or NULL checkout inventory snapshot.',
      jsonb_build_object('order_id', p_order_id)
    );
    RETURN jsonb_build_object('success', false, 'code', 'ORDER_ITEM_SNAPSHOT_REQUIRES_REVIEW');
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.order_items AS oi
     WHERE oi.order_id = p_order_id
     GROUP BY oi.product_id
    HAVING BOOL_OR(oi.inventory_tracked_at_checkout)
        <> BOOL_AND(oi.inventory_tracked_at_checkout)
  ) THEN
    INSERT INTO public.finance_audit_logs (
      actor_id, action_type, target_entity, target_id, notes, new_values
    ) VALUES (
      NULL, 'MIXED_INVENTORY_SNAPSHOT_REQUIRES_REVIEW', 'orders', p_order_id,
      'Compensation stopped because order lines for the same product have conflicting checkout inventory snapshots.',
      jsonb_build_object('order_id', p_order_id)
    );
    RETURN jsonb_build_object('success', false, 'code', 'MIXED_INVENTORY_SNAPSHOT');
  END IF;

  -- Lock products in deterministic order before locking the coupon.
  -- Checkout's atomic path also locks products before coupon counters.
  -- This consistent order reduces product/coupon deadlock risk.
  FOR v_item IN
    SELECT oi.product_id
      FROM public.order_items AS oi
     WHERE oi.order_id = p_order_id
     GROUP BY oi.product_id
     ORDER BY oi.product_id
  LOOP
    PERFORM 1
      FROM public.products AS p
     WHERE p.id = v_item.product_id
     FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.finance_audit_logs (
        actor_id, action_type, target_entity, target_id, notes, new_values
      ) VALUES (
        NULL, 'PRODUCT_MISSING_FOR_COMPENSATION', 'orders', p_order_id,
        'Compensation stopped because an order item references a missing product.',
        jsonb_build_object('product_id', v_item.product_id)
      );
      RETURN jsonb_build_object('success', false, 'code', 'PRODUCT_MISSING_REQUIRES_REVIEW');
    END IF;
  END LOOP;

  v_code := NULLIF(upper(btrim(COALESCE(p_coupon_code, v_order.coupon_code))), '');

  IF p_coupon_code IS NOT NULL
     AND NULLIF(upper(btrim(p_coupon_code)), '') IS DISTINCT FROM
         NULLIF(upper(btrim(v_order.coupon_code)), '') THEN
    RETURN jsonb_build_object('success', false, 'code', 'COUPON_CODE_MISMATCH');
  END IF;

  -- Product locks are already held; lock coupon after products.
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

    -- The existing checkout/release paths maintain both counters together.
    -- A mismatch is ambiguous; do not decrement either counter automatically.
    IF v_times_used <= 0 OR v_usage_count <> v_times_used THEN
      INSERT INTO public.finance_audit_logs (
        actor_id, action_type, target_entity, target_id, old_values, notes
      ) VALUES (
        NULL, 'COUPON_COUNTER_MISMATCH_REQUIRES_REVIEW', 'coupons', v_coupon.id,
        jsonb_build_object(
          'times_used', v_coupon.times_used,
          'usage_count', v_coupon.usage_count
        ),
        'Coupon counters are zero/unequal; compensation stopped without changing coupon counters.'
      );
      RETURN jsonb_build_object('success', false, 'code', 'COUPON_COUNTER_MISMATCH');
    END IF;
  END IF;

  -- Stock ledger insert and stock increment are in the same transaction.
  FOR v_item IN
    SELECT
      oi.product_id,
      SUM(oi.quantity)::INTEGER AS quantity,
      BOOL_AND(oi.inventory_tracked_at_checkout) AS inventory_tracked
    FROM public.order_items AS oi
    WHERE oi.order_id = p_order_id
    GROUP BY oi.product_id
    ORDER BY oi.product_id
  LOOP
    IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'INVALID_ORDER_ITEM_FOR_STOCK_RESTORATION';
    END IF;

    v_ledger_id := NULL;

    INSERT INTO public.order_stock_restorations (
      order_id, product_id, quantity, inventory_tracked
    ) VALUES (
      p_order_id, v_item.product_id, v_item.quantity, v_item.inventory_tracked
    )
    ON CONFLICT (order_id, product_id) DO NOTHING
    RETURNING id INTO v_ledger_id;

    IF v_ledger_id IS NULL THEN
      PERFORM 1
        FROM public.order_stock_restorations AS r
       WHERE r.order_id = p_order_id
         AND r.product_id = v_item.product_id
         AND r.quantity = v_item.quantity
         AND r.inventory_tracked = v_item.inventory_tracked;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'STOCK_RESTORATION_LEDGER_MISMATCH: order %, product %',
          p_order_id, v_item.product_id;
      END IF;

      v_already_count := v_already_count + 1;
    ELSE
      IF v_item.inventory_tracked THEN
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
       SET times_used = v_times_used - 1,
           usage_count = v_usage_count - 1
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
