-- ==============================================================================
-- MIGRATION: PROFESSIONAL MARKETPLACE ID ARCHITECTURE
-- Customer Reference: CUS-001, CUS-002... (concurrency-safe PostgreSQL sequence)
-- Order Number: ORD-10007 (preserves existing order_number_seq)
-- Invoice Number: INV-10007 (permanent database field, INV- + order_number digits)
-- Order Item ID: OI-10007-001, OI-10007-002... (concurrency-safe advisory lock)
-- SKU Snapshot: Historical product SKU preserved inside order_items.sku
-- ==============================================================================

BEGIN;

-- 1. CUSTOMER ID SEQUENCE & PROFILES TRIGGER
CREATE SEQUENCE IF NOT EXISTS public.customer_id_seq START 1;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS customer_id_code TEXT;

CREATE OR REPLACE FUNCTION public.set_customer_id_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.customer_id_code IS NULL OR NEW.customer_id_code = '' OR NEW.customer_id_code NOT SIMILAR TO 'CUS-[0-9]+' THEN
        NEW.customer_id_code := 'CUS-' || LPAD(nextval('public.customer_id_seq')::text, 3, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_set_customer_id_code ON public.profiles;
CREATE TRIGGER trg_set_customer_id_code
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_customer_id_code();

-- Backfill existing profiles missing or non-sequential customer_id_code
DO $$
DECLARE
    r RECORD;
    v_seq INT;
    v_max INT := 0;
BEGIN
    -- Check highest existing sequential CUS code
    SELECT COALESCE(MAX(NULLIF(regexp_replace(customer_id_code, '\D', '', 'g'), '')::int), 0)
    INTO v_max
    FROM public.profiles
    WHERE customer_id_code SIMILAR TO 'CUS-[0-9]+';

    IF v_max > 0 THEN
        PERFORM setval('public.customer_id_seq', v_max);
    END IF;

    -- Backfill remaining profiles ordered by creation date
    FOR r IN 
        SELECT id FROM public.profiles 
        WHERE customer_id_code IS NULL 
           OR customer_id_code = '' 
           OR customer_id_code NOT SIMILAR TO 'CUS-[0-9]+'
        ORDER BY created_at ASC, id ASC
    LOOP
        UPDATE public.profiles
        SET customer_id_code = 'CUS-' || LPAD(nextval('public.customer_id_seq')::text, 3, '0')
        WHERE id = r.id;
    END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_customer_id_code ON public.profiles(customer_id_code);


-- 2. ORDERS: INVOICE NUMBER COLUMN, TRIGGER & BACKFILL
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS invoice_number TEXT;

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
    v_seq BIGINT;
BEGIN
    IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
        v_seq := nextval('public.order_number_seq');
        NEW.order_number := 'ORD-' || v_seq::text;
    END IF;

    IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
        NEW.invoice_number := 'INV-' || REPLACE(NEW.order_number, 'ORD-', '');
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_generate_order_number ON public.orders;
CREATE TRIGGER trigger_generate_order_number
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.generate_order_number();

CREATE OR REPLACE FUNCTION public.set_order_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
        IF NEW.order_number IS NOT NULL AND NEW.order_number <> '' THEN
            NEW.invoice_number := 'INV-' || REPLACE(NEW.order_number, 'ORD-', '');
        ELSE
            NEW.invoice_number := 'INV-' || nextval('public.order_number_seq')::text;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_set_order_invoice_number ON public.orders;
CREATE TRIGGER trg_set_order_invoice_number
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_order_invoice_number();

-- Backfill existing orders with INV-10007 format
UPDATE public.orders
SET invoice_number = 'INV-' || REPLACE(order_number, 'ORD-', '')
WHERE invoice_number IS NULL 
   OR invoice_number = '' 
   OR invoice_number NOT SIMILAR TO 'INV-[0-9]+';

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_invoice_number ON public.orders(invoice_number);


-- 3. ORDER ITEMS: ORDER ITEM CODE, SKU SNAPSHOT & CONCURRENCY-SAFE TRIGGER
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS order_item_code TEXT;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS sku TEXT;

CREATE OR REPLACE FUNCTION public.set_order_item_details()
RETURNS TRIGGER AS $$
DECLARE
    v_order_num TEXT;
    v_clean_num TEXT;
    v_item_seq INT;
    v_prod_sku TEXT;
BEGIN
    -- 1. Lock on order ID to ensure concurrency safety across concurrent item inserts for the same order
    IF NEW.order_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext(NEW.order_id::text));
    END IF;

    -- 2. Snapshot SKU from products table if missing
    IF (NEW.sku IS NULL OR NEW.sku = '') AND NEW.product_id IS NOT NULL THEN
        SELECT p.sku INTO v_prod_sku FROM public.products p WHERE p.id = NEW.product_id;
        NEW.sku := v_prod_sku;
    END IF;

    -- 3. Generate Order Item Code (OI-10007-001)
    IF NEW.order_item_code IS NULL OR NEW.order_item_code = '' THEN
        SELECT order_number INTO v_order_num FROM public.orders WHERE id = NEW.order_id;
        IF v_order_num IS NOT NULL AND v_order_num <> '' THEN
            v_clean_num := REPLACE(v_order_num, 'ORD-', '');
        ELSE
            v_clean_num := '10000';
        END IF;

        -- Count existing items for this order to assign sequential suffix
        SELECT COALESCE(MAX(
            NULLIF(regexp_replace(order_item_code, '^.*-', '', 'g'), '')::int
        ), 0) + 1 INTO v_item_seq 
        FROM public.order_items 
        WHERE order_id = NEW.order_id;

        NEW.order_item_code := 'OI-' || v_clean_num || '-' || LPAD(v_item_seq::text, 3, '0');
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_set_order_item_details ON public.order_items;
CREATE TRIGGER trg_set_order_item_details
BEFORE INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.set_order_item_details();

-- Backfill SKU snapshot for existing order_items
UPDATE public.order_items oi
SET sku = COALESCE(
    oi.sku,
    p.sku,
    oi.variant_info->>'sku'
)
FROM public.products p
WHERE oi.product_id = p.id
  AND (oi.sku IS NULL OR oi.sku = '');

-- Backfill order_item_code for existing order_items
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
        LEFT JOIN public.orders o ON o.id = oi.order_id
        WHERE oi.order_item_code IS NULL OR oi.order_item_code = '' OR oi.order_item_code NOT SIMILAR TO 'OI-[0-9]+-[0-9]+'
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_items_order_item_code ON public.order_items(order_item_code);


-- 4. UPDATE get_seller_orders() RPC TO INCLUDE ORDER ITEM CODE & SKU (STRICT PRIVACY PRESERVED)
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
    LEFT JOIN public.profiles p ON p.id = o.user_id
    LEFT JOIN seller_order_items soi ON soi.item_order_id = o.id
    LEFT JOIN order_timelines_agg ota ON ota.timeline_order_id = o.id
    ORDER BY o.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_seller_orders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_seller_orders() TO authenticated;

COMMIT;
