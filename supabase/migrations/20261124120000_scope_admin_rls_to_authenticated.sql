-- ==============================================================================
-- MIGRATION: 20261124120000_scope_admin_rls_to_authenticated.sql
-- PURPOSE:
-- 1. Harden public.is_admin_user() with SET search_path = '' and fully qualified refs.
-- 2. Restrict execute privileges on public.is_admin() and public.is_admin_user().
-- 3. Scope legacy admin RLS policies strictly TO authenticated.
-- 4. Preserve public access for active delivery cities (SELECT USING (is_active = true)).
-- 5. Preserve 100% of seller, customer, and storage owner policies.
-- 6. Preserve custom-cake-references admin authorization using is_admin_user().
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. HARDEN ADMIN HELPER FUNCTIONS & RESTRICT EXECUTE PRIVILEGES
-- ------------------------------------------------------------------------------

-- Harden is_admin_user() with search_path = '' and fully qualified schema references
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$;

-- Ensure ownership remains with postgres
ALTER FUNCTION public.is_admin_user() OWNER TO postgres;

-- Revoke execute from PUBLIC and anon for both helper functions
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_user() FROM PUBLIC, anon;

-- Grant execute strictly to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2. PUBLIC.PRODUCTS: SCOPE ADMIN POLICY TO AUTHENTICATED
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin full access products" ON public.products;
CREATE POLICY "Admin full access products" ON public.products
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- 3. PUBLIC.STORES: SCOPE ADMIN POLICY TO AUTHENTICATED
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin full access stores" ON public.stores;
CREATE POLICY "Admin full access stores" ON public.stores
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- 4. PUBLIC.PROFILES: SCOPE ADMIN POLICY TO AUTHENTICATED
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin view all profiles" ON public.profiles;
CREATE POLICY "Admin view all profiles" ON public.profiles
FOR SELECT
TO authenticated
USING (public.is_admin());

-- ------------------------------------------------------------------------------
-- 5. PUBLIC.CATEGORIES: SCOPE ADMIN POLICY TO AUTHENTICATED
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin full access categories" ON public.categories;
CREATE POLICY "Admin full access categories" ON public.categories
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- 6. PUBLIC.DELIVERY_CITIES: CLEAN PUBLIC READ & SCOPE ADMIN TO AUTHENTICATED
-- ------------------------------------------------------------------------------
-- Public active delivery-city SELECT policy remains accessible to PUBLIC/anon
DROP POLICY IF EXISTS "Anyone can view active delivery cities" ON public.delivery_cities;
CREATE POLICY "Anyone can view active delivery cities" ON public.delivery_cities
FOR SELECT
TO PUBLIC
USING (is_active = true);

-- Admin management policy scoped to authenticated
DROP POLICY IF EXISTS "Admin full access delivery cities" ON public.delivery_cities;
CREATE POLICY "Admin full access delivery cities" ON public.delivery_cities
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- 7. STORAGE.OBJECTS: SCOPE REMAINING 3 ADMIN POLICIES TO AUTHENTICATED
-- ------------------------------------------------------------------------------
-- Product images admin full access
DROP POLICY IF EXISTS "Admin full access product-images storage" ON storage.objects;
CREATE POLICY "Admin full access product-images storage" ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'product-images'
  AND public.is_admin()
)
WITH CHECK (
  bucket_id = 'product-images'
  AND public.is_admin()
);

-- Review images admin moderation
DROP POLICY IF EXISTS "Admins moderate review-images" ON storage.objects;
CREATE POLICY "Admins moderate review-images" ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'review-images'
  AND public.is_admin()
);

-- Custom cake references admin full access (preserves is_admin_user() check)
DROP POLICY IF EXISTS "Admin full access custom cake references" ON storage.objects;
CREATE POLICY "Admin full access custom cake references" ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'custom-cake-references'
  AND public.is_admin_user()
)
WITH CHECK (
  bucket_id = 'custom-cake-references'
  AND public.is_admin_user()
);

COMMIT;
