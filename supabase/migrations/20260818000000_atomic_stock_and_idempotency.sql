-- ==============================================================================
-- MIGRATION: ATOMIC STOCK RESERVATION & CHECKOUT IDEMPOTENCY
-- Description:
-- 1. Adds non-destructive idempotency_key column and unique partial index to public.orders.
-- 2. Implements decrement_product_stock_atomic(UUID, INT) with row-level locks and strict stock checks.
-- 3. Implements restore_product_stock_atomic(UUID, INT) for safe transactional compensation.
-- 4. Replaces legacy decrement_product_stock(UUID, INT) to eliminate GREATEST(0, stock - quantity) overselling.
-- 5. Implements create_order_atomic(TEXT, JSONB, JSONB) for all-in-one atomic order creation & stock reservation.
-- ==============================================================================

BEGIN;

-- 1. ORDERS: IDEMPOTENCY KEY COLUMN & UNIQUE INDEX
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key 
ON public.orders(idempotency_key) 
WHERE idempotency_key IS NOT NULL;


-- 2. ATOMIC CONDITIONAL STOCK DECREMENT FUNCTION
-- Returns TRUE if stock was successfully decremented, or FALSE if insufficient stock.
-- Respects track_inventory and allow_backorders. Never allows stock to become negative.
CREATE OR REPLACE FUNCTION public.decrement_product_stock_atomic(
    p_product_id UUID,
    p_quantity INT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_rows INT;
BEGIN
    IF p_quantity <= 0 THEN
        RETURN TRUE;
    END IF;

    UPDATE public.products
    SET stock_quantity = stock_quantity - p_quantity
    WHERE id = p_product_id
      AND (
        track_inventory = false 
        OR allow_backorders = true 
        OR stock_quantity >= p_quantity
      );

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN (v_rows > 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.decrement_product_stock_atomic(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decrement_product_stock_atomic(UUID, INT) TO authenticated, anon, service_role;


-- 3. ATOMIC STOCK RESTORATION FUNCTION (FOR ROLLBACK COMPENSATION)
CREATE OR REPLACE FUNCTION public.restore_product_stock_atomic(
    p_product_id UUID,
    p_quantity INT
)
RETURNS VOID AS $$
BEGIN
    IF p_quantity <= 0 THEN
        RETURN;
    END IF;

    UPDATE public.products
    SET stock_quantity = stock_quantity + p_quantity
    WHERE id = p_product_id AND track_inventory = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.restore_product_stock_atomic(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_product_stock_atomic(UUID, INT) TO authenticated, anon, service_role;


-- 4. UPDATE LEGACY DECREMENT FUNCTION
-- Eliminates GREATEST(0, stock_quantity - p_quantity) so overselling can never occur.
CREATE OR REPLACE FUNCTION public.decrement_product_stock(
    p_product_id UUID,
    p_quantity INT
)
RETURNS VOID AS $$
DECLARE
    v_updated INT;
BEGIN
    IF p_quantity <= 0 THEN
        RETURN;
    END IF;

    UPDATE public.products
    SET stock_quantity = stock_quantity - p_quantity
    WHERE id = p_product_id
      AND (
        track_inventory = false 
        OR allow_backorders = true 
        OR stock_quantity >= p_quantity
      );

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK: Stock cannot be decremented for product ID %', p_product_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.decrement_product_stock(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decrement_product_stock(UUID, INT) TO authenticated, anon, service_role;


-- 5. ATOMIC COMPLETE ORDER CREATION & STOCK RESERVATION RPC
-- Executes idempotency check, sorted row-locked stock validation/decrement,
-- order insertion (firing ORD/INV triggers), order items insertion (firing OI triggers),
-- and coupon counter increments inside a single atomic PostgreSQL transaction.
CREATE OR REPLACE FUNCTION public.create_order_atomic(
    p_idempotency_key TEXT,
    p_order_data JSONB,
    p_order_items JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_existing_order RECORD;
    v_order RECORD;
    v_item JSONB;
    v_prod RECORD;
    v_order_id UUID;
    v_coupon_code TEXT;
BEGIN
    -- 1. Idempotency Check: Return existing order if attempt ID was already processed
    IF p_idempotency_key IS NOT NULL AND p_idempotency_key <> '' THEN
        SELECT id, order_number, invoice_number, payment_status, total, created_at
        INTO v_existing_order
        FROM public.orders
        WHERE idempotency_key = p_idempotency_key
        LIMIT 1;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', true,
                'is_duplicate', true,
                'order_id', v_existing_order.id,
                'order_number', v_existing_order.order_number,
                'invoice_number', v_existing_order.invoice_number,
                'order', row_to_json(v_existing_order)
            );
        END IF;
    END IF;

    -- 2. Lock and conditionally decrement stock for each item in sorted order to prevent deadlocks
    FOR v_item IN 
        SELECT value FROM jsonb_array_elements(p_order_items) 
        ORDER BY (value->>'product_id')::text 
    LOOP
        SELECT id, title, stock_quantity, track_inventory, allow_backorders
        INTO v_prod
        FROM public.products
        WHERE id = (v_item->>'product_id')::UUID
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product "%" is no longer available.', COALESCE(v_item->>'title', 'item');
        END IF;

        IF v_prod.track_inventory AND NOT v_prod.allow_backorders THEN
            IF v_prod.stock_quantity < (v_item->>'quantity')::INT THEN
                RAISE EXCEPTION 'INSUFFICIENT_STOCK: Insufficient stock for "%". Available: %, Requested: %',
                    v_prod.title, v_prod.stock_quantity, (v_item->>'quantity')::INT;
            END IF;
        END IF;

        IF v_prod.track_inventory THEN
            UPDATE public.products
            SET stock_quantity = stock_quantity - (v_item->>'quantity')::INT
            WHERE id = v_prod.id;
        END IF;
    END LOOP;

    -- 3. Insert order record (trigger_generate_order_number will generate ORD-XXXXX and INV-XXXXX)
    INSERT INTO public.orders (
        idempotency_key,
        user_id,
        email,
        shipping_address,
        billing_address,
        shipping_method,
        shipping_cost,
        subtotal,
        discount_amount,
        tax_amount,
        total,
        coupon_code,
        payment_method,
        payment_status,
        fulfillment_status,
        internal_status
    ) VALUES (
        p_idempotency_key,
        CASE WHEN (p_order_data->>'user_id') IS NOT NULL AND (p_order_data->>'user_id') <> '' AND (p_order_data->>'user_id') <> 'null' THEN (p_order_data->>'user_id')::UUID ELSE NULL END,
        p_order_data->>'email',
        p_order_data->'shipping_address',
        p_order_data->'billing_address',
        p_order_data->>'shipping_method',
        COALESCE((p_order_data->>'shipping_cost')::NUMERIC, 0),
        COALESCE((p_order_data->>'subtotal')::NUMERIC, 0),
        COALESCE((p_order_data->>'discount_amount')::NUMERIC, 0),
        COALESCE((p_order_data->>'tax_amount')::NUMERIC, 0),
        COALESCE((p_order_data->>'total')::NUMERIC, 0),
        p_order_data->>'coupon_code',
        COALESCE(p_order_data->>'payment_method', 'COD'),
        COALESCE(p_order_data->>'payment_status', 'pending'),
        COALESCE(p_order_data->>'fulfillment_status', 'pending'),
        COALESCE(p_order_data->>'internal_status', 'ORDERED')
    )
    RETURNING * INTO v_order;

    v_order_id := v_order.id;

    -- 4. Insert order items (triggers will assign OI-XXXXX-YYY code and snapshot SKU)
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_order_items) LOOP
        INSERT INTO public.order_items (
            order_id,
            product_id,
            store_id,
            title,
            sku,
            quantity,
            unit_price,
            line_total,
            variant_info
        ) VALUES (
            v_order_id,
            (v_item->>'product_id')::UUID,
            CASE WHEN (v_item->>'store_id') IS NOT NULL AND (v_item->>'store_id') <> '' THEN (v_item->>'store_id')::UUID ELSE NULL END,
            v_item->>'title',
            v_item->>'sku',
            (v_item->>'quantity')::INT,
            COALESCE((v_item->>'unit_price')::NUMERIC, 0),
            COALESCE((v_item->>'line_total')::NUMERIC, 0),
            v_item->'variant_info'
        );
    END LOOP;

    -- 5. Increment coupon usage if applied
    v_coupon_code := p_order_data->>'coupon_code';
    IF v_coupon_code IS NOT NULL AND v_coupon_code <> '' THEN
        UPDATE public.coupons
        SET times_used = COALESCE(times_used, 0) + 1,
            usage_count = COALESCE(usage_count, 0) + 1
        WHERE code = v_coupon_code;
    END IF;

    -- 6. Return committed order data
    RETURN jsonb_build_object(
        'success', true,
        'is_duplicate', false,
        'order_id', v_order.id,
        'order_number', v_order.order_number,
        'invoice_number', v_order.invoice_number,
        'order', row_to_json(v_order)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.create_order_atomic(TEXT, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(TEXT, JSONB, JSONB) TO authenticated, anon, service_role;

COMMIT;
