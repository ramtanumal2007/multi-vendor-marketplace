-- ==============================================================================
-- FINAL SELLER + ADMIN ORDER CONTROL & TIMELINE SECURITY MIGRATION
-- ==============================================================================

BEGIN;

-- 1. Ensure internal_status column exists on public.orders with default 'ORDERED'
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS internal_status TEXT DEFAULT 'ORDERED';

-- 2. SECURITY DEFINER HELPER FOR IS_ADMIN
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS BOOLEAN AS $$
BEGIN
  IF current_setting('role', true) = 'service_role' OR auth.role() = 'service_role' THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. SECURITY DEFINER HELPER TO CHECK IF SELLER OWNS AN ORDER (PREVENTS RLS RECURSION)
CREATE OR REPLACE FUNCTION public.seller_owns_order(p_order_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.order_items oi
    JOIN public.stores s ON s.id = oi.store_id
    WHERE oi.order_id = p_order_id
    AND s.seller_id = p_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. AUTOMATIC INITIAL ORDERED TIMELINE EVENT ON ORDER CREATION
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

-- 5. TRIGGER TO ENFORCE SELLER STATUS TRANSITIONS ON PUBLIC.ORDERS
CREATE OR REPLACE FUNCTION public.enforce_order_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  old_status TEXT;
  new_status TEXT;
BEGIN
  -- 1. Admin users are completely unrestricted
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  old_status := COALESCE(OLD.internal_status, 'ORDERED');
  new_status := COALESCE(NEW.internal_status, 'ORDERED');

  -- 2. If status is unchanged, allow update (e.g. payment_status, shipping_address)
  IF old_status = new_status THEN
    RETURN NEW;
  END IF;

  -- 3. Validate seller allowed status transitions ONLY:
  -- ORDERED -> CONFIRMED
  -- CONFIRMED -> READY TO DISPATCH
  IF (old_status = 'ORDERED' AND new_status = 'CONFIRMED') OR
     (old_status = 'CONFIRMED' AND new_status = 'READY TO DISPATCH') THEN
    RETURN NEW;
  ELSE
    RAISE EXCEPTION 'Unauthorized: Seller status transition from % to % is not allowed.', old_status, new_status;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_enforce_order_status_transition ON public.orders;
CREATE TRIGGER trg_enforce_order_status_transition
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_order_status_transition();

-- 6. TRIGGER TO ENFORCE SELLER ORDER TIMELINE INSERTIONS ON PUBLIC.ORDER_TIMELINE
CREATE OR REPLACE FUNCTION public.enforce_order_timeline_insert()
RETURNS TRIGGER AS $$
DECLARE
  current_order_status TEXT;
  target_event_status TEXT;
BEGIN
  -- Admin users are completely unrestricted
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Fetch current internal_status of the order
  SELECT COALESCE(internal_status, 'ORDERED') INTO current_order_status
  FROM public.orders
  WHERE id = NEW.order_id;

  target_event_status := COALESCE(NEW.status, 'ORDERED');

  -- Validate seller allowed timeline insertions:
  -- Seller can only insert when current order status is ORDERED, CONFIRMED, or READY TO DISPATCH
  -- AND the inserted event status is ORDERED, CONFIRMED, or READY TO DISPATCH
  IF current_order_status IN ('ORDERED', 'CONFIRMED', 'READY TO DISPATCH') AND
     target_event_status IN ('ORDERED', 'CONFIRMED', 'READY TO DISPATCH') THEN
    RETURN NEW;
  ELSE
    RAISE EXCEPTION 'Unauthorized: Seller cannot insert timeline event with status % for order currently in status %.', target_event_status, current_order_status;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_enforce_order_timeline_insert ON public.order_timeline;
CREATE TRIGGER trg_enforce_order_timeline_insert
BEFORE INSERT ON public.order_timeline
FOR EACH ROW EXECUTE FUNCTION public.enforce_order_timeline_insert();

-- 7. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_timeline ENABLE ROW LEVEL SECURITY;

-- 8. RLS POLICIES FOR PUBLIC.ORDERS
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can insert own orders" ON public.orders;
DROP POLICY IF EXISTS "Sellers can view own store orders" ON public.orders;
DROP POLICY IF EXISTS "Sellers can update own store orders for initial stages" ON public.orders;
DROP POLICY IF EXISTS "Admin full access orders" ON public.orders;

CREATE POLICY "Users can view own orders" ON public.orders
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own orders" ON public.orders
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Sellers can view own store orders" ON public.orders
FOR SELECT USING (public.seller_owns_order(id, auth.uid()));

CREATE POLICY "Sellers can update own store orders for initial stages" ON public.orders
FOR UPDATE USING (public.seller_owns_order(id, auth.uid()))
WITH CHECK (public.seller_owns_order(id, auth.uid()));

CREATE POLICY "Admin full access orders" ON public.orders
FOR ALL USING (public.is_admin());

-- 9. RLS POLICIES FOR PUBLIC.ORDER_ITEMS
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

-- 10. RLS POLICIES FOR PUBLIC.ORDER_TIMELINE
DROP POLICY IF EXISTS "Public or Users view order timeline" ON public.order_timeline;
DROP POLICY IF EXISTS "Users view own order timeline" ON public.order_timeline;
DROP POLICY IF EXISTS "Users insert own order timeline" ON public.order_timeline;
DROP POLICY IF EXISTS "Sellers view own order timeline" ON public.order_timeline;
DROP POLICY IF EXISTS "Sellers insert order timeline" ON public.order_timeline;
DROP POLICY IF EXISTS "Admin full access order timeline" ON public.order_timeline;

-- Admin: Full access
CREATE POLICY "Admin full access order timeline" ON public.order_timeline
FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Customers: SELECT only (NO INSERT)
CREATE POLICY "Users view own order timeline" ON public.order_timeline
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.orders 
    WHERE orders.id = order_timeline.order_id 
    AND orders.user_id = auth.uid()
  )
);

-- Sellers: SELECT timeline for store's orders
CREATE POLICY "Sellers view own order timeline" ON public.order_timeline
FOR SELECT USING (public.seller_owns_order(order_timeline.order_id, auth.uid()));

-- Sellers: INSERT timeline for store's orders (trigger validates status restriction)
CREATE POLICY "Sellers insert order timeline" ON public.order_timeline
FOR INSERT WITH CHECK (public.seller_owns_order(order_timeline.order_id, auth.uid()));

COMMIT;
