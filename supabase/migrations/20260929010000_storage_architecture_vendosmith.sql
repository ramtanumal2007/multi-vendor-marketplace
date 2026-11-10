-- ==============================================================================
-- MIGRATION: VENDOSMITH COMPLETE STORAGE ARCHITECTURE & HARDENED RLS
-- Version: 20260929010000
-- Status: PREPARED FOR USER REVIEW (DO NOT APPLY AUTOMATICALLY)
-- 
-- Buckets Configured:
-- 1. brand-assets          (PUBLIC  - 5MB  - JPEG, PNG, WEBP, SVG, GIF, ICO)
-- 2. promotional-banners   (PUBLIC  - 10MB - JPEG, PNG, WEBP, GIF)
-- 3. seller-store-branding (PUBLIC  - 5MB  - JPEG, PNG, WEBP)
-- 4. category-images       (PUBLIC  - 5MB  - JPEG, PNG, WEBP, SVG)
-- 5. support-attachments   (PRIVATE - 10MB - JPEG, PNG, WEBP, PDF)
-- 6. seller-kyc-docs       (PRIVATE - 10MB - JPEG, PNG, WEBP, PDF)
-- 7. order-invoices        (PRIVATE - 10MB - PDF, JPEG, PNG)
-- 8. return-evidence       (PRIVATE - 20MB - JPEG, PNG, WEBP, PDF, MP4, MOV)
--
-- Preserved Buckets (UNTOUCHED):
-- - product-images
-- - seller-payment-docs
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. ENSURE ALL 8 STORAGE BUCKETS EXIST WITH HARDENED LIMITS & MIME RESTRICTIONS
-- ==============================================================================

-- 1.1 brand-assets (Public, 5MB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'brand-assets',
    'brand-assets',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif', 'image/x-icon', 'image/vnd.microsoft.icon']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif', 'image/x-icon', 'image/vnd.microsoft.icon'];

