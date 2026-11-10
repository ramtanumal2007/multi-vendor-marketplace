-- ==============================================================================
-- PHASE 1 SPRINT 4/5: ORDER VISIBILITY, SELLER CONTROL & ADMIN OVERRIDE RLS
-- ==============================================================================

BEGIN;

-- 1. ADD INTERNAL STATUS TO ORDERS TABLE IF NOT EXISTS
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS internal_status TEXT DEFAULT 'ORDERED';

-- 2. CREATE FUNCTION & TRIGGER TO ENFORCE SELLER STATUS TRANSITIONS
CREATE OR REPLACE FUNCTION public.enforce_order_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- 1. Admin users are completely unrestricted
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- 2. If status is unchanged, allow update (e.g. shipping address, payment status)
  IF OLD.internal_status IS NOT DISTINCT FROM NEW.internal_status THEN
    RETURN NEW;
  END IF;

  -- 3. Validate seller allowed transitions:
  -- ORDERED -> CONFIRMED
  -- CONFIRMED -> READY TO DISPATCH
  IF (OLD.internal_status = 'ORDERED' AND NEW.internal_status = 'CONFIRMED') OR
     (OLD.internal_status = 'CONFIRMED' AND NEW.internal_status = 'READY TO DISPATCH') THEN
    RETURN NEW;
  ELSE
    RAISE EXCEPTION 'Unauthorized: Seller status transition from % to % is not allowed.', OLD.internal_status, NEW.internal_status;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_enforce_order_status_transition ON public.orders;
CREATE TRIGGER trg_enforce_order_status_transition
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_order_status_transition();

-- 3. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_timeline ENABLE ROW LEVEL SECURITY;

-- 4. POLICIES FOR PUBLIC.ORDERS
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can insert own orders" ON public.orders;
DROP POLICY IF EXISTS "Sellers can view own store orders" ON public.orders;
DROP POLICY IF EXISTS "Sellers can update own store orders for initial stages" ON public.orders;
DROP POLICY IF EXISTS "Admin full access orders" ON public.orders;

-- Customers can view their own orders
CREATE POLICY "Users can view own orders" ON public.orders
FOR SELECT USING (auth.uid() = user_id);

-- Customers can insert their own orders
CREATE POLICY "Users can insert own orders" ON public.orders
FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Sellers can view orders containing products from their stores (Full Visibility across all stages)
CREATE POLICY "Sellers can view own store orders" ON public.orders
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.order_items
    JOIN public.stores ON stores.id = order_items.store_id
    WHERE order_items.order_id = orders.id
    AND stores.seller_id = auth.uid()
  )
);

-- Sellers can update orders containing products from their stores
CREATE POLICY "Sellers can update own store orders for initial stages" ON public.orders
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.order_items
    JOIN public.stores ON stores.id = order_items.store_id
    WHERE order_items.order_id = orders.id
    AND stores.seller_id = auth.uid()
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.order_items
    JOIN public.stores ON stores.id = order_items.store_id
    WHERE order_items.order_id = orders.id
    AND stores.seller_id = auth.uid()
  )
);

-- Admin full access to all orders
CREATE POLICY "Admin full access orders" ON public.orders
FOR ALL USING (public.is_admin());


-- 5. POLICIES FOR PUBLIC.ORDER_ITEMS
DROP POLICY IF EXISTS "Users can view own order items" ON public.order_items;
DROP POLICY IF EXISTS "Users can insert own order items" ON public.order_items;
DROP POLICY IF EXISTS "Sellers can view own order items" ON public.order_items;
DROP POLICY IF EXISTS "Admin full access order items" ON public.order_items;

CREATE POLICY "Users can view own order items" ON public.order_items
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.orders WHERE id = order_items.order_id AND user_id = auth.uid())
);

CREATE POLICY "Users can insert own order items" ON public.order_items
FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.orders WHERE id = order_items.order_id AND user_id = auth.uid())
);

CREATE POLICY "Sellers can view own order items" ON public.order_items
FOR SELECT USING (
  store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid())
);

CREATE POLICY "Admin full access order items" ON public.order_items
FOR ALL USING (public.is_admin());


-- 6. POLICIES FOR PUBLIC.ORDER_TIMELINE
DROP POLICY IF EXISTS "Public or Users view order timeline" ON public.order_timeline;
DROP POLICY IF EXISTS "Users view own order timeline" ON public.order_timeline;
DROP POLICY IF EXISTS "Sellers view own order timeline" ON public.order_timeline;
DROP POLICY IF EXISTS "Sellers insert order timeline" ON public.order_timeline;
DROP POLICY IF EXISTS "Admin full access order timeline" ON public.order_timeline;

CREATE POLICY "Users view own order timeline" ON public.order_timeline
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.orders 
    WHERE orders.id = order_timeline.order_id 
    AND orders.user_id = auth.uid()
  )
);

CREATE POLICY "Sellers view own order timeline" ON public.order_timeline
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.order_items 
    JOIN public.stores ON stores.id = order_items.store_id
    WHERE order_items.order_id = order_timeline.order_id 
    AND stores.seller_id = auth.uid()
  )
);

CREATE POLICY "Sellers insert order timeline" ON public.order_timeline
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.order_items 
    JOIN public.stores ON stores.id = order_items.store_id
    WHERE order_items.order_id = order_timeline.order_id 
    AND stores.seller_id = auth.uid()
  )
);

CREATE POLICY "Admin full access order timeline" ON public.order_timeline
FOR ALL USING (public.is_admin());

COMMIT;
