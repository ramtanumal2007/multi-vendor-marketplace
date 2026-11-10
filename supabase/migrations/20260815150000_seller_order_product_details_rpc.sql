-- ==============================================================================
-- MIGRATION: SECURE RPC FOR SELLER ORDER PRODUCT DETAILS DRAWER
-- Function: public.get_seller_order_product_details(p_order_item_id UUID)
-- Resolves seller store ownership, live product inventory, dynamic store name,
-- ordered quantity vs current stock, historical snapshot fallback, and zero customer PII.
-- ==============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.get_seller_order_product_details(UUID);

CREATE OR REPLACE FUNCTION public.get_seller_order_product_details(p_order_item_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_seller_id UUID;
    v_seller_store_id UUID;
    v_seller_store_name TEXT;
    v_item RECORD;
    v_prod RECORD;
    v_cat_name TEXT;
    v_image_url TEXT;
BEGIN
    -- 1. Identify currently authenticated Seller
    v_seller_id := auth.uid();
    IF v_seller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized seller session');
    END IF;

    -- 2. Resolve Seller's primary store from public.stores
    SELECT s.id, s.name INTO v_seller_store_id, v_seller_store_name
    FROM public.stores s
    WHERE s.seller_id = v_seller_id
    LIMIT 1;

    -- 3. Fetch order item and verify store ownership
    SELECT 
        oi.id,
        oi.order_id,
        oi.product_id,
        oi.store_id,
        oi.title,
        oi.sku,
        oi.order_item_code,
        oi.quantity,
        oi.unit_price,
        oi.line_total,
        o.order_number
    INTO v_item
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.id = p_order_item_id
      AND (
          oi.store_id IN (SELECT s.id FROM public.stores s WHERE s.seller_id = v_seller_id)
          OR oi.product_id IN (
              SELECT p.id FROM public.products p 
              WHERE p.store_id IN (SELECT s.id FROM public.stores s WHERE s.seller_id = v_seller_id)
          )
      );

    IF v_item.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Order item not found or does not belong to seller store'
        );
    END IF;

    -- If store name was not resolved via seller_id, resolve it via order_item.store_id
    IF v_seller_store_name IS NULL AND v_item.store_id IS NOT NULL THEN
        SELECT s.name INTO v_seller_store_name
        FROM public.stores s
        WHERE s.id = v_item.store_id;
    END IF;

    -- 4. Fetch live product inventory details if product still exists
    IF v_item.product_id IS NOT NULL THEN
        SELECT 
            p.id,
            p.title,
            p.sku,
            p.price,
            p.stock_quantity,
            p.status,
            p.description,
            p.category_id,
            p.store_id
        INTO v_prod
        FROM public.products p
        WHERE p.id = v_item.product_id;
    END IF;

    -- Fetch category name if category_id exists
    IF v_prod.category_id IS NOT NULL THEN
        SELECT c.name INTO v_cat_name
        FROM public.categories c
        WHERE c.id = v_prod.category_id;
    END IF;

    -- Fetch primary product image if available
    IF v_item.product_id IS NOT NULL THEN
        SELECT pi.image_url INTO v_image_url
        FROM public.product_images pi
        WHERE pi.product_id = v_item.product_id
        ORDER BY pi.sort_order ASC, pi.id ASC
        LIMIT 1;
    END IF;

    -- 5. Construct secure result JSON (Zero Customer PII)
    RETURN jsonb_build_object(
        'success', true,
        'product_exists', (v_prod.id IS NOT NULL),
        'order_item_id', v_item.id,
        'order_item_code', COALESCE(v_item.order_item_code, 'OI-ITEM'),
        'order_number', COALESCE(v_item.order_number, 'ORD-ORDER'),
        'ordered_quantity', v_item.quantity,
        'unit_price', v_item.unit_price,
        'line_total', v_item.line_total,
        'product_id', COALESCE(v_prod.id, v_item.product_id),
        'product_name', COALESCE(v_prod.title, v_item.title),
        'sku', COALESCE(v_prod.sku, v_item.sku, 'N/A'),
        'category_name', COALESCE(v_cat_name, 'General'),
        'store_id', COALESCE(v_prod.store_id, v_item.store_id, v_seller_store_id),
        'store_name', COALESCE(v_seller_store_name, 'Seller Store'),
        'current_stock', v_prod.stock_quantity,
        'status', COALESCE(v_prod.status, 'unavailable'),
        'is_active', (v_prod.status = 'active'),
        'image_url', v_image_url,
        'description', v_prod.description
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_seller_order_product_details(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_seller_order_product_details(UUID) TO authenticated;

COMMIT;
