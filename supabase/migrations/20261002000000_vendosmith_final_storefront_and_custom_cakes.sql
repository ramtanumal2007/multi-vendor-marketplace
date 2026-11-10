-- ==============================================================================
-- MIGRATION: VENDOSMITH FINAL STOREFRONT + CUSTOM CAKE SYSTEM
-- Version: 20261002000000
-- Status: PREPARED FOR USER REVIEW (DO NOT APPLY AUTOMATICALLY TO PRODUCTION)
--
-- Features:
-- 1. Storage bucket: custom-cake-references (Private, 10MB limit, image/jpeg, image/png, image/webp)
-- 2. Storage RLS policies for customer upload, owner view, seller view, and admin full access
-- 3. Table: custom_cake_requests (Dedicated custom cake request entity & status lifecycle)
-- 4. Table: custom_cake_activity_logs (Audit history log for all custom cake actions)
-- 5. Request Number Sequence & Trigger: CKR-10001, CKR-10002...
-- 6. Category seed: Ensure 'Cake' / 'Cakes & Bakery' category exists
-- 7. RLS policies on custom_cake_requests and custom_cake_activity_logs
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. STORAGE BUCKET: custom-cake-references (PRIVATE, 10MB)
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'custom-cake-references',
    'custom-cake-references',
    false,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- ==============================================================================
-- 2. TABLE: custom_cake_requests
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.custom_cake_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_number TEXT UNIQUE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    cake_type TEXT NOT NULL,
    flavor TEXT NOT NULL,
    weight TEXT NOT NULL,
    servings TEXT,
    theme_description TEXT NOT NULL,
    message_on_cake TEXT,
    preferred_delivery_date DATE NOT NULL,
    preferred_delivery_time TEXT NOT NULL,
    budget_max NUMERIC(10, 2) NOT NULL,
    budget_min NUMERIC(10, 2),
    reference_images JSONB DEFAULT '[]'::jsonb,
    contact_name TEXT NOT NULL,
    contact_phone TEXT NOT NULL,
    delivery_address JSONB NOT NULL,
    dietary_notes TEXT,
    additional_instructions TEXT,
    status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (
        status IN (
            'SUBMITTED',
            'ADMIN_REVIEW',
            'FORWARDED_TO_SELLER',
            'SELLER_REVIEW',
            'QUOTED',
            'CUSTOMER_ACCEPTED',
            'CONVERTED_TO_ORDER',
            'DECLINED',
            'REJECTED',
            'CANCELLED',
            'CLARIFICATION_REQUESTED'
        )
    ),
    assigned_seller_id UUID REFERENCES public.seller_profiles(id) ON DELETE SET NULL,
    assigned_store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    seller_quote JSONB,
    clarification_notes TEXT,
    converted_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexing for performance
CREATE INDEX IF NOT EXISTS idx_custom_cake_requests_user ON public.custom_cake_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_cake_requests_seller ON public.custom_cake_requests(assigned_seller_id);
CREATE INDEX IF NOT EXISTS idx_custom_cake_requests_status ON public.custom_cake_requests(status);
CREATE INDEX IF NOT EXISTS idx_custom_cake_requests_created ON public.custom_cake_requests(created_at DESC);

-- ==============================================================================
-- 3. SEQUENCE & TRIGGER FOR SEQUENTIAL REQUEST NUMBER (CKR-10001)
-- ==============================================================================
CREATE SEQUENCE IF NOT EXISTS public.custom_cake_request_seq START WITH 10001;

CREATE OR REPLACE FUNCTION public.set_custom_cake_request_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.request_number IS NULL OR NEW.request_number = '' THEN
        NEW.request_number := 'CKR-' || nextval('public.custom_cake_request_seq')::text;
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_custom_cake_request_number ON public.custom_cake_requests;
CREATE TRIGGER trg_set_custom_cake_request_number
BEFORE INSERT ON public.custom_cake_requests
FOR EACH ROW
EXECUTE FUNCTION public.set_custom_cake_request_number();

-- ==============================================================================
-- 4. TABLE: custom_cake_activity_logs (AUDIT TRAIL)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.custom_cake_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID REFERENCES public.custom_cake_requests(id) ON DELETE CASCADE NOT NULL,
    action TEXT NOT NULL,
    actor_id UUID,
    actor_role TEXT NOT NULL CHECK (actor_role IN ('customer', 'admin', 'seller', 'system')),
    actor_name TEXT,
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_custom_cake_activity_request ON public.custom_cake_activity_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_custom_cake_activity_created ON public.custom_cake_activity_logs(created_at ASC);

