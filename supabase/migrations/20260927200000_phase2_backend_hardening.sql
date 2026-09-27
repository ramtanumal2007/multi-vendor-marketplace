-- ==============================================================================
-- Migration: Phase 2 Backend Hardening & Atomic Operations
-- Version: 20260927200000
-- Description:
--   1. Fix Multi-Seller Tracking Collision:
--      - public.is_order_multi_seller(p_order_id UUID)
--      - public.get_orders_multi_seller_status(p_order_ids UUID[])
--      - trg_prevent_multi_seller_tracking BEFORE UPDATE trigger on public.orders
--   2. Fix Non-Atomic Bulk Order Updates:
--      - public.bulk_update_seller_orders(p_order_ids UUID[], p_target_status TEXT, p_note TEXT)
--   3. Customer Cancel / Return Duplicate Ticket Prevention:
--      - Hardened public.create_support_ticket with open ticket deduplication
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. MULTI-SELLER ORDER DETECTION & TRACKING COLLISION PREVENTION
-- ==============================================================================

-- 1.1 Helper: Check if an individual order contains products from multiple stores
CREATE OR REPLACE FUNCTION public.is_order_multi_seller(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN (
        SELECT COUNT(DISTINCT COALESCE(oi.store_id, p.store_id)) > 1
        FROM public.order_items oi
        LEFT JOIN public.products p ON p.id = oi.product_id
        WHERE oi.order_id = p_order_id
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_order_multi_seller(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_order_multi_seller(UUID) TO authenticated;

-- 1.2 Batch Helper: Check multi-seller status for a list of order IDs (used in seller portal)
CREATE OR REPLACE FUNCTION public.get_orders_multi_seller_status(p_order_ids UUID[])
RETURNS TABLE (
    order_id UUID,
    is_multi_seller BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o_id AS order_id,
        (COUNT(DISTINCT COALESCE(oi.store_id, p.store_id)) > 1) AS is_multi_seller
    FROM unnest(p_order_ids) AS o_id
    LEFT JOIN public.order_items oi ON oi.order_id = o_id
    LEFT JOIN public.products p ON p.id = oi.product_id
    GROUP BY o_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_orders_multi_seller_status(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_orders_multi_seller_status(UUID[]) TO authenticated;

-- 1.3 Trigger: Prevent Sellers from overwriting top-level tracking on multi-seller orders
CREATE OR REPLACE FUNCTION public.prevent_multi_seller_tracking_collision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Check if tracking carrier or tracking number are being modified
    IF (NEW.tracking_number IS DISTINCT FROM OLD.tracking_number OR 
        NEW.tracking_carrier IS DISTINCT FROM OLD.tracking_carrier) THEN
        
        -- If the order is multi-seller, block direct top-level tracking modification by non-admins
        IF public.is_order_multi_seller(NEW.id) THEN
            IF NOT public.is_admin() THEN
                RAISE EXCEPTION 'Tracking for multi-seller orders cannot be updated directly at the order level to avoid cross-seller data collision. Item-level shipment tracking will be enabled in a future release.'
                USING ERRCODE = '42501';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_multi_seller_tracking ON public.orders;
CREATE TRIGGER trg_prevent_multi_seller_tracking
BEFORE UPDATE OF tracking_number, tracking_carrier ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_multi_seller_tracking_collision();

-- ==============================================================================
-- 2. ATOMIC SERVER-SIDE BULK SELLER ORDER STATUS TRANSITIONS
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.bulk_update_seller_orders(
    p_order_ids UUID[],
    p_target_status TEXT,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_seller_id UUID;
    v_ord_id UUID;
    v_current_status TEXT;
    v_fulfillment_status TEXT;
    v_timeline_note TEXT;
    v_count INT;
BEGIN
    -- 1. Validate authenticated session
    v_seller_id := auth.uid();
    IF v_seller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required for bulk order updates' USING ERRCODE = '42501';
    END IF;

    -- 2. Verify approved seller status (or platform admin)
    IF NOT EXISTS (
        SELECT 1 FROM public.seller_profiles
        WHERE id = v_seller_id AND verification_status = 'approved'
    ) AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Forbidden: Only approved sellers can perform bulk order updates' USING ERRCODE = '42501';
    END IF;

    -- 3. Validate target status
    IF p_target_status NOT IN ('CONFIRMED', 'READY TO DISPATCH') THEN
        RAISE EXCEPTION 'Invalid target status: % (allowed: CONFIRMED, READY TO DISPATCH)', p_target_status USING ERRCODE = '22023';
    END IF;

    -- 4. Validate order IDs array
    IF p_order_ids IS NULL OR array_length(p_order_ids, 1) IS NULL OR array_length(p_order_ids, 1) = 0 THEN
        RAISE EXCEPTION 'No order IDs provided for bulk update' USING ERRCODE = '22023';
    END IF;

    v_count := array_length(p_order_ids, 1);

    -- 5. Validate ownership and allowed status transition for EVERY order
    -- If any order is invalid, the entire transaction will roll back automatically
    FOREACH v_ord_id IN ARRAY p_order_ids LOOP
        -- Verify seller store ownership
        IF NOT public.seller_owns_order(v_ord_id, v_seller_id) AND NOT public.is_admin() THEN
            RAISE EXCEPTION 'Unauthorized: Order % does not contain items from your store', v_ord_id USING ERRCODE = '42501';
        END IF;

        -- Verify order existence and current status
        SELECT internal_status INTO v_current_status
        FROM public.orders
        WHERE id = v_ord_id;

        IF v_current_status IS NULL THEN
            RAISE EXCEPTION 'Order % not found', v_ord_id USING ERRCODE = 'P0002';
        END IF;

        -- Validate allowed transitions:
        -- ORDERED -> CONFIRMED
        -- CONFIRMED -> READY TO DISPATCH
        IF p_target_status = 'CONFIRMED' AND v_current_status <> 'ORDERED' THEN
            RAISE EXCEPTION 'Order % cannot transition from % to CONFIRMED. Only ORDERED status may transition to CONFIRMED.', v_ord_id, v_current_status USING ERRCODE = '22023';
        ELSIF p_target_status = 'READY TO DISPATCH' AND v_current_status <> 'CONFIRMED' THEN
            RAISE EXCEPTION 'Order % cannot transition from % to READY TO DISPATCH. Only CONFIRMED status may transition to READY TO DISPATCH.', v_ord_id, v_current_status USING ERRCODE = '22023';
        END IF;
    END LOOP;

    -- 6. All orders validated. Execute atomic update
    v_fulfillment_status := CASE WHEN p_target_status = 'READY TO DISPATCH' THEN 'shipped' ELSE 'processing' END;
    v_timeline_note := COALESCE(
        NULLIF(TRIM(p_note), ''),
        CASE
            WHEN p_target_status = 'CONFIRMED' THEN 'Order confirmed via bulk action. Packing in progress.'
            ELSE 'Order packed and marked ready for logistics dispatch via bulk action.'
        END
    );

    UPDATE public.orders
    SET
        internal_status = p_target_status,
        fulfillment_status = v_fulfillment_status,
        updated_at = now()
    WHERE id = ANY(p_order_ids);

    -- 7. Insert timeline events for each updated order
    INSERT INTO public.order_timeline (order_id, status, note, created_by)
    SELECT unnest(p_order_ids), p_target_status, v_timeline_note, v_seller_id;

    RETURN jsonb_build_object(
        'success', true,
        'target_status', p_target_status,
        'updated_count', v_count
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bulk_update_seller_orders(UUID[], TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_update_seller_orders(UUID[], TEXT, TEXT) TO authenticated;

-- ==============================================================================
-- 3. CUSTOMER CANCEL / RETURN DUPLICATE TICKET PREVENTION
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.create_support_ticket(
    p_category TEXT,
    p_subject TEXT,
    p_description TEXT,
    p_order_id UUID DEFAULT NULL,
    p_order_number TEXT DEFAULT NULL,
    p_phone_number TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_customer_name TEXT;
    v_customer_email TEXT;
    v_ticket_id UUID;
    v_ticket_number TEXT;
    v_ticket_record RECORD;
    v_normalized_category TEXT;
    v_existing_ticket RECORD;
BEGIN
    -- Verify authenticated user
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to create a support ticket' USING ERRCODE = '42501';
    END IF;

    -- Fetch user identity
    SELECT full_name, email INTO v_customer_name, v_customer_email
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_customer_name IS NULL OR TRIM(v_customer_name) = '' THEN
        v_customer_name := COALESCE(auth.jwt()->>'name', 'Customer');
    END IF;

    IF v_customer_email IS NULL OR TRIM(v_customer_email) = '' THEN
        v_customer_email := COALESCE(auth.jwt()->>'email', 'customer@vendosmith.com');
    END IF;

    -- Validate fields
    IF p_category IS NULL OR TRIM(p_category) = '' THEN
        RAISE EXCEPTION 'Category is required';
    END IF;
    IF p_subject IS NULL OR TRIM(p_subject) = '' THEN
        RAISE EXCEPTION 'Subject is required';
    END IF;
    IF p_description IS NULL OR TRIM(p_description) = '' THEN
        RAISE EXCEPTION 'Description is required';
    END IF;

    -- Normalize category to match schema constraint
    v_normalized_category := CASE
        WHEN TRIM(p_category) = 'Returns & Refunds' THEN 'Return / Refund'
        ELSE TRIM(p_category)
    END;

    -- Defense-in-depth: Order ownership validation & duplicate open ticket prevention
    IF p_order_id IS NOT NULL THEN
        -- Verify order ownership: Customers may only create tickets for their own orders
        IF NOT EXISTS (
            SELECT 1
            FROM public.orders
            WHERE id = p_order_id
              AND user_id = v_user_id
        ) AND NOT public.is_admin() THEN
            RAISE EXCEPTION 'Unauthorized: Order does not belong to your account'
            USING ERRCODE = '42501';
        END IF;

        SELECT id, ticket_number, status, category, created_at INTO v_existing_ticket
        FROM public.support_tickets
        WHERE order_id = p_order_id
          AND user_id = v_user_id
          AND status IN ('OPEN', 'UNDER_REVIEW', 'ACTION_TAKEN')
          AND (
            category = v_normalized_category
            OR (category = 'Return / Refund' AND v_normalized_category = 'Return / Refund')
            OR subject ILIKE '%' || TRIM(p_subject) || '%'
            OR TRIM(p_subject) ILIKE '%' || subject || '%'
          )
        ORDER BY created_at DESC
        LIMIT 1;

        -- If an equivalent open ticket already exists, do not create duplicate. Return existing record.
        IF v_existing_ticket.id IS NOT NULL THEN
            SELECT * INTO v_ticket_record FROM public.support_tickets WHERE id = v_existing_ticket.id;
            RETURN to_jsonb(v_ticket_record) || jsonb_build_object(
                'is_duplicate', true,
                'message', 'An active support ticket (' || v_existing_ticket.ticket_number || ') is already open for this request.'
            );
        END IF;
    END IF;

    -- Single authoritative sequence ticket number
    v_ticket_number := 'VSM-' || LPAD(nextval('public.support_ticket_seq')::TEXT, 5, '0');

    -- Insert into support_tickets
    INSERT INTO public.support_tickets (
        ticket_number,
        user_id,
        customer_name,
        customer_email,
        phone_number,
        order_id,
        order_number,
        category,
        subject,
        description,
        status,
        priority
    ) VALUES (
        v_ticket_number,
        v_user_id,
        v_customer_name,
        v_customer_email,
        p_phone_number,
        p_order_id,
        p_order_number,
        v_normalized_category,
        TRIM(p_subject),
        TRIM(p_description),
        'OPEN',
        'NORMAL'
    )
    RETURNING id INTO v_ticket_id;

    -- Insert initial message into immutable support_ticket_messages
    INSERT INTO public.support_ticket_messages (
        ticket_id,
        sender_id,
        sender_role,
        sender_name,
        message
    ) VALUES (
        v_ticket_id,
        v_user_id,
        'customer',
        v_customer_name,
        TRIM(p_description)
    );

    SELECT * INTO v_ticket_record FROM public.support_tickets WHERE id = v_ticket_id;
    RETURN to_jsonb(v_ticket_record) || jsonb_build_object('is_duplicate', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_support_ticket(TEXT, TEXT, TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_support_ticket(TEXT, TEXT, TEXT, UUID, TEXT, TEXT) TO authenticated;

COMMIT;
