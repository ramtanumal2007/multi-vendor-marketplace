-- ==============================================================================
-- MIGRATION: COUPON RLS POLICY, ATOMIC STOCK DECREMENT RPC & SEED TEST COUPONS
-- ==============================================================================

BEGIN;

-- 1. Coupon public read policy for active coupons
DROP POLICY IF EXISTS "Public read active coupons" ON public.coupons;
CREATE POLICY "Public read active coupons" ON public.coupons FOR SELECT USING (is_active = true);

-- 2. Concurrency-safe atomic stock decrement RPC
CREATE OR REPLACE FUNCTION public.decrement_product_stock(
    p_product_id UUID,
    p_quantity INT
)
RETURNS VOID AS $$
BEGIN
    UPDATE public.products
    SET stock_quantity = GREATEST(0, stock_quantity - p_quantity)
    WHERE id = p_product_id AND track_inventory = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.decrement_product_stock(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decrement_product_stock(UUID, INT) TO authenticated, anon;

-- 3. Seed active test coupons for development/testing if not present
INSERT INTO public.coupons (code, type, value, min_order_amount, is_active, target_type)
VALUES 
    ('WELCOME10', 'percentage', 10, 0, true, 'all'),
    ('FLAT50', 'fixed', 50, 200, true, 'all'),
    ('EXPIRED100', 'percentage', 100, 0, true, 'all')
ON CONFLICT (code) DO NOTHING;

-- Set EXPIRED100 valid_to to past date for testing expired validation
UPDATE public.coupons
SET valid_to = NOW() - INTERVAL '10 days'
WHERE code = 'EXPIRED100';

COMMIT;
