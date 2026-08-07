-- ==============================================================================
-- PHASE 1: SELLER DASHBOARD EXTENSIONS & ADMIN COUPON MANAGEMENT (FINAL)
-- DO NOT EXECUTE AUTOMATICALLY. Run manually in Supabase SQL Editor.
-- ==============================================================================

BEGIN;

-- 1. SELLER PROFILES EXTENSIONS FOR MEMBERSHIP, LEVEL & SCORE
ALTER TABLE public.seller_profiles
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS membership_plan TEXT DEFAULT 'BASIC' CHECK (membership_plan IN ('BASIC', 'PRO', 'BUSINESS')),
ADD COLUMN IF NOT EXISTS membership_status TEXT DEFAULT 'active' CHECK (membership_status IN ('active', 'canceled', 'expired', 'past_due', 'trialing')),
ADD COLUMN IF NOT EXISTS membership_started_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS membership_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS max_products INT DEFAULT 10,
ADD COLUMN IF NOT EXISTS storage_limit_mb INT DEFAULT 500,
ADD COLUMN IF NOT EXISTS admin_users_limit INT DEFAULT 1,
ADD COLUMN IF NOT EXISTS has_seen_approval_modal BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS seller_level TEXT DEFAULT 'New Seller' CHECK (seller_level IN ('New Seller', 'Verified Seller', 'Trusted Seller', 'Top Rated Seller', 'Premium Seller')),
ADD COLUMN IF NOT EXISTS seller_score INT DEFAULT 50 CHECK (seller_score >= 0 AND seller_score <= 100);

-- 2. STORE BRANDING, SEO & POLICIES EXTENSIONS ON STORES TABLE
ALTER TABLE public.stores
ADD COLUMN IF NOT EXISTS primary_color TEXT DEFAULT '#2563EB',
ADD COLUMN IF NOT EXISTS tagline VARCHAR(80),
ADD COLUMN IF NOT EXISTS about_store TEXT,
ADD COLUMN IF NOT EXISTS shipping_policy TEXT,
ADD COLUMN IF NOT EXISTS return_policy TEXT,
ADD COLUMN IF NOT EXISTS tax_gst_number TEXT,
ADD COLUMN IF NOT EXISTS bank_account_details TEXT,
ADD COLUMN IF NOT EXISTS seo_title TEXT,
ADD COLUMN IF NOT EXISTS seo_description TEXT,
ADD COLUMN IF NOT EXISTS seo_keywords TEXT[],
ADD COLUMN IF NOT EXISTS social_instagram TEXT,
ADD COLUMN IF NOT EXISTS social_facebook TEXT,
ADD COLUMN IF NOT EXISTS social_twitter TEXT,
ADD COLUMN IF NOT EXISTS social_website TEXT;

-- Constraint for tagline length
ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_tagline_length_check;
ALTER TABLE public.stores ADD CONSTRAINT stores_tagline_length_check CHECK (char_length(tagline) <= 80);

-- 3. MEMBERSHIP HISTORY TABLE
CREATE TABLE IF NOT EXISTS public.seller_membership_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID REFERENCES public.seller_profiles(id) ON DELETE CASCADE NOT NULL,
    plan TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    amount_paid NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.seller_membership_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sellers can view own membership history" ON public.seller_membership_history;
CREATE POLICY "Sellers can view own membership history" ON public.seller_membership_history 
FOR SELECT USING (seller_id = auth.uid() OR public.is_admin());

-- 4. CERTIFICATE REGISTRY TABLE
CREATE TABLE IF NOT EXISTS public.seller_certificate_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID REFERENCES public.seller_profiles(id) ON DELETE CASCADE NOT NULL,
    certificate_number TEXT UNIQUE NOT NULL,
    verification_id TEXT UNIQUE NOT NULL,
    issue_date TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked')),
    issued_by TEXT DEFAULT 'Marketplace Administrator',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.seller_certificate_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sellers and public can view certificate registry" ON public.seller_certificate_registry;
CREATE POLICY "Sellers and public can view certificate registry" ON public.seller_certificate_registry 
FOR SELECT USING (seller_id = auth.uid() OR public.is_admin());

