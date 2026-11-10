-- ==============================================================================
-- SUPABASE STORAGE BUCKET & HARDENED RLS MIGRATION FOR PRODUCT IMAGES
-- ==============================================================================

BEGIN;

-- 1. Ensure product-images bucket exists with updated configuration
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880, -- 5 MB limit per object
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Storage RLS policies on storage.objects for product-images bucket
DROP POLICY IF EXISTS "Public read product-images" ON storage.objects;
DROP POLICY IF EXISTS "Admins and Approved Sellers upload product-images" ON storage.objects;
DROP POLICY IF EXISTS "Admins and Approved Sellers delete product-images" ON storage.objects;
DROP POLICY IF EXISTS "Admin full access product-images storage" ON storage.objects;
DROP POLICY IF EXISTS "Approved Sellers insert own product-images storage" ON storage.objects;
DROP POLICY IF EXISTS "Approved Sellers update own product-images storage" ON storage.objects;
DROP POLICY IF EXISTS "Approved Sellers delete own product-images storage" ON storage.objects;

-- Public read access to product-images
CREATE POLICY "Public read product-images" ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

-- Admin full access to product-images (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "Admin full access product-images storage" ON storage.objects
USING (
  bucket_id = 'product-images'
  AND public.is_admin()
)
WITH CHECK (
  bucket_id = 'product-images'
  AND public.is_admin()
);

-- Approved Sellers INSERT policy strictly for seller/{auth.uid()}/...
CREATE POLICY "Approved Sellers insert own product-images storage" ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] = 'seller'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller')
  AND EXISTS (SELECT 1 FROM public.seller_profiles WHERE id = auth.uid() AND verification_status = 'approved')
);

-- Approved Sellers UPDATE policy strictly for seller/{auth.uid()}/...
CREATE POLICY "Approved Sellers update own product-images storage" ON storage.objects FOR UPDATE
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] = 'seller'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller')
  AND EXISTS (SELECT 1 FROM public.seller_profiles WHERE id = auth.uid() AND verification_status = 'approved')
)
WITH CHECK (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] = 'seller'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller')
  AND EXISTS (SELECT 1 FROM public.seller_profiles WHERE id = auth.uid() AND verification_status = 'approved')
);

-- Approved Sellers DELETE policy strictly for seller/{auth.uid()}/...
CREATE POLICY "Approved Sellers delete own product-images storage" ON storage.objects FOR DELETE
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] = 'seller'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller')
  AND EXISTS (SELECT 1 FROM public.seller_profiles WHERE id = auth.uid() AND verification_status = 'approved')
);

COMMIT;