-- 1.2 promotional-banners (Public, 10MB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'promotional-banners',
    'promotional-banners',
    true,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- 1.3 seller-store-branding (Public, 5MB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'seller-store-branding',
    'seller-store-branding',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- 1.4 category-images (Public, 5MB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'category-images',
    'category-images',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];

-- 1.5 support-attachments (Private, 10MB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'support-attachments',
    'support-attachments',
    false,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

-- 1.6 seller-kyc-docs (Private, 10MB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'seller-kyc-docs',
    'seller-kyc-docs',
    false,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

-- 1.7 order-invoices (Private, 10MB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'order-invoices',
    'order-invoices',
    false,
    10485760,
    ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png'];

-- 1.8 return-evidence (Private, 20MB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'return-evidence',
    'return-evidence',
    false,
    20971520,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'video/mp4', 'video/quicktime']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 20971520,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'video/mp4', 'video/quicktime'];

-- ==============================================================================
-- 2. HARDENED STORAGE RLS POLICIES FOR ALL 8 BUCKETS
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 2.1 BUCKET: brand-assets (Public Read, Admin Write)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read brand-assets" ON storage.objects;
DROP POLICY IF EXISTS "Admin full access brand-assets" ON storage.objects;

CREATE POLICY "Public read brand-assets" ON storage.objects
FOR SELECT
USING (bucket_id = 'brand-assets');

CREATE POLICY "Admin full access brand-assets" ON storage.objects
FOR ALL TO authenticated
USING (bucket_id = 'brand-assets' AND public.is_admin())
WITH CHECK (bucket_id = 'brand-assets' AND public.is_admin());

-- ------------------------------------------------------------------------------
-- 2.2 BUCKET: promotional-banners (Public Read, Admin Write)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read promotional-banners" ON storage.objects;
DROP POLICY IF EXISTS "Admin full access promotional-banners" ON storage.objects;

CREATE POLICY "Public read promotional-banners" ON storage.objects
FOR SELECT
USING (bucket_id = 'promotional-banners');

CREATE POLICY "Admin full access promotional-banners" ON storage.objects
FOR ALL TO authenticated
USING (bucket_id = 'promotional-banners' AND public.is_admin())
WITH CHECK (bucket_id = 'promotional-banners' AND public.is_admin());

-- ------------------------------------------------------------------------------
-- 2.3 BUCKET: seller-store-branding (Public Read, Admin Full, Approved Seller Scoped)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read seller-store-branding" ON storage.objects;
DROP POLICY IF EXISTS "Admin full access seller-store-branding" ON storage.objects;
DROP POLICY IF EXISTS "Approved Sellers insert own store branding" ON storage.objects;
DROP POLICY IF EXISTS "Approved Sellers update own store branding" ON storage.objects;
DROP POLICY IF EXISTS "Approved Sellers delete own store branding" ON storage.objects;

CREATE POLICY "Public read seller-store-branding" ON storage.objects
FOR SELECT
USING (bucket_id = 'seller-store-branding');

CREATE POLICY "Admin full access seller-store-branding" ON storage.objects
FOR ALL TO authenticated
USING (bucket_id = 'seller-store-branding' AND public.is_admin())
WITH CHECK (bucket_id = 'seller-store-branding' AND public.is_admin());

CREATE POLICY "Approved Sellers insert own store branding" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'seller-store-branding' AND
    (
        (storage.foldername(name))[1] = auth.uid()::text OR
        ((storage.foldername(name))[1] = 'seller' AND (storage.foldername(name))[2] = auth.uid()::text)
    ) AND
    EXISTS (
        SELECT 1 FROM public.seller_profiles
        WHERE id = auth.uid() AND verification_status = 'approved'
    )
);

CREATE POLICY "Approved Sellers update own store branding" ON storage.objects
FOR UPDATE TO authenticated
USING (
    bucket_id = 'seller-store-branding' AND
    (
        (storage.foldername(name))[1] = auth.uid()::text OR
        ((storage.foldername(name))[1] = 'seller' AND (storage.foldername(name))[2] = auth.uid()::text)
    ) AND
    EXISTS (
        SELECT 1 FROM public.seller_profiles
        WHERE id = auth.uid() AND verification_status = 'approved'
    )
)
WITH CHECK (
    bucket_id = 'seller-store-branding' AND
    (
        (storage.foldername(name))[1] = auth.uid()::text OR
        ((storage.foldername(name))[1] = 'seller' AND (storage.foldername(name))[2] = auth.uid()::text)
    ) AND
    EXISTS (
        SELECT 1 FROM public.seller_profiles
        WHERE id = auth.uid() AND verification_status = 'approved'
    )
);

CREATE POLICY "Approved Sellers delete own store branding" ON storage.objects
FOR DELETE TO authenticated
USING (
    bucket_id = 'seller-store-branding' AND
    (
        (storage.foldername(name))[1] = auth.uid()::text OR
        ((storage.foldername(name))[1] = 'seller' AND (storage.foldername(name))[2] = auth.uid()::text)
    ) AND
    EXISTS (
        SELECT 1 FROM public.seller_profiles
        WHERE id = auth.uid() AND verification_status = 'approved'
    )
);

-- ------------------------------------------------------------------------------
-- 2.4 BUCKET: category-images (Public Read, Admin Write)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read category-images" ON storage.objects;
DROP POLICY IF EXISTS "Admin full access category-images" ON storage.objects;

CREATE POLICY "Public read category-images" ON storage.objects
FOR SELECT
USING (bucket_id = 'category-images');

CREATE POLICY "Admin full access category-images" ON storage.objects
FOR ALL TO authenticated
USING (bucket_id = 'category-images' AND public.is_admin())
WITH CHECK (bucket_id = 'category-images' AND public.is_admin());

-- ------------------------------------------------------------------------------
-- 2.5 BUCKET: support-attachments (Private, Admin Full, Authenticated Owner Scoped)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin full access support-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users select own support-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users insert own support-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users update own support-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own support-attachments" ON storage.objects;

CREATE POLICY "Admin full access support-attachments" ON storage.objects
FOR ALL TO authenticated
USING (bucket_id = 'support-attachments' AND public.is_admin())
WITH CHECK (bucket_id = 'support-attachments' AND public.is_admin());

CREATE POLICY "Users select own support-attachments" ON storage.objects
FOR SELECT TO authenticated
USING (
    bucket_id = 'support-attachments' AND
    (
        (storage.foldername(name))[1] = auth.uid()::text OR
        ((storage.foldername(name))[1] IN ('user', 'tickets') AND (storage.foldername(name))[2] = auth.uid()::text)
    )
);

CREATE POLICY "Users insert own support-attachments" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'support-attachments' AND
    (
        (storage.foldername(name))[1] = auth.uid()::text OR
        ((storage.foldername(name))[1] IN ('user', 'tickets') AND (storage.foldername(name))[2] = auth.uid()::text)
    )
);

CREATE POLICY "Users update own support-attachments" ON storage.objects
FOR UPDATE TO authenticated
USING (
    bucket_id = 'support-attachments' AND
    (
        (storage.foldername(name))[1] = auth.uid()::text OR
        ((storage.foldername(name))[1] IN ('user', 'tickets') AND (storage.foldername(name))[2] = auth.uid()::text)
    )
)
WITH CHECK (
    bucket_id = 'support-attachments' AND
    (
        (storage.foldername(name))[1] = auth.uid()::text OR
        ((storage.foldername(name))[1] IN ('user', 'tickets') AND (storage.foldername(name))[2] = auth.uid()::text)
    )
);

CREATE POLICY "Users delete own support-attachments" ON storage.objects
FOR DELETE TO authenticated
USING (
    bucket_id = 'support-attachments' AND
    (
        (storage.foldername(name))[1] = auth.uid()::text OR
        ((storage.foldername(name))[1] IN ('user', 'tickets') AND (storage.foldername(name))[2] = auth.uid()::text)
    )
);

-- ------------------------------------------------------------------------------
-- 2.6 BUCKET: seller-kyc-docs (Private, Admin Full, Seller Scoped)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin full access seller-kyc-docs" ON storage.objects;
DROP POLICY IF EXISTS "Sellers select own kyc docs" ON storage.objects;
DROP POLICY IF EXISTS "Sellers insert own kyc docs" ON storage.objects;
DROP POLICY IF EXISTS "Sellers update own kyc docs" ON storage.objects;
DROP POLICY IF EXISTS "Sellers delete own kyc docs" ON storage.objects;

CREATE POLICY "Admin full access seller-kyc-docs" ON storage.objects
FOR ALL TO authenticated
USING (bucket_id = 'seller-kyc-docs' AND public.is_admin())
WITH CHECK (bucket_id = 'seller-kyc-docs' AND public.is_admin());

CREATE POLICY "Sellers select own kyc docs" ON storage.objects
FOR SELECT TO authenticated
USING (
    bucket_id = 'seller-kyc-docs' AND
    (
        (storage.foldername(name))[1] = auth.uid()::text OR
        ((storage.foldername(name))[1] = 'seller' AND (storage.foldername(name))[2] = auth.uid()::text)
    )
);

CREATE POLICY "Sellers insert own kyc docs" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'seller-kyc-docs' AND
    (
        (storage.foldername(name))[1] = auth.uid()::text OR
        ((storage.foldername(name))[1] = 'seller' AND (storage.foldername(name))[2] = auth.uid()::text)
    ) AND
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('seller', 'admin')
    )
);

