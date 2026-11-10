-- ==============================================================================
-- MIGRATION: VENDOSMITH FINAL CUSTOM CAKE ORDER CONVERSION & NARROW TRIGGER
-- Version: 20261002010000
-- ==============================================================================

BEGIN;

-- 1. EXTEND custom_cake_requests WITH cashfree_order_id
ALTER TABLE public.custom_cake_requests 
ADD COLUMN IF NOT EXISTS cashfree_order_id TEXT;

CREATE INDEX IF NOT EXISTS idx_custom_cake_requests_cf_order 
ON public.custom_cake_requests(cashfree_order_id);

-- 2. NARROWLY-SCOPED STORE ID & CATALOG INTEGRITY TRIGGER FOR order_items
CREATE OR REPLACE FUNCTION public.set_order_item_store_id() RETURNS TRIGGER AS $$
DECLARE
    v_store_id UUID;
    v_store_exists BOOLEAN;
BEGIN
    -- Branch A: Standard catalog order item
    IF NEW.product_id IS NOT NULL THEN
        SELECT store_id INTO v_store_id 
        FROM public.products 
        WHERE id = NEW.product_id;
        
        IF NOT FOUND OR v_store_id IS NULL THEN
            RAISE EXCEPTION 'Product % does not exist or has no valid store.', NEW.product_id;
        END IF;
        
        -- Authoritatively derive store_id from catalog products table
        NEW.store_id := v_store_id;
        RETURN NEW;
    END IF;

    -- Branch B: Custom Cake bespoke item (product_id IS NULL)
    -- Permitted ONLY when BOTH:
    -- 1. NEW.sku IS NOT NULL AND NEW.sku LIKE 'CAKE-CUSTOM-%'
    -- 2. NEW.store_id IS NOT NULL AND exists in public.stores
    IF NEW.product_id IS NULL THEN
        IF NEW.sku IS NOT NULL 
           AND NEW.sku LIKE 'CAKE-CUSTOM-%' 
           AND NEW.store_id IS NOT NULL THEN
           
            SELECT EXISTS (
                SELECT 1 FROM public.stores WHERE id = NEW.store_id
            ) INTO v_store_exists;
            
            IF NOT v_store_exists THEN
                RAISE EXCEPTION 'Store % does not exist for bespoke item (SKU: %).', NEW.store_id, NEW.sku;
            END IF;
            
            -- Valid bespoke order item: retain verified store_id
            RETURN NEW;
        ELSE
            -- Branch C: Any other NULL product_id is strictly rejected
            RAISE EXCEPTION 'product_id cannot be null for standard order items (SKU: %, store_id: %). Only authorized bespoke items (SKU CAKE-CUSTOM-*) are permitted.',
                COALESCE(NEW.sku, 'NULL'),
                COALESCE(NEW.store_id::text, 'NULL');
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS enforce_order_item_store_id ON public.order_items;
CREATE TRIGGER enforce_order_item_store_id
BEFORE INSERT ON public.order_items
FOR EACH ROW EXECUTE PROCEDURE public.set_order_item_store_id();

