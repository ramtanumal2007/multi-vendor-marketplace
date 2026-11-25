-- ==============================================================================
-- MIGRATION: 20261125220000_scope_storefront_rls_and_fix_exposure.sql
-- PURPOSE:
-- 1. Scope public.seller_profiles admin policy strictly TO authenticated (fixes product 42501).
-- 2. Scope public.products 4 seller policies strictly TO authenticated (eliminates anon subqueries).
-- 3. Scope public.product_images admin & 4 seller policies strictly TO authenticated.
-- 4. Harden public.product_images public read to active products in approved stores (fixes image exposure).
-- 5. Scope public.coupons admin & seller policies TO authenticated, restrict public
--    read to general coupons, and restrict targeted coupons to approved sellers (fixes coupon exposure).
-- 6. Scope hero_slides and homepage_sections admin policies TO authenticated.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. PUBLIC.SELLER_PROFILES: SCOPE ADMIN POLICY TO AUTHENTICATED
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin full access seller_profiles" ON public.seller_profiles;
CREATE POLICY "Admin full access seller_profiles" ON public.seller_profiles
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- 2. PUBLIC.PRODUCTS: SCOPE 4 SELLER POLICIES TO AUTHENTICATED
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Sellers can view own products" ON public.products;
CREATE POLICY "Sellers can view own products" ON public.products
FOR SELECT
TO authenticated
USING (
  (store_id IN ( SELECT stores.id FROM stores WHERE (stores.seller_id = auth.uid()))) 
  AND (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'seller'::text)))) 
  AND (EXISTS ( SELECT 1 FROM seller_profiles WHERE ((seller_profiles.id = auth.uid()) AND (seller_profiles.verification_status = 'approved'::text))))
);

DROP POLICY IF EXISTS "Sellers can insert own products" ON public.products;
CREATE POLICY "Sellers can insert own products" ON public.products
FOR INSERT
TO authenticated
WITH CHECK (
  (store_id IN ( SELECT stores.id FROM stores WHERE (stores.seller_id = auth.uid()))) 
  AND (status = ANY (ARRAY['draft'::text, 'pending_review'::text])) 
  AND (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'seller'::text)))) 
  AND (EXISTS ( SELECT 1 FROM seller_profiles WHERE ((seller_profiles.id = auth.uid()) AND (seller_profiles.verification_status = 'approved'::text))))
);

DROP POLICY IF EXISTS "Sellers can update own products" ON public.products;
CREATE POLICY "Sellers can update own products" ON public.products
FOR UPDATE
TO authenticated
USING (
  (store_id IN ( SELECT stores.id FROM stores WHERE (stores.seller_id = auth.uid()))) 
  AND (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'seller'::text)))) 
  AND (EXISTS ( SELECT 1 FROM seller_profiles WHERE ((seller_profiles.id = auth.uid()) AND (seller_profiles.verification_status = 'approved'::text))))
)
WITH CHECK (
  (store_id IN ( SELECT stores.id FROM stores WHERE (stores.seller_id = auth.uid()))) 
  AND (status = ANY (ARRAY['draft'::text, 'pending_review'::text]))
);

DROP POLICY IF EXISTS "Sellers can delete own products" ON public.products;
CREATE POLICY "Sellers can delete own products" ON public.products
FOR DELETE
TO authenticated
USING (
  (store_id IN ( SELECT stores.id FROM stores WHERE (stores.seller_id = auth.uid()))) 
  AND (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'seller'::text)))) 
  AND (EXISTS ( SELECT 1 FROM seller_profiles WHERE ((seller_profiles.id = auth.uid()) AND (seller_profiles.verification_status = 'approved'::text))))
);

-- ------------------------------------------------------------------------------
-- 3. PUBLIC.PRODUCT_IMAGES: HARDEN PUBLIC READ & SCOPE ADMIN/SELLER POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read access for product_images" ON public.product_images;
CREATE POLICY "Public read access for product_images" ON public.product_images
FOR SELECT
TO public
USING (
  product_id IN (
    SELECT products.id 
    FROM public.products 
    WHERE products.status = 'active'::text 
      AND (products.store_id IS NULL OR products.store_id IN (
        SELECT stores.id FROM public.stores WHERE stores.status = 'approved'::text
      ))
  )
);