CREATE POLICY "Sellers update own kyc docs" ON storage.objects
FOR UPDATE TO authenticated
USING (
    bucket_id = 'seller-kyc-docs' AND
    (
        (storage.foldername(name))[1] = auth.uid()::text OR
        ((storage.foldername(name))[1] = 'seller' AND (storage.foldername(name))[2] = auth.uid()::text)
    )
)
WITH CHECK (
    bucket_id = 'seller-kyc-docs' AND
    (
        (storage.foldername(name))[1] = auth.uid()::text OR
        ((storage.foldername(name))[1] = 'seller' AND (storage.foldername(name))[2] = auth.uid()::text)
    )
);

CREATE POLICY "Sellers delete own kyc docs" ON storage.objects
FOR DELETE TO authenticated
USING (
    bucket_id = 'seller-kyc-docs' AND
    (
        (storage.foldername(name))[1] = auth.uid()::text OR
        ((storage.foldername(name))[1] = 'seller' AND (storage.foldername(name))[2] = auth.uid()::text)
    )
);

-- ------------------------------------------------------------------------------
-- 2.7 BUCKET: order-invoices (Private, Admin Full, Owner Scoped)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin full access order-invoices" ON storage.objects;
DROP POLICY IF EXISTS "Users select own order-invoices" ON storage.objects;
DROP POLICY IF EXISTS "Sellers insert order-invoices" ON storage.objects;
DROP POLICY IF EXISTS "Sellers update order-invoices" ON storage.objects;
DROP POLICY IF EXISTS "Sellers delete order-invoices" ON storage.objects;

