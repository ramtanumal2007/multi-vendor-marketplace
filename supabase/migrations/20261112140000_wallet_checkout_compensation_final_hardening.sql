-- VENDOSMITH: follow-up hardening for wallet-debit failure compensation.
-- This migration is a file artifact only. Creating it does NOT execute or apply SQL.
-- Historical order-item snapshots are deliberately NOT backfilled from the live
-- catalog because current product settings cannot prove checkout-time settings.

BEGIN;

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
  -- Custom/bespoke order items have no catalog product and no catalog stock.
  IF NEW.product_id IS NULL THEN
    NEW.inventory_tracked_at_checkout := FALSE;
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.track_inventory, TRUE)
    INTO v_track_inventory
    FROM public.products AS p
   WHERE p.id = NEW.product_id
   FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND_FOR_INVENTORY_SNAPSHOT: %', NEW.product_id;
  END IF;

  -- Ignore any caller-supplied value; snapshot the catalog setting at insert.
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

CREATE TABLE IF NOT EXISTS public.order_variant_stock_restorations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  variant_id UUID NOT NULL,
  product_id UUID NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  inventory_tracked BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_variant_stock_restorations_order_variant_key
    UNIQUE (order_id, variant_id)
);

ALTER TABLE public.order_variant_stock_restorations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.order_variant_stock_restorations
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.order_variant_stock_restorations TO service_role;

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
  v_var RECORD;
  v_var_row RECORD;
  v_var_item RECORD;
  v_var_ledger_id UUID;
  v_code TEXT;
  v_rows INTEGER;
  v_coupon_locked BOOLEAN := FALSE;
  v_coupon_release_ok BOOLEAN := FALSE;
  v_coupon_review_required BOOLEAN := FALSE;
  v_coupon_review_reason TEXT;
  v_times_used INTEGER;
  v_usage_count INTEGER;
  v_ledger_id UUID;
  v_restored_count INTEGER := 0;
  v_already_count INTEGER := 0;
  v_item_count INTEGER := 0;
