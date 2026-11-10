-- ==============================================================================
-- MASTER MIGRATION: TAX, DELIVERY, PAYMENT STATES, CITIES & SELLER VISIBILITY
-- ==============================================================================

BEGIN;

-- 1. ADD COLUMNS FOR ADMIN TAX & DELIVERY MANAGEMENT
ALTER TABLE public.delivery_cities
ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC DEFAULT 40;

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS tax_rate NUMERIC DEFAULT NULL,
ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC DEFAULT NULL;

ALTER TABLE public.categories
ADD COLUMN IF NOT EXISTS tax_rate NUMERIC DEFAULT NULL;

ALTER TABLE public.site_settings
ADD COLUMN IF NOT EXISTS default_tax_rate NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS free_delivery_threshold NUMERIC DEFAULT 500;

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'COD';


-- 2. UPDATE GET_SELLER_ORDERS RPC FOR ALL SELLER STORES & ZERO PII
DROP FUNCTION IF EXISTS public.get_seller_orders();
CREATE OR REPLACE FUNCTION public.get_seller_orders()
RETURNS TABLE (
    order_id UUID,
    order_number TEXT,
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
        SELECT id FROM public.stores WHERE seller_id = v_seller_id
    ),
    seller_order_items AS (
        SELECT 
            oi.order_id,
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
        JOIN public.products p ON p.id = oi.product_id
        WHERE oi.store_id IN (SELECT id FROM seller_stores)
           OR p.store_id IN (SELECT id FROM seller_stores)
        GROUP BY oi.order_id
    ),
    seller_order_ids AS (
        SELECT DISTINCT order_id FROM seller_order_items
    ),
    order_timelines_agg AS (
        SELECT 
            ot.order_id,
            jsonb_agg(
                jsonb_build_object(
                    'id', ot.id,
                    'status', ot.status,
                    'note', ot.note,
                    'created_at', ot.created_at
                ) ORDER BY ot.created_at DESC
            ) AS timeline_json
        FROM public.order_timeline ot
        JOIN seller_order_ids so ON so.order_id = ot.order_id
        GROUP BY ot.order_id
    )
    SELECT 
        o.id AS order_id,
        o.order_number,
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
    JOIN seller_order_ids so ON so.order_id = o.id
    LEFT JOIN public.profiles p ON p.id = o.user_id
    LEFT JOIN seller_order_items soi ON soi.order_id = o.id
    LEFT JOIN order_timelines_agg ota ON ota.order_id = o.id
    ORDER BY o.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMIT;
