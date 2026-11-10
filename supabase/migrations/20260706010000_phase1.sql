-- ==============================================================================
-- FINAL PHASE 1: SELLER MARKETPLACE FOUNDATION MIGRATION
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. PROFILES: Role Protection
-- ------------------------------------------------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('customer', 'seller', 'admin'));

CREATE OR REPLACE FUNCTION public.protect_profile_role() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Role modification is restricted to Administrators.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS enforce_profile_role_security ON public.profiles;
CREATE TRIGGER enforce_profile_role_security BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE PROCEDURE public.protect_profile_role();


-- ------------------------------------------------------------------------------
-- 2. SELLER PROFILES & MODERATION
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.seller_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    business_name TEXT,
    contact_name TEXT,
    phone TEXT,
    business_email TEXT,
    business_type TEXT,
    verification_status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT seller_profiles_verification_status_check CHECK (verification_status IN ('pending', 'under_review', 'approved', 'rejected', 'suspended'))
);

DROP TRIGGER IF EXISTS update_seller_profiles_updated_at ON public.seller_profiles;
CREATE TRIGGER update_seller_profiles_updated_at BEFORE UPDATE ON public.seller_profiles FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.protect_seller_moderation() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.verification_status IS DISTINCT FROM OLD.verification_status AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Moderation status changes are restricted to Administrators.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS enforce_seller_moderation_security ON public.seller_profiles;
CREATE TRIGGER enforce_seller_moderation_security BEFORE UPDATE ON public.seller_profiles FOR EACH ROW EXECUTE PROCEDURE public.protect_seller_moderation();

ALTER TABLE public.seller_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Sellers can view own seller profile" ON public.seller_profiles;
DROP POLICY IF EXISTS "Sellers can update own seller profile" ON public.seller_profiles;
DROP POLICY IF EXISTS "Sellers can insert own seller profile" ON public.seller_profiles;
DROP POLICY IF EXISTS "Admin full access seller_profiles" ON public.seller_profiles;

CREATE POLICY "Sellers can view own seller profile" ON public.seller_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Sellers can insert own seller profile" ON public.seller_profiles FOR INSERT WITH CHECK (auth.uid() = id AND verification_status = 'pending');
CREATE POLICY "Sellers can update own seller profile" ON public.seller_profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Admin full access seller_profiles" ON public.seller_profiles USING (public.is_admin());

