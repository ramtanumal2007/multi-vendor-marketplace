-- ==============================================================================
-- UPDATE PRODUCT MANAGEMENT & SECURITY RLS MIGRATION
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. PRODUCTS: STRICT SELLER & ADMIN ACCESS CONTROL
-- ------------------------------------------------------------------------------
-- Safely drop existing seller policies on products to avoid conflicts
DROP POLICY IF EXISTS "Sellers can view own products" ON public.products;
DROP POLICY IF EXISTS "Sellers can insert own products" ON public.products;
DROP POLICY IF EXISTS "Sellers can update own products" ON public.products;
DROP POLICY IF EXISTS "Sellers can delete own products" ON public.products;
DROP POLICY IF EXISTS "Admin full access products" ON public.products;

-- Admin full access to products (all operations)
CREATE POLICY "Admin full access products" ON public.products
USING (public.is_admin());

-- Approved sellers can view own products
CREATE POLICY "Sellers can view own products" ON public.products FOR SELECT
USING (
  store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller')
  AND EXISTS (SELECT 1 FROM public.seller_profiles WHERE id = auth.uid() AND verification_status = 'approved')
);

-- Approved sellers can insert products strictly into their own store
CREATE POLICY "Sellers can insert own products" ON public.products FOR INSERT
WITH CHECK (
  store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid())
  AND status IN ('draft', 'pending_review')
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller')
  AND EXISTS (SELECT 1 FROM public.seller_profiles WHERE id = auth.uid() AND verification_status = 'approved')
);

-- Approved sellers can update own products (status restricted to draft or pending_review via WITH CHECK)
CREATE POLICY "Sellers can update own products" ON public.products FOR UPDATE
USING (
  store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller')
  AND EXISTS (SELECT 1 FROM public.seller_profiles WHERE id = auth.uid() AND verification_status = 'approved')
)
WITH CHECK (
  store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid())
  AND status IN ('draft', 'pending_review')
);

-- Approved sellers can delete own products
CREATE POLICY "Sellers can delete own products" ON public.products FOR DELETE
USING (
  store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller')
  AND EXISTS (SELECT 1 FROM public.seller_profiles WHERE id = auth.uid() AND verification_status = 'approved')
);


-- ------------------------------------------------------------------------------
-- 2. PRODUCT IMAGES: STRICT SELLER & ADMIN ACCESS CONTROL
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Sellers can view images for own products" ON public.product_images;
DROP POLICY IF EXISTS "Sellers can insert images for own products" ON public.product_images;
DROP POLICY IF EXISTS "Sellers can update images for own products" ON public.product_images;
DROP POLICY IF EXISTS "Sellers can delete images for own products" ON public.product_images;
DROP POLICY IF EXISTS "Admin full access product_images" ON public.product_images;

-- Admin full access to product images
CREATE POLICY "Admin full access product_images" ON public.product_images
USING (public.is_admin());

-- Approved sellers image access
CREATE POLICY "Sellers can view images for own products" ON public.product_images FOR SELECT
USING (
  product_id IN (SELECT id FROM public.products WHERE store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid()))
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller')
  AND EXISTS (SELECT 1 FROM public.seller_profiles WHERE id = auth.uid() AND verification_status = 'approved')
);

CREATE POLICY "Sellers can insert images for own products" ON public.product_images FOR INSERT
WITH CHECK (
  product_id IN (SELECT id FROM public.products WHERE store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid()))
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller')
  AND EXISTS (SELECT 1 FROM public.seller_profiles WHERE id = auth.uid() AND verification_status = 'approved')
);

CREATE POLICY "Sellers can update images for own products" ON public.product_images FOR UPDATE
USING (
  product_id IN (SELECT id FROM public.products WHERE store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid()))
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller')
  AND EXISTS (SELECT 1 FROM public.seller_profiles WHERE id = auth.uid() AND verification_status = 'approved')
)
WITH CHECK (
  product_id IN (SELECT id FROM public.products WHERE store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid()))
);

CREATE POLICY "Sellers can delete images for own products" ON public.product_images FOR DELETE
USING (
  product_id IN (SELECT id FROM public.products WHERE store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid()))
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller')
  AND EXISTS (SELECT 1 FROM public.seller_profiles WHERE id = auth.uid() AND verification_status = 'approved')
);

COMMIT;
