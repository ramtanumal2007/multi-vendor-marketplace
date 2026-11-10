-- ==============================================================================
-- PHASE 1 SPRINT 4/5: ORDER TIMELINE RLS & TRANSITION SECURITY TRIGGERS
-- ==============================================================================

BEGIN;

-- 1. Ensure internal_status column exists on public.orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS internal_status TEXT DEFAULT 'ORDERED';

-- 2. Ensure public.is_admin() helper is security definer
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. TRIGGER TO AUTOMATICALLY CREATE INITIAL ORDERED TIMELINE EVENT ON ORDER CREATION
CREATE OR REPLACE FUNCTION public.handle_new_order_timeline()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.order_timeline (order_id, status, note, created_by)
  VALUES (NEW.id, 'ORDERED', 'Order placed successfully', NEW.user_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_auto_create_order_timeline ON public.orders;
CREATE TRIGGER trg_auto_create_order_timeline
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.handle_new_order_timeline();

-- 4. TRIGGER TO ENFORCE SELLER STATUS TRANSITION ON ORDERS TABLE
CREATE OR REPLACE FUNCTION public.enforce_order_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Admin users are completely unrestricted
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- If status is unchanged, allow update
  IF OLD.internal_status IS NOT DISTINCT FROM NEW.internal_status THEN
    RETURN NEW;
  END IF;

  -- Validate seller allowed transitions:
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
FOR EACH ROW EXECUTE FUNCTION public.enforce_order_status_transition();

-- 5. TRIGGER TO ENFORCE SELLER ORDER TIMELINE INSERTIONS
CREATE OR REPLACE FUNCTION public.enforce_order_timeline_insert()
RETURNS TRIGGER AS $$
DECLARE
  current_order_status TEXT;
BEGIN
  -- Admin users are completely unrestricted
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Fetch current internal_status of the order
  SELECT internal_status INTO current_order_status
  FROM public.orders
  WHERE id = NEW.order_id;

  -- Validate seller allowed timeline transitions:
  -- ORDERED -> CONFIRMED
  -- CONFIRMED -> READY TO DISPATCH
  IF NEW.status = 'ORDERED' OR
     (current_order_status = 'ORDERED' AND NEW.status = 'CONFIRMED') OR
     (current_order_status = 'CONFIRMED' AND NEW.status = 'READY TO DISPATCH') THEN
    RETURN NEW;
  ELSE
    RAISE EXCEPTION 'Unauthorized: Seller cannot insert timeline event with status % for order currently in status %.', NEW.status, current_order_status;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_enforce_order_timeline_insert ON public.order_timeline;
CREATE TRIGGER trg_enforce_order_timeline_insert
BEFORE INSERT ON public.order_timeline
FOR EACH ROW EXECUTE FUNCTION public.enforce_order_timeline_insert();

-- 6. CONFIGURE RLS POLICIES FOR ORDER_TIMELINE
ALTER TABLE public.order_timeline ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public or Users view order timeline" ON public.order_timeline;
DROP POLICY IF EXISTS "Users view own order timeline" ON public.order_timeline;
DROP POLICY IF EXISTS "Users insert own order timeline" ON public.order_timeline;
DROP POLICY IF EXISTS "Sellers view own order timeline" ON public.order_timeline;
DROP POLICY IF EXISTS "Sellers insert order timeline" ON public.order_timeline;
DROP POLICY IF EXISTS "Admin full access order timeline" ON public.order_timeline;

-- Admin: Full SELECT, INSERT, UPDATE, DELETE access
CREATE POLICY "Admin full access order timeline" ON public.order_timeline
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Customers: View timeline ONLY for own orders (NO INSERT PERMISSION)
CREATE POLICY "Users view own order timeline" ON public.order_timeline
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.orders 
    WHERE orders.id = order_timeline.order_id 
    AND orders.user_id = auth.uid()
  )
);

-- Sellers: View timeline for orders containing products from their store
CREATE POLICY "Sellers view own order timeline" ON public.order_timeline
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.order_items 
    JOIN public.stores ON stores.id = order_items.store_id
    WHERE order_items.order_id = order_timeline.order_id 
    AND stores.seller_id = auth.uid()
  )
);

-- Sellers: Insert timeline event for orders containing products from their store
CREATE POLICY "Sellers insert order timeline" ON public.order_timeline
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.order_items 
    JOIN public.stores ON stores.id = order_items.store_id
    WHERE order_items.order_id = order_timeline.order_id 
    AND stores.seller_id = auth.uid()
  )
);

COMMIT;
