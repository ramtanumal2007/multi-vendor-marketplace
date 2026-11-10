-- ==============================================================================
-- MIGRATION: FIX CUSTOMER IDS & CONVERT LEGACY PERSIST ORDERS TO ORD-1000X / INV-1000X
-- 1. Ensure every customer/email has exactly ONE unique permanent customer reference (CUS-001, CUS-002...)
-- 2. Link every order to its matching profile via user_id / email
-- 3. Safely convert legacy PERSIST-XXXXXX orders to ORD-10004, ORD-10005, ORD-10006 and INV-10004, INV-10005, INV-10006
-- ==============================================================================

BEGIN;

-- 1. CLEANUP PROFILES DATA & ASSIGN UNIFIED CUS CODES
UPDATE public.profiles
SET full_name = 'Tumpa Mal'
WHERE email = 'tumpamal1981@gmail.com' AND (full_name IS NULL OR full_name = '');

UPDATE public.profiles
SET full_name = 'Sudip Singha'
WHERE email = 'ramtanumal@gmail.com' AND (full_name IS NULL OR full_name = '');

-- Re-sync all profile customer_id_codes sequentially by created_at
DO $$
DECLARE
    r RECORD;
    v_seq INT := 1;
BEGIN
    FOR r IN 
        SELECT id FROM public.profiles 
        ORDER BY created_at ASC, id ASC
    LOOP
        UPDATE public.profiles
        SET customer_id_code = 'CUS-' || LPAD(v_seq::text, 3, '0')
        WHERE id = r.id;

        v_seq := v_seq + 1;
    END LOOP;

    PERFORM setval('public.customer_id_seq', v_seq - 1);
END $$;


-- 2. LINK ORDERS TO CORRECT CUSTOMER PROFILES BY EMAIL & USER_ID
-- Link ORD-10003 (ramtanumal2007@gmail.com) to Ramtanu's profile (4fca2811-fe1a-4e10-a3e8-756819a17b0c -> CUS-003)
UPDATE public.orders
SET user_id = '4fca2811-fe1a-4e10-a3e8-756819a17b0c'
WHERE order_number = 'ORD-10003';

-- Link ORD-10007 (SUDIP@GMAIL.COM) to Sudip's profile (247fdf0f-48fd-4dd4-aa34-91982068a8ad -> CUS-004)
UPDATE public.orders
SET user_id = '247fdf0f-48fd-4dd4-aa34-91982068a8ad'
WHERE order_number = 'ORD-10007';

-- Auto-link any other orders matching profile emails
UPDATE public.orders o
SET user_id = p.id
FROM public.profiles p
WHERE LOWER(o.email) = LOWER(p.email)
  AND (o.user_id IS NULL OR o.user_id <> p.id);


-- 3. CONVERT LEGACY PERSIST- ORDERS TO SEQUENTIAL ORD- / INV- NUMBERS
UPDATE public.orders
SET order_number = 'ORD-10004',
    invoice_number = 'INV-10004'
WHERE order_number = 'PERSIST-280349';

UPDATE public.orders
SET order_number = 'ORD-10005',
    invoice_number = 'INV-10005'
WHERE order_number = 'PERSIST-546972';

UPDATE public.orders
SET order_number = 'ORD-10006',
    invoice_number = 'INV-10006'
WHERE order_number = 'PERSIST-571679';

-- Ensure all orders have matching INV-XXXXX invoice numbers
UPDATE public.orders
SET invoice_number = 'INV-' || REPLACE(order_number, 'ORD-', '')
WHERE invoice_number IS NULL OR invoice_number = '' OR invoice_number NOT SIMILAR TO 'INV-[0-9]+';

-- Set order_number_seq to 10007 so the next order gets ORD-10008
SELECT setval('public.order_number_seq', 10007);


-- 4. UPDATE ORDER ITEM CODES FOR CONVERTED ORDERS
DO $$
DECLARE
    r RECORD;
    v_seq INT;
    v_last_order UUID := NULL;
    v_clean_num TEXT;
BEGIN
    FOR r IN 
        SELECT oi.id, oi.order_id, o.order_number 
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        ORDER BY oi.order_id, oi.id ASC
    LOOP
        IF v_last_order IS NULL OR v_last_order <> r.order_id THEN
            v_last_order := r.order_id;
            v_seq := 1;
        ELSE
            v_seq := v_seq + 1;
        END IF;

        v_clean_num := REPLACE(COALESCE(r.order_number, 'ORD-10000'), 'ORD-', '');

        UPDATE public.order_items
        SET order_item_code = 'OI-' || v_clean_num || '-' || LPAD(v_seq::text, 3, '0')
        WHERE id = r.id;
    END LOOP;
END $$;


-- 5. UPDATE get_seller_orders() RPC TO JOIN PROFILES ON USER_ID AND EMAIL
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
                    'order_item_code', oi.order_item_code,
                    'product_id', oi.product_id,
                    'title', oi.title,
                    'sku', COALESCE(oi.sku, p.sku),
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
            'INV-' || REPLACE(o.order_number, 'ORD-', '')
        ) AS invoice_number,
        COALESCE(
            p.customer_id_code, 
            'CUS-001'
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
    LEFT JOIN public.profiles p ON p.id = o.user_id OR LOWER(p.email) = LOWER(o.email)
    LEFT JOIN seller_order_items soi ON soi.item_order_id = o.id
    LEFT JOIN order_timelines_agg ota ON ota.timeline_order_id = o.id
    ORDER BY o.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_seller_orders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_seller_orders() TO authenticated;

COMMIT;
