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
    v_var RECORD;
    v_prod_id UUID;
    v_var_id UUID;
    v_qty INT;
    v_rows INT;
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

    -- 2. Deterministic topological locking: lock all products first, then all variants second
    -- Phase 2a: Lock unique products in ascending product_id order
    FOR v_prod_id IN
        SELECT DISTINCT (value->>'product_id')::UUID
        FROM jsonb_array_elements(p_order_items)
        WHERE (value->>'product_id') IS NOT NULL
          AND (value->>'product_id') <> ''
          AND (value->>'product_id') <> 'null'
        ORDER BY (value->>'product_id')::UUID
    LOOP
        PERFORM 1
        FROM public.products
        WHERE id = v_prod_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product "%" is no longer available.', v_prod_id;
        END IF;
    END LOOP;

    -- Phase 2b: Lock unique variants in ascending variant_id order
    FOR v_var_id IN
        SELECT DISTINCT (value->>'variant_id')::UUID
        FROM jsonb_array_elements(p_order_items)
        WHERE (value->>'variant_id') IS NOT NULL
          AND (value->>'variant_id') <> ''
          AND (value->>'variant_id') <> 'null'
        ORDER BY (value->>'variant_id')::UUID
    LOOP
        PERFORM 1
        FROM public.product_variants
        WHERE id = v_var_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Variant "%" is no longer available.', v_var_id;
        END IF;
    END LOOP;

    -- Phase 2c: Validate stock and atomically decrement
    FOR v_item IN 
        SELECT value FROM jsonb_array_elements(p_order_items) 
        ORDER BY 
            COALESCE((value->>'product_id')::TEXT, ''),
            COALESCE((value->>'variant_id')::TEXT, '')
    LOOP
        v_prod_id := CASE 
            WHEN (v_item->>'product_id') IS NOT NULL 
                 AND (v_item->>'product_id') <> '' 
                 AND (v_item->>'product_id') <> 'null' 
            THEN (v_item->>'product_id')::UUID 
            ELSE NULL 
        END;

        -- Custom items (e.g. bespoke cake requests) have no catalog stock
        IF v_prod_id IS NULL THEN
            IF (v_item->>'variant_id') IS NOT NULL 
               AND (v_item->>'variant_id') <> '' 
               AND (v_item->>'variant_id') <> 'null' THEN
                RAISE EXCEPTION 'INVALID_CUSTOM_ITEM: Custom items cannot specify a variant.';
            END IF;
            CONTINUE;
        END IF;

        v_qty := (v_item->>'quantity')::INT;
        IF v_qty IS NULL OR v_qty <= 0 THEN
            RAISE EXCEPTION 'INVALID_QUANTITY: Quantity for "%" must be greater than zero.', COALESCE(v_item->>'title', 'item');
        END IF;

        v_var_id := CASE 
            WHEN (v_item->>'variant_id') IS NOT NULL 
                 AND (v_item->>'variant_id') <> '' 
                 AND (v_item->>'variant_id') <> 'null' 
            THEN (v_item->>'variant_id')::UUID 
            ELSE NULL 
        END;

        -- Read current row-locked product state
        SELECT id, title, stock_quantity, track_inventory, allow_backorders
        INTO v_prod
        FROM public.products
        WHERE id = v_prod_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product "%" is no longer available.', COALESCE(v_item->>'title', 'item');
        END IF;

        IF v_var_id IS NOT NULL THEN
            -- Read current row-locked variant state
            SELECT id, product_id, stock_quantity, sku
            INTO v_var
            FROM public.product_variants
            WHERE id = v_var_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Selected variant for "%" is no longer available.', COALESCE(v_item->>'title', 'item');
            END IF;

            -- Validate variant belongs to the selected product (NULL-safe)
            IF v_var.product_id IS DISTINCT FROM v_prod.id THEN
                RAISE EXCEPTION 'Selected variant does not belong to product "%".', v_prod.title;
            END IF;

            -- Validate stock against requested quantity
            IF v_prod.track_inventory AND NOT v_prod.allow_backorders THEN
                IF COALESCE(v_prod.stock_quantity, 0) < v_qty THEN
                    RAISE EXCEPTION 'INSUFFICIENT_STOCK: Insufficient stock for "%". Available: %, Requested: %',
                        v_prod.title, COALESCE(v_prod.stock_quantity, 0), v_qty;
                END IF;

                IF v_var.stock_quantity IS NOT NULL AND v_var.stock_quantity < v_qty THEN
                    RAISE EXCEPTION 'INSUFFICIENT_VARIANT_STOCK: Insufficient variant stock for "%". Available: %, Requested: %',
                        COALESCE(v_item->>'title', v_prod.title), v_var.stock_quantity, v_qty;
                END IF;
            END IF;

            -- Atomically decrement variant and product stock with fail-closed row count verification
            IF v_prod.track_inventory THEN
                IF v_var.stock_quantity IS NOT NULL THEN
                    UPDATE public.product_variants
                    SET stock_quantity = stock_quantity - v_qty
                    WHERE id = v_var.id;

                    GET DIAGNOSTICS v_rows = ROW_COUNT;
                    IF v_rows = 0 THEN
                        RAISE EXCEPTION 'VARIANT_STOCK_UPDATE_FAILED: %', v_var.id;
                    END IF;
                END IF;

                UPDATE public.products
                SET stock_quantity = stock_quantity - v_qty
                WHERE id = v_prod.id;

                GET DIAGNOSTICS v_rows = ROW_COUNT;
                IF v_rows = 0 THEN
                    RAISE EXCEPTION 'PRODUCT_STOCK_UPDATE_FAILED: %', v_prod.id;
                END IF;
            END IF;

        ELSE
            -- Non-variant product stock validation and decrement
            IF v_prod.track_inventory AND NOT v_prod.allow_backorders THEN
                IF COALESCE(v_prod.stock_quantity, 0) < v_qty THEN
                    RAISE EXCEPTION 'INSUFFICIENT_STOCK: Insufficient stock for "%". Available: %, Requested: %',
                        v_prod.title, COALESCE(v_prod.stock_quantity, 0), v_qty;
                END IF;
            END IF;

            IF v_prod.track_inventory THEN
                UPDATE public.products
                SET stock_quantity = stock_quantity - v_qty
                WHERE id = v_prod.id;

                GET DIAGNOSTICS v_rows = ROW_COUNT;
                IF v_rows = 0 THEN
                    RAISE EXCEPTION 'PRODUCT_STOCK_UPDATE_FAILED: %', v_prod.id;
                END IF;
            END IF;
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
            variant_id,
            store_id,
            title,
            sku,
            quantity,
            unit_price,
            line_total,
            variant_info
        ) VALUES (
            v_order_id,
            CASE WHEN (v_item->>'product_id') IS NOT NULL AND (v_item->>'product_id') <> '' AND (v_item->>'product_id') <> 'null' THEN (v_item->>'product_id')::UUID ELSE NULL END,
            CASE WHEN (v_item->>'variant_id') IS NOT NULL AND (v_item->>'variant_id') <> '' AND (v_item->>'variant_id') <> 'null' THEN (v_item->>'variant_id')::UUID ELSE NULL END,
            CASE WHEN (v_item->>'store_id') IS NOT NULL AND (v_item->>'store_id') <> '' AND (v_item->>'store_id') <> 'null' THEN (v_item->>'store_id')::UUID ELSE NULL END,
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
