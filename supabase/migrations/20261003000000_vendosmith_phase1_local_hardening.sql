-- ==============================================================================
-- VENDOSMITH PHASE 1 LOCAL MIGRATION SPECIFICATION
-- File: 20261003000000_vendosmith_phase1_local_hardening.sql
-- Description: Schema hardening for Product Colour Variants, Asia/Kolkata
--              delivery date tracking, Cashfree partial unique indexes,
--              and idempotent coupon counter reconciliation.
--
-- STRICT DIRECTIVE:
-- LOCAL MIGRATION FILE ONLY.
-- DO NOT EXECUTE AGAINST PRODUCTION DATABASE OR MUTATE LIVE DATA.
-- ==============================================================================

-- 1. PRODUCT VARIANTS EXTENSIONS (Requirement 7: Product Colour Variants)
-- Add variant color name, color code, and image URL columns if they do not exist
ALTER TABLE IF EXISTS public.product_variants
    ADD COLUMN IF NOT EXISTS color_name TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS color_code TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT NULL;

COMMENT ON COLUMN public.product_variants.color_name IS 'Display name of product colour variant (e.g., Midnight Blue, Crimson Red)';
COMMENT ON COLUMN public.product_variants.color_code IS 'Hex/CSS color code for swatch rendering (e.g., #1E3A8A)';
COMMENT ON COLUMN public.product_variants.image_url IS 'Specific product image URL displaying this variant';

-- 2. ORDERS EXTENSIONS (Requirement 9: Delivery Dates & Requirement 11: Cashfree)
ALTER TABLE IF EXISTS public.orders
    ADD COLUMN IF NOT EXISTS cashfree_order_id TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS cashfree_payment_id TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS estimated_delivery_date DATE DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS promised_delivery_date DATE DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS scheduled_delivery_date DATE DEFAULT NULL;

COMMENT ON COLUMN public.orders.cashfree_order_id IS 'Authoritative Cashfree PG gateway order identifier';
COMMENT ON COLUMN public.orders.cashfree_payment_id IS 'Unique Cashfree payment/transaction identifier';
COMMENT ON COLUMN public.orders.estimated_delivery_date IS 'Snapshot of calculated delivery date in Asia/Kolkata timezone';
COMMENT ON COLUMN public.orders.promised_delivery_date IS 'Admin-overridden or promised delivery commitment date';
COMMENT ON COLUMN public.orders.scheduled_delivery_date IS 'Customer-selected preferred delivery schedule date';

-- 3. GATEWAY UNIQUENESS & REPLAY PROTECTION (Requirement 11)
-- Partial unique indexes ensure gateway payment IDs and order IDs cannot be reused across multiple orders
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_cashfree_order_id
    ON public.orders(cashfree_order_id)
    WHERE cashfree_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_cashfree_payment_id
    ON public.orders(cashfree_payment_id)
    WHERE cashfree_payment_id IS NOT NULL;

-- Index for date queries & admin filtering
CREATE INDEX IF NOT EXISTS idx_orders_estimated_delivery_date
    ON public.orders(estimated_delivery_date)
    WHERE estimated_delivery_date IS NOT NULL;

-- 4. ORDER ITEMS VARIANT TRACKING (Requirement 7)
ALTER TABLE IF EXISTS public.order_items
    ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_variant_id
    ON public.order_items(variant_id)
    WHERE variant_id IS NOT NULL;

-- 5. IDEMPOTENT COUPON RELEASE RPC (Requirement 12: Coupon Consistency)
-- Safely releases a coupon redemption upon order cancellation or payment failure without underflowing counters
CREATE OR REPLACE FUNCTION public.release_coupon_redemption(
    p_order_id UUID,
    p_coupon_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_coupon RECORD;
    v_target_code TEXT;
    v_next_count INT;
BEGIN
    -- Check order existence and coupon code
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Order not found');
    END IF;

    v_target_code := COALESCE(NULLIF(TRIM(p_coupon_code), ''), v_order.coupon_code);

    -- If no coupon was applied on this order, gracefully return success
    IF v_target_code IS NULL OR TRIM(v_target_code) = '' THEN
        RETURN jsonb_build_object('success', true, 'message', 'No coupon associated with this order; no release needed');
    END IF;

    -- Fetch coupon with row lock
    SELECT * INTO v_coupon
    FROM public.coupons
    WHERE UPPER(code) = UPPER(v_target_code)
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Coupon code not found');
    END IF;

    -- Safe decrement without negative counter underflow
    v_next_count := GREATEST(0, COALESCE(v_coupon.times_used, v_coupon.usage_count, 0) - 1);

    UPDATE public.coupons
    SET
        times_used = v_next_count,
        usage_count = v_next_count,
        updated_at = NOW()
    WHERE id = v_coupon.id;

    -- Mark order coupon as released
    UPDATE public.orders
    SET
        coupon_code = NULL,
        discount_amount = 0.00
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'coupon_code', v_coupon.code,
        'new_usage_count', v_next_count
    );
END;
$$;

-- Grant execution to authenticated users and service_role
GRANT EXECUTE ON FUNCTION public.release_coupon_redemption(UUID, TEXT) TO authenticated, service_role;

-- ==============================================================================
-- ROLLBACK SPECIFICATION & SAFE DATA PRESERVATION PLAN
-- ==============================================================================
-- In the event of rollback, execute the following statements manually.
-- Under NO circumstances should existing orders, payments, customers, or variants be deleted.
--
-- Rollback SQL:
--
-- 1. Revert coupon release function:
--    DROP FUNCTION IF EXISTS public.release_coupon_redemption(UUID, TEXT);
--
-- 2. Drop partial indexes:
--    DROP INDEX IF EXISTS public.idx_orders_cashfree_order_id;
--    DROP INDEX IF EXISTS public.idx_orders_cashfree_payment_id;
--    DROP INDEX IF EXISTS public.idx_orders_estimated_delivery_date;
--    DROP INDEX IF EXISTS public.idx_order_items_variant_id;
--
-- 3. To preserve backward compatibility without losing data:
--    Columns color_name, color_code, image_url on product_variants and
--    cashfree_order_id, estimated_delivery_date on orders are nullable and
--    may safely remain in the schema without interfering with legacy operations.
-- ==============================================================================