-- ------------------------------------------------------------------------------
-- 3. ATOMIC SELLER MODERATION RPCs
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_seller(p_seller_id UUID) RETURNS BOOLEAN AS $$
DECLARE
    v_current_status TEXT;
    v_updated INT;
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    
    SELECT verification_status INTO v_current_status FROM public.seller_profiles WHERE id = p_seller_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Seller profile not found.'; END IF;
    IF v_current_status NOT IN ('pending', 'under_review') THEN
        RAISE EXCEPTION 'Invalid transition: Cannot approve a seller with status %', v_current_status;
    END IF;

    UPDATE public.seller_profiles SET verification_status = 'approved' WHERE id = p_seller_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'Failed to update seller profile.'; END IF;

    UPDATE public.profiles SET role = 'seller' WHERE id = p_seller_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'Failed to update user profile role.'; END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.approve_seller(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_seller(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_seller(p_seller_id UUID) RETURNS BOOLEAN AS $$
DECLARE
    v_current_status TEXT;
    v_updated INT;
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    
    SELECT verification_status INTO v_current_status FROM public.seller_profiles WHERE id = p_seller_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Seller profile not found.'; END IF;
    IF v_current_status NOT IN ('pending', 'under_review') THEN
        RAISE EXCEPTION 'Invalid transition: Cannot reject a seller with status %', v_current_status;
    END IF;

    UPDATE public.seller_profiles SET verification_status = 'rejected' WHERE id = p_seller_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'Failed to update seller profile.'; END IF;

    UPDATE public.profiles SET role = 'customer' WHERE id = p_seller_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'Failed to update user profile role.'; END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.reject_seller(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_seller(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.suspend_seller(p_seller_id UUID) RETURNS BOOLEAN AS $$
DECLARE
    v_current_status TEXT;
    v_updated INT;
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    
    SELECT verification_status INTO v_current_status FROM public.seller_profiles WHERE id = p_seller_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Seller profile not found.'; END IF;
    IF v_current_status != 'approved' THEN
        RAISE EXCEPTION 'Invalid transition: Can only suspend an approved seller (current: %)', v_current_status;
    END IF;

    UPDATE public.seller_profiles SET verification_status = 'suspended' WHERE id = p_seller_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'Failed to update seller profile.'; END IF;

    UPDATE public.profiles SET role = 'customer' WHERE id = p_seller_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'Failed to update user profile role.'; END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.suspend_seller(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suspend_seller(UUID) TO authenticated;


-- ------------------------------------------------------------------------------
-- 4. STORES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID REFERENCES public.seller_profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    logo_url TEXT,
    banner_url TEXT,
    phone TEXT,
    email TEXT,
    address_line1 TEXT,
    address_line2 TEXT,
    city TEXT,
    state TEXT,
    postal_code TEXT,
    latitude NUMERIC,
    longitude NUMERIC,
    status TEXT DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT stores_status_check CHECK (status IN ('draft', 'pending', 'under_review', 'approved', 'rejected', 'suspended'))
);

CREATE INDEX IF NOT EXISTS idx_stores_seller_id ON public.stores(seller_id);

DROP TRIGGER IF EXISTS update_stores_updated_at ON public.stores;
CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.protect_store_moderation() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT public.is_admin() THEN
        -- Sellers can only transition draft -> pending
        IF OLD.status = 'draft' AND NEW.status = 'pending' THEN
            -- OK
        ELSE
            RAISE EXCEPTION 'Unauthorized: Store status changes restricted.'; 
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS enforce_store_moderation_security ON public.stores;
CREATE TRIGGER enforce_store_moderation_security BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE PROCEDURE public.protect_store_moderation();

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access for approved stores" ON public.stores;
DROP POLICY IF EXISTS "Sellers can manage own stores" ON public.stores;
DROP POLICY IF EXISTS "Sellers can view own stores" ON public.stores;
DROP POLICY IF EXISTS "Sellers can insert own stores" ON public.stores;
DROP POLICY IF EXISTS "Sellers can update own stores" ON public.stores;
DROP POLICY IF EXISTS "Admin full access stores" ON public.stores;

CREATE POLICY "Public read access for approved stores" ON public.stores FOR SELECT USING (status = 'approved');
CREATE POLICY "Sellers can view own stores" ON public.stores FOR SELECT USING (auth.uid() = seller_id AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller'));
CREATE POLICY "Sellers can insert own stores" ON public.stores FOR INSERT WITH CHECK (auth.uid() = seller_id AND status = 'draft' AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller'));
CREATE POLICY "Sellers can update own stores" ON public.stores FOR UPDATE USING (auth.uid() = seller_id AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller')) WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "Admin full access stores" ON public.stores USING (public.is_admin());


-- ------------------------------------------------------------------------------
-- 5. PRODUCTS & MODERATION
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'store_id') THEN
        ALTER TABLE public.products ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE RESTRICT;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_products_store_id ON public.products(store_id);

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_status_check;
ALTER TABLE public.products ADD CONSTRAINT products_status_check CHECK (status IN ('draft', 'pending_review', 'active', 'rejected', 'archived'));

CREATE OR REPLACE FUNCTION public.process_product_insert() RETURNS TRIGGER AS $$
BEGIN
    IF NOT public.is_admin() THEN
        IF NEW.status NOT IN ('draft', 'pending_review') THEN
            RAISE EXCEPTION 'Unauthorized: Sellers cannot insert products with status %', NEW.status;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS protect_product_insert ON public.products;
CREATE TRIGGER protect_product_insert BEFORE INSERT ON public.products FOR EACH ROW EXECUTE PROCEDURE public.process_product_insert();

CREATE OR REPLACE FUNCTION public.process_product_update() RETURNS TRIGGER AS $$
BEGIN
    IF NOT public.is_admin() THEN
        -- Force active edit to pending_review, preventing bypass
        IF OLD.status = 'active' THEN
            NEW.status = 'pending_review';
        ELSIF NEW.status NOT IN ('draft', 'pending_review') THEN
            RAISE EXCEPTION 'Unauthorized: Sellers cannot set product status to %', NEW.status;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS downgrade_active_product_on_edit ON public.products;
CREATE TRIGGER downgrade_active_product_on_edit BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE PROCEDURE public.process_product_update();


ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access for products" ON public.products;
DROP POLICY IF EXISTS "Sellers can manage their own products" ON public.products;
DROP POLICY IF EXISTS "Sellers can view own products" ON public.products;
DROP POLICY IF EXISTS "Sellers can insert own products" ON public.products;
DROP POLICY IF EXISTS "Sellers can update own products" ON public.products;
DROP POLICY IF EXISTS "Sellers can delete own products" ON public.products;

CREATE POLICY "Public read access for products" ON public.products FOR SELECT
USING (status = 'active' AND (store_id IS NULL OR store_id IN (SELECT id FROM public.stores WHERE status = 'approved')));

CREATE POLICY "Sellers can view own products" ON public.products FOR SELECT
USING (store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid()) AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller'));

CREATE POLICY "Sellers can insert own products" ON public.products FOR INSERT
WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid()) AND status IN ('draft', 'pending_review') AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller'));

CREATE POLICY "Sellers can update own products" ON public.products FOR UPDATE
USING (store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid()) AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller'))
WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid()) AND status IN ('draft', 'pending_review'));


-- ------------------------------------------------------------------------------
-- 6. PRODUCT RELATED ENTITIES: Strict Re-parenting & Access Prevention
-- ------------------------------------------------------------------------------
-- Product Images
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Sellers can view images for own products" ON public.product_images;
DROP POLICY IF EXISTS "Sellers can insert images for own products" ON public.product_images;
DROP POLICY IF EXISTS "Sellers can update images for own products" ON public.product_images;
DROP POLICY IF EXISTS "Sellers can delete images for own products" ON public.product_images;

CREATE POLICY "Sellers can view images for own products" ON public.product_images FOR SELECT USING (product_id IN (SELECT id FROM public.products WHERE store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid())) AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller'));
CREATE POLICY "Sellers can insert images for own products" ON public.product_images FOR INSERT WITH CHECK (product_id IN (SELECT id FROM public.products WHERE store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid())) AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller'));
CREATE POLICY "Sellers can update images for own products" ON public.product_images FOR UPDATE USING (product_id IN (SELECT id FROM public.products WHERE store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid())) AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller')) WITH CHECK (product_id IN (SELECT id FROM public.products WHERE store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid())));
CREATE POLICY "Sellers can delete images for own products" ON public.product_images FOR DELETE USING (product_id IN (SELECT id FROM public.products WHERE store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid())) AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller'));

-- Product Options
ALTER TABLE public.product_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Sellers can view options for own products" ON public.product_options;
DROP POLICY IF EXISTS "Sellers can insert options for own products" ON public.product_options;
DROP POLICY IF EXISTS "Sellers can update options for own products" ON public.product_options;
DROP POLICY IF EXISTS "Sellers can delete options for own products" ON public.product_options;

CREATE POLICY "Sellers can view options for own products" ON public.product_options FOR SELECT USING (product_id IN (SELECT id FROM public.products WHERE store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid())) AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller'));
CREATE POLICY "Sellers can insert options for own products" ON public.product_options FOR INSERT WITH CHECK (product_id IN (SELECT id FROM public.products WHERE store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid())) AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller'));
CREATE POLICY "Sellers can update options for own products" ON public.product_options FOR UPDATE USING (product_id IN (SELECT id FROM public.products WHERE store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid())) AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller')) WITH CHECK (product_id IN (SELECT id FROM public.products WHERE store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid())));
CREATE POLICY "Sellers can delete options for own products" ON public.product_options FOR DELETE USING (product_id IN (SELECT id FROM public.products WHERE store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid())) AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller'));

-- Product Option Values
ALTER TABLE public.product_option_values ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Sellers can view option values for own products" ON public.product_option_values;
DROP POLICY IF EXISTS "Sellers can insert option values for own products" ON public.product_option_values;
DROP POLICY IF EXISTS "Sellers can update option values for own products" ON public.product_option_values;
DROP POLICY IF EXISTS "Sellers can delete option values for own products" ON public.product_option_values;

CREATE POLICY "Sellers can view option values for own products" ON public.product_option_values FOR SELECT USING (option_id IN (SELECT id FROM public.product_options WHERE product_id IN (SELECT id FROM public.products WHERE store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid()))) AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller'));
CREATE POLICY "Sellers can insert option values for own products" ON public.product_option_values FOR INSERT WITH CHECK (option_id IN (SELECT id FROM public.product_options WHERE product_id IN (SELECT id FROM public.products WHERE store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid()))) AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller'));
CREATE POLICY "Sellers can update option values for own products" ON public.product_option_values FOR UPDATE USING (option_id IN (SELECT id FROM public.product_options WHERE product_id IN (SELECT id FROM public.products WHERE store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid()))) AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller')) WITH CHECK (option_id IN (SELECT id FROM public.product_options WHERE product_id IN (SELECT id FROM public.products WHERE store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid()))));
CREATE POLICY "Sellers can delete option values for own products" ON public.product_option_values FOR DELETE USING (option_id IN (SELECT id FROM public.product_options WHERE product_id IN (SELECT id FROM public.products WHERE store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid()))) AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller'));

-- Product Variants
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Sellers can view variants for own products" ON public.product_variants;
DROP POLICY IF EXISTS "Sellers can insert variants for own products" ON public.product_variants;
DROP POLICY IF EXISTS "Sellers can update variants for own products" ON public.product_variants;
DROP POLICY IF EXISTS "Sellers can delete variants for own products" ON public.product_variants;

CREATE POLICY "Sellers can view variants for own products" ON public.product_variants FOR SELECT USING (product_id IN (SELECT id FROM public.products WHERE store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid())) AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller'));
CREATE POLICY "Sellers can insert variants for own products" ON public.product_variants FOR INSERT WITH CHECK (product_id IN (SELECT id FROM public.products WHERE store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid())) AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller'));
CREATE POLICY "Sellers can update variants for own products" ON public.product_variants FOR UPDATE USING (product_id IN (SELECT id FROM public.products WHERE store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid())) AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller')) WITH CHECK (product_id IN (SELECT id FROM public.products WHERE store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid())));
CREATE POLICY "Sellers can delete variants for own products" ON public.product_variants FOR DELETE USING (product_id IN (SELECT id FROM public.products WHERE store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid())) AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller'));


-- ------------------------------------------------------------------------------
-- 7. ORDER ITEMS & SECURITY
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'store_id') THEN
        ALTER TABLE public.order_items ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE RESTRICT;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_order_items_store_id ON public.order_items(store_id);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Sellers can view own order items" ON public.order_items;
CREATE POLICY "Sellers can view own order items" ON public.order_items FOR SELECT 
USING (store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid()) AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'seller'));

-- Enforce order_items.store_id securely on the backend
CREATE OR REPLACE FUNCTION public.set_order_item_store_id() RETURNS TRIGGER AS $$
DECLARE
    v_store_id UUID;
BEGIN
    IF NEW.product_id IS NULL THEN
        -- Strictly reject missing product ID during INSERT.
        RAISE EXCEPTION 'product_id cannot be null for a new order item.';
    END IF;

    SELECT store_id INTO v_store_id FROM public.products WHERE id = NEW.product_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product % does not exist.', NEW.product_id;
    END IF;
    
    NEW.store_id = v_store_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS enforce_order_item_store_id ON public.order_items;
CREATE TRIGGER enforce_order_item_store_id
BEFORE INSERT ON public.order_items
FOR EACH ROW EXECUTE PROCEDURE public.set_order_item_store_id();

COMMIT;