-- 3. SERVER-ONLY ORDER CONVERSION RPC (REAL LIVE SCHEMA)
CREATE OR REPLACE FUNCTION public.convert_custom_cake_to_order_server(
    p_request_id UUID,
    p_payment_method TEXT,
    p_payment_status TEXT,
    p_internal_status TEXT,
    p_fulfillment_status TEXT,
    p_payment_reference TEXT DEFAULT NULL,
    p_cashfree_order_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_req RECORD;
    v_order_id UUID;
    v_order_number TEXT;
    v_invoice_number TEXT;
    v_item_sku TEXT;
    v_final_amount NUMERIC(10,2);
    v_base_price NUMERIC(10,2);
    v_delivery_fee NUMERIC(10,2);
    v_customer_email TEXT;
    v_shipping_addr JSONB;
BEGIN
    -- 1. Fetch request with row lock
    SELECT * INTO v_req
    FROM public.custom_cake_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Custom cake request % not found', p_request_id;
    END IF;

    -- 2. Idempotency: return existing order if already converted
    IF v_req.status = 'CONVERTED_TO_ORDER' AND v_req.converted_order_id IS NOT NULL THEN
        SELECT order_number, invoice_number INTO v_order_number, v_invoice_number 
        FROM public.orders 
        WHERE id = v_req.converted_order_id;
        
        RETURN jsonb_build_object(
            'success', true,
            'is_duplicate', true,
            'order_id', v_req.converted_order_id,
            'order_number', v_order_number,
            'invoice_number', v_invoice_number
        );
    END IF;

    -- 3. Validate state and quote existence
    IF v_req.status NOT IN ('QUOTED', 'CUSTOMER_ACCEPTED') THEN
        RAISE EXCEPTION 'Request % is in status % and cannot be converted to order', p_request_id, v_req.status;
    END IF;

    IF v_req.seller_quote IS NULL OR v_req.assigned_store_id IS NULL THEN
        RAISE EXCEPTION 'Request % lacks an accepted quote or assigned store', p_request_id;
    END IF;

    -- 4. Parse server-authoritative financials from seller_quote
    v_final_amount := COALESCE((v_req.seller_quote->>'final_amount')::numeric, 0);
    v_base_price   := COALESCE((v_req.seller_quote->>'base_price')::numeric, v_final_amount);
    v_delivery_fee := COALESCE((v_req.seller_quote->>'delivery_charge')::numeric, 0);

    -- 5. Strict Email Verification: auth.users -> profiles -> FAIL if neither exists
    SELECT COALESCE(u.email, p.email) INTO v_customer_email
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE p.id = v_req.user_id;

    IF v_customer_email IS NULL OR TRIM(v_customer_email) = '' THEN
        RAISE EXCEPTION 'Customer email not found for user %. A verified email on the customer account or profile is strictly required to create an order.', v_req.user_id;
    END IF;

    -- 6. Construct unified shipping/billing address JSONB matching standard orders
    v_shipping_addr := jsonb_build_object(
        'full_name', v_req.contact_name,
        'phone', v_req.contact_phone,
        'email', v_customer_email,
        'address_line1', v_req.delivery_address->>'address_line1',
        'address_line2', v_req.delivery_address->>'address_line2',
        'landmark', v_req.delivery_address->>'landmark',
        'city', v_req.delivery_address->>'city',
        'state', v_req.delivery_address->>'state',
        'postal_code', v_req.delivery_address->>'postal_code',
        'country', COALESCE(v_req.delivery_address->>'country', 'India')
    );

    -- 7. Bespoke SKU prefix for trigger enforcement
    v_item_sku := 'CAKE-CUSTOM-' || v_req.request_number;

    -- 8. Insert into public.orders using the ACTUAL LIVE schema
    -- order_number and invoice_number are omitted so trigger_generate_order_number
    -- and trg_set_order_invoice_number authoritatively assign standard ORD-xxxxx and INV-xxxxx.
    INSERT INTO public.orders (
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
        internal_status,
        razorpay_payment_id,
        notes
    ) VALUES (
        v_req.user_id,
        v_customer_email,
        v_shipping_addr,
        v_shipping_addr,
        'Custom Cake Delivery',
        v_delivery_fee,
        v_base_price,
        0.00,
        0.00,
        v_final_amount,
        NULL,
        p_payment_method,
        p_payment_status,
        p_fulfillment_status,
        p_internal_status,
        p_payment_reference,
        'Custom Cake Request #' || v_req.request_number
    ) RETURNING id, order_number, invoice_number INTO v_order_id, v_order_number, v_invoice_number;

    -- 9. Insert into public.order_items using ACTUAL LIVE schema
    -- product_id IS NULL triggers set_order_item_store_id() Branch B (CAKE-CUSTOM-* check).
    -- order_item_code is auto-assigned as 'OI-' || clean_order_num || '-001' by trg_set_order_item_details().
    INSERT INTO public.order_items (
        order_id,
        store_id,
        product_id,
        variant_id,
        title,
        sku,
        quantity,
        unit_price,
        line_total,
        variant_info
    ) VALUES (
        v_order_id,
        v_req.assigned_store_id,
        NULL,
        NULL,
        'Custom Cake: ' || v_req.cake_type || ' (' || v_req.flavor || ', ' || v_req.weight || ')',
        v_item_sku,
        1,
        v_base_price,
        v_base_price,
        jsonb_build_object(
            'is_custom_cake', true,
            'request_number', v_req.request_number,
            'flavor', v_req.flavor,
            'weight', v_req.weight,
            'cake_type', v_req.cake_type,
            'message_on_cake', v_req.message_on_cake,
            'preferred_delivery_date', v_req.preferred_delivery_date,
            'preferred_delivery_time', v_req.preferred_delivery_time
        )
    );

    -- 10. Insert into public.order_timeline using ACTUAL LIVE schema
    -- The live column is 'note', NOT 'description'
    INSERT INTO public.order_timeline (
        order_id,
        status,
        note,
        created_by
    ) VALUES (
        v_order_id,
        p_internal_status,
        CASE 
            WHEN p_payment_method = 'COD' THEN 'Custom cake order placed with Cash on Delivery (pending seller confirmation)'
            ELSE 'Custom cake online payment verified via Cashfree (' || COALESCE(p_payment_reference, 'N/A') || ')'
        END,
        v_req.user_id
    );

    -- 11. Update Custom Cake Request status
    UPDATE public.custom_cake_requests
    SET status = 'CONVERTED_TO_ORDER',
        converted_order_id = v_order_id,
        cashfree_order_id = COALESCE(p_cashfree_order_id, cashfree_order_id),
        updated_at = NOW()
    WHERE id = v_req.id;

    RETURN jsonb_build_object(
        'success', true,
        'is_duplicate', false,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'invoice_number', v_invoice_number
    );
END;
$$;

-- Revoke execution from public & authenticated users; grant only to service_role (server routes)
REVOKE ALL ON FUNCTION public.convert_custom_cake_to_order_server(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_custom_cake_to_order_server(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

COMMIT;