-- ==============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.custom_cake_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_cake_activity_logs ENABLE ROW LEVEL SECURITY;

-- Helper function to check admin role
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5.1 Policies for custom_cake_requests
DROP POLICY IF EXISTS "Customers can view own custom cake requests" ON public.custom_cake_requests;
CREATE POLICY "Customers can view own custom cake requests"
ON public.custom_cake_requests FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Customers can insert own custom cake requests" ON public.custom_cake_requests;
CREATE POLICY "Customers can insert own custom cake requests"
ON public.custom_cake_requests FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Customers can update own custom cake requests" ON public.custom_cake_requests;
CREATE POLICY "Customers can update own custom cake requests"
ON public.custom_cake_requests FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Sellers can view assigned custom cake requests" ON public.custom_cake_requests;
CREATE POLICY "Sellers can view assigned custom cake requests"
ON public.custom_cake_requests FOR SELECT
USING (auth.uid() = assigned_seller_id);

DROP POLICY IF EXISTS "Sellers can update assigned custom cake requests" ON public.custom_cake_requests;
CREATE POLICY "Sellers can update assigned custom cake requests"
ON public.custom_cake_requests FOR UPDATE
USING (auth.uid() = assigned_seller_id)
WITH CHECK (auth.uid() = assigned_seller_id);

DROP POLICY IF EXISTS "Admin full access custom cake requests" ON public.custom_cake_requests;
CREATE POLICY "Admin full access custom cake requests"
ON public.custom_cake_requests FOR ALL
USING (public.is_admin_user());

-- 5.2 Policies for custom_cake_activity_logs
DROP POLICY IF EXISTS "Users can view logs for their custom cake requests" ON public.custom_cake_activity_logs;
CREATE POLICY "Users can view logs for their custom cake requests"
ON public.custom_cake_activity_logs FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.custom_cake_requests r
        WHERE r.id = custom_cake_activity_logs.request_id
        AND (r.user_id = auth.uid() OR r.assigned_seller_id = auth.uid() OR public.is_admin_user())
    )
);

DROP POLICY IF EXISTS "Authenticated users can insert activity logs" ON public.custom_cake_activity_logs;
CREATE POLICY "Authenticated users can insert activity logs"
ON public.custom_cake_activity_logs FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- ==============================================================================
-- 6. STORAGE RLS POLICIES FOR custom-cake-references
-- ==============================================================================
DROP POLICY IF EXISTS "Admin full access custom cake references" ON storage.objects;
CREATE POLICY "Admin full access custom cake references"
ON storage.objects FOR ALL
USING (
    bucket_id = 'custom-cake-references' 
    AND public.is_admin_user()
);

DROP POLICY IF EXISTS "Customers upload own custom cake references" ON storage.objects;
CREATE POLICY "Customers upload own custom cake references"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'custom-cake-references'
    AND auth.uid() IS NOT NULL
    AND (
        (storage.foldername(name))[1] = auth.uid()::text OR
        ((storage.foldername(name))[1] = 'custom-cakes' AND (storage.foldername(name))[2] = auth.uid()::text)
    )
);

DROP POLICY IF EXISTS "Customers read own custom cake references" ON storage.objects;
CREATE POLICY "Customers read own custom cake references"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'custom-cake-references'
    AND auth.uid() IS NOT NULL
    AND (
        (storage.foldername(name))[1] = auth.uid()::text OR
        ((storage.foldername(name))[1] = 'custom-cakes' AND (storage.foldername(name))[2] = auth.uid()::text)
    )
);

DROP POLICY IF EXISTS "Assigned sellers read custom cake references" ON storage.objects;
CREATE POLICY "Assigned sellers read custom cake references"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'custom-cake-references'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
        SELECT 1 FROM public.custom_cake_requests r
        WHERE r.assigned_seller_id = auth.uid()
        AND r.reference_images::text LIKE '%' || name || '%'
    )
);

-- ==============================================================================
-- 7. SEED: ENSURE CAKE CATEGORY EXISTS
-- ==============================================================================
INSERT INTO public.categories (name, slug, description, sort_order)
VALUES ('Cake', 'cake', 'Designer, birthday, anniversary & handcrafted celebration cakes', 0)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order;

COMMIT;
