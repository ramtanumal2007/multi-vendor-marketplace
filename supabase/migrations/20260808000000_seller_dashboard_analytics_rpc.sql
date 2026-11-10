-- ==============================================================================
-- PHASE 1 SPRINT 1: SELLER DASHBOARD PRODUCTION COMPLETION & NOTIFICATIONS MIGRATION
-- DO NOT EXECUTE AUTOMATICALLY. Run manually in Supabase SQL Editor if required.
-- ==============================================================================

BEGIN;

-- 1. GET SELLER CERTIFICATE (Reads existing certificate created during approval only)
CREATE OR REPLACE FUNCTION public.get_seller_certificate(p_seller_id UUID)
RETURNS TABLE (
    certificate_number TEXT,
    verification_id TEXT,
    issue_date TIMESTAMPTZ,
    status TEXT,
    issued_by TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.certificate_number,
        c.verification_id,
        c.issue_date,
        c.status,
        c.issued_by
    FROM public.seller_certificate_registry c
    WHERE c.seller_id = p_seller_id
    ORDER BY c.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_seller_certificate(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_seller_certificate(UUID) TO authenticated;

-- 2. DEDICATED ANALYTICS RPCs

-- A. Dashboard Summary Overall
CREATE OR REPLACE FUNCTION public.get_dashboard_summary(p_seller_id UUID)
RETURNS TABLE (
    total_revenue NUMERIC,
    total_orders INT,
    conversion_rate NUMERIC,
    pending_payout NUMERIC,
    completed_payouts INT
) AS $$
DECLARE
    v_store_ids UUID[];
BEGIN
    SELECT ARRAY_AGG(id) INTO v_store_ids FROM public.stores WHERE seller_id = p_seller_id;

    IF v_store_ids IS NULL OR ARRAY_LENGTH(v_store_ids, 1) = 0 THEN
        RETURN QUERY SELECT 0::NUMERIC, 0::INT, 0.0::NUMERIC, 0::NUMERIC, 0::INT;
        RETURN;
    END IF;

    RETURN QUERY
    WITH seller_items AS (
        SELECT oi.order_id, oi.line_total, o.payment_status, o.fulfillment_status
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        WHERE oi.store_id = ANY(v_store_ids)
    )
    SELECT 
        COALESCE(SUM(line_total), 0)::NUMERIC AS total_revenue,
        COUNT(DISTINCT order_id)::INT AS total_orders,
        0.0::NUMERIC AS conversion_rate, -- Prepared for future tracking table
        COALESCE(SUM(CASE WHEN payment_status = 'paid' AND fulfillment_status IN ('pending', 'processing', 'shipped') THEN line_total ELSE 0 END), 0)::NUMERIC AS pending_payout,
        COUNT(DISTINCT CASE WHEN fulfillment_status = 'delivered' THEN order_id END)::INT AS completed_payouts
    FROM seller_items;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_summary(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(UUID) TO authenticated;

-- B. Today Stats Snapshot
CREATE OR REPLACE FUNCTION public.get_today_stats(p_seller_id UUID)
RETURNS TABLE (
    today_sales NUMERIC,
    today_orders INT,
    today_visitors INT,
    pending_shipments INT
) AS $$
DECLARE
    v_store_ids UUID[];
BEGIN
    SELECT ARRAY_AGG(id) INTO v_store_ids FROM public.stores WHERE seller_id = p_seller_id;

    IF v_store_ids IS NULL OR ARRAY_LENGTH(v_store_ids, 1) = 0 THEN
        RETURN QUERY SELECT 0::NUMERIC, 0::INT, 0::INT, 0::INT;
        RETURN;
    END IF;

    RETURN QUERY
    WITH seller_items AS (
        SELECT oi.order_id, oi.line_total, o.created_at, o.fulfillment_status
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        WHERE oi.store_id = ANY(v_store_ids)
    )
    SELECT
        COALESCE(SUM(CASE WHEN DATE(created_at) = CURRENT_DATE THEN line_total ELSE 0 END), 0)::NUMERIC AS today_sales,
        COUNT(DISTINCT CASE WHEN DATE(created_at) = CURRENT_DATE THEN order_id END)::INT AS today_orders,
        0::INT AS today_visitors, -- Prepared for future tracking table
        COUNT(DISTINCT CASE WHEN fulfillment_status IN ('pending', 'processing') THEN order_id END)::INT AS pending_shipments
    FROM seller_items;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_today_stats(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_today_stats(UUID) TO authenticated;

-- C. Weekly Stats
CREATE OR REPLACE FUNCTION public.get_weekly_stats(p_seller_id UUID)
RETURNS TABLE (
    weekly_revenue NUMERIC,
    weekly_orders INT,
    weekly_views INT
) AS $$
DECLARE
    v_store_ids UUID[];
BEGIN
    SELECT ARRAY_AGG(id) INTO v_store_ids FROM public.stores WHERE seller_id = p_seller_id;

    IF v_store_ids IS NULL OR ARRAY_LENGTH(v_store_ids, 1) = 0 THEN
        RETURN QUERY SELECT 0::NUMERIC, 0::INT, 0::INT;
        RETURN;
    END IF;

    RETURN QUERY
    WITH seller_items AS (
        SELECT oi.order_id, oi.line_total, o.created_at
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        WHERE oi.store_id = ANY(v_store_ids)
        AND o.created_at >= (NOW() - INTERVAL '7 days')
    )
    SELECT
        COALESCE(SUM(line_total), 0)::NUMERIC AS weekly_revenue,
        COUNT(DISTINCT order_id)::INT AS weekly_orders,
        0::INT AS weekly_views -- Prepared for future tracking table
    FROM seller_items;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_weekly_stats(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_weekly_stats(UUID) TO authenticated;

-- D. Monthly Stats
CREATE OR REPLACE FUNCTION public.get_monthly_stats(p_seller_id UUID)
RETURNS TABLE (
    monthly_revenue NUMERIC,
    monthly_orders INT,
    monthly_views INT
) AS $$
DECLARE
    v_store_ids UUID[];
BEGIN
    SELECT ARRAY_AGG(id) INTO v_store_ids FROM public.stores WHERE seller_id = p_seller_id;

    IF v_store_ids IS NULL OR ARRAY_LENGTH(v_store_ids, 1) = 0 THEN
        RETURN QUERY SELECT 0::NUMERIC, 0::INT, 0::INT;
        RETURN;
    END IF;

    RETURN QUERY
    WITH seller_items AS (
        SELECT oi.order_id, oi.line_total, o.created_at
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        WHERE oi.store_id = ANY(v_store_ids)
        AND o.created_at >= (NOW() - INTERVAL '30 days')
    )
    SELECT
        COALESCE(SUM(line_total), 0)::NUMERIC AS monthly_revenue,
        COUNT(DISTINCT order_id)::INT AS monthly_orders,
        0::INT AS monthly_views -- Prepared for future tracking table
    FROM seller_items;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_monthly_stats(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_monthly_stats(UUID) TO authenticated;


-- 3. SELLER NOTIFICATION BACKEND ARCHITECTURE & RPCs

-- Unread count RPC
CREATE OR REPLACE FUNCTION public.get_seller_unread_notification_count(p_seller_id UUID)
RETURNS INT AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::INT 
        FROM public.seller_notifications 
        WHERE seller_id = p_seller_id AND is_read = FALSE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_seller_unread_notification_count(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_seller_unread_notification_count(UUID) TO authenticated;

-- Mark notifications as read RPC (handles single array or all if NULL/empty)
CREATE OR REPLACE FUNCTION public.mark_seller_notifications_read(
    p_notification_ids UUID[] DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    IF p_notification_ids IS NULL OR ARRAY_LENGTH(p_notification_ids, 1) IS NULL THEN
        UPDATE public.seller_notifications
        SET is_read = TRUE
        WHERE seller_id = auth.uid() AND is_read = FALSE;
    ELSE
        UPDATE public.seller_notifications
        SET is_read = TRUE
        WHERE seller_id = auth.uid() AND id = ANY(p_notification_ids);
    END IF;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.mark_seller_notifications_read(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_seller_notifications_read(UUID[]) TO authenticated;

-- Admin Broadcast helper RPC for future admin functionality
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

    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.send_seller_notification_broadcast(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_seller_notification_broadcast(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- 4. SELLER ACHIEVEMENTS AUTO-UNLOCK CHECKER RPC
CREATE OR REPLACE FUNCTION public.check_and_unlock_seller_achievements(p_seller_id UUID)
RETURNS VOID AS $$
DECLARE
    v_store_id UUID;
    v_product_count INT := 0;
    v_plan TEXT;
    v_ach_store_approved UUID;
    v_ach_first_product UUID;
    v_ach_catalog_expander UUID;
    v_ach_pro_member UUID;
BEGIN
    SELECT id, membership_plan INTO v_store_id, v_plan FROM public.seller_profiles WHERE id = p_seller_id;
    
    SELECT COUNT(*)::INT INTO v_product_count 
    FROM public.products p
    JOIN public.stores s ON s.id = p.store_id
    WHERE s.seller_id = p_seller_id;

    SELECT id INTO v_ach_store_approved FROM public.seller_achievements WHERE code = 'STORE_APPROVED';
    SELECT id INTO v_ach_first_product FROM public.seller_achievements WHERE code = 'FIRST_PRODUCT';
    SELECT id INTO v_ach_catalog_expander FROM public.seller_achievements WHERE code = 'CATALOG_EXPANDER';
    SELECT id INTO v_ach_pro_member FROM public.seller_achievements WHERE code = 'PRO_MEMBER';

    -- Unlock STORE_APPROVED
    IF v_ach_store_approved IS NOT NULL THEN
        INSERT INTO public.seller_unlocked_achievements (seller_id, achievement_id)
        VALUES (p_seller_id, v_ach_store_approved) ON CONFLICT DO NOTHING;
    END IF;

    -- Unlock FIRST_PRODUCT
    IF v_product_count >= 1 AND v_ach_first_product IS NOT NULL THEN
        INSERT INTO public.seller_unlocked_achievements (seller_id, achievement_id)
        VALUES (p_seller_id, v_ach_first_product) ON CONFLICT DO NOTHING;
    END IF;

    -- Unlock CATALOG_EXPANDER
    IF v_product_count >= 5 AND v_ach_catalog_expander IS NOT NULL THEN
        INSERT INTO public.seller_unlocked_achievements (seller_id, achievement_id)
        VALUES (p_seller_id, v_ach_catalog_expander) ON CONFLICT DO NOTHING;
    END IF;

    -- Unlock PRO_MEMBER
    IF v_plan IN ('PRO', 'BUSINESS') AND v_ach_pro_member IS NOT NULL THEN
        INSERT INTO public.seller_unlocked_achievements (seller_id, achievement_id)
        VALUES (p_seller_id, v_ach_pro_member) ON CONFLICT DO NOTHING;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.check_and_unlock_seller_achievements(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_and_unlock_seller_achievements(UUID) TO authenticated;

COMMIT;
