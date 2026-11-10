-- ==============================================================================
-- MIGRATION: CUSTOMER ID CODE, INVOICE NUMBERING & ATOMIC DELIVERY CONFIRMATION RPC
-- ==============================================================================

BEGIN;

-- 1. PROFILES: CUSTOMER ID CODE TRIGGER & BACKFILL
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS customer_id_code TEXT;

CREATE OR REPLACE FUNCTION public.set_customer_id_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.customer_id_code IS NULL OR NEW.customer_id_code = '' THEN
        NEW.customer_id_code := 'CUS-' || LPAD(UPPER(SUBSTRING(NEW.id::text FROM 1 FOR 6)), 6, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_set_customer_id_code ON public.profiles;
CREATE TRIGGER trg_set_customer_id_code
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_customer_id_code();

-- Backfill any existing profiles missing customer_id_code
UPDATE public.profiles
SET customer_id_code = 'CUS-' || LPAD(UPPER(SUBSTRING(id::text FROM 1 FOR 6)), 6, '0')
WHERE customer_id_code IS NULL OR customer_id_code = '';


-- 2. ORDERS: INVOICE NUMBER COLUMN, TRIGGER & BACKFILL
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS invoice_number TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_invoice_number ON public.orders(invoice_number);

CREATE OR REPLACE FUNCTION public.set_order_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
        NEW.invoice_number := 'INV-' || TO_CHAR(COALESCE(NEW.created_at, NOW()), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(NEW.id::text FROM 1 FOR 5));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_set_order_invoice_number ON public.orders;
CREATE TRIGGER trg_set_order_invoice_number
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_order_invoice_number();

-- Backfill any existing orders missing invoice_number
UPDATE public.orders
SET invoice_number = 'INV-' || TO_CHAR(created_at, 'YYYYMMDD') || '-' || UPPER(SUBSTRING(id::text FROM 1 FOR 5))
WHERE invoice_number IS NULL OR invoice_number = '';


-- 3. ATOMIC DELIVERY CONFIRMATION RPC
DROP FUNCTION IF EXISTS public.confirm_order_delivery(UUID, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.confirm_order_delivery(
    p_order_id UUID,
    p_payment_method TEXT,
    p_admin_id UUID DEFAULT NULL
)
RETURNS SETOF public.orders AS $$
DECLARE
    v_actual_method TEXT;
    v_note TEXT;
    v_admin_user UUID;
BEGIN
    -- Check admin permission
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only Administrators can confirm order delivery.';
    END IF;

    v_admin_user := COALESCE(p_admin_id, auth.uid());

    -- Normalize payment method
    v_actual_method := UPPER(TRIM(p_payment_method));
    IF v_actual_method NOT IN ('COD', 'ONLINE', 'UPI', 'CARD', 'RAZORPAY') THEN
        v_actual_method := 'ONLINE';
    END IF;

    -- Build timeline note based on method
    IF v_actual_method = 'COD' THEN
        v_note := 'Order delivered — payment confirmed via COD';
    ELSE
        v_note := 'Order delivered — online payment confirmed (' || v_actual_method || ')';
    END IF;

    -- 1. Atomically update orders table
    UPDATE public.orders
    SET 
        fulfillment_status = 'delivered',
        internal_status = 'DELIVERED',
        payment_status = 'paid',
        payment_method = v_actual_method,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 2. Insert into order_timeline
    INSERT INTO public.order_timeline (order_id, status, note, created_by)
    VALUES (p_order_id, 'DELIVERED', v_note, v_admin_user);

    -- 3. Return updated order row
    RETURN QUERY
    SELECT * FROM public.orders WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.confirm_order_delivery(UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_order_delivery(UUID, TEXT, UUID) TO authenticated;


-- 4. UPDATE get_seller_orders() RPC TO RETURN INVOICE_NUMBER AND STRICTLY PROTECTED CUSTOMER CODE
DROP FUNCTION IF EXISTS public.get_seller_orders();

CREATE OR REPLACE FUNCTION public.get_seller_orders()
RETURNS TABLE (
    order_id UUID,
    order_number TEXT,
    invoice_number TEXT,
    customer_id_code TEXT,
    seller_total NUMERIC,
    payment_method TEXT,
    payment_status TEXT,
    fulfillment_status TEXT,
    internal_status TEXT,
    created_at TIMESTAMPTZ,
    items JSONB,
    timeline JSONB
) AS $$
DECLARE
    v_seller_id UUID;
BEGIN
    v_seller_id := auth.uid();
    IF v_seller_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH seller_stores AS (
        SELECT s.id FROM public.stores s WHERE s.seller_id = v_seller_id
    ),
    seller_order_items AS (
        SELECT 
            oi.order_id AS item_order_id,
            jsonb_agg(
                jsonb_build_object(
                    'id', oi.id,
                    'title', oi.title,
                    'quantity', oi.quantity,
                    'unit_price', oi.unit_price,
                    'line_total', oi.line_total
                )
            ) AS items_json,
            SUM(oi.line_total) AS total_sum
        FROM public.order_items oi
        LEFT JOIN public.products p ON p.id = oi.product_id
        WHERE oi.store_id IN (SELECT ss.id FROM seller_stores ss)
           OR p.store_id IN (SELECT ss.id FROM seller_stores ss)
        GROUP BY oi.order_id
    ),
    seller_order_ids AS (
        SELECT DISTINCT soi.item_order_id AS target_order_id FROM seller_order_items soi
    ),
    order_timelines_agg AS (
        SELECT 
            ot.order_id AS timeline_order_id,
            jsonb_agg(
                jsonb_build_object(
                    'id', ot.id,
                    'status', ot.status,
                    'note', ot.note,
                    'created_at', ot.created_at
                ) ORDER BY ot.created_at DESC
            ) AS timeline_json
        FROM public.order_timeline ot
        JOIN seller_order_ids so ON so.target_order_id = ot.order_id
        GROUP BY ot.order_id
    )
    SELECT 
        o.id AS order_id,
        o.order_number,
        COALESCE(
            o.invoice_number,
            'INV-' || TO_CHAR(o.created_at, 'YYYYMMDD') || '-' || UPPER(SUBSTRING(o.id::text FROM 1 FOR 5))
        ) AS invoice_number,
        COALESCE(
            p.customer_id_code, 
            'CUS-' || LPAD(UPPER(SUBSTRING(o.user_id::text FROM 1 FOR 6)), 6, '0')
        ) AS customer_id_code,
        COALESCE(soi.total_sum, 0) AS seller_total,
        COALESCE(o.payment_method, 'COD') AS payment_method,
        o.payment_status,
        o.fulfillment_status,
        COALESCE(o.internal_status, 'ORDERED') AS internal_status,
        o.created_at,
        COALESCE(soi.items_json, '[]'::jsonb) AS items,
        COALESCE(ota.timeline_json, '[]'::jsonb) AS timeline
    FROM public.orders o
    JOIN seller_order_ids so ON so.target_order_id = o.id
    LEFT JOIN public.profiles p ON p.id = o.user_id
    LEFT JOIN seller_order_items soi ON soi.item_order_id = o.id
    LEFT JOIN order_timelines_agg ota ON ota.timeline_order_id = o.id
    ORDER BY o.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMIT;
