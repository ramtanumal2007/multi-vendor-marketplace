-- ==============================================================================
-- ROLLBACK SCRIPT: 20261124120000_scope_admin_rls_to_authenticated.rollback.sql
-- PURPOSE:
-- Restores the exact pre-migration function definitions, privileges, and RLS policies
-- as audited from the live staging database catalog.
-- DO NOT EXECUTE UNLESS ROLLING BACK MIGRATION 20261124120000.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. REVERT FUNCTION DEFINITION & PRIVILEGES
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$;

ALTER FUNCTION public.is_admin_user() OWNER TO postgres;

-- Restore original execute grants
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO anon;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO service_role;

-- ------------------------------------------------------------------------------
-- 2. REVERT PUBLIC.PRODUCTS
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin full access products" ON public.products;
CREATE POLICY "Admin full access products" ON public.products
FOR ALL
TO PUBLIC
USING (is_admin());

-- ------------------------------------------------------------------------------
-- 3. REVERT PUBLIC.STORES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin full access stores" ON public.stores;
CREATE POLICY "Admin full access stores" ON public.stores
FOR ALL
TO PUBLIC
USING (is_admin());

-- ------------------------------------------------------------------------------
-- 4. REVERT PUBLIC.PROFILES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin view all profiles" ON public.profiles;
CREATE POLICY "Admin view all profiles" ON public.profiles
FOR SELECT
TO PUBLIC
USING (is_admin());

-- ------------------------------------------------------------------------------
-- 5. REVERT PUBLIC.CATEGORIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin full access categories" ON public.categories;
CREATE POLICY "Admin full access categories" ON public.categories
FOR ALL
TO PUBLIC
USING (is_admin());

-- ------------------------------------------------------------------------------
-- 6. REVERT PUBLIC.DELIVERY_CITIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can view active delivery cities" ON public.delivery_cities;
CREATE POLICY "Anyone can view active delivery cities" ON public.delivery_cities
FOR SELECT
TO PUBLIC
USING (((is_active = true) OR is_admin()));

DROP POLICY IF EXISTS "Admin full access delivery cities" ON public.delivery_cities;
CREATE POLICY "Admin full access delivery cities" ON public.delivery_cities
FOR ALL
TO PUBLIC
USING (is_admin())
WITH CHECK (is_admin());

-- ------------------------------------------------------------------------------
-- 7. REVERT STORAGE.OBJECTS
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin full access product-images storage" ON storage.objects;
CREATE POLICY "Admin full access product-images storage" ON storage.objects
FOR ALL
TO PUBLIC
USING (
  (bucket_id = 'product-images'::text) AND is_admin()
)
WITH CHECK (
  (bucket_id = 'product-images'::text) AND is_admin()
);

DROP POLICY IF EXISTS "Admins moderate review-images" ON storage.objects;
CREATE POLICY "Admins moderate review-images" ON storage.objects
FOR DELETE
TO PUBLIC
USING (
  (bucket_id = 'review-images'::text) AND is_admin()
);

DROP POLICY IF EXISTS "Admin full access custom cake references" ON storage.objects;
CREATE POLICY "Admin full access custom cake references" ON storage.objects
FOR ALL
TO PUBLIC
USING (
  (bucket_id = 'custom-cake-references'::text) AND is_admin_user()
);

COMMIT;