DROP POLICY IF EXISTS "Admin full access product_images" ON public.product_images;
CREATE POLICY "Admin full access product_images" ON public.product_images
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Sellers can view images for own products" ON public.product_images;
CREATE POLICY "Sellers can view images for own products" ON public.product_images
FOR SELECT
TO authenticated
USING (
  (product_id IN ( SELECT products.id FROM products WHERE (products.store_id IN ( SELECT stores.id FROM stores WHERE (stores.seller_id = auth.uid()))))) 
  AND (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'seller'::text)))) 
  AND (EXISTS ( SELECT 1 FROM seller_profiles WHERE ((seller_profiles.id = auth.uid()) AND (seller_profiles.verification_status = 'approved'::text))))
);

DROP POLICY IF EXISTS "Sellers can insert images for own products" ON public.product_images;
CREATE POLICY "Sellers can insert images for own products" ON public.product_images
FOR INSERT
TO authenticated
WITH CHECK (
  (product_id IN ( SELECT products.id FROM products WHERE (products.store_id IN ( SELECT stores.id FROM stores WHERE (stores.seller_id = auth.uid()))))) 
  AND (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'seller'::text)))) 
  AND (EXISTS ( SELECT 1 FROM seller_profiles WHERE ((seller_profiles.id = auth.uid()) AND (seller_profiles.verification_status = 'approved'::text))))
);

DROP POLICY IF EXISTS "Sellers can update images for own products" ON public.product_images;
CREATE POLICY "Sellers can update images for own products" ON public.product_images
FOR UPDATE
TO authenticated
USING (
  (product_id IN ( SELECT products.id FROM products WHERE (products.store_id IN ( SELECT stores.id FROM stores WHERE (stores.seller_id = auth.uid()))))) 
  AND (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'seller'::text)))) 
  AND (EXISTS ( SELECT 1 FROM seller_profiles WHERE ((seller_profiles.id = auth.uid()) AND (seller_profiles.verification_status = 'approved'::text))))
)
WITH CHECK (
  product_id IN ( SELECT products.id FROM products WHERE (products.store_id IN ( SELECT stores.id FROM stores WHERE (stores.seller_id = auth.uid()))))
);

DROP POLICY IF EXISTS "Sellers can delete images for own products" ON public.product_images;
CREATE POLICY "Sellers can delete images for own products" ON public.product_images
FOR DELETE
TO authenticated
USING (
  (product_id IN ( SELECT products.id FROM products WHERE (products.store_id IN ( SELECT stores.id FROM stores WHERE (stores.seller_id = auth.uid()))))) 
  AND (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'seller'::text)))) 
  AND (EXISTS ( SELECT 1 FROM seller_profiles WHERE ((seller_profiles.id = auth.uid()) AND (seller_profiles.verification_status = 'approved'::text))))
);

-- ------------------------------------------------------------------------------
-- 4. PUBLIC.COUPONS: FIX DATA EXPOSURE & TIGHTEN SELLER AUTHORIZATION
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read active coupons" ON public.coupons;
CREATE POLICY "Public read active coupons" ON public.coupons
FOR SELECT
TO public
USING (is_active = true AND target_type = 'all'::text);

DROP POLICY IF EXISTS "Admin full access coupons" ON public.coupons;
CREATE POLICY "Admin full access coupons" ON public.coupons
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Sellers can view relevant coupons" ON public.coupons;
CREATE POLICY "Sellers can view relevant coupons" ON public.coupons
FOR SELECT
TO authenticated
USING (
  is_active = true AND EXISTS (
    SELECT 1 FROM public.seller_profiles
    WHERE seller_profiles.id = auth.uid() 
      AND seller_profiles.verification_status = 'approved'::text
      AND (
        (coupons.target_type = 'seller'::text AND auth.uid() = ANY (coupons.target_sellers))
        OR 
        (coupons.target_type = 'membership_plan'::text AND seller_profiles.membership_plan = ANY (coupons.target_membership_plans))
      )
  )
);

-- ------------------------------------------------------------------------------
-- 5. PUBLIC.HERO_SLIDES: SCOPE ADMIN POLICY TO AUTHENTICATED
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin full access for hero_slides" ON public.hero_slides;
CREATE POLICY "Admin full access for hero_slides" ON public.hero_slides
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- 6. PUBLIC.HOMEPAGE_SECTIONS: SCOPE ADMIN POLICY TO AUTHENTICATED
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin full access for homepage_sections" ON public.homepage_sections;
CREATE POLICY "Admin full access for homepage_sections" ON public.homepage_sections
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

COMMIT;
