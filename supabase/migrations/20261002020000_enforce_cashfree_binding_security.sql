-- ==============================================================================
-- Migration: 20261002020000_enforce_cashfree_binding_security.sql
-- Enforce Cashfree session binding and reject forged payment_status = paid
-- ==============================================================================

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
SET search_path = public, pg_temp
AS $$
DECLARE
    v_req RECORD;
    v_new_order_id UUID;
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

    -- 4. SECURITY ENFORCEMENT: Online paid orders MUST have verified Cashfree order binding matching request
    IF p_payment_status = 'paid' OR p_payment_method = 'Cashfree' THEN
        IF p_cashfree_order_id IS NULL OR TRIM(p_cashfree_order_id) = '' THEN
            RAISE EXCEPTION 'A verified Cashfree Order ID is strictly required for online paid conversion';
        END IF;
        IF v_req.cashfree_order_id IS NULL OR v_req.cashfree_order_id != p_cashfree_order_id THEN
            RAISE EXCEPTION 'Cashfree Order ID mismatch: received %, bound %', p_cashfree_order_id, v_req.cashfree_order_id;
        END IF;
    END IF;

    -- 5. Parse server-authoritative financials from seller_quote
    v_final_amount := COALESCE((v_req.seller_quote->>'final_amount')::numeric, 0);
    v_base_price   := COALESCE((v_req.seller_quote->>'base_price')::numeric, v_final_amount);
    v_delivery_fee := COALESCE((v_req.seller_quote->>'delivery_charge')::numeric, 0);

    -- 6. Strict Email Verification: auth.users -> profiles -> FAIL if neither exists
    SELECT COALESCE(u.email, p.email) INTO v_customer_email
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE p.id = v_req.user_id;

    IF v_customer_email IS NULL OR TRIM(v_customer_email) = '' THEN
        RAISE EXCEPTION 'Customer email not found for user %. A verified email on the customer account or profile is strictly required to create an order.', v_req.user_id;
    END IF;

    -- 7. Construct unified shipping/billing address JSONB matching standard orders
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

    -- 8. Bespoke SKU prefix for trigger enforcement
    v_item_sku := 'CAKE-CUSTOM-' || v_req.request_number;

    -- 9. Insert into public.orders using the ACTUAL LIVE schema
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
        0,
        0,
        v_final_amount,
        NULL,
        p_payment_method,
        p_payment_status,
        p_fulfillment_status,
        p_internal_status,
        p_payment_reference,
        'Bespoke Custom Cake Order: ' || COALESCE(v_req.cake_type, 'Cake') || ' (' || COALESCE(v_req.flavor, 'Standard') || ', ' || COALESCE(v_req.weight, '1kg') || ')'
    ) RETURNING id, order_number, invoice_number INTO v_new_order_id, v_order_number, v_invoice_number;

    -- 10. Insert line item with narrow bespoke SKU check passed
    INSERT INTO public.order_items (
        order_id,
        store_id,
        product_id,
        title,
        sku,
        quantity,
        unit_price,
        line_total,
        variant_info
    ) VALUES (
        v_new_order_id,
        v_req.assigned_store_id,
        NULL,
        'Custom Cake - ' || COALESCE(v_req.cake_type, 'Cake') || ' (' || COALESCE(v_req.flavor, '') || ')',
        v_item_sku,
        1,
        v_base_price,
        v_base_price,
        jsonb_build_object(
            'weight', v_req.weight,
            'flavor', v_req.flavor,
            'cake_type', v_req.cake_type,
            'message_on_cake', v_req.message_on_cake,
            'dietary_notes', v_req.dietary_notes,
            'theme_description', v_req.theme_description,
            'preferred_delivery_date', v_req.preferred_delivery_date,
            'preferred_delivery_time', v_req.preferred_delivery_time,
            'custom_cake_request_id', v_req.id
        )
    );

    -- 11. Insert Initial Timeline Log using actual column (note)
    INSERT INTO public.order_timeline (
        order_id,
        status,
        note
    ) VALUES (
        v_new_order_id,
        p_internal_status,
        'Order created from Custom Cake Request #' || v_req.request_number || ' via ' || p_payment_method || ' (' || p_payment_status || ')'
    );

    -- 12. Update custom cake request to CONVERTED_TO_ORDER
    UPDATE public.custom_cake_requests
    SET converted_order_id = v_new_order_id,
        status = 'CONVERTED_TO_ORDER',
        updated_at = NOW()
    WHERE id = p_request_id;

    RETURN jsonb_build_object(
        'success', true,
        'is_duplicate', false,
        'order_id', v_new_order_id,
        'order_number', v_order_number,
        'invoice_number', v_invoice_number
    );
END;
$$;

-- Revoke execute from public, anon, and authenticated client roles
REVOKE ALL ON FUNCTION public.convert_custom_cake_to_order_server(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.convert_custom_cake_to_order_server(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.convert_custom_cake_to_order_server(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM authenticated;

-- Grant EXECUTE exclusively to service_role (server-side API routes)
GRANT EXECUTE ON FUNCTION public.convert_custom_cake_to_order_server(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

