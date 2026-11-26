-- ==============================================================================
-- MIGRATION: 20261127020000_admin_financial_controls_and_charge_toggles.sql
-- ENVIRONMENT: STAGING ONLY (Supabase Ref: ftraeimnlcyzocsoutgn)
-- DESCRIPTION:
--   1. Adds ON/OFF toggles and fixed platform charges to marketplace_fee_rules:
--      - gst_enabled (BOOLEAN DEFAULT true)
--      - tcs_enabled (BOOLEAN DEFAULT true)
--      - tds_enabled (BOOLEAN DEFAULT true)
--      - fixed_platform_fee_paise (BIGINT DEFAULT 0)
--      - fixed_platform_fee_enabled (BOOLEAN DEFAULT false)
--   2. Adds fixed_platform_fee_paise & other_platform_charges_paise to seller_settlements
--      to preserve historical order financial snapshot immutability.
--   3. Upgrades admin_update_membership_plan RPC to persist toggles & audit diffs.
--   4. Creates admin_update_financial_charge_toggles RPC for dedicated charge control.
--   5. Upgrades sync_seller_order_settlements_atomic to respect charge ON/OFF states.
-- ==============================================================================

BEGIN;

-- 1. UPGRADE MARKETPLACE_FEE_RULES TABLE
ALTER TABLE public.marketplace_fee_rules
ADD COLUMN IF NOT EXISTS gst_enabled BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS tcs_enabled BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS tds_enabled BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS fixed_platform_fee_paise BIGINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS fixed_platform_fee_enabled BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);

-- 2. UPGRADE SELLER_SETTLEMENTS TABLE FOR HISTORICAL IMMUTABILITY
ALTER TABLE public.seller_settlements
ADD COLUMN IF NOT EXISTS fixed_platform_fee_paise BIGINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS other_platform_charges_paise BIGINT NOT NULL DEFAULT 0;

-- 3. ENSURE FINANCE_AUDIT_LOGS POLICY & COLUMNS
CREATE TABLE IF NOT EXISTS public.finance_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.profiles(id),
    action_type TEXT NOT NULL,
    target_entity TEXT NOT NULL,
    target_id UUID,
    old_values JSONB,
    new_values JSONB,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. RPC: DEDICATED ADMIN FINANCIAL CHARGE TOGGLES & RATES UPDATE
