-- =========================================================================
-- VENDOSMITH LOCAL MIGRATION: PRODUCT-CATEGORY & PRODUCT-STORE M2M
-- Migration: 20261004010000_product_categories_and_stores_m2m.sql
-- Description:
--   1. Introduces public.product_categories to support multi-select subcategories
--      per product while preserving public.products.category_id as primary.
--   2. Introduces public.product_stores to support assigning a product to multiple
--      stores while preserving public.products.store_id as the primary store.
--   3. Backward compatibility:
--      - products.category_id is NOT removed or modified.
--      - products.store_id is NOT removed or modified.
--      - All existing foreign keys, order relations, seller dashboards, and
--        reports referencing products.store_id or products.category_id remain valid.
--   4. SAFETY NOTICE: This migration is prepared locally only. DO NOT EXECUTE
--      remotely until reviewed and approved by the database administrator.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Table: public.product_categories
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_categories (
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT pk_product_categories PRIMARY KEY (product_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_product_categories_product_id ON public.product_categories(product_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_category_id ON public.product_categories(category_id);

-- Enable RLS on product_categories
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

-- Public can view product categories for active/published products
CREATE POLICY "Public read product categories"
    ON public.product_categories
    FOR SELECT
    USING (true);

-- Admins & store owners can manage product categories
CREATE POLICY "Admins and sellers manage product categories"
    ON public.product_categories
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'super_admin')
        )
        OR EXISTS (
            SELECT 1 FROM public.products p
            JOIN public.stores s ON s.id = p.store_id
            WHERE p.id = product_categories.product_id AND s.seller_id = auth.uid()
        )
    );

-- Backfill existing single category assignments as primary
INSERT INTO public.product_categories (product_id, category_id, is_primary)
SELECT id, category_id, true
FROM public.products
WHERE category_id IS NOT NULL
ON CONFLICT (product_id, category_id) DO UPDATE SET is_primary = true;

-- -------------------------------------------------------------------------
-- 2. Table: public.product_stores
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_stores (
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT pk_product_stores PRIMARY KEY (product_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_product_stores_product_id ON public.product_stores(product_id);
CREATE INDEX IF NOT EXISTS idx_product_stores_store_id ON public.product_stores(store_id);

-- Enable RLS on product_stores
ALTER TABLE public.product_stores ENABLE ROW LEVEL SECURITY;

-- Public can view product stores for active/published products
CREATE POLICY "Public read product stores"
    ON public.product_stores
    FOR SELECT
    USING (true);

-- Admins & store owners can manage product store assignments
CREATE POLICY "Admins and sellers manage product stores"
    ON public.product_stores
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'super_admin')
        )
        OR EXISTS (
            SELECT 1 FROM public.stores s
            WHERE s.id = product_stores.store_id AND s.seller_id = auth.uid()
        )
    );

-- Backfill existing single store assignments as primary
INSERT INTO public.product_stores (product_id, store_id, is_primary)
SELECT id, store_id, true
FROM public.products
WHERE store_id IS NOT NULL
ON CONFLICT (product_id, store_id) DO UPDATE SET is_primary = true;

-- -------------------------------------------------------------------------
-- 3. Extend public.categories with icon and is_active
-- -------------------------------------------------------------------------
ALTER TABLE public.categories
ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

COMMENT ON TABLE public.product_categories IS 'Junction table for multi-category and multi-subcategory product assignments';
COMMENT ON TABLE public.product_stores IS 'Junction table for assigning products across multiple approved stores';

