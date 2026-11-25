-- ==============================================================================
-- ROLLBACK SCRIPT: 20261125220000_scope_storefront_rls_and_fix_exposure.rollback.sql
-- PURPOSE:
-- Restores all 16 policies to their exact live pre-migration state.
-- DO NOT EXECUTE UNLESS ROLLING BACK MIGRATION 20261125220000.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. REVERT PUBLIC.SELLER_PROFILES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin full access seller_profiles" ON public.seller_profiles;
CREATE POLICY "Admin full access seller_profiles" ON public.seller_profiles
FOR ALL
TO PUBLIC
USING (is_admin());

-- ------------------------------------------------------------------------------
-- 2. REVERT PUBLIC.PRODUCTS SELLER POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Sellers can view own products" ON public.products;
CREATE POLICY "Sellers can view own products" ON public.products
FOR SELECT
TO PUBLIC
USING (
  ((store_id IN ( SELECT stores.id FROM stores WHERE (stores.seller_id = auth.uid()))) AND (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'seller'::text)))) AND (EXISTS ( SELECT 1 FROM seller_profiles WHERE ((seller_profiles.id = auth.uid()) AND (seller_profiles.verification_status = 'approved'::text)))))
);

DROP POLICY IF EXISTS "Sellers can insert own products" ON public.products;
CREATE POLICY "Sellers can insert own products" ON public.products
FOR INSERT
TO PUBLIC
WITH CHECK (
  ((store_id IN ( SELECT stores.id FROM stores WHERE (stores.seller_id = auth.uid()))) AND (status = ANY (ARRAY['draft'::text, 'pending_review'::text])) AND (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'seller'::text)))) AND (EXISTS ( SELECT 1 FROM seller_profiles WHERE ((seller_profiles.id = auth.uid()) AND (seller_profiles.verification_status = 'approved'::text)))))
);

DROP POLICY IF EXISTS "Sellers can update own products" ON public.products;
CREATE POLICY "Sellers can update own products" ON public.products
FOR UPDATE
TO PUBLIC
USING (
  ((store_id IN ( SELECT stores.id FROM stores WHERE (stores.seller_id = auth.uid()))) AND (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'seller'::text)))) AND (EXISTS ( SELECT 1 FROM seller_profiles WHERE ((seller_profiles.id = auth.uid()) AND (seller_profiles.verification_status = 'approved'::text)))))
)
WITH CHECK (
  ((store_id IN ( SELECT stores.id FROM stores WHERE (stores.seller_id = auth.uid()))) AND (status = ANY (ARRAY['draft'::text, 'pending_review'::text])))
);

DROP POLICY IF EXISTS "Sellers can delete own products" ON public.products;
CREATE POLICY "Sellers can delete own products" ON public.products
FOR DELETE
TO PUBLIC
USING (
  ((store_id IN ( SELECT stores.id FROM stores WHERE (stores.seller_id = auth.uid()))) AND (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'seller'::text)))) AND (EXISTS ( SELECT 1 FROM seller_profiles WHERE ((seller_profiles.id = auth.uid()) AND (seller_profiles.verification_status = 'approved'::text)))))
);

-- ------------------------------------------------------------------------------
-- 3. REVERT PUBLIC.PRODUCT_IMAGES POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read access for product_images" ON public.product_images;
CREATE POLICY "Public read access for product_images" ON public.product_images
FOR SELECT
TO PUBLIC
USING (true);

DROP POLICY IF EXISTS "Admin full access product_images" ON public.product_images;
CREATE POLICY "Admin full access product_images" ON public.product_images
FOR ALL
TO PUBLIC
USING (is_admin());

DROP POLICY IF EXISTS "Sellers can view images for own products" ON public.product_images;
CREATE POLICY "Sellers can view images for own products" ON public.product_images
FOR SELECT
TO PUBLIC
USING (
  ((product_id IN ( SELECT products.id FROM products WHERE (products.store_id IN ( SELECT stores.id FROM stores WHERE (stores.seller_id = auth.uid()))))) AND (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'seller'::text)))) AND (EXISTS ( SELECT 1 FROM seller_profiles WHERE ((seller_profiles.id = auth.uid()) AND (seller_profiles.verification_status = 'approved'::text)))))
);

