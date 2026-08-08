-- ==============================================================================
-- PHASE 1 SPRINT 2: NOTIFICATION SYSTEM PRODUCTION COMPLETION MIGRATION
-- DO NOT EXECUTE AUTOMATICALLY. Run manually in Supabase SQL Editor if required.
-- ==============================================================================

BEGIN;

-- 1. CUSTOMER NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.customer_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'system' CHECK (type IN ('system', 'order_confirmation', 'order_shipped', 'order_delivered', 'offer', 'coupon')),
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
    is_read BOOLEAN DEFAULT false,
    link_url TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.customer_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers can view own notifications" ON public.customer_notifications;
CREATE POLICY "Customers can view own notifications" ON public.customer_notifications 
FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Customers can update own notification read state" ON public.customer_notifications;
CREATE POLICY "Customers can update own notification read state" ON public.customer_notifications 
FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admin full access customer notifications" ON public.customer_notifications;
CREATE POLICY "Admin full access customer notifications" ON public.customer_notifications 
FOR ALL USING (public.is_admin());


-- 2. ADMIN NOTIFICATIONS HISTORY LOG TABLE
CREATE TABLE IF NOT EXISTS public.admin_notifications_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    target_audience TEXT NOT NULL CHECK (target_audience IN ('all_sellers', 'seller', 'all_customers', 'customer')),
    target_id UUID,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'system',
    priority TEXT DEFAULT 'medium',
    link_url TEXT,
    recipient_count INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.admin_notifications_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access admin_notifications_log" ON public.admin_notifications_log;
CREATE POLICY "Admin full access admin_notifications_log" ON public.admin_notifications_log 
FOR ALL USING (public.is_admin());


-- 3. CUSTOMER NOTIFICATION RPCs