CREATE POLICY "Admin full access order-invoices" ON storage.objects
FOR ALL TO authenticated
USING (bucket_id = 'order-invoices' AND public.is_admin())
WITH CHECK (bucket_id = 'order-invoices' AND public.is_admin());

CREATE POLICY "Users select own order-invoices" ON storage.objects
FOR SELECT TO authenticated
USING (
    bucket_id = 'order-invoices' AND
    (
        (storage.foldername(name))[1] = auth.uid()::text OR
        ((storage.foldername(name))[1] IN ('customer', 'seller', 'orders') AND (storage.foldername(name))[2] = auth.uid()::text)
    )
);

CREATE POLICY "Sellers insert order-invoices" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'order-invoices' AND
    (
        (storage.foldername(name))[1] = auth.uid()::text OR
        ((storage.foldername(name))[1] = 'seller' AND (storage.foldername(name))[2] = auth.uid()::text)
    ) AND
    EXISTS (
        SELECT 1 FROM public.seller_profiles
        WHERE id = auth.uid() AND verification_status = 'approved'
    )
);

CREATE POLICY "Sellers update order-invoices" ON storage.objects
FOR UPDATE TO authenticated
USING (
    bucket_id = 'order-invoices' AND
    (
        (storage.foldername(name))[1] = auth.uid()::text OR
        ((storage.foldername(name))[1] = 'seller' AND (storage.foldername(name))[2] = auth.uid()::text)
    ) AND
    EXISTS (
        SELECT 1 FROM public.seller_profiles
        WHERE id = auth.uid() AND verification_status = 'approved'
    )
)
WITH CHECK (
    bucket_id = 'order-invoices' AND
    (
        (storage.foldername(name))[1] = auth.uid()::text OR
        ((storage.foldername(name))[1] = 'seller' AND (storage.foldername(name))[2] = auth.uid()::text)
    ) AND
    EXISTS (
        SELECT 1 FROM public.seller_profiles
        WHERE id = auth.uid() AND verification_status = 'approved'
    )
);

CREATE POLICY "Sellers delete order-invoices" ON storage.objects
FOR DELETE TO authenticated
USING (
    bucket_id = 'order-invoices' AND
    (
        (storage.foldername(name))[1] = auth.uid()::text OR
        ((storage.foldername(name))[1] = 'seller' AND (storage.foldername(name))[2] = auth.uid()::text)
    ) AND
    EXISTS (
        SELECT 1 FROM public.seller_profiles
        WHERE id = auth.uid() AND verification_status = 'approved'
    )
);

-- ------------------------------------------------------------------------------
-- 2.8 BUCKET: return-evidence (Private, Admin Full, Owner Scoped)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin full access return-evidence" ON storage.objects;
DROP POLICY IF EXISTS "Users select own return-evidence" ON storage.objects;
DROP POLICY IF EXISTS "Users insert own return-evidence" ON storage.objects;
DROP POLICY IF EXISTS "Users update own return-evidence" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own return-evidence" ON storage.objects;

CREATE POLICY "Admin full access return-evidence" ON storage.objects
FOR ALL TO authenticated
USING (bucket_id = 'return-evidence' AND public.is_admin())
WITH CHECK (bucket_id = 'return-evidence' AND public.is_admin());

CREATE POLICY "Users select own return-evidence" ON storage.objects
FOR SELECT TO authenticated
USING (
    bucket_id = 'return-evidence' AND
    (
        (storage.foldername(name))[1] = auth.uid()::text OR
        ((storage.foldername(name))[1] IN ('customer', 'seller', 'returns') AND (storage.foldername(name))[2] = auth.uid()::text)
    )
);

CREATE POLICY "Users insert own return-evidence" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'return-evidence' AND
    (
        (storage.foldername(name))[1] = auth.uid()::text OR
        ((storage.foldername(name))[1] IN ('customer', 'seller', 'returns') AND (storage.foldername(name))[2] = auth.uid()::text)
    )
);