-- 5. NOTIFICATION CENTER TABLE WITH PUSH-READY FIELDS & PRIORITY
CREATE TABLE IF NOT EXISTS public.seller_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID REFERENCES public.seller_profiles(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'system' CHECK (type IN ('system', 'order', 'approval', 'inventory', 'warning')),
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
    is_push_ready BOOLEAN DEFAULT false,
    push_payload JSONB,
    is_read BOOLEAN DEFAULT false,
    link_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.seller_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sellers can view own notifications" ON public.seller_notifications;
CREATE POLICY "Sellers can view own notifications" ON public.seller_notifications 
FOR SELECT USING (seller_id = auth.uid());

DROP POLICY IF EXISTS "Sellers can update own notification read state" ON public.seller_notifications;
CREATE POLICY "Sellers can update own notification read state" ON public.seller_notifications 
FOR UPDATE USING (seller_id = auth.uid()) WITH CHECK (seller_id = auth.uid());

-- 6. ACHIEVEMENT SYSTEM TABLES
CREATE TABLE IF NOT EXISTS public.seller_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    icon_name TEXT DEFAULT 'Award',
    points INT DEFAULT 10,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.seller_achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view achievements list" ON public.seller_achievements;
CREATE POLICY "Public can view achievements list" ON public.seller_achievements FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.seller_unlocked_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID REFERENCES public.seller_profiles(id) ON DELETE CASCADE NOT NULL,
    achievement_id UUID REFERENCES public.seller_achievements(id) ON DELETE CASCADE NOT NULL,
    unlocked_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(seller_id, achievement_id)
);
ALTER TABLE public.seller_unlocked_achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sellers can view own unlocked achievements" ON public.seller_unlocked_achievements;
CREATE POLICY "Sellers can view own unlocked achievements" ON public.seller_unlocked_achievements 
FOR SELECT USING (seller_id = auth.uid());

-- SEED ACHIEVEMENTS
INSERT INTO public.seller_achievements (code, title, description, icon_name, points)
VALUES 
    ('STORE_APPROVED', 'Verified Merchant', 'Successfully completed seller verification and store approval.', 'CheckCircle', 20),
    ('FIRST_PRODUCT', 'Product Launch', 'Listed your very first product catalog item.', 'Package', 15),
    ('CATALOG_EXPANDER', 'Catalog Builder', 'Listed 5 or more active products in your store.', 'Layers', 25),
    ('PRO_MEMBER', 'Pro Tier Seller', 'Upgraded to Pro or Business membership plan.', 'Zap', 40)
ON CONFLICT (code) DO NOTHING;

-- 7. EXTEND COUPONS TABLE WITH AUTO-APPLY, STACKABLE & REDEMPTIONS
ALTER TABLE public.coupons
ADD COLUMN IF NOT EXISTS target_type TEXT DEFAULT 'all' CHECK (target_type IN ('all', 'seller', 'membership_plan', 'category', 'product')),
ADD COLUMN IF NOT EXISTS target_sellers UUID[],
ADD COLUMN IF NOT EXISTS target_membership_plans TEXT[],
ADD COLUMN IF NOT EXISTS is_first_order_only BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_apply BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS stackable BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS usage_count INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_total_redemptions INT,
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id);

DROP POLICY IF EXISTS "Sellers can view relevant coupons" ON public.coupons;
CREATE POLICY "Sellers can view relevant coupons" ON public.coupons
FOR SELECT USING (
    public.is_admin() OR 
    target_type = 'all' OR 
    (target_type = 'seller' AND auth.uid() = ANY(target_sellers)) OR
    (target_type = 'membership_plan' AND EXISTS (
        SELECT 1 FROM public.seller_profiles 
        WHERE id = auth.uid() AND membership_plan = ANY(coupons.target_membership_plans)
    ))
);