CREATE OR REPLACE FUNCTION public.admin_update_financial_charge_toggles(
    p_plan TEXT DEFAULT NULL,
    p_gst_enabled BOOLEAN DEFAULT NULL,
    p_gst_rate NUMERIC DEFAULT NULL,
    p_tcs_enabled BOOLEAN DEFAULT NULL,
    p_tcs_rate NUMERIC DEFAULT NULL,
    p_tds_enabled BOOLEAN DEFAULT NULL,
    p_tds_rate NUMERIC DEFAULT NULL,
    p_fixed_platform_fee_paise BIGINT DEFAULT NULL,
    p_fixed_platform_fee_enabled BOOLEAN DEFAULT NULL,
    p_change_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID;
    v_actor_email TEXT;
    v_plan_filter TEXT;
    v_target RECORD;
    v_old_values JSONB;
    v_new_values JSONB;
    v_updated_rows INT := 0;
BEGIN
    -- Security guard: Admin or service_role only
    IF auth.role() != 'service_role' AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only marketplace administrators can modify tax and charge rules'
        USING ERRCODE = '42501';
    END IF;

    v_actor_id := auth.uid();
    IF v_actor_id IS NOT NULL THEN
        SELECT email INTO v_actor_email FROM auth.users WHERE id = v_actor_id;
    ELSE
        v_actor_email := 'system_admin';
    END IF;

    -- Validation bounds
    IF p_gst_rate IS NOT NULL AND (p_gst_rate < 0 OR p_gst_rate > 1) THEN
        RAISE EXCEPTION 'GST rate must be between 0.00 and 1.00' USING ERRCODE = '22000';
    END IF;
    IF p_tcs_rate IS NOT NULL AND (p_tcs_rate < 0 OR p_tcs_rate > 1) THEN
        RAISE EXCEPTION 'TCS rate must be between 0.00 and 1.00' USING ERRCODE = '22000';
    END IF;
    IF p_tds_rate IS NOT NULL AND (p_tds_rate < 0 OR p_tds_rate > 1) THEN
        RAISE EXCEPTION 'TDS rate must be between 0.00 and 1.00' USING ERRCODE = '22000';
    END IF;
    IF p_fixed_platform_fee_paise IS NOT NULL AND p_fixed_platform_fee_paise < 0 THEN
        RAISE EXCEPTION 'Fixed platform fee cannot be negative' USING ERRCODE = '22000';
    END IF;

    IF p_plan IS NOT NULL AND TRIM(p_plan) != '' THEN
        v_plan_filter := UPPER(TRIM(p_plan));
    ELSE
        v_plan_filter := NULL;
    END IF;

    FOR v_target IN 
        SELECT * FROM public.marketplace_fee_rules
        WHERE (v_plan_filter IS NULL OR membership_plan = v_plan_filter)
        FOR UPDATE
    LOOP
        v_old_values := to_jsonb(v_target);

        UPDATE public.marketplace_fee_rules
        SET 
            gst_enabled = COALESCE(p_gst_enabled, v_target.gst_enabled),
            gst_rate = COALESCE(p_gst_rate, v_target.gst_rate),
            tcs_enabled = COALESCE(p_tcs_enabled, v_target.tcs_enabled),
            tcs_rate = COALESCE(p_tcs_rate, v_target.tcs_rate),
            tds_enabled = COALESCE(p_tds_enabled, v_target.tds_enabled),
            tds_rate = COALESCE(p_tds_rate, v_target.tds_rate),
            fixed_platform_fee_paise = COALESCE(p_fixed_platform_fee_paise, v_target.fixed_platform_fee_paise),
            fixed_platform_fee_enabled = COALESCE(p_fixed_platform_fee_enabled, v_target.fixed_platform_fee_enabled),
            updated_at = NOW(),
            updated_by = v_actor_id
        WHERE id = v_target.id;

        SELECT to_jsonb(t) INTO v_new_values
        FROM public.marketplace_fee_rules t
        WHERE t.id = v_target.id;

        -- Record audit entry
        INSERT INTO public.finance_audit_logs (
            actor_id,
            action_type,
            target_entity,
            target_id,
            old_values,
            new_values,
            notes,
            created_at
        ) VALUES (
            v_actor_id,
            'FINANCIAL_CHARGES_CONFIG_UPDATED',
            'marketplace_fee_rules',
            v_target.id,
            v_old_values,
            v_new_values,
            COALESCE(p_change_reason, format('Admin %s updated charge toggles for %s', v_actor_email, v_target.membership_plan)),
            NOW()
        );

        v_updated_rows := v_updated_rows + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'updated_plans_count', v_updated_rows,
        'timestamp', NOW()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_financial_charge_toggles FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_financial_charge_toggles TO authenticated, service_role;

-- 5. UPGRADE ADMIN_UPDATE_MEMBERSHIP_PLAN RPC
CREATE OR REPLACE FUNCTION public.admin_update_membership_plan(
    p_plan TEXT,
    p_display_name TEXT,
    p_description TEXT,
    p_active BOOLEAN,
    p_monthly_price NUMERIC,
    p_yearly_price NUMERIC,
    p_max_products INT,
    p_storage_limit_mb INT,
    p_admin_users_limit INT,
    p_seller_coupons_enabled BOOLEAN,
    p_bulk_csv_enabled BOOLEAN,
    p_ranking_boost_level TEXT,
    p_commission_rate NUMERIC,
    p_billing_duration TEXT,
    p_grace_period_days INT,
    p_min_payout_amount NUMERIC,
    p_escrow_hold_days INT,
    p_gst_rate NUMERIC,
    p_tcs_rate NUMERIC,
    p_tds_rate NUMERIC,
    p_original_monthly_price NUMERIC DEFAULT NULL,
    p_offer_monthly_price NUMERIC DEFAULT NULL,
    p_original_yearly_price NUMERIC DEFAULT NULL,
    p_offer_yearly_price NUMERIC DEFAULT NULL,
    p_offer_enabled BOOLEAN DEFAULT false,
    p_offer_label TEXT DEFAULT 'Special Offer',
    p_offer_badge TEXT DEFAULT 'Limited Time',
    p_offer_valid_until TIMESTAMPTZ DEFAULT NULL,
    p_gst_enabled BOOLEAN DEFAULT true,
    p_tcs_enabled BOOLEAN DEFAULT true,
    p_tds_enabled BOOLEAN DEFAULT true,
    p_fixed_platform_fee_paise BIGINT DEFAULT 0,
    p_fixed_platform_fee_enabled BOOLEAN DEFAULT false,
    p_change_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_old RECORD;
    v_actor_id UUID;
    v_target_plan TEXT;
    v_new_row RECORD;
BEGIN
    IF auth.role() != 'service_role' AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only marketplace administrators can modify membership plan rules' 
        USING ERRCODE = '42501';
    END IF;

    v_actor_id := auth.uid();
    v_target_plan := UPPER(TRIM(p_plan));

    -- Lock row
    SELECT * INTO v_old
    FROM public.marketplace_fee_rules
    WHERE membership_plan = v_target_plan
    FOR UPDATE;

    IF v_old IS NULL THEN
        RAISE EXCEPTION 'Membership plan rule for % not found', v_target_plan USING ERRCODE = 'P0002';
    END IF;

    -- Strict validation bounds
    IF p_monthly_price < 0 OR p_yearly_price < 0 THEN
        RAISE EXCEPTION 'Pricing cannot be negative' USING ERRCODE = '22000';
    END IF;
    IF p_commission_rate < 0 OR p_commission_rate > 1 THEN
        RAISE EXCEPTION 'Commission rate must be between 0.00 and 1.00 (e.g. 0.08 for 8%%)' USING ERRCODE = '22000';
    END IF;
    IF p_gst_rate < 0 OR p_gst_rate > 1 THEN
        RAISE EXCEPTION 'GST rate must be between 0.00 and 1.00' USING ERRCODE = '22000';
    END IF;
    IF p_tcs_rate < 0 OR p_tcs_rate > 1 THEN
        RAISE EXCEPTION 'TCS rate must be between 0.00 and 1.00' USING ERRCODE = '22000';
    END IF;
    IF p_tds_rate < 0 OR p_tds_rate > 1 THEN
        RAISE EXCEPTION 'TDS rate must be between 0.00 and 1.00' USING ERRCODE = '22000';
    END IF;
    IF p_min_payout_amount < 0 OR p_escrow_hold_days < 0 OR p_grace_period_days < 0 THEN
        RAISE EXCEPTION 'Payout/membership days and amounts cannot be negative' USING ERRCODE = '22000';
    END IF;
    IF p_fixed_platform_fee_paise < 0 THEN
        RAISE EXCEPTION 'Fixed platform fee cannot be negative' USING ERRCODE = '22000';
    END IF;

    UPDATE public.marketplace_fee_rules
    SET 
        display_name = COALESCE(p_display_name, display_name),
        description = COALESCE(p_description, description),
        active = COALESCE(p_active, active),
        monthly_price = p_monthly_price,
        yearly_price = p_yearly_price,
        max_products = p_max_products,
        storage_limit_mb = p_storage_limit_mb,
        admin_users_limit = p_admin_users_limit,
        seller_coupons_enabled = p_seller_coupons_enabled,
        bulk_csv_enabled = p_bulk_csv_enabled,
        ranking_boost_level = p_ranking_boost_level,
        commission_rate = p_commission_rate,
        billing_duration = p_billing_duration,
        grace_period_days = p_grace_period_days,
        min_payout_amount = p_min_payout_amount,
        escrow_hold_days = p_escrow_hold_days,
        gst_rate = p_gst_rate,
        tcs_rate = p_tcs_rate,
        tds_rate = p_tds_rate,
        original_monthly_price = p_original_monthly_price,
        offer_monthly_price = p_offer_monthly_price,
        original_yearly_price = p_original_yearly_price,
        offer_yearly_price = p_offer_yearly_price,
        offer_enabled = p_offer_enabled,
        offer_label = p_offer_label,
        offer_badge = p_offer_badge,
        offer_valid_until = p_offer_valid_until,
        gst_enabled = COALESCE(p_gst_enabled, gst_enabled),
        tcs_enabled = COALESCE(p_tcs_enabled, tcs_enabled),
        tds_enabled = COALESCE(p_tds_enabled, tds_enabled),
        fixed_platform_fee_paise = COALESCE(p_fixed_platform_fee_paise, fixed_platform_fee_paise),
        fixed_platform_fee_enabled = COALESCE(p_fixed_platform_fee_enabled, fixed_platform_fee_enabled),
        updated_at = NOW(),
        updated_by = v_actor_id
    WHERE membership_plan = v_target_plan
    RETURNING * INTO v_new_row;

    -- Record immutable audit log
    INSERT INTO public.finance_audit_logs (
        actor_id,
        action_type,
        target_entity,
        target_id,
        old_values,
        new_values,
        notes,
        created_at
    ) VALUES (
        v_actor_id,
        'MEMBERSHIP_PLAN_UPDATED',
        'marketplace_fee_rules',
        v_old.id,
        to_jsonb(v_old),
        to_jsonb(v_new_row),
        COALESCE(p_change_reason, format('Updated %s plan rules (Commission: %s%% -> %s%%)', v_target_plan, (v_old.commission_rate * 100)::TEXT, (p_commission_rate * 100)::TEXT)),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'plan', to_jsonb(v_new_row),
        'message', format('Membership plan %s updated successfully', v_target_plan)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_membership_plan FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_membership_plan TO authenticated, service_role;

-- 6. UPGRADE SYNC_SELLER_ORDER_SETTLEMENTS_ATOMIC TO RESPECT TAX & CHARGE TOGGLES
CREATE OR REPLACE FUNCTION public.sync_seller_order_settlements_atomic(p_order_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order_item RECORD;
    v_seller_id UUID;
    v_membership_plan TEXT;
    v_comm_rate NUMERIC(6, 4);
    v_gst_rate NUMERIC(6, 4);
    v_tcs_rate NUMERIC(6, 4);
    v_tds_rate NUMERIC(6, 4);
    v_hold_days INT;
    v_platform_absorbs_coupon BOOLEAN;
    v_gst_enabled BOOLEAN;
    v_tcs_enabled BOOLEAN;
    v_tds_enabled BOOLEAN;
    v_fixed_fee_paise BIGINT;
    v_fixed_fee_enabled BOOLEAN;
    
    v_effective_gst_rate NUMERIC(6, 4);
    v_effective_tcs_rate NUMERIC(6, 4);
    v_effective_tds_rate NUMERIC(6, 4);
    v_applied_fixed_fee_paise BIGINT;

    v_unit_price_paise BIGINT;
    v_gross_amount_paise BIGINT;
    v_coupon_allocated_paise BIGINT;
    v_commission_amount_paise BIGINT;
    v_gst_on_comm_paise BIGINT;
    v_tcs_paise BIGINT;
    v_tds_paise BIGINT;
    v_net_seller_payable_paise BIGINT;
    v_hold_until TIMESTAMPTZ;
    v_order_delivered_at TIMESTAMPTZ;
    v_is_cod BOOLEAN;
    v_is_cod_reconciled BOOLEAN;
    v_target_status TEXT;
    v_synced_count INT := 0;
BEGIN
    FOR v_order_item IN
        SELECT 
            oi.id AS item_id,
            oi.order_id,
            oi.product_id,
            oi.quantity,
            oi.price AS unit_price,
            oi.line_total,
            oi.order_item_code,
            o.order_number,
            o.subtotal AS order_subtotal,
            o.discount_amount AS order_discount_amount,
            o.payment_method,
            o.payment_status,
            COALESCE(oi.fulfillment_status, o.status) AS fulfillment_status,
            o.delivered_at AS order_delivered_at,
            o.updated_at AS order_updated_at,
            s.seller_id AS store_seller_id,
            sp.membership_plan AS seller_membership_plan,
            sp.membership_status AS seller_membership_status,
            sp.membership_expires_at AS seller_membership_expires_at,
            p.title,
            p.sku
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        LEFT JOIN public.stores s ON s.id = oi.store_id
        LEFT JOIN public.seller_profiles sp ON sp.id = s.seller_id
        LEFT JOIN public.products p ON p.id = oi.product_id
        WHERE s.seller_id IS NOT NULL
          AND (p_order_id IS NULL OR o.id = p_order_id)
    LOOP
        v_seller_id := v_order_item.store_seller_id;
        
        -- Authoritative Membership Plan Resolution with Grace Period consistency
        IF v_order_item.seller_membership_plan IS NULL THEN
            v_membership_plan := 'BASIC';
        ELSIF v_order_item.seller_membership_expires_at IS NOT NULL 
              AND NOW() > v_order_item.seller_membership_expires_at 
              AND NOW() > (v_order_item.seller_membership_expires_at + INTERVAL '7 days') THEN
            -- Beyond 7-day grace period: downgrade to BASIC
            v_membership_plan := 'BASIC';
        ELSE
            -- Active OR within 7-day grace period: retain configured plan
            v_membership_plan := v_order_item.seller_membership_plan;
        END IF;

        -- Authoritative fee rules lookup
        SELECT 
            COALESCE(commission_rate, 0.1200),
            COALESCE(gst_rate, 0.1800),
            COALESCE(tcs_rate, 0.0050),
            COALESCE(tds_rate, 0.0010),
            COALESCE(escrow_hold_days, 7),
            COALESCE(platform_absorbs_coupons, true),
            COALESCE(gst_enabled, true),
            COALESCE(tcs_enabled, true),
            COALESCE(tds_enabled, true),
            COALESCE(fixed_platform_fee_paise, 0),
            COALESCE(fixed_platform_fee_enabled, false)
        INTO 
            v_comm_rate,
            v_gst_rate,
            v_tcs_rate,
            v_tds_rate,
            v_hold_days,
            v_platform_absorbs_coupon,
            v_gst_enabled,
            v_tcs_enabled,
            v_tds_enabled,
            v_fixed_fee_paise,
            v_fixed_fee_enabled
        FROM public.marketplace_fee_rules
        WHERE membership_plan = v_membership_plan
        LIMIT 1;

        -- Fallback if no rule row found
        IF v_comm_rate IS NULL THEN
            v_comm_rate := 0.1200;
            v_gst_rate := 0.1800;
            v_tcs_rate := 0.0050;
            v_tds_rate := 0.0010;
            v_hold_days := 7;
            v_gst_enabled := true;
            v_tcs_enabled := true;
            v_tds_enabled := true;
            v_fixed_fee_paise := 0;
            v_fixed_fee_enabled := false;
        END IF;

        -- Apply ON/OFF controls
        v_effective_gst_rate := CASE WHEN v_gst_enabled THEN v_gst_rate ELSE 0 END;
        v_effective_tcs_rate := CASE WHEN v_tcs_enabled THEN v_tcs_rate ELSE 0 END;
        v_effective_tds_rate := CASE WHEN v_tds_enabled THEN v_tds_rate ELSE 0 END;
        v_applied_fixed_fee_paise := CASE WHEN v_fixed_fee_enabled THEN v_fixed_fee_paise ELSE 0 END;

        v_unit_price_paise := ROUND(COALESCE(v_order_item.unit_price, 0) * 100)::BIGINT;
        v_gross_amount_paise := ROUND(COALESCE(v_order_item.line_total, v_order_item.unit_price * v_order_item.quantity) * 100)::BIGINT;

        IF COALESCE(v_order_item.order_subtotal, 0) > 0 AND COALESCE(v_order_item.order_discount_amount, 0) > 0 THEN
            v_coupon_allocated_paise := ROUND(
                (v_order_item.line_total / v_order_item.order_subtotal) * (v_order_item.order_discount_amount * 100)
            )::BIGINT;
        ELSE
            v_coupon_allocated_paise := 0;
        END IF;

        v_commission_amount_paise := ROUND(v_gross_amount_paise * v_comm_rate)::BIGINT;
        v_gst_on_comm_paise := ROUND(v_commission_amount_paise * v_effective_gst_rate)::BIGINT;
        v_tcs_paise := ROUND(v_gross_amount_paise * v_effective_tcs_rate)::BIGINT;
        v_tds_paise := ROUND(v_gross_amount_paise * v_effective_tds_rate)::BIGINT;

        v_net_seller_payable_paise := v_gross_amount_paise - v_commission_amount_paise - v_gst_on_comm_paise - v_tcs_paise - v_tds_paise - v_applied_fixed_fee_paise;
        IF v_net_seller_payable_paise < 0 THEN
            v_net_seller_payable_paise := 0;
        END IF;

        v_order_delivered_at := v_order_item.order_delivered_at;
        IF v_order_delivered_at IS NULL AND LOWER(v_order_item.fulfillment_status) = 'delivered' THEN
            v_order_delivered_at := v_order_item.order_updated_at;
        END IF;

        v_is_cod := UPPER(v_order_item.payment_method) = 'COD';
        IF v_is_cod THEN
            SELECT EXISTS(
                SELECT 1 FROM public.cod_order_remittances WHERE order_id = v_order_item.order_id
            ) INTO v_is_cod_reconciled;
        ELSE
            v_is_cod_reconciled := true;
        END IF;

        IF v_order_delivered_at IS NOT NULL THEN
            v_hold_until := v_order_delivered_at + (v_hold_days || ' days')::INTERVAL;
        ELSE
            v_hold_until := NULL;
        END IF;

        IF LOWER(v_order_item.fulfillment_status) = 'cancelled' THEN
            v_target_status := 'cancelled';
        ELSIF LOWER(v_order_item.fulfillment_status) = 'delivered' THEN
            IF v_is_cod AND NOT v_is_cod_reconciled THEN
                v_target_status := 'pending_delivery';
            ELSE
                IF v_hold_until IS NOT NULL AND v_hold_until <= NOW() THEN
                    v_target_status := 'eligible_released';
                ELSE
                    v_target_status := 'on_hold';
                END IF;
            END IF;
        ELSE
            v_target_status := 'pending_delivery';
        END IF;

        -- INSERT initial immutable financial snapshot
        INSERT INTO public.seller_settlements (
            seller_id,
            order_id,
            order_item_id,
            order_number,
            order_item_code,
            product_id,
            product_title,
            sku,
            quantity,
            unit_price_paise,
            gross_amount_paise,
            product_discount_paise,
            platform_coupon_paise,
            seller_discount_paise,
            commission_rate,
            commission_amount_paise,
            gst_rate,
            gst_on_commission_paise,
            tcs_rate,
            tcs_amount_paise,
            tds_rate,
            tds_amount_paise,
            fixed_platform_fee_paise,
            shipping_charge_paise,
            shipping_borne_by,
            refunded_amount_paise,
            net_seller_payable_paise,
            payment_method,
            payment_status,
            fulfillment_status,
            delivered_at,
            hold_until,
            cod_reconciled,
            cod_reconciled_at,
            settlement_status,
            updated_at
        ) VALUES (
            v_seller_id,
            v_order_item.order_id,
            v_order_item.item_id,
            v_order_item.order_number,
            v_order_item.order_item_code,
            v_order_item.product_id,
            v_order_item.title,
            v_order_item.sku,
            v_order_item.quantity,
            v_unit_price_paise,
            v_gross_amount_paise,
            0,
            v_coupon_allocated_paise,
            0,
            v_comm_rate,
            v_commission_amount_paise,
            v_effective_gst_rate,
            v_gst_on_comm_paise,
            v_effective_tcs_rate,
            v_tcs_paise,
            v_effective_tds_rate,
            v_tds_paise,
            v_applied_fixed_fee_paise,
            0,
            'platform',
            0,
            v_net_seller_payable_paise,
            v_order_item.payment_method,
            v_order_item.payment_status,
            v_order_item.fulfillment_status,
            v_order_delivered_at,
            v_hold_until,
            v_is_cod_reconciled,
            CASE WHEN v_is_cod_reconciled THEN NOW() ELSE NULL END,
            v_target_status,
            NOW()
        )
        -- HISTORICAL IMMUTABILITY: DO NOT OVERWRITE HISTORICAL COMMISSION OR TAXES!
        ON CONFLICT (order_item_id) DO UPDATE SET
            payment_status = EXCLUDED.payment_status,
            fulfillment_status = EXCLUDED.fulfillment_status,
            delivered_at = COALESCE(seller_settlements.delivered_at, EXCLUDED.delivered_at),
            hold_until = COALESCE(seller_settlements.hold_until, EXCLUDED.hold_until),
            cod_reconciled = EXCLUDED.cod_reconciled,
            cod_reconciled_at = COALESCE(seller_settlements.cod_reconciled_at, EXCLUDED.cod_reconciled_at),
            settlement_status = CASE 
                WHEN seller_settlements.settlement_status = 'eligible_released' THEN 'eligible_released'
                WHEN seller_settlements.settlement_status = 'refunded_adjusted' THEN 'refunded_adjusted'
                ELSE EXCLUDED.settlement_status 
            END,
            updated_at = NOW();

        v_synced_count := v_synced_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'synced_items_count', v_synced_count,
        'order_id', p_order_id,
        'timestamp', NOW()
    );
END;
$$;

COMMIT;