CREATE POLICY "Users update own return-evidence" ON storage.objects
FOR UPDATE TO authenticated
USING (
    bucket_id = 'return-evidence' AND
    (
        (storage.foldername(name))[1] = auth.uid()::text OR
        ((storage.foldername(name))[1] IN ('customer', 'seller', 'returns') AND (storage.foldername(name))[2] = auth.uid()::text)
    )
)
WITH CHECK (
    bucket_id = 'return-evidence' AND
    (
        (storage.foldername(name))[1] = auth.uid()::text OR
        ((storage.foldername(name))[1] IN ('customer', 'seller', 'returns') AND (storage.foldername(name))[2] = auth.uid()::text)
    )
);

CREATE POLICY "Users delete own return-evidence" ON storage.objects
FOR DELETE TO authenticated
USING (
    bucket_id = 'return-evidence' AND
    (
        (storage.foldername(name))[1] = auth.uid()::text OR
        ((storage.foldername(name))[1] IN ('customer', 'seller', 'returns') AND (storage.foldername(name))[2] = auth.uid()::text)
    )
);

-- ==============================================================================
-- 3. EXTEND SUPPORT RPC TO PERSIST ATTACHMENTS TO BOTH TICKETS & MESSAGES
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.create_support_ticket(
    p_category TEXT,
    p_subject TEXT,
    p_description TEXT,
    p_order_id UUID DEFAULT NULL,
    p_order_number TEXT DEFAULT NULL,
    p_phone_number TEXT DEFAULT NULL,
    p_attachment_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_customer_name TEXT;
    v_customer_email TEXT;
    v_ticket_id UUID;
    v_ticket_number TEXT;
    v_ticket_record RECORD;
BEGIN
    -- Verify authenticated user
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to create a support ticket' USING ERRCODE = '42501';
    END IF;

    -- Fetch user identity
    SELECT full_name, email INTO v_customer_name, v_customer_email
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_customer_name IS NULL OR TRIM(v_customer_name) = '' THEN
        v_customer_name := COALESCE(auth.jwt()->>'name', 'Customer');
    END IF;

    IF v_customer_email IS NULL OR TRIM(v_customer_email) = '' THEN
        v_customer_email := COALESCE(auth.jwt()->>'email', 'customer@vendosmith.com');
    END IF;

    -- Validate fields
    IF p_category IS NULL OR TRIM(p_category) = '' THEN
        RAISE EXCEPTION 'Category is required';
    END IF;
    IF p_subject IS NULL OR TRIM(p_subject) = '' THEN
        RAISE EXCEPTION 'Subject is required';
    END IF;
    IF p_description IS NULL OR TRIM(p_description) = '' THEN
        RAISE EXCEPTION 'Description is required';
    END IF;

    -- Single authoritative sequence ticket number
    v_ticket_number := 'VSM-' || LPAD(nextval('public.support_ticket_seq')::TEXT, 5, '0');

    -- Insert into support_tickets
    INSERT INTO public.support_tickets (
        ticket_number,
        user_id,
        customer_name,
        customer_email,
        phone_number,
        order_id,
        order_number,
        category,
        subject,
        description,
        attachment_url,
        status,
        priority
    ) VALUES (
        v_ticket_number,
        v_user_id,
        v_customer_name,
        v_customer_email,
        p_phone_number,
        p_order_id,
        p_order_number,
        p_category,
        TRIM(p_subject),
        TRIM(p_description),
        NULLIF(TRIM(p_attachment_url), ''),
        'OPEN',
        'NORMAL'
    )
    RETURNING id INTO v_ticket_id;

    -- Insert initial message into immutable support_ticket_messages
    INSERT INTO public.support_ticket_messages (
        ticket_id,
        sender_id,
        sender_role,
        sender_name,
        message,
        attachment_url
    ) VALUES (
        v_ticket_id,
        v_user_id,
        'customer',
        v_customer_name,
        TRIM(p_description),
        NULLIF(TRIM(p_attachment_url), '')
    );

    SELECT * INTO v_ticket_record FROM public.support_tickets WHERE id = v_ticket_id;
    RETURN to_jsonb(v_ticket_record);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_support_ticket(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT) TO authenticated;

COMMIT;
