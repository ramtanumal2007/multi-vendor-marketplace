-- ==============================================================================
-- MIGRATION: VENDOSMITH STOREFRONT UX, DISPLAY STYLES & VERIFIED REVIEW SYSTEM
-- Version: 20261001120000
-- Status: PREPARED FOR USER REVIEW (DO NOT APPLY AUTOMATICALLY)
-- 
-- Changes:
-- 1. Add `display_style` column to `public.products` with safe fallback ('standard')
-- 2. Enhance `public.reviews` with `order_id`, `image_url`, `updated_at`
-- 3. Enforce one-review-per-customer-product unique constraint
-- 4. Create `review-images` public storage bucket with hardened size & MIME limits
-- 5. Harden RLS policies on reviews and review-images storage
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. PRODUCTS: ADMIN CUSTOMER DISPLAY / GRID STYLE
-- ==============================================================================

-- 1.1 Add display_style column with standard marketplace default
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS display_style TEXT DEFAULT 'standard';

-- 1.2 Backfill any nulls to safe default 'standard'
UPDATE public.products
SET display_style = 'standard'
WHERE display_style IS NULL;

-- 1.3 Add CHECK constraint for valid marketplace grid display variants
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'products_display_style_check'
    ) THEN
        ALTER TABLE public.products
        ADD CONSTRAINT products_display_style_check
        CHECK (display_style IN ('standard', 'compact', 'deal', 'featured', 'horizontal', 'minimal'));
    END IF;
END $$;

-- 1.4 Index for display_style queries if filtered
CREATE INDEX IF NOT EXISTS idx_products_display_style ON public.products(display_style);


-- ==============================================================================
-- 2. REVIEWS: VERIFIED PURCHASE SYSTEM ENHANCEMENTS
-- ==============================================================================

-- 2.1 Add order reference to reviews
ALTER TABLE public.reviews
ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;

-- 2.2 Add optional review image url
ALTER TABLE public.reviews
ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT NULL;

-- 2.3 Add updated_at timestamp
ALTER TABLE public.reviews
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2.4 Index for performance
CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON public.reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON public.reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_order_id ON public.reviews(order_id);

-- 2.5 One review per customer per product constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'reviews_user_product_unique'
    ) THEN
        ALTER TABLE public.reviews
        ADD CONSTRAINT reviews_user_product_unique UNIQUE (user_id, product_id);
    END IF;
END $$;


-- ==============================================================================
-- 3. STORAGE: DEDICATED PUBLIC `review-images` BUCKET
-- ==============================================================================

-- 3.1 Ensure `review-images` bucket exists (Public read, 5MB max, JPEG/PNG/WEBP)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'review-images',
    'review-images',
    true,
    5242880, -- 5 MB limit
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- 3.2 Storage RLS policies for `review-images`
-- Zero-Bypass Security Model:
-- Public can READ review photos.
-- Direct client INSERT is completely DENIED by RLS.
-- All photo uploads MUST go through the server-side endpoint `/api/reviews/upload`
-- which authoritatively verifies delivered order ownership, MIME type, and file size.
DROP POLICY IF EXISTS "Public read review-images" ON storage.objects;
DROP POLICY IF EXISTS "Verified purchasers insert review-images" ON storage.objects;
DROP POLICY IF EXISTS "Reviewers update own review-images" ON storage.objects;
DROP POLICY IF EXISTS "Reviewers or admins delete review-images" ON storage.objects;
DROP POLICY IF EXISTS "Admins moderate review-images" ON storage.objects;

-- 3.2.1 Public read access for customer review photos on storefront
CREATE POLICY "Public read review-images" ON storage.objects FOR SELECT
USING (bucket_id = 'review-images');

-- 3.2.2 Admin moderation deletion (only platform admins can delete review photos directly)
CREATE POLICY "Admins moderate review-images" ON storage.objects FOR DELETE
USING (
    bucket_id = 'review-images'
    AND public.is_admin()
);


-- ==============================================================================
-- 4. HARDENED RLS ON `public.reviews`
-- ==============================================================================

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read reviews" ON public.reviews;
DROP POLICY IF EXISTS "Authenticated users can create reviews" ON public.reviews;
DROP POLICY IF EXISTS "Verified purchasers can create reviews" ON public.reviews;
DROP POLICY IF EXISTS "Users can update own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Users or admins can delete reviews" ON public.reviews;

-- 4.1 Anyone can read published reviews
CREATE POLICY "Public read reviews" ON public.reviews FOR SELECT
USING (true);

-- 4.2 Only verified purchasers who have had this product delivered can insert
CREATE POLICY "Verified purchasers can create reviews" ON public.reviews FOR INSERT
WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
        SELECT 1
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.id
        WHERE o.user_id = auth.uid()
          AND oi.product_id = public.reviews.product_id
          AND LOWER(o.fulfillment_status) = 'delivered'
    )
);

-- 4.3 Users can update their own existing review
CREATE POLICY "Users can update own reviews" ON public.reviews FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 4.4 Users can delete their own review; Admins can moderate/delete any review
CREATE POLICY "Users or admins can delete reviews" ON public.reviews FOR DELETE
USING (auth.uid() = user_id OR public.is_admin());

COMMIT;