-- Get customer unread count
CREATE OR REPLACE FUNCTION public.get_customer_unread_notification_count(p_user_id UUID)
RETURNS INT AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::INT 
        FROM public.customer_notifications 
        WHERE user_id = p_user_id AND is_read = FALSE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_customer_unread_notification_count(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_unread_notification_count(UUID) TO authenticated;

-- Mark customer notifications read
CREATE OR REPLACE FUNCTION public.mark_customer_notifications_read(
    p_notification_ids UUID[] DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    IF p_notification_ids IS NULL OR ARRAY_LENGTH(p_notification_ids, 1) IS NULL THEN
        UPDATE public.customer_notifications
        SET is_read = TRUE
        WHERE user_id = auth.uid() AND is_read = FALSE;
    ELSE
        UPDATE public.customer_notifications
        SET is_read = TRUE
        WHERE user_id = auth.uid() AND id = ANY(p_notification_ids);
    END IF;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.mark_customer_notifications_read(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_customer_notifications_read(UUID[]) TO authenticated;

-- Broadcast notification to all customers
CREATE OR REPLACE FUNCTION public.send_customer_notification_broadcast(
    p_title TEXT,
    p_message TEXT,
    p_type TEXT DEFAULT 'system',
    p_priority TEXT DEFAULT 'medium',
    p_link_url TEXT DEFAULT NULL,
    p_sender_id UUID DEFAULT NULL
)
RETURNS INT AS $$
DECLARE
    v_customer RECORD;
    v_count INT := 0;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Broadcast is restricted to Administrators.';
    END IF;

    FOR v_customer IN 
        SELECT id FROM public.profiles 
        WHERE role = 'customer' OR role IS NULL
    LOOP
        INSERT INTO public.customer_notifications (user_id, title, message, type, priority, link_url)
        VALUES (v_customer.id, p_title, p_message, p_type, p_priority, p_link_url);
        v_count := v_count + 1;
    END LOOP;

    INSERT INTO public.admin_notifications_log (
        sender_id, target_audience, title, message, type, priority, link_url, recipient_count
    ) VALUES (
        COALESCE(p_sender_id, auth.uid()), 'all_customers', p_title, p_message, p_type, p_priority, p_link_url, v_count
    );

    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.send_customer_notification_broadcast(TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_customer_notification_broadcast(TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated;


-- 4. UPDATE SELLER NOTIFICATION BROADCAST RPC TO LOG HISTORY
CREATE OR REPLACE FUNCTION public.send_seller_notification_broadcast(
    p_title TEXT,
    p_message TEXT,
    p_type TEXT DEFAULT 'system',
    p_priority TEXT DEFAULT 'medium',
    p_link_url TEXT DEFAULT NULL,
    p_target_plan TEXT DEFAULT NULL
)
RETURNS INT AS $$
DECLARE
    v_seller RECORD;
    v_count INT := 0;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Broadcast is restricted to Administrators.';
    END IF;

    FOR v_seller IN 
        SELECT id FROM public.seller_profiles 
        WHERE verification_status = 'approved'
        AND (p_target_plan IS NULL OR membership_plan = p_target_plan)
    LOOP
        INSERT INTO public.seller_notifications (seller_id, title, message, type, priority, link_url)
        VALUES (v_seller.id, p_title, p_message, p_type, p_priority, p_link_url);
        v_count := v_count + 1;
    END LOOP;

    INSERT INTO public.admin_notifications_log (
        sender_id, target_audience, title, message, type, priority, link_url, recipient_count
    ) VALUES (
        auth.uid(), 'all_sellers', p_title, p_message, p_type, p_priority, p_link_url, v_count
    );

    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.send_seller_notification_broadcast(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_seller_notification_broadcast(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- 5. AUTOMATED ORDER STATUS & PLACEMENT TRIGGER FOR CUSTOMER NOTIFICATIONS
CREATE OR REPLACE FUNCTION public.handle_order_notification_events()
RETURNS TRIGGER AS $$
DECLARE
    v_order_num TEXT;
BEGIN
    v_order_num := COALESCE(NEW.order_number, SUBSTRING(NEW.id::TEXT FROM 1 FOR 8));

    -- Handle INSERT (New order placed -> Order Confirmation)
    IF TG_OP = 'INSERT' THEN
        IF NEW.user_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.customer_notifications 
                WHERE user_id = NEW.user_id 
                AND type = 'order_confirmation' 
                AND (metadata->>'order_id') = NEW.id::TEXT
            ) THEN
                INSERT INTO public.customer_notifications (
                    user_id, title, message, type, priority, link_url, metadata
                ) VALUES (
                    NEW.user_id,
                    'Order Confirmed 🎉',
                    'Your order #' || v_order_num || ' has been placed successfully.',
                    'order_confirmation',
                    'high',
                    '/account/orders/' || NEW.id,
                    jsonb_build_object('order_id', NEW.id, 'order_number', v_order_num)
                );
            END IF;
        END IF;
    END IF;

    -- Handle UPDATE (fulfillment_status changes)
    IF TG_OP = 'UPDATE' THEN
        IF NEW.user_id IS NOT NULL THEN
            -- Order Shipped notification
            IF NEW.fulfillment_status = 'shipped' AND OLD.fulfillment_status IS DISTINCT FROM NEW.fulfillment_status THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.customer_notifications 
                    WHERE user_id = NEW.user_id 
                    AND type = 'order_shipped' 
                    AND (metadata->>'order_id') = NEW.id::TEXT
                ) THEN
                    INSERT INTO public.customer_notifications (
                        user_id, title, message, type, priority, link_url, metadata
                    ) VALUES (
                        NEW.user_id,
                        'Order Shipped 🚚',
                        'Your order #' || v_order_num || ' has been shipped.',
                        'order_shipped',
                        'high',
                        '/account/orders/' || NEW.id,
                        jsonb_build_object('order_id', NEW.id, 'order_number', v_order_num)
                    );
                END IF;
            END IF;

            -- Order Delivered notification
            IF NEW.fulfillment_status = 'delivered' AND OLD.fulfillment_status IS DISTINCT FROM NEW.fulfillment_status THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.customer_notifications 
                    WHERE user_id = NEW.user_id 
                    AND type = 'order_delivered' 
                    AND (metadata->>'order_id') = NEW.id::TEXT
                ) THEN
                    INSERT INTO public.customer_notifications (
                        user_id, title, message, type, priority, link_url, metadata
                    ) VALUES (
                        NEW.user_id,
                        'Order Delivered 📦',
                        'Your order #' || v_order_num || ' has been delivered.',
                        'order_delivered',
                        'high',
                        '/account/orders/' || NEW.id,
                        jsonb_build_object('order_id', NEW.id, 'order_number', v_order_num)
                    );
                END IF;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Fallback safety: do NOT fail order insert/update if notification creation fails
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_order_notification_events ON public.orders;
CREATE TRIGGER trg_order_notification_events
    AFTER INSERT OR UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_order_notification_events();

COMMIT;
