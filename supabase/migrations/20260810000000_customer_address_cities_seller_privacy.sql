-- ==============================================================================
-- MIGRATION: DELIVERY CITIES, STRICT SELLER PRIVACY & ANONYMIZED SELLER ORDERS
-- ==============================================================================

BEGIN;

-- 1. DELIVERY CITIES TABLE
CREATE TABLE IF NOT EXISTS public.delivery_cities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on delivery_cities
ALTER TABLE public.delivery_cities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active delivery cities" ON public.delivery_cities;
DROP POLICY IF EXISTS "Admin full access delivery cities" ON public.delivery_cities;

-- Public/Customer: View active cities only
CREATE POLICY "Anyone can view active delivery cities" ON public.delivery_cities
FOR SELECT USING (is_active = true OR public.is_admin());

-- Admin: Full access
CREATE POLICY "Admin full access delivery cities" ON public.delivery_cities
FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Seed the initial 12 cities
INSERT INTO public.delivery_cities (name, is_active)
VALUES
    ('TARKESWAR', true),
    ('LOKNATH', true),
    ('KAIKALA', true),
    ('HARIPAL', true),
    ('MALIYA HALT', true),
    ('NALIKUL', true),
    ('KAMARKUNDU', true),
    ('SINGUR', true),
    ('NASHIBPUR', true),
    ('DIARA', true),
    ('SHEORAAPHULI', true),
    ('MADHUSUDANPUR', true)
ON CONFLICT (name) DO UPDATE SET is_active = EXCLUDED.is_active;


-- 2. UPDATE PROFILES RLS POLICY TO PROTECT CUSTOMER PII FROM OTHER USERS
-- Ensure users can view their own profile, admins can view all profiles, but sellers cannot view customer profiles.
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admin view all profiles" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles
FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admin view all profiles" ON public.profiles
FOR SELECT USING (public.is_admin());


-- 3. UPDATE PUBLIC.ORDERS RLS POLICY FOR STRICT SELLER PRIVACY
-- Remove direct SELECT access on public.orders for sellers.
-- Sellers will use SECURITY DEFINER RPC public.get_seller_orders() which strips all PII.
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can insert own orders" ON public.orders;
DROP POLICY IF EXISTS "Sellers can view own store orders" ON public.orders;
DROP POLICY IF EXISTS "Sellers can update own store orders for initial stages" ON public.orders;
DROP POLICY IF EXISTS "Admin full access orders" ON public.orders;

CREATE POLICY "Users can view own orders" ON public.orders
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own orders" ON public.orders
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Sellers can update own store orders for initial stages" ON public.orders
FOR UPDATE USING (public.seller_owns_order(id, auth.uid()))
WITH CHECK (public.seller_owns_order(id, auth.uid()));

CREATE POLICY "Admin full access orders" ON public.orders
FOR ALL USING (public.is_admin());


-- 4. RPC TO FETCH ANONYMIZED SELLER ORDERS (NO PII)
DROP FUNCTION IF EXISTS public.get_seller_orders();
CREATE OR REPLACE FUNCTION public.get_seller_orders()
RETURNS TABLE (
    order_id UUID,
    order_number TEXT,
    customer_id_code TEXT,
    seller_total NUMERIC,
    payment_status TEXT,
    fulfillment_status TEXT,
    internal_status TEXT,
    created_at TIMESTAMPTZ,
    items JSONB,
    timeline JSONB
) AS $$
DECLARE
    v_seller_id UUID;
    v_store_id UUID;
BEGIN
    v_seller_id := auth.uid();
    IF v_seller_id IS NULL THEN
        RETURN;
    END IF;

    -- Get seller store_id
    SELECT id INTO v_store_id
    FROM public.stores
    WHERE seller_id = v_seller_id
    LIMIT 1;

    IF v_store_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH seller_order_ids AS (
        SELECT DISTINCT oi.order_id
        FROM public.order_items oi
        WHERE oi.store_id = v_store_id
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
        WHERE oi.store_id = v_store_id
        GROUP BY oi.order_id
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
