-- ==============================================================================
-- VENDOSMITH: LOCAL STORAGE BUCKETS & ACCESS POLICIES SETUP
-- Migration: 20261019000000_local_storage_buckets_and_policies.sql
-- Description:
--   1. Initializes all required public and private storage buckets
--   2. Enforces access policies on storage.objects:
--      - Public buckets: viewable by anyone
--      - Private buckets: viewable only by owner or admins via signed URLs
--      - Upload/modify: allowed for authenticated users and service_role
-- ==============================================================================

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
-- Public Buckets
('product-images', 'product-images', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
('category-images', 'category-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']),
('brand-assets', 'brand-assets', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']),
('promotional-banners', 'promotional-banners', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
('seller-store-branding', 'seller-store-branding', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
('banners', 'banners', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
('banner-images', 'banner-images', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
('brand-logos', 'brand-logos', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']),
('brands', 'brands', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']),
('categories', 'categories', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']),
('category-banners', 'category-banners', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),

-- Private Buckets (public: false)
('support-attachments', 'support-attachments', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
('seller-kyc-docs', 'seller-kyc-docs', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
('order-invoices', 'order-invoices', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png']),
('return-evidence', 'return-evidence', false, 20971520, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'video/mp4', 'video/quicktime']),
('seller-payment-docs', 'seller-payment-docs', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
('custom-cake-references', 'custom-cake-references', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']),
('chat-attachments', 'chat-attachments', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
('custom-requests', 'custom-requests', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- RLS Policy on storage.buckets to allow checking bucket metadata
DROP POLICY IF EXISTS "Buckets are viewable by everyone" ON storage.buckets;
CREATE POLICY "Buckets are viewable by everyone"
ON storage.buckets FOR SELECT
USING (true);

-- RLS Policies on storage.objects
DROP POLICY IF EXISTS "Public buckets are viewable by anyone" ON storage.objects;
CREATE POLICY "Public buckets are viewable by anyone"
ON storage.objects FOR SELECT
USING (
  bucket_id IN (
    SELECT id FROM storage.buckets WHERE public = true
  )
);

DROP POLICY IF EXISTS "Private objects viewable by owner or admin" ON storage.objects;
CREATE POLICY "Private objects viewable by owner or admin"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id IN (SELECT id FROM storage.buckets WHERE public = false)
  AND (
    auth.uid() = owner
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND LOWER(role) IN ('admin', 'super_admin')
    )
  )
);

DROP POLICY IF EXISTS "Authenticated users can upload objects" ON storage.objects;
CREATE POLICY "Authenticated users can upload objects"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id IS NOT NULL
);

DROP POLICY IF EXISTS "Users can update own objects" ON storage.objects;
CREATE POLICY "Users can update own objects"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  auth.uid() = owner
  OR public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND LOWER(role) IN ('admin', 'super_admin')
  )
);

DROP POLICY IF EXISTS "Users can delete own objects" ON storage.objects;
CREATE POLICY "Users can delete own objects"
ON storage.objects FOR DELETE
TO authenticated
USING (
  auth.uid() = owner
  OR public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND LOWER(role) IN ('admin', 'super_admin')
  )
);

COMMIT;
