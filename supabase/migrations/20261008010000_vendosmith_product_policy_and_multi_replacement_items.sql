-- ==============================================================================
-- VENDOSMITH: PRODUCT-LEVEL RETURN & REPLACEMENT POLICY + MULTI-PRODUCT REPLACEMENT ITEMS
-- Migration: 20261008010000_vendosmith_product_policy_and_multi_replacement_items.sql
-- Description:
--   1. Product-Level Policy Controls (Authoritative per-product settings):
--      - return_allowed (BOOLEAN)
--      - return_window_days (INT)
--      - replacement_allowed (BOOLEAN)
--      - replacement_window_days (INT)
--      - replacement_selectable (BOOLEAN)
--   2. Multi-Product Replacement Items (return_request_replacement_items):
--      - Stores individual replacement products chosen in a single exchange request
--      - Server-derived unit price and line totals
--      - Store/seller associations
--   3. Row Level Security (RLS) policies for customer, seller, and admin
--
-- CRITICAL SAFETY NOTICE:
-- DO NOT EXECUTE THIS MIGRATION AUTOMATICALLY ON REMOTE PRODUCTION DATABASE.
-- MIGRATION FILE CREATED FOR ARCHITECTURAL COMPLIANCE AND LOCAL STAGING ONLY.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. EXTEND PRODUCTS TABLE WITH AUTHORITATIVE RETURN & REPLACEMENT POLICY
-- ------------------------------------------------------------------------------
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS return_allowed BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS return_window_days INT DEFAULT 7,
ADD COLUMN IF NOT EXISTS replacement_allowed BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS replacement_window_days INT DEFAULT 7,
ADD COLUMN IF NOT EXISTS replacement_selectable BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_products_replacement_selectable 
ON public.products(replacement_selectable, status) 
WHERE replacement_selectable = true AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_products_return_policy 
ON public.products(return_allowed, replacement_allowed);

-- ------------------------------------------------------------------------------
-- 2. MULTI-PRODUCT REPLACEMENT ITEMS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.return_request_replacement_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_request_id UUID NOT NULL REFERENCES public.return_requests(id) ON DELETE CASCADE,
    replacement_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    line_total NUMERIC(12, 2) NOT NULL CHECK (line_total >= 0),
    store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    seller_id UUID REFERENCES public.seller_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_rr_replacement_items_req_id 
ON public.return_request_replacement_items(return_request_id);

CREATE INDEX IF NOT EXISTS idx_rr_replacement_items_prod_id 
ON public.return_request_replacement_items(replacement_product_id);

CREATE INDEX IF NOT EXISTS idx_rr_replacement_items_store_id 
ON public.return_request_replacement_items(store_id);

CREATE INDEX IF NOT EXISTS idx_rr_replacement_items_seller_id 
ON public.return_request_replacement_items(seller_id);

-- ------------------------------------------------------------------------------
-- 3. ENABLE RLS ON REPLACEMENT ITEMS TABLE
-- ------------------------------------------------------------------------------
ALTER TABLE public.return_request_replacement_items ENABLE ROW LEVEL SECURITY;

-- Customer can read replacement items of their own return requests
CREATE POLICY "customer_view_own_replacement_items"
ON public.return_request_replacement_items
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.return_requests rr
        WHERE rr.id = return_request_replacement_items.return_request_id
          AND rr.customer_id = auth.uid()
    )
);

-- Seller can view replacement items for their own products/stores
CREATE POLICY "seller_view_assigned_replacement_items"
ON public.return_request_replacement_items
FOR SELECT
TO authenticated
USING (
    seller_id IN (SELECT id FROM public.seller_profiles WHERE user_id = auth.uid())
    OR store_id IN (
        SELECT s.id FROM public.stores s
        JOIN public.seller_profiles sp ON sp.id = s.seller_id
        WHERE sp.user_id = auth.uid()
    )
);

-- Admin full access
CREATE POLICY "admin_all_replacement_items"
ON public.return_request_replacement_items
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    )
);

-- Service role full access
CREATE POLICY "service_role_all_replacement_items"
ON public.return_request_replacement_items
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMIT;