BEGIN
  SELECT *
    INTO v_order
    FROM public.orders
   WHERE id = p_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_FOUND');
  END IF;

  IF upper(COALESCE(v_order.internal_status, '')) = 'CANCELLED' THEN
    IF position('[WALLET_DEBIT_COMPENSATION_V1]' IN COALESCE(v_order.notes, '')) > 0
       OR position('[WALLET_DEBIT_COMPENSATION_V2]' IN COALESCE(v_order.notes, '')) > 0 THEN
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
      'Compensation skipped: order was already cancelled before the idempotency marker. Stock may already have been restored; manual reconciliation is required.',
      jsonb_build_object('internal_status', v_order.internal_status, 'notes', v_order.notes)
    );

    RETURN jsonb_build_object(
      'success', false,
      'code', 'LEGACY_CANCELLED_REQUIRES_REVIEW'
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

  -- NULL snapshots are historical/ambiguous. Do not infer checkout-time state
  -- from today's catalog setting. Custom items (product_id NULL) are allowed
  -- only when the trigger has explicitly snapshotted them as untracked.
  IF EXISTS (
    SELECT 1
      FROM public.order_items AS oi
     WHERE oi.order_id = p_order_id
       AND (
         oi.quantity IS NULL
         OR oi.quantity <= 0
         OR oi.inventory_tracked_at_checkout IS NULL
         OR (oi.product_id IS NULL AND oi.inventory_tracked_at_checkout IS TRUE)
         OR (oi.variant_id IS NOT NULL AND oi.product_id IS NULL)
       )
  ) THEN
    INSERT INTO public.finance_audit_logs (
      actor_id, action_type, target_entity, target_id, notes, new_values
    ) VALUES (
      NULL, 'ORDER_ITEM_SNAPSHOT_REQUIRES_REVIEW', 'orders', p_order_id,
      'Compensation stopped because one or more items have invalid quantity or ambiguous checkout inventory snapshot. Historical NULL snapshots are not inferred from the live catalog.',
      jsonb_build_object('order_id', p_order_id)
    );
    RETURN jsonb_build_object('success', false, 'code', 'ORDER_ITEM_SNAPSHOT_REQUIRES_REVIEW');
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.order_items AS oi
     WHERE oi.order_id = p_order_id
       AND oi.product_id IS NOT NULL
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

  IF EXISTS (
    SELECT 1
      FROM public.order_items AS oi
     WHERE oi.order_id = p_order_id
       AND oi.variant_id IS NOT NULL
     GROUP BY oi.variant_id
    HAVING COUNT(DISTINCT oi.product_id) > 1
  ) THEN
    INSERT INTO public.finance_audit_logs (
      actor_id, action_type, target_entity, target_id, notes, new_values
    ) VALUES (
      NULL, 'ORDER_ITEM_VARIANT_PRODUCT_CONFLICT', 'orders', p_order_id,
      'Compensation stopped because the same variant_id is associated with multiple distinct product_ids in order_items.',
      jsonb_build_object('order_id', p_order_id)
    );
    RETURN jsonb_build_object('success', false, 'code', 'VARIANT_PRODUCT_CONFLICT_REQUIRES_REVIEW');
  END IF;

  -- Match checkout's deterministic product-before-coupon lock order.
  FOR v_item IN
    SELECT oi.product_id
      FROM public.order_items AS oi
     WHERE oi.order_id = p_order_id
       AND oi.product_id IS NOT NULL
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

  -- Match checkout's deterministic product-before-variant-before-coupon lock order.
  FOR v_var IN
    SELECT oi.variant_id, oi.product_id
      FROM public.order_items AS oi
     WHERE oi.order_id = p_order_id
       AND oi.variant_id IS NOT NULL
     GROUP BY oi.variant_id, oi.product_id
     ORDER BY oi.variant_id
  LOOP
    SELECT pv.id, pv.product_id
      INTO v_var_row
      FROM public.product_variants AS pv
     WHERE pv.id = v_var.variant_id
     FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.finance_audit_logs (
        actor_id, action_type, target_entity, target_id, notes, new_values
      ) VALUES (
        NULL, 'VARIANT_MISSING_FOR_COMPENSATION', 'orders', p_order_id,
        'Compensation stopped because an order item references a missing variant row.',
        jsonb_build_object('variant_id', v_var.variant_id, 'product_id', v_var.product_id)
      );
      RETURN jsonb_build_object('success', false, 'code', 'VARIANT_MISSING_REQUIRES_REVIEW');
    END IF;

    IF v_var_row.product_id IS DISTINCT FROM v_var.product_id THEN
      INSERT INTO public.finance_audit_logs (
        actor_id, action_type, target_entity, target_id, notes, new_values
      ) VALUES (
        NULL, 'VARIANT_PRODUCT_MISMATCH_FOR_COMPENSATION', 'orders', p_order_id,
        'Compensation stopped because variant does not belong to the expected product.',
        jsonb_build_object('variant_id', v_var.variant_id, 'actual_product_id', v_var_row.product_id, 'expected_product_id', v_var.product_id)
      );
      RETURN jsonb_build_object('success', false, 'code', 'VARIANT_PRODUCT_MISMATCH_REQUIRES_REVIEW');
    END IF;
  END LOOP;

  v_code := NULLIF(upper(btrim(COALESCE(p_coupon_code, v_order.coupon_code))), '');

  -- A coupon discrepancy must not prevent physical stock from being restored.
  -- Validate/lock coupon now, but treat coupon release as a separately audited
  -- outcome. Stock and order cancellation can still complete safely.
  IF p_coupon_code IS NOT NULL
     AND NULLIF(upper(btrim(p_coupon_code)), '') IS DISTINCT FROM
         NULLIF(upper(btrim(v_order.coupon_code)), '') THEN
    v_coupon_review_required := TRUE;
    v_coupon_review_reason := 'CALLER_ORDER_COUPON_MISMATCH';
  ELSIF v_code IS NOT NULL THEN
    SELECT *
      INTO v_coupon
      FROM public.coupons
     WHERE upper(code) = v_code
     FOR UPDATE;

    IF NOT FOUND THEN
      v_coupon_review_required := TRUE;
      v_coupon_review_reason := 'COUPON_RECORD_MISSING';
    ELSE
      v_coupon_locked := TRUE;
      v_times_used := COALESCE(v_coupon.times_used, 0);
      v_usage_count := COALESCE(v_coupon.usage_count, 0);

      IF v_times_used > 0 AND v_usage_count = v_times_used THEN
        v_coupon_release_ok := TRUE;
      ELSE
        v_coupon_review_required := TRUE;
        v_coupon_review_reason := 'COUPON_COUNTER_MISMATCH_OR_UNDERFLOW';
      END IF;
    END IF;
  END IF;

  -- Restore only catalog-backed products. Custom items with product_id NULL
  -- are intentionally excluded because they have no catalog stock to restore.
  FOR v_item IN
    SELECT
      oi.product_id,
      SUM(oi.quantity)::INTEGER AS quantity,
      BOOL_AND(oi.inventory_tracked_at_checkout) AS inventory_tracked
    FROM public.order_items AS oi
    WHERE oi.order_id = p_order_id
      AND oi.product_id IS NOT NULL
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

  -- Idempotently restore variant stock with deterministic lock order
  FOR v_var_item IN
    SELECT
      oi.variant_id,
      oi.product_id,
      SUM(oi.quantity)::INTEGER AS quantity,
      BOOL_AND(oi.inventory_tracked_at_checkout) AS inventory_tracked
    FROM public.order_items AS oi
    WHERE oi.order_id = p_order_id
      AND oi.variant_id IS NOT NULL
      AND oi.product_id IS NOT NULL
    GROUP BY oi.variant_id, oi.product_id
    ORDER BY oi.variant_id
  LOOP
    IF v_var_item.quantity IS NULL OR v_var_item.quantity <= 0 THEN
      RAISE EXCEPTION 'INVALID_ORDER_ITEM_FOR_VARIANT_STOCK_RESTORATION';
    END IF;

    v_var_ledger_id := NULL;

    INSERT INTO public.order_variant_stock_restorations (
      order_id, variant_id, product_id, quantity, inventory_tracked
    ) VALUES (
      p_order_id, v_var_item.variant_id, v_var_item.product_id, v_var_item.quantity, v_var_item.inventory_tracked
    )
    ON CONFLICT (order_id, variant_id) DO NOTHING
    RETURNING id INTO v_var_ledger_id;

    IF v_var_ledger_id IS NULL THEN
      PERFORM 1
        FROM public.order_variant_stock_restorations AS r
       WHERE r.order_id = p_order_id
         AND r.variant_id = v_var_item.variant_id
         AND r.product_id = v_var_item.product_id
         AND r.quantity = v_var_item.quantity
         AND r.inventory_tracked = v_var_item.inventory_tracked;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'VARIANT_STOCK_RESTORATION_LEDGER_MISMATCH: order %, variant %',
          p_order_id, v_var_item.variant_id;
      END IF;
    ELSE
      IF v_var_item.inventory_tracked THEN
        UPDATE public.product_variants
           SET stock_quantity = stock_quantity + v_var_item.quantity
         WHERE id = v_var_item.variant_id
           AND product_id = v_var_item.product_id
           AND stock_quantity IS NOT NULL;

        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows = 0 THEN
          PERFORM 1
             FROM public.product_variants
            WHERE id = v_var_item.variant_id
              AND product_id = v_var_item.product_id;
          IF NOT FOUND THEN
            RAISE EXCEPTION 'VARIANT_STOCK_UPDATE_FAILED: variant % not found', v_var_item.variant_id;
          END IF;
        END IF;
      END IF;
    END IF;
  END LOOP;

  UPDATE public.orders
     SET payment_status = 'failed',
         internal_status = 'CANCELLED',
         fulfillment_status = 'cancelled',
         wallet_amount_applied = 0,
         cancelled_at = COALESCE(cancelled_at, NOW()),
         notes = concat_ws(
           E'\n',
           NULLIF(notes, ''),
           '[WALLET_DEBIT_COMPENSATION_V2]',
           CASE WHEN v_coupon_review_required
             THEN '[COUPON_RELEASE_REQUIRES_REVIEW]'
             ELSE NULL
           END,
           NULLIF(p_failure_note, '')
         )
   WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_CANCELLATION_UPDATE_FAILED';
  END IF;

  IF v_coupon_release_ok AND v_coupon_locked THEN
    UPDATE public.coupons
       SET times_used = v_times_used - 1,
           usage_count = v_usage_count - 1
     WHERE id = v_coupon.id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'COUPON_COUNTER_UPDATE_FAILED: %', v_coupon.id;
    END IF;
  ELSIF v_coupon_review_required THEN
    INSERT INTO public.finance_audit_logs (
      actor_id, action_type, target_entity, target_id, old_values, notes, new_values
    ) VALUES (
      NULL,
      'COUPON_RELEASE_REQUIRES_REVIEW',
      'orders',
      p_order_id,
      CASE WHEN v_coupon_locked THEN
        jsonb_build_object(
          'coupon_id', v_coupon.id,
          'times_used', v_coupon.times_used,
          'usage_count', v_coupon.usage_count
        )
      ELSE NULL END,
      COALESCE(v_coupon_review_reason, 'COUPON_RELEASE_REQUIRES_REVIEW'),
      jsonb_build_object('coupon_code', v_code, 'order_id', p_order_id)
    );
  END IF;

  -- Clear coupon details only after a confirmed counter release. If review is
  -- required, preserve the original code/discount for financial reconciliation.
  IF v_coupon_release_ok THEN
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
    'coupon_released', v_coupon_release_ok,
    'coupon_review_required', v_coupon_review_required,
    'coupon_review_reason', v_coupon_review_reason
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.compensate_order_wallet_debit_failure(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compensate_order_wallet_debit_failure(UUID, TEXT, TEXT)
  TO service_role;

COMMIT;