-- 8. RPC UPDATES
CREATE OR REPLACE FUNCTION public.approve_seller(p_seller_id UUID) RETURNS BOOLEAN AS $$
DECLARE
    v_current_status TEXT;
    v_business_name TEXT;
    v_seller_id_code TEXT;
    v_updated INT;
    v_store_count INT;
    v_base_slug TEXT;
    v_final_slug TEXT;
    v_achieve_id UUID;
    v_cert_num TEXT;
    v_ver_id TEXT;
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    
    SELECT verification_status, business_name, seller_id_code 
    INTO v_current_status, v_business_name, v_seller_id_code 
    FROM public.seller_profiles 
    WHERE id = p_seller_id FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Seller profile not found.'; END IF;
    IF v_current_status NOT IN ('pending', 'under_review') THEN
        RAISE EXCEPTION 'Invalid transition: Cannot approve a seller with status %', v_current_status;
    END IF;

    IF v_seller_id_code IS NULL THEN
        v_seller_id_code := 'SLR-' || LPAD(nextval('public.seller_id_seq')::TEXT, 6, '0');
    END IF;

    UPDATE public.seller_profiles 
    SET verification_status = 'approved',
        seller_id_code = v_seller_id_code,
        approved_at = COALESCE(approved_at, NOW()),
        seller_level = 'Verified Seller',
        seller_score = GREATEST(seller_score, 75),
        membership_plan = COALESCE(membership_plan, 'BASIC'),
        membership_status = COALESCE(membership_status, 'active'),
        membership_started_at = COALESCE(membership_started_at, NOW()),
        max_products = COALESCE(max_products, 10),
        storage_limit_mb = COALESCE(storage_limit_mb, 500),
        admin_users_limit = COALESCE(admin_users_limit, 1),
        updated_at = NOW()
    WHERE id = p_seller_id;
    
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'Failed to update seller profile.'; END IF;

    UPDATE public.profiles SET role = 'seller', updated_at = NOW() WHERE id = p_seller_id;
    
    UPDATE public.stores 
    SET status = 'approved', updated_at = NOW()
    WHERE seller_id = p_seller_id AND status IN ('draft', 'pending', 'under_review');

    GET DIAGNOSTICS v_store_count = ROW_COUNT;

    IF v_store_count = 0 THEN
      SELECT COUNT(*) INTO v_store_count FROM public.stores WHERE seller_id = p_seller_id AND status = 'approved';
      IF v_store_count = 0 THEN
        v_base_slug := lower(regexp_replace(COALESCE(v_business_name, 'seller-store'), '[^a-zA-Z0-9]+', '-', 'g'));
        v_base_slug := regexp_replace(v_base_slug, '(^-|-$)+', '', 'g');
        IF v_base_slug = '' THEN v_base_slug := 'seller-store'; END IF;
        v_final_slug := v_base_slug || '-' || substring(md5(random()::text || clock_timestamp()::text) from 1 for 8);

        INSERT INTO public.stores (seller_id, name, slug, status)
        VALUES (p_seller_id, COALESCE(v_business_name, 'Official Store'), v_final_slug, 'approved');
      END IF;
    END IF;

    -- Membership History Entry
    INSERT INTO public.seller_membership_history (seller_id, plan, status, started_at)
    VALUES (p_seller_id, 'BASIC', 'active', NOW());

    -- Certificate Registry Entry
    v_cert_num := 'CERT-' || v_seller_id_code || '-' || TO_CHAR(NOW(), 'YYYY');
    v_ver_id := 'VER-' || UPPER(SUBSTRING(MD5(p_seller_id::text || NOW()::text) FROM 1 FOR 8));
    INSERT INTO public.seller_certificate_registry (seller_id, certificate_number, verification_id, status)
    VALUES (p_seller_id, v_cert_num, v_ver_id, 'active')
    ON CONFLICT (certificate_number) DO NOTHING;

    INSERT INTO public.seller_application_events (seller_id, event_type) VALUES (p_seller_id, 'approved');

    -- Push-ready Welcome notification
    INSERT INTO public.seller_notifications (seller_id, title, message, type, priority, is_push_ready, link_url)
    VALUES (
        p_seller_id, 
        'Application Approved! 🎉', 
        'Congratulations! Your seller application has been approved. You are now a Verified Seller.', 
        'approval',
        'high',
        true,
        '/seller'
    );

    -- Auto-unlock STORE_APPROVED achievement
    SELECT id INTO v_achieve_id FROM public.seller_achievements WHERE code = 'STORE_APPROVED';
    IF v_achieve_id IS NOT NULL THEN
        INSERT INTO public.seller_unlocked_achievements (seller_id, achievement_id) 
        VALUES (p_seller_id, v_achieve_id) ON CONFLICT DO NOTHING;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.approve_seller(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_seller(UUID) TO authenticated;

-- ACKNOWLEDGE MODAL RPC
CREATE OR REPLACE FUNCTION public.acknowledge_seller_approval_modal() RETURNS BOOLEAN AS $$
BEGIN
    UPDATE public.seller_profiles
    SET has_seen_approval_modal = TRUE,
        updated_at = NOW()
    WHERE id = auth.uid();
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.acknowledge_seller_approval_modal() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acknowledge_seller_approval_modal() TO authenticated;

COMMIT;
