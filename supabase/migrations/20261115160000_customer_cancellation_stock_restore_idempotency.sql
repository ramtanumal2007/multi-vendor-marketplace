-- VENDOSMITH: idempotent stock restoration for customer order cancellation.
-- This is a migration artifact only. It is NOT applied by creating this file.
-- Historical rows with NULL checkout snapshots are intentionally sent to review.

BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_cancellation_stock_restorations (
  order_item_id UUID PRIMARY KEY REFERENCES public.order_items(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  variant_id UUID,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  restored_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.customer_cancellation_stock_restorations
  ADD COLUMN IF NOT EXISTS variant_id UUID;

ALTER TABLE public.customer_cancellation_stock_restorations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.customer_cancellation_stock_restorations
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.customer_cancellation_stock_restorations TO service_role;

CREATE OR REPLACE FUNCTION public.restore_cancelled_order_item_stock(
  p_order_item_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_item RECORD;
  v_prod RECORD;
  v_var RECORD;
  v_ledger_item UUID;
  v_rows INTEGER;
BEGIN
  SELECT
    oi.id,
    oi.order_id,
    oi.product_id,
    oi.variant_id,
    oi.quantity,
    oi.inventory_tracked_at_checkout,
    o.internal_status,
    o.fulfillment_status
  INTO v_item
  FROM public.order_items AS oi
  JOIN public.orders AS o ON o.id = oi.order_id
  WHERE oi.id = p_order_item_id
  FOR UPDATE OF oi;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'ORDER_ITEM_NOT_FOUND');
  END IF;

  IF upper(COALESCE(v_item.internal_status, '')) <> 'CANCELLED'
     AND lower(COALESCE(v_item.fulfillment_status, '')) <> 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_CANCELLED');
  END IF;

  IF v_item.product_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'code', 'CUSTOM_ITEM_NO_STOCK');
  END IF;

  IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_ITEM_QUANTITY');
  END IF;

  IF v_item.inventory_tracked_at_checkout IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVENTORY_SNAPSHOT_REQUIRES_MANUAL_REVIEW');
  END IF;

  IF v_item.inventory_tracked_at_checkout IS FALSE THEN
    RETURN jsonb_build_object('success', true, 'code', 'INVENTORY_NOT_TRACKED_AT_CHECKOUT');
  END IF;

  -- Lock parent product and validate existence
  SELECT id, stock_quantity
    INTO v_prod
    FROM public.products
   WHERE id = v_item.product_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STOCK_RESTORE_PRODUCT_NOT_FOUND: %', v_item.product_id;
  END IF;

  -- Lock variant and validate existence and product ownership (NULL-safe)
  IF v_item.variant_id IS NOT NULL THEN
    SELECT id, product_id, stock_quantity
      INTO v_var
      FROM public.product_variants
     WHERE id = v_item.variant_id
       FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'STOCK_RESTORE_VARIANT_NOT_FOUND: %', v_item.variant_id;
    END IF;

    IF v_var.product_id IS DISTINCT FROM v_item.product_id THEN
      RAISE EXCEPTION 'STOCK_RESTORE_VARIANT_PRODUCT_MISMATCH: variant % belongs to product %, expected %',
        v_var.id, v_var.product_id, v_item.product_id;
    END IF;
  END IF;

  INSERT INTO public.customer_cancellation_stock_restorations (
    order_item_id, order_id, product_id, variant_id, quantity
  ) VALUES (
    v_item.id, v_item.order_id, v_item.product_id, v_item.variant_id, v_item.quantity
  )
  ON CONFLICT (order_item_id) DO NOTHING
  RETURNING order_item_id INTO v_ledger_item;

  IF v_ledger_item IS NULL THEN
    RETURN jsonb_build_object('success', true, 'code', 'ALREADY_RESTORED');
  END IF;

  IF v_item.inventory_tracked_at_checkout IS TRUE THEN
    UPDATE public.products
       SET stock_quantity = COALESCE(stock_quantity, 0) + v_item.quantity
     WHERE id = v_item.product_id;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'STOCK_RESTORE_PRODUCT_NOT_FOUND: %', v_item.product_id;
    END IF;

    IF v_item.variant_id IS NOT NULL AND v_var.stock_quantity IS NOT NULL THEN
      UPDATE public.product_variants
         SET stock_quantity = stock_quantity + v_item.quantity
       WHERE id = v_var.id;

      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows = 0 THEN
        RAISE EXCEPTION 'STOCK_RESTORE_VARIANT_UPDATE_FAILED: %', v_var.id;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'code', 'RESTORED');
END;
$function$;

REVOKE ALL ON FUNCTION public.restore_cancelled_order_item_stock(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_cancelled_order_item_stock(UUID)
  TO service_role;

COMMIT;