DROP POLICY IF EXISTS "Sellers can insert images for own products" ON public.product_images;
CREATE POLICY "Sellers can insert images for own products" ON public.product_images
FOR INSERT
TO PUBLIC
WITH CHECK (
  ((product_id IN ( SELECT products.id FROM products WHERE (products.store_id IN ( SELECT stores.id FROM stores WHERE (stores.seller_id = auth.uid()))))) AND (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'seller'::text)))) AND (EXISTS ( SELECT 1 FROM seller_profiles WHERE ((seller_profiles.id = auth.uid()) AND (seller_profiles.verification_status = 'approved'::text)))))
);

DROP POLICY IF EXISTS "Sellers can update images for own products" ON public.product_images;
CREATE POLICY "Sellers can update images for own products" ON public.product_images
FOR UPDATE
TO PUBLIC
USING (
  ((product_id IN ( SELECT products.id FROM products WHERE (products.store_id IN ( SELECT stores.id FROM stores WHERE (stores.seller_id = auth.uid()))))) AND (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'seller'::text)))) AND (EXISTS ( SELECT 1 FROM seller_profiles WHERE ((seller_profiles.id = auth.uid()) AND (seller_profiles.verification_status = 'approved'::text)))))
)
WITH CHECK (
  (product_id IN ( SELECT products.id FROM products WHERE (products.store_id IN ( SELECT stores.id FROM stores WHERE (stores.seller_id = auth.uid())))))
);

DROP POLICY IF EXISTS "Sellers can delete images for own products" ON public.product_images;
CREATE POLICY "Sellers can delete images for own products" ON public.product_images
FOR DELETE
TO PUBLIC
USING (
  ((product_id IN ( SELECT products.id FROM products WHERE (products.store_id IN ( SELECT stores.id FROM stores WHERE (stores.seller_id = auth.uid()))))) AND (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'seller'::text)))) AND (EXISTS ( SELECT 1 FROM seller_profiles WHERE ((seller_profiles.id = auth.uid()) AND (seller_profiles.verification_status = 'approved'::text)))))
);

-- ------------------------------------------------------------------------------
-- 4. REVERT PUBLIC.COUPONS POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read active coupons" ON public.coupons;
CREATE POLICY "Public read active coupons" ON public.coupons
FOR SELECT
TO PUBLIC
USING (is_active = true);

DROP POLICY IF EXISTS "Admin full access coupons" ON public.coupons;
CREATE POLICY "Admin full access coupons" ON public.coupons
FOR ALL
TO PUBLIC
USING (is_admin());

DROP POLICY IF EXISTS "Sellers can view relevant coupons" ON public.coupons;
CREATE POLICY "Sellers can view relevant coupons" ON public.coupons
FOR SELECT
TO PUBLIC
USING (
  (is_admin() OR (target_type = 'all'::text) OR ((target_type = 'seller'::text) AND (auth.uid() = ANY (target_sellers))) OR ((target_type = 'membership_plan'::text) AND (EXISTS ( SELECT 1
   FROM seller_profiles
  WHERE ((seller_profiles.id = auth.uid()) AND (seller_profiles.membership_plan = ANY (coupons.target_membership_plans)))))))
);

-- ------------------------------------------------------------------------------
-- 5. REVERT PUBLIC.HERO_SLIDES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin full access for hero_slides" ON public.hero_slides;
CREATE POLICY "Admin full access for hero_slides" ON public.hero_slides
FOR ALL
TO PUBLIC
USING (is_admin());

-- ------------------------------------------------------------------------------
-- 6. REVERT PUBLIC.HOMEPAGE_SECTIONS
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin full access for homepage_sections" ON public.homepage_sections;
CREATE POLICY "Admin full access for homepage_sections" ON public.homepage_sections
FOR ALL
TO PUBLIC
USING (is_admin());

COMMIT;
