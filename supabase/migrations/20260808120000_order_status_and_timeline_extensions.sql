-- ==============================================================================
-- PHASE 1 SPRINT 4: ORDER STATUS EXTENSIONS & PROFILES STATUS MIGRATION
-- DO NOT EXECUTE AUTOMATICALLY. Run manually in Supabase SQL Editor if needed.
-- ==============================================================================

BEGIN;

-- 1. ADD ACCOUNT STATUS TO PROFILES TABLE FOR ADMIN CUSTOMER MANAGEMENT
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'inactive'));

-- 2. ADD INTERNAL STATUS TO ORDERS TABLE FOR MARKETPLACE WORKFLOW
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS internal_status TEXT DEFAULT 'ORDERED';

-- 3. RLS POLICIES FOR ORDER TIMELINE TABLE
ALTER TABLE public.order_timeline ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public or Users view order timeline" ON public.order_timeline;
DROP POLICY IF EXISTS "Users view own order timeline" ON public.order_timeline;
DROP POLICY IF EXISTS "Sellers view own order timeline" ON public.order_timeline;
DROP POLICY IF EXISTS "Sellers insert order timeline" ON public.order_timeline;
DROP POLICY IF EXISTS "Admin full access order timeline" ON public.order_timeline;

-- Customers can view timeline for their orders
CREATE POLICY "Users view own order timeline" ON public.order_timeline
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.orders 
    WHERE orders.id = order_timeline.order_id 
    AND orders.user_id = auth.uid()
  )
);

-- Sellers can view timeline for orders containing their products
CREATE POLICY "Sellers view own order timeline" ON public.order_timeline
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.order_items 
    JOIN public.stores ON stores.id = order_items.store_id
    WHERE order_items.order_id = order_timeline.order_id 
    AND stores.seller_id = auth.uid()
  )
);

-- Sellers can insert timeline updates for their orders
CREATE POLICY "Sellers insert order timeline" ON public.order_timeline
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.order_items 
    JOIN public.stores ON stores.id = order_items.store_id
    WHERE order_items.order_id = order_timeline.order_id 
    AND stores.seller_id = auth.uid()
  )
);

-- Admin full access to order timeline
CREATE POLICY "Admin full access order timeline" ON public.order_timeline
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

COMMIT;
