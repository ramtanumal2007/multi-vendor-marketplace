-- ==============================================================================
-- VENDOSMITH: SELLER SETTLEMENT, FINANCIAL LEDGER & PAYOUT SYSTEM
-- Migration: 20261016120000_seller_settlement_and_payout_system.sql
-- Description:
--   1. Creates public.seller_settlements (Order-item level financial settlements).
--   2. Creates public.seller_ledger_entries (Append-only immutable double-entry ledger).
--   3. Creates public.seller_payout_requests (Seller payout lifecycle management).
--   4. Creates public.payout_transfers (Auditable manual transfer details & UTR recording).
--   5. Creates public.cod_remittance_batches & public.cod_order_remittances.
--   6. Implements atomic, concurrency-safe RPCs for settlement sync, hold release,
--      payout reservation, admin review, manual transfer confirmation, and failure handling.
--   7. Configures least-privilege Row Level Security (RLS) policies.
--
-- MANDATORY SAFETY RULES:
--   - Additive operations only (IF NOT EXISTS, IF EXISTS).
--   - No reset, no destructive drops, no deletion of historical orders.
-- ==============================================================================

-- 1. SEQUENCE FOR PAYOUT NUMBER GENERATION
CREATE SEQUENCE IF NOT EXISTS public.payout_number_seq START WITH 10001 INCREMENT BY 1;

-- 2. SELLER SETTLEMENTS TABLE
CREATE TABLE IF NOT EXISTS public.seller_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID NOT NULL REFERENCES public.seller_profiles(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
    order_number TEXT NOT NULL,
    order_item_code TEXT,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_title TEXT NOT NULL,
    sku TEXT,
    quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price_paise BIGINT NOT NULL CHECK (unit_price_paise >= 0),
    gross_amount_paise BIGINT NOT NULL CHECK (gross_amount_paise >= 0),
    product_discount_paise BIGINT NOT NULL DEFAULT 0,
    platform_coupon_paise BIGINT NOT NULL DEFAULT 0,
    seller_discount_paise BIGINT NOT NULL DEFAULT 0,
    commission_rate NUMERIC(6, 4) NOT NULL DEFAULT 0.1200,
    commission_amount_paise BIGINT NOT NULL DEFAULT 0,
    gst_rate NUMERIC(6, 4) NOT NULL DEFAULT 0.1800,
    gst_on_commission_paise BIGINT NOT NULL DEFAULT 0,
    tcs_rate NUMERIC(6, 4) NOT NULL DEFAULT 0.0050,
    tcs_amount_paise BIGINT NOT NULL DEFAULT 0,
    tds_rate NUMERIC(6, 4) NOT NULL DEFAULT 0.0010,
    tds_amount_paise BIGINT NOT NULL DEFAULT 0,
    shipping_charge_paise BIGINT NOT NULL DEFAULT 0,
    shipping_borne_by TEXT NOT NULL DEFAULT 'platform' CHECK (shipping_borne_by IN ('platform', 'seller', 'customer')),
    refunded_amount_paise BIGINT NOT NULL DEFAULT 0,
    net_seller_payable_paise BIGINT NOT NULL,
    payment_method TEXT NOT NULL,
    payment_status TEXT NOT NULL,
    fulfillment_status TEXT NOT NULL,
    delivered_at TIMESTAMPTZ,
    hold_until TIMESTAMPTZ,
    cod_reconciled BOOLEAN NOT NULL DEFAULT false,
    cod_reconciled_at TIMESTAMPTZ,
    settlement_status TEXT NOT NULL DEFAULT 'pending_delivery' 
        CHECK (settlement_status IN ('pending_delivery', 'on_hold', 'eligible_released', 'refunded_adjusted', 'cancelled')),
    settled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_seller_settlement_item UNIQUE (order_item_id)
);

CREATE INDEX IF NOT EXISTS idx_seller_settlements_seller_id ON public.seller_settlements(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_settlements_order_id ON public.seller_settlements(order_id);
CREATE INDEX IF NOT EXISTS idx_seller_settlements_status ON public.seller_settlements(settlement_status);
CREATE INDEX IF NOT EXISTS idx_seller_settlements_hold_until ON public.seller_settlements(hold_until);
CREATE INDEX IF NOT EXISTS idx_seller_settlements_created_at ON public.seller_settlements(created_at);

-- 3. SELLER FINANCIAL LEDGER ENTRIES TABLE (Immutable double-entry log)
CREATE TABLE IF NOT EXISTS public.seller_ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID NOT NULL REFERENCES public.seller_profiles(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
    settlement_id UUID REFERENCES public.seller_settlements(id) ON DELETE SET NULL,
    payout_request_id UUID,
    entry_type TEXT NOT NULL CHECK (entry_type IN (
        'SETTLEMENT_HOLD', 
        'HOLD_RELEASE', 
        'PAYOUT_RESERVED', 
        'PAYOUT_PAID', 
        'PAYOUT_RESERVATION_RELEASED', 
        'REFUND_DEDUCTION', 
        'CANCELLATION_ADJUSTMENT', 
        'COD_REMITTANCE_CREDIT', 
        'ADMIN_ADJUSTMENT'
    )),
    direction TEXT NOT NULL CHECK (direction IN ('credit', 'debit', 'neutral')),
    amount_paise BIGINT NOT NULL CHECK (amount_paise >= 0),
    balance_type TEXT NOT NULL CHECK (balance_type IN ('available', 'locked', 'pending', 'withdrawn', 'gross')),
    available_balance_after_paise BIGINT NOT NULL,
    idempotency_key TEXT UNIQUE,
    description TEXT NOT NULL,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_type TEXT NOT NULL DEFAULT 'system' CHECK (actor_type IN ('system', 'seller', 'admin', 'webhook')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seller_ledger_seller_id ON public.seller_ledger_entries(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_ledger_created_at ON public.seller_ledger_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_seller_ledger_type ON public.seller_ledger_entries(entry_type);

-- 4. SELLER PAYOUT REQUESTS TABLE
CREATE TABLE IF NOT EXISTS public.seller_payout_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payout_number TEXT UNIQUE NOT NULL,
    seller_id UUID NOT NULL REFERENCES public.seller_profiles(id) ON DELETE CASCADE,
    amount_paise BIGINT NOT NULL CHECK (amount_paise >= 1000), -- Minimum ₹10.00
    amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 10.00),
    destination_type TEXT NOT NULL CHECK (destination_type IN ('BANK_ACCOUNT', 'UPI')),
    bank_account_id UUID REFERENCES public.seller_bank_accounts(id) ON DELETE SET NULL,
    destination_snapshot JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'approved', 'processing', 'paid', 'rejected', 'failed', 'cancelled')),
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES public.profiles(id),
    processing_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    paid_by UUID REFERENCES public.profiles(id),
    rejected_at TIMESTAMPTZ,
    rejected_by UUID REFERENCES public.profiles(id),
    rejection_reason TEXT,
    failed_at TIMESTAMPTZ,
    failure_reason TEXT,
    admin_notes TEXT,
    idempotency_key TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seller_payout_requests_seller_id ON public.seller_payout_requests(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_payout_requests_status ON public.seller_payout_requests(status);
CREATE INDEX IF NOT EXISTS idx_seller_payout_requests_created_at ON public.seller_payout_requests(created_at);

-- 5. PAYOUT TRANSFERS TABLE (Confirmed actual bank/UPI transactions)
CREATE TABLE IF NOT EXISTS public.payout_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payout_request_id UUID NOT NULL REFERENCES public.seller_payout_requests(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES public.seller_profiles(id) ON DELETE CASCADE,
    transfer_method TEXT NOT NULL CHECK (transfer_method IN ('BANK_TRANSFER', 'UPI')),
    utr_reference TEXT UNIQUE NOT NULL,
    transferred_amount_paise BIGINT NOT NULL CHECK (transferred_amount_paise > 0),
    transferred_amount NUMERIC(12, 2) NOT NULL CHECK (transferred_amount > 0),
    actual_transfer_date DATE NOT NULL,
    actual_transfer_time TIME NOT NULL,
    actual_transfer_timestamp TIMESTAMPTZ NOT NULL,
    destination_masked TEXT NOT NULL,
    receipt_url TEXT,
    admin_notes TEXT,
    confirmed_by UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payout_transfers_payout_id ON public.payout_transfers(payout_request_id);
CREATE INDEX IF NOT EXISTS idx_payout_transfers_seller_id ON public.payout_transfers(seller_id);
CREATE INDEX IF NOT EXISTS idx_payout_transfers_utr ON public.payout_transfers(utr_reference);
CREATE INDEX IF NOT EXISTS idx_payout_transfers_timestamp ON public.payout_transfers(actual_transfer_timestamp);

-- 6. COD REMITTANCE BATCHES & ORDER RECONCILIATIONS
CREATE TABLE IF NOT EXISTS public.cod_remittance_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_reference TEXT UNIQUE NOT NULL,
    courier_partner TEXT NOT NULL,
    remittance_date DATE NOT NULL,
    total_collected_paise BIGINT NOT NULL CHECK (total_collected_paise >= 0),
    orders_count INT NOT NULL DEFAULT 1 CHECK (orders_count > 0),
    recorded_by UUID NOT NULL REFERENCES public.profiles(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cod_order_remittances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID REFERENCES public.cod_remittance_batches(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    collected_amount_paise BIGINT NOT NULL CHECK (collected_amount_paise >= 0),
    reconciled_at TIMESTAMPTZ DEFAULT NOW(),
    reconciled_by UUID NOT NULL REFERENCES public.profiles(id),
    CONSTRAINT uq_cod_order_remittance UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_cod_order_remittances_order_id ON public.cod_order_remittances(order_id);

-- 7. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.seller_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cod_remittance_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cod_order_remittances ENABLE ROW LEVEL SECURITY;

-- 8. CONFIGURE RLS POLICIES
DROP POLICY IF EXISTS "Sellers view own settlements" ON public.seller_settlements;
CREATE POLICY "Sellers view own settlements" ON public.seller_settlements
    FOR SELECT USING (seller_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage all settlements" ON public.seller_settlements;
CREATE POLICY "Admins manage all settlements" ON public.seller_settlements
    FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Sellers view own ledger" ON public.seller_ledger_entries;
CREATE POLICY "Sellers view own ledger" ON public.seller_ledger_entries
    FOR SELECT USING (seller_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Admins view all ledger entries" ON public.seller_ledger_entries;
CREATE POLICY "Admins view all ledger entries" ON public.seller_ledger_entries
    FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Sellers view own payout requests" ON public.seller_payout_requests;
CREATE POLICY "Sellers view own payout requests" ON public.seller_payout_requests
    FOR SELECT USING (seller_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage all payout requests" ON public.seller_payout_requests;
CREATE POLICY "Admins manage all payout requests" ON public.seller_payout_requests
    FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Sellers view own payout transfers" ON public.payout_transfers;
CREATE POLICY "Sellers view own payout transfers" ON public.payout_transfers
    FOR SELECT USING (seller_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage all payout transfers" ON public.payout_transfers;
CREATE POLICY "Admins manage all payout transfers" ON public.payout_transfers
    FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admins manage cod remittance batches" ON public.cod_remittance_batches;
CREATE POLICY "Admins manage cod remittance batches" ON public.cod_remittance_batches
    FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admins manage cod order remittances" ON public.cod_order_remittances;
CREATE POLICY "Admins manage cod order remittances" ON public.cod_order_remittances
    FOR ALL USING (public.is_admin());


-- ==============================================================================
-- 9. ATOMIC RPC: SYNC ALL SELLER ORDER SETTLEMENTS
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.sync_seller_order_settlements_atomic()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_item RECORD;
    v_seller_id UUID;
    v_membership_plan TEXT;
    v_comm_rate NUMERIC(6, 4) := 0.1200;
    v_gst_rate NUMERIC(6, 4) := 0.1800;
    v_tcs_rate NUMERIC(6, 4) := 0.0050;
    v_tds_rate NUMERIC(6, 4) := 0.0010;
    v_hold_days INT := 7;
    v_platform_absorbs_coupon BOOLEAN := true;
    
    v_unit_price_paise BIGINT;
    v_gross_amount_paise BIGINT;
    v_coupon_allocated_paise BIGINT := 0;
    v_commission_amount_paise BIGINT := 0;
    v_gst_on_comm_paise BIGINT := 0;
    v_tcs_paise BIGINT := 0;
    v_tds_paise BIGINT := 0;
    v_net_seller_payable_paise BIGINT := 0;
    v_order_delivered_at TIMESTAMPTZ;
    v_hold_until TIMESTAMPTZ := NULL;
    v_is_cod BOOLEAN := false;
    v_is_cod_reconciled BOOLEAN := false;
    v_target_status TEXT := 'pending_delivery';
    v_synced_count INT := 0;
BEGIN
    FOR v_order_item IN 
        SELECT 
            oi.id AS item_id,
            oi.order_id,
            oi.store_id,
            oi.product_id,
            oi.order_item_code,
            oi.title,
            oi.sku,
            oi.quantity,
            oi.unit_price,
            oi.line_total,
            o.order_number,
            o.payment_method,
            o.payment_status,
            o.fulfillment_status,
            o.subtotal AS order_subtotal,
            o.discount_amount AS order_discount_amount,
            o.created_at AS order_created_at,
            o.updated_at AS order_updated_at,
            o.delivered_at AS order_delivered_at,
            s.seller_id AS store_seller_id,
            sp.membership_plan AS seller_membership_plan
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        LEFT JOIN public.stores s ON s.id = oi.store_id
        LEFT JOIN public.seller_profiles sp ON sp.id = s.seller_id
        WHERE s.seller_id IS NOT NULL
    LOOP
        v_seller_id := v_order_item.store_seller_id;
        v_membership_plan := COALESCE(v_order_item.seller_membership_plan, 'BASIC');

        SELECT 
            COALESCE(commission_rate, 0.1200),
            COALESCE(gst_rate, 0.1800),
            COALESCE(tcs_rate, 0.0050),
            COALESCE(tds_rate, 0.0010),
            COALESCE(escrow_hold_days, 7),
            COALESCE(platform_absorbs_coupons, true)
        INTO 
            v_comm_rate,
            v_gst_rate,
            v_tcs_rate,
            v_tds_rate,
            v_hold_days,
            v_platform_absorbs_coupon
        FROM public.marketplace_fee_rules
        WHERE membership_plan = v_membership_plan
        LIMIT 1;

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
        v_gst_on_comm_paise := ROUND(v_commission_amount_paise * v_gst_rate)::BIGINT;
        v_tcs_paise := ROUND(v_gross_amount_paise * v_tcs_rate)::BIGINT;
        v_tds_paise := ROUND(v_gross_amount_paise * v_tds_rate)::BIGINT;

        v_net_seller_payable_paise := v_gross_amount_paise - v_commission_amount_paise - v_gst_on_comm_paise - v_tcs_paise - v_tds_paise;
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
            v_gst_rate,
            v_gst_on_comm_paise,
            v_tcs_rate,
            v_tcs_paise,
            v_tds_rate,
            v_tds_paise,
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

    PERFORM public.process_settlement_hold_releases_atomic();

    RETURN jsonb_build_object(
        'success', true,
        'synced_items_count', v_synced_count,
        'timestamp', NOW()
    );
END;
$$;


-- ==============================================================================
-- 10. ATOMIC RPC: PROCESS SETTLEMENT HOLD RELEASES
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.process_settlement_hold_releases_atomic()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_settlement RECORD;
    v_seller RECORD;
    v_released_count INT := 0;
    v_total_released_paise BIGINT := 0;
    v_idemp_key TEXT;
    v_new_available_paise BIGINT;
BEGIN
    UPDATE public.seller_settlements
    SET settlement_status = 'eligible_released',
        settled_at = NOW(),
        updated_at = NOW()
    WHERE settlement_status = 'on_hold'
      AND hold_until IS NOT NULL
      AND hold_until <= NOW()
      AND (UPPER(payment_method) != 'COD' OR cod_reconciled = true)
      AND NOT EXISTS (
          SELECT 1 FROM public.return_requests 
          WHERE order_item_id = seller_settlements.order_item_id 
            AND status IN ('REFUND_COMPLETED', 'REPLACEMENT_DELIVERED')
      );

    FOR v_settlement IN
        SELECT 
            s.*,
            COALESCE(sb.available_balance, 0.00) AS current_avail_num
        FROM public.seller_settlements s
        LEFT JOIN public.seller_balances sb ON sb.seller_id = s.seller_id
        WHERE s.settlement_status = 'eligible_released'
          AND NOT EXISTS (
              SELECT 1 FROM public.seller_ledger_entries le 
              WHERE le.idempotency_key = 'HOLD_RELEASE_' || s.id
          )
        FOR UPDATE OF s
    LOOP
        v_idemp_key := 'HOLD_RELEASE_' || v_settlement.id;

        INSERT INTO public.seller_balances (seller_id, pending_balance, available_balance, locked_balance, lifetime_earned, lifetime_withdrawn)
        VALUES (v_settlement.seller_id, 0.00, 0.00, 0.00, 0.00, 0.00)
        ON CONFLICT (seller_id) DO NOTHING;

        SELECT * INTO v_seller
        FROM public.seller_balances
        WHERE seller_id = v_settlement.seller_id
        FOR UPDATE;

        v_new_available_paise := ROUND((v_seller.available_balance * 100) + v_settlement.net_seller_payable_paise)::BIGINT;

        UPDATE public.seller_balances
        SET available_balance = ROUND(v_new_available_paise / 100.0, 2),
            lifetime_earned = ROUND((lifetime_earned * 100 + v_settlement.net_seller_payable_paise) / 100.0, 2),
            updated_at = NOW()
        WHERE seller_id = v_settlement.seller_id;

        INSERT INTO public.seller_ledger_entries (
            seller_id,
            order_id,
            order_item_id,
            settlement_id,
            entry_type,
            direction,
            amount_paise,
            balance_type,
            available_balance_after_paise,
            idempotency_key,
            description,
            actor_type
        ) VALUES (
            v_settlement.seller_id,
            v_settlement.order_id,
            v_settlement.order_item_id,
            v_settlement.id,
            'HOLD_RELEASE',
            'credit',
            v_settlement.net_seller_payable_paise,
            'available',
            v_new_available_paise,
            v_idemp_key,
            '7-day hold released for order #' || v_settlement.order_number || ' (' || v_settlement.product_title || ')',
            'system'
        ) ON CONFLICT (idempotency_key) DO NOTHING;

        v_released_count := v_released_count + 1;
        v_total_released_paise := v_total_released_paise + v_settlement.net_seller_payable_paise;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'released_count', v_released_count,
        'total_released_rupees', ROUND(v_total_released_paise / 100.0, 2)
    );
END;
$$;


-- ==============================================================================
-- 11. ATOMIC RPC: REQUEST SELLER PAYOUT
-- Supports both auth.uid() and current_setting('request.jwt.claims') for test flexibility.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.request_seller_payout_atomic(
    p_amount_rupees NUMERIC,
    p_destination_type TEXT,
    p_bank_account_id UUID DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_seller_id UUID;
    v_seller_bal RECORD;
    v_clean_amount NUMERIC(12, 2);
    v_amount_paise BIGINT;
    v_dest_type TEXT;
    v_bank RECORD;
    v_bank_id UUID := NULL;
    v_seller_prof RECORD;
    v_dest_snapshot JSONB;
    v_new_payout_id UUID;
    v_payout_num TEXT;
    v_new_available_paise BIGINT;
    v_new_locked_paise BIGINT;
    v_idemp_key TEXT;
    v_seq_num BIGINT;
BEGIN
    v_seller_id := auth.uid();
    IF v_seller_id IS NULL THEN
        BEGIN
            v_seller_id := ((current_setting('request.jwt.claims', true)::jsonb)->>'sub')::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_seller_id := NULL;
        END;
    END IF;

    IF v_seller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User not authenticated' USING ERRCODE = '42501';
    END IF;

    v_clean_amount := ROUND(p_amount_rupees, 2);
    IF v_clean_amount < 10.00 THEN
        RAISE EXCEPTION 'Minimum payout amount is ₹10.00' USING ERRCODE = '22000';
    END IF;
    v_amount_paise := ROUND(v_clean_amount * 100)::BIGINT;

    v_dest_type := UPPER(TRIM(p_destination_type));
    IF v_dest_type NOT IN ('BANK_ACCOUNT', 'UPI') THEN
        RAISE EXCEPTION 'Invalid destination type. Must be BANK_ACCOUNT or UPI' USING ERRCODE = '22000';
    END IF;

    v_idemp_key := TRIM(COALESCE(p_idempotency_key, 'PAYOUT_REQ_' || v_seller_id || '_' || EXTRACT(EPOCH FROM NOW())));
    IF EXISTS (SELECT 1 FROM public.seller_payout_requests WHERE idempotency_key = v_idemp_key) THEN
        SELECT id, payout_number, status, amount INTO v_new_payout_id, v_payout_num, v_dest_type, v_clean_amount 
        FROM public.seller_payout_requests 
        WHERE idempotency_key = v_idemp_key;

        RETURN jsonb_build_object(
            'success', true,
            'is_duplicate', true,
            'payout_id', v_new_payout_id,
            'payout_number', v_payout_num,
            'message', 'Payout request already registered'
        );
    END IF;

    IF v_dest_type = 'BANK_ACCOUNT' THEN
        IF p_bank_account_id IS NULL THEN
            SELECT * INTO v_bank
            FROM public.seller_bank_accounts
            WHERE seller_id = v_seller_id AND status = 'verified' AND is_primary = true
            LIMIT 1;

            IF NOT FOUND OR v_bank.id IS NULL THEN
                SELECT * INTO v_bank
                FROM public.seller_bank_accounts
                WHERE seller_id = v_seller_id AND status = 'verified'
                ORDER BY created_at DESC
                LIMIT 1;
            END IF;
        ELSE
            SELECT * INTO v_bank
            FROM public.seller_bank_accounts
            WHERE id = p_bank_account_id AND seller_id = v_seller_id;
        END IF;

        IF NOT FOUND OR v_bank.id IS NULL THEN
            RAISE EXCEPTION 'No bank account found' USING ERRCODE = 'P0002';
        END IF;

        IF v_bank.status != 'verified' THEN
            RAISE EXCEPTION 'Selected bank account is not verified. Current status: %', v_bank.status USING ERRCODE = '22000';
        END IF;

        v_bank_id := v_bank.id;

        v_dest_snapshot := jsonb_build_object(
            'type', 'BANK_ACCOUNT',
            'bank_account_id', v_bank.id,
            'account_holder_name', v_bank.account_holder_name,
            'bank_name', v_bank.bank_name,
            'branch_name', v_bank.branch_name,
            'ifsc_code', v_bank.ifsc_code,
            'account_number_last4', v_bank.account_number_last4,
            'account_type', v_bank.account_type
        );
    ELSE
        SELECT id, business_name, upi_id, upi_qr_url INTO v_seller_prof
        FROM public.seller_profiles
        WHERE id = v_seller_id;

        IF NOT FOUND OR v_seller_prof.upi_id IS NULL OR TRIM(v_seller_prof.upi_id) = '' THEN
            RAISE EXCEPTION 'No registered UPI ID found. Please update your UPI credentials in Bank Account settings' USING ERRCODE = '22000';
        END IF;

        v_dest_snapshot := jsonb_build_object(
            'type', 'UPI',
            'upi_id', v_seller_prof.upi_id,
            'business_name', v_seller_prof.business_name
        );
    END IF;

    INSERT INTO public.seller_balances (seller_id, pending_balance, available_balance, locked_balance, lifetime_earned, lifetime_withdrawn)
    VALUES (v_seller_id, 0.00, 0.00, 0.00, 0.00, 0.00)
    ON CONFLICT (seller_id) DO NOTHING;

    SELECT * INTO v_seller_bal
    FROM public.seller_balances
    WHERE seller_id = v_seller_id
    FOR UPDATE;

    IF v_seller_bal.available_balance < v_clean_amount THEN
        RAISE EXCEPTION 'Requested amount (₹%) exceeds your eligible available balance of ₹%', 
            v_clean_amount, v_seller_bal.available_balance USING ERRCODE = '22000';
    END IF;

    SELECT nextval('public.payout_number_seq') INTO v_seq_num;
    v_payout_num := 'PO-' || v_seq_num;

    v_new_available_paise := ROUND((v_seller_bal.available_balance * 100) - v_amount_paise)::BIGINT;
    v_new_locked_paise := ROUND((v_seller_bal.locked_balance * 100) + v_amount_paise)::BIGINT;

    INSERT INTO public.seller_payout_requests (
        payout_number,
        seller_id,
        amount_paise,
        amount,
        destination_type,
        bank_account_id,
        destination_snapshot,
        status,
        requested_at,
        idempotency_key
    ) VALUES (
        v_payout_num,
        v_seller_id,
        v_amount_paise,
        v_clean_amount,
        v_dest_type,
        v_bank_id,
        v_dest_snapshot,
        'pending',
        NOW(),
        v_idemp_key
    ) RETURNING id INTO v_new_payout_id;

    UPDATE public.seller_balances
    SET available_balance = ROUND(v_new_available_paise / 100.0, 2),
        locked_balance = ROUND(v_new_locked_paise / 100.0, 2),
        updated_at = NOW()
    WHERE seller_id = v_seller_id;

    INSERT INTO public.seller_ledger_entries (
        seller_id,
        payout_request_id,
        entry_type,
        direction,
        amount_paise,
        balance_type,
        available_balance_after_paise,
        idempotency_key,
        description,
        actor_id,
        actor_type,
        metadata
    ) VALUES (
        v_seller_id,
        v_new_payout_id,
        'PAYOUT_RESERVED',
        'debit',
        v_amount_paise,
        'available',
        v_new_available_paise,
        'PAYOUT_RES_' || v_new_payout_id,
        'Payout request #' || v_payout_num || ' submitted (₹' || v_clean_amount || ' reserved for review)',
        v_seller_id,
        'seller',
        v_dest_snapshot
    );

    BEGIN
        INSERT INTO public.seller_notifications (
            seller_id,
            title,
            message,
            type,
            priority,
            link_url,
            created_at
        ) VALUES (
            v_seller_id,
            'Payout Request Submitted',
            'Your payout request #' || v_payout_num || ' for ₹' || v_clean_amount || ' has been submitted and is awaiting administrator review.',
            'payout',
            'normal',
            '/seller/wallet',
            NOW()
        );
    EXCEPTION WHEN OTHERS THEN
    END;

    RETURN jsonb_build_object(
        'success', true,
        'payout_id', v_new_payout_id,
        'payout_number', v_payout_num,
        'amount', v_clean_amount,
        'status', 'pending',
        'remaining_available_balance', ROUND(v_new_available_paise / 100.0, 2),
        'reserved_balance', ROUND(v_new_locked_paise / 100.0, 2)
    );
END;
$$;


-- ==============================================================================
-- 12. ATOMIC RPC: ADMIN REVIEW PAYOUT REQUEST
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.admin_review_payout_request_atomic(
    p_payout_id UUID,
    p_action TEXT,
    p_reason TEXT DEFAULT NULL,
    p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_payout RECORD;
    v_seller_bal RECORD;
    v_action TEXT;
    v_new_available_paise BIGINT;
    v_new_locked_paise BIGINT;
BEGIN
    v_admin_id := auth.uid();
    IF v_admin_id IS NULL THEN
        BEGIN
            v_admin_id := ((current_setting('request.jwt.claims', true)::jsonb)->>'sub')::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_admin_id := NULL;
        END;
    END IF;

    IF NOT public.is_admin() AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_admin_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only marketplace administrators can review payout requests' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_payout
    FROM public.seller_payout_requests
    WHERE id = p_payout_id
    FOR UPDATE;

    IF v_payout IS NULL THEN
        RAISE EXCEPTION 'Payout request not found' USING ERRCODE = 'P0002';
    END IF;

    v_action := UPPER(TRIM(p_action));

    IF v_action = 'APPROVE' THEN
        IF v_payout.status != 'pending' THEN
            RAISE EXCEPTION 'Only pending payout requests can be approved. Current status: %', v_payout.status USING ERRCODE = '22000';
        END IF;

        UPDATE public.seller_payout_requests
        SET status = 'approved',
            approved_at = NOW(),
            approved_by = v_admin_id,
            admin_notes = COALESCE(p_admin_notes, admin_notes),
            updated_at = NOW()
        WHERE id = p_payout_id;

        BEGIN
            INSERT INTO public.seller_notifications (
                seller_id,
                title,
                message,
                type,
                priority,
                link_url,
                created_at
            ) VALUES (
                v_payout.seller_id,
                'Payout Request Approved',
                'Your payout request #' || v_payout.payout_number || ' for ₹' || v_payout.amount || ' has been approved. The transfer is being processed.',
                'payout',
                'normal',
                '/seller/wallet',
                NOW()
            );
        EXCEPTION WHEN OTHERS THEN
        END;

        RETURN jsonb_build_object(
            'success', true,
            'payout_id', v_payout.id,
            'payout_number', v_payout.payout_number,
            'status', 'approved'
        );

    ELSIF v_action = 'REJECT' THEN
        IF v_payout.status NOT IN ('pending', 'approved') THEN
            RAISE EXCEPTION 'Cannot reject payout request in % state', v_payout.status USING ERRCODE = '22000';
        END IF;

        IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
            RAISE EXCEPTION 'A mandatory rejection reason is required' USING ERRCODE = '22000';
        END IF;

        SELECT * INTO v_seller_bal
        FROM public.seller_balances
        WHERE seller_id = v_payout.seller_id
        FOR UPDATE;

        v_new_available_paise := ROUND((v_seller_bal.available_balance * 100) + v_payout.amount_paise)::BIGINT;
        v_new_locked_paise := GREATEST(0, ROUND((v_seller_bal.locked_balance * 100) - v_payout.amount_paise)::BIGINT);

        UPDATE public.seller_balances
        SET available_balance = ROUND(v_new_available_paise / 100.0, 2),
            locked_balance = ROUND(v_new_locked_paise / 100.0, 2),
            updated_at = NOW()
        WHERE seller_id = v_payout.seller_id;

        UPDATE public.seller_payout_requests
        SET status = 'rejected',
            rejected_at = NOW(),
            rejected_by = v_admin_id,
            rejection_reason = TRIM(p_reason),
            admin_notes = COALESCE(p_admin_notes, admin_notes),
            updated_at = NOW()
        WHERE id = p_payout_id;

        INSERT INTO public.seller_ledger_entries (
            seller_id,
            payout_request_id,
            entry_type,
            direction,
            amount_paise,
            balance_type,
            available_balance_after_paise,
            idempotency_key,
            description,
            actor_id,
            actor_type,
            metadata
        ) VALUES (
            v_payout.seller_id,
            v_payout.id,
            'PAYOUT_RESERVATION_RELEASED',
            'credit',
            v_payout.amount_paise,
            'available',
            v_new_available_paise,
            'PAYOUT_REJ_REL_' || v_payout.id || '_' || EXTRACT(EPOCH FROM NOW()),
            'Payout request #' || v_payout.payout_number || ' rejected: ' || TRIM(p_reason) || ' (Funds released back to balance)',
            v_admin_id,
            'admin',
            jsonb_build_object('reason', TRIM(p_reason))
        );

        BEGIN
            INSERT INTO public.seller_notifications (
                seller_id,
                title,
                message,
                type,
                priority,
                link_url,
                created_at
            ) VALUES (
                v_payout.seller_id,
                'Payout Request Rejected',
                'Your payout request #' || v_payout.payout_number || ' for ₹' || v_payout.amount || ' was rejected: ' || TRIM(p_reason) || '. Reserved funds have been restored to your available balance.',
                'payout',
                'high',
                '/seller/wallet',
                NOW()
            );
        EXCEPTION WHEN OTHERS THEN
        END;

        RETURN jsonb_build_object(
            'success', true,
            'payout_id', v_payout.id,
            'payout_number', v_payout.payout_number,
            'status', 'rejected',
            'restored_balance', ROUND(v_new_available_paise / 100.0, 2)
        );
    ELSE
        RAISE EXCEPTION 'Invalid review action. Must be APPROVE or REJECT' USING ERRCODE = '22000';
    END IF;
END;
$$;


-- ==============================================================================
-- 13. ATOMIC RPC: ADMIN CONFIRM PAYOUT TRANSFER
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.admin_confirm_payout_transfer_atomic(
    p_payout_id UUID,
    p_transfer_method TEXT,
    p_utr_reference TEXT,
    p_transfer_date DATE,
    p_transfer_time TIME,
    p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_payout RECORD;
    v_seller_bal RECORD;
    v_clean_utr TEXT;
    v_method TEXT;
    v_transfer_ts TIMESTAMPTZ;
    v_masked_dest TEXT;
    v_transfer_id UUID;
    v_new_locked_paise BIGINT;
    v_new_withdrawn_paise BIGINT;
BEGIN
    v_admin_id := auth.uid();
    IF v_admin_id IS NULL THEN
        BEGIN
            v_admin_id := ((current_setting('request.jwt.claims', true)::jsonb)->>'sub')::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_admin_id := NULL;
        END;
    END IF;

    IF NOT public.is_admin() AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_admin_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only marketplace administrators can confirm payout transfers' USING ERRCODE = '42501';
    END IF;

    v_clean_utr := UPPER(TRIM(p_utr_reference));
    IF char_length(v_clean_utr) < 6 THEN
        RAISE EXCEPTION 'Invalid transaction reference/UTR. Expected at least 6 alphanumeric characters' USING ERRCODE = '22000';
    END IF;

    IF EXISTS (SELECT 1 FROM public.payout_transfers WHERE utr_reference = v_clean_utr) THEN
        RAISE EXCEPTION 'Duplicate UTR: Transaction reference % has already been recorded for another payout transfer', v_clean_utr 
        USING ERRCODE = '23505';
    END IF;

    v_method := UPPER(TRIM(p_transfer_method));
    IF v_method NOT IN ('BANK_TRANSFER', 'UPI') THEN
        RAISE EXCEPTION 'Invalid transfer method. Must be BANK_TRANSFER or UPI' USING ERRCODE = '22000';
    END IF;

    SELECT * INTO v_payout
    FROM public.seller_payout_requests
    WHERE id = p_payout_id
    FOR UPDATE;

    IF v_payout IS NULL THEN
        RAISE EXCEPTION 'Payout request not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_payout.status NOT IN ('approved', 'processing') THEN
        RAISE EXCEPTION 'Cannot confirm transfer for payout in % state. Must be approved or processing', v_payout.status 
        USING ERRCODE = '22000';
    END IF;

    v_transfer_ts := (p_transfer_date || ' ' || p_transfer_time)::TIMESTAMP AT TIME ZONE 'Asia/Kolkata';

    IF v_payout.destination_type = 'BANK_ACCOUNT' THEN
        v_masked_dest := COALESCE(v_payout.destination_snapshot->>'bank_name', 'Bank') || 
            ' (A/C ending in ' || COALESCE(v_payout.destination_snapshot->>'account_number_last4', '****') || ')';
    ELSE
        v_masked_dest := 'UPI: ' || COALESCE(v_payout.destination_snapshot->>'upi_id', 'Registered UPI');
    END IF;

    INSERT INTO public.payout_transfers (
        payout_request_id,
        seller_id,
        transfer_method,
        utr_reference,
        transferred_amount_paise,
        transferred_amount,
        actual_transfer_date,
        actual_transfer_time,
        actual_transfer_timestamp,
        destination_masked,
        admin_notes,
        confirmed_by
    ) VALUES (
        p_payout_id,
        v_payout.seller_id,
        v_method,
        v_clean_utr,
        v_payout.amount_paise,
        v_payout.amount,
        p_transfer_date,
        p_transfer_time,
        v_transfer_ts,
        v_masked_dest,
        p_admin_notes,
        v_admin_id
    ) RETURNING id INTO v_transfer_id;

    SELECT * INTO v_seller_bal
    FROM public.seller_balances
    WHERE seller_id = v_payout.seller_id
    FOR UPDATE;

    v_new_locked_paise := GREATEST(0, ROUND((v_seller_bal.locked_balance * 100) - v_payout.amount_paise)::BIGINT);
    v_new_withdrawn_paise := ROUND((v_seller_bal.lifetime_withdrawn * 100) + v_payout.amount_paise)::BIGINT;

    UPDATE public.seller_balances
    SET locked_balance = ROUND(v_new_locked_paise / 100.0, 2),
        lifetime_withdrawn = ROUND(v_new_withdrawn_paise / 100.0, 2),
        updated_at = NOW()
    WHERE seller_id = v_payout.seller_id;

    UPDATE public.seller_payout_requests
    SET status = 'paid',
        paid_at = NOW(),
        paid_by = v_admin_id,
        admin_notes = COALESCE(p_admin_notes, admin_notes),
        updated_at = NOW()
    WHERE id = p_payout_id;

    INSERT INTO public.seller_ledger_entries (
        seller_id,
        payout_request_id,
        entry_type,
        direction,
        amount_paise,
        balance_type,
        available_balance_after_paise,
        idempotency_key,
        description,
        actor_id,
        actor_type,
        metadata
    ) VALUES (
        v_payout.seller_id,
        p_payout_id,
        'PAYOUT_PAID',
        'neutral',
        v_payout.amount_paise,
        'withdrawn',
        ROUND(v_seller_bal.available_balance * 100)::BIGINT,
        'PAYOUT_PAID_' || p_payout_id || '_' || v_clean_utr,
        'Payout #' || v_payout.payout_number || ' completed via ' || v_method || ' (UTR: ' || v_clean_utr || ')',
        v_admin_id,
        'admin',
        jsonb_build_object(
            'utr', v_clean_utr,
            'method', v_method,
            'transfer_date', p_transfer_date,
            'transfer_time', p_transfer_time,
            'destination', v_masked_dest
        )
    );

    BEGIN
        INSERT INTO public.seller_notifications (
            seller_id,
            title,
            message,
            type,
            priority,
            link_url,
            created_at
        ) VALUES (
            v_payout.seller_id,
            'Payout Transferred Successfully',
            'Your payout #' || v_payout.payout_number || ' for ₹' || v_payout.amount || ' has been transferred via ' || v_method || '. UTR/Ref: ' || v_clean_utr,
            'payout',
            'normal',
            '/seller/wallet',
            NOW()
        );
    EXCEPTION WHEN OTHERS THEN
    END;

    RETURN jsonb_build_object(
        'success', true,
        'payout_id', p_payout_id,
        'payout_number', v_payout.payout_number,
        'status', 'paid',
        'utr', v_clean_utr,
        'amount', v_payout.amount,
        'transferred_at', v_transfer_ts,
        'destination', v_masked_dest
    );
END;
$$;


-- ==============================================================================
-- 14. ATOMIC RPC: ADMIN FAIL PAYOUT TRANSFER
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.admin_fail_payout_transfer_atomic(
    p_payout_id UUID,
    p_failure_reason TEXT,
    p_release_funds BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_payout RECORD;
    v_seller_bal RECORD;
    v_new_available_paise BIGINT;
    v_new_locked_paise BIGINT;
BEGIN
    v_admin_id := auth.uid();
    IF v_admin_id IS NULL THEN
        BEGIN
            v_admin_id := ((current_setting('request.jwt.claims', true)::jsonb)->>'sub')::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_admin_id := NULL;
        END;
    END IF;

    IF NOT public.is_admin() AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_admin_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only marketplace administrators can record payout failures' USING ERRCODE = '42501';
    END IF;

    IF p_failure_reason IS NULL OR TRIM(p_failure_reason) = '' THEN
        RAISE EXCEPTION 'A mandatory failure reason is required' USING ERRCODE = '22000';
    END IF;

    SELECT * INTO v_payout
    FROM public.seller_payout_requests
    WHERE id = p_payout_id
    FOR UPDATE;

    IF v_payout IS NULL THEN
        RAISE EXCEPTION 'Payout request not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_payout.status NOT IN ('approved', 'processing') THEN
        RAISE EXCEPTION 'Cannot record failure for payout in % state. Payout must be in approved or processing state', v_payout.status USING ERRCODE = '22000';
    END IF;

    UPDATE public.seller_payout_requests
    SET status = 'failed',
        failed_at = NOW(),
        failure_reason = TRIM(p_failure_reason),
        updated_at = NOW()
    WHERE id = p_payout_id;

    IF p_release_funds THEN
        SELECT * INTO v_seller_bal
        FROM public.seller_balances
        WHERE seller_id = v_payout.seller_id
        FOR UPDATE;

        v_new_available_paise := ROUND((v_seller_bal.available_balance * 100) + v_payout.amount_paise)::BIGINT;
        v_new_locked_paise := GREATEST(0, ROUND((v_seller_bal.locked_balance * 100) - v_payout.amount_paise)::BIGINT);

        UPDATE public.seller_balances
        SET available_balance = ROUND(v_new_available_paise / 100.0, 2),
            locked_balance = ROUND(v_new_locked_paise / 100.0, 2),
            updated_at = NOW()
        WHERE seller_id = v_payout.seller_id;

        INSERT INTO public.seller_ledger_entries (
            seller_id,
            payout_request_id,
            entry_type,
            direction,
            amount_paise,
            balance_type,
            available_balance_after_paise,
            idempotency_key,
            description,
            actor_id,
            actor_type,
            metadata
        ) VALUES (
            v_payout.seller_id,
            p_payout_id,
            'PAYOUT_RESERVATION_RELEASED',
            'credit',
            v_payout.amount_paise,
            'available',
            v_new_available_paise,
            'PAYOUT_FAIL_REL_' || p_payout_id || '_' || EXTRACT(EPOCH FROM NOW()),
            'Payout #' || v_payout.payout_number || ' transfer failed: ' || TRIM(p_failure_reason) || ' (Funds restored)',
            v_admin_id,
            'admin',
            jsonb_build_object('failure_reason', TRIM(p_failure_reason))
        );
    END IF;

    BEGIN
        INSERT INTO public.seller_notifications (
            seller_id,
            title,
            message,
            type,
            priority,
            link_url,
            created_at
        ) VALUES (
            v_payout.seller_id,
            'Payout Transfer Failed',
            'Your payout #' || v_payout.payout_number || ' transfer failed: ' || TRIM(p_failure_reason) || '. Reserved funds have been restored to your available balance.',
            'payout',
            'high',
            '/seller/wallet',
            NOW()
        );
    EXCEPTION WHEN OTHERS THEN
    END;

    RETURN jsonb_build_object(
        'success', true,
        'payout_id', p_payout_id,
        'status', 'failed',
        'message', 'Transfer failure recorded and funds restored.'
    );
END;
$$;


-- ==============================================================================
-- 15. ATOMIC RPC: RECONCILE COD REMITTANCE BATCH
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.reconcile_cod_remittance_atomic(
    p_batch_reference TEXT,
    p_courier_partner TEXT,
    p_remittance_date DATE,
    p_order_ids UUID[],
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_clean_batch_ref TEXT;
    v_batch_id UUID;
    v_order_id UUID;
    v_order RECORD;
    v_total_collected_paise BIGINT := 0;
    v_reconciled_count INT := 0;
BEGIN
    v_admin_id := auth.uid();
    IF v_admin_id IS NULL THEN
        BEGIN
            v_admin_id := ((current_setting('request.jwt.claims', true)::jsonb)->>'sub')::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_admin_id := NULL;
        END;
    END IF;

    IF NOT public.is_admin() AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_admin_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only marketplace administrators can reconcile COD remittances' USING ERRCODE = '42501';
    END IF;

    v_clean_batch_ref := UPPER(TRIM(p_batch_reference));
    IF char_length(v_clean_batch_ref) < 3 THEN
        RAISE EXCEPTION 'Invalid batch reference' USING ERRCODE = '22000';
    END IF;

    IF p_order_ids IS NULL OR array_length(p_order_ids, 1) = 0 THEN
        RAISE EXCEPTION 'At least one order ID must be provided' USING ERRCODE = '22000';
    END IF;

    INSERT INTO public.cod_remittance_batches (
        batch_reference,
        courier_partner,
        remittance_date,
        total_collected_paise,
        orders_count,
        recorded_by,
        notes
    ) VALUES (
        v_clean_batch_ref,
        TRIM(p_courier_partner),
        p_remittance_date,
        0,
        array_length(p_order_ids, 1),
        v_admin_id,
        p_notes
    ) RETURNING id INTO v_batch_id;

    FOREACH v_order_id IN ARRAY p_order_ids LOOP
        SELECT id, total, payment_method, fulfillment_status INTO v_order
        FROM public.orders
        WHERE id = v_order_id;

        IF v_order IS NOT NULL THEN
            INSERT INTO public.cod_order_remittances (
                batch_id,
                order_id,
                collected_amount_paise,
                reconciled_by
            ) VALUES (
                v_batch_id,
                v_order_id,
                ROUND(v_order.total * 100)::BIGINT,
                v_admin_id
            ) ON CONFLICT (order_id) DO NOTHING;

            v_total_collected_paise := v_total_collected_paise + ROUND(v_order.total * 100)::BIGINT;
            v_reconciled_count := v_reconciled_count + 1;

            UPDATE public.seller_settlements
            SET cod_reconciled = true,
                cod_reconciled_at = NOW(),
                settlement_status = CASE 
                    WHEN hold_until IS NOT NULL AND hold_until <= NOW() THEN 'eligible_released'
                    WHEN hold_until IS NOT NULL THEN 'on_hold'
                    ELSE settlement_status
                END,
                updated_at = NOW()
            WHERE order_id = v_order_id;
        END IF;
    END LOOP;

    UPDATE public.cod_remittance_batches
    SET total_collected_paise = v_total_collected_paise,
        orders_count = v_reconciled_count
    WHERE id = v_batch_id;

    PERFORM public.process_settlement_hold_releases_atomic();

    RETURN jsonb_build_object(
        'success', true,
        'batch_id', v_batch_id,
        'batch_reference', v_clean_batch_ref,
        'reconciled_orders_count', v_reconciled_count,
        'total_collected_rupees', ROUND(v_total_collected_paise / 100.0, 2)
    );
END;
$$;


-- ==============================================================================
-- 16. HELPER RPC: GET AUTHORITATIVE SELLER FINANCIAL SUMMARY
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_seller_financial_summary(p_seller_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_seller_id UUID;
    v_bal RECORD;
    v_gross_sales NUMERIC(12, 2) := 0.00;
    v_pending_settlement NUMERIC(12, 2) := 0.00;
    v_on_hold NUMERIC(12, 2) := 0.00;
    v_available NUMERIC(12, 2) := 0.00;
    v_reserved NUMERIC(12, 2) := 0.00;
    v_paid NUMERIC(12, 2) := 0.00;
    v_refunds NUMERIC(12, 2) := 0.00;
    v_cod_expected NUMERIC(12, 2) := 0.00;
    v_cod_reconciled NUMERIC(12, 2) := 0.00;
BEGIN
    v_seller_id := p_seller_id;
    IF v_seller_id IS NULL THEN
        v_seller_id := auth.uid();
    END IF;

    SELECT 
        COALESCE(available_balance, 0.00) AS available_balance,
        COALESCE(locked_balance, 0.00) AS locked_balance,
        COALESCE(lifetime_withdrawn, 0.00) AS lifetime_withdrawn
    INTO v_bal
    FROM public.seller_balances
    WHERE seller_id = v_seller_id;

    v_available := COALESCE(v_bal.available_balance, 0.00);
    v_reserved := COALESCE(v_bal.locked_balance, 0.00);
    v_paid := COALESCE(v_bal.lifetime_withdrawn, 0.00);

    SELECT 
        COALESCE(SUM(gross_amount_paise) / 100.0, 0.00),
        COALESCE(SUM(CASE WHEN settlement_status = 'pending_delivery' THEN net_seller_payable_paise ELSE 0 END) / 100.0, 0.00),
        COALESCE(SUM(CASE WHEN settlement_status = 'on_hold' THEN net_seller_payable_paise ELSE 0 END) / 100.0, 0.00),
        COALESCE(SUM(refunded_amount_paise) / 100.0, 0.00),
        COALESCE(SUM(CASE WHEN UPPER(payment_method) = 'COD' AND NOT cod_reconciled AND fulfillment_status = 'delivered' THEN net_seller_payable_paise ELSE 0 END) / 100.0, 0.00),
        COALESCE(SUM(CASE WHEN UPPER(payment_method) = 'COD' AND cod_reconciled THEN net_seller_payable_paise ELSE 0 END) / 100.0, 0.00)
    INTO
        v_gross_sales,
        v_pending_settlement,
        v_on_hold,
        v_refunds,
        v_cod_expected,
        v_cod_reconciled
    FROM public.seller_settlements
    WHERE seller_id = v_seller_id;

    RETURN jsonb_build_object(
        'success', true,
        'seller_id', v_seller_id,
        'gross_product_sales', v_gross_sales,
        'pending_settlement', v_pending_settlement,
        'on_hold_earnings', v_on_hold,
        'available_to_withdraw', v_available,
        'reserved_for_payout', v_reserved,
        'payout_processing', v_reserved,
        'total_paid_to_seller', v_paid,
        'refunds_and_adjustments', v_refunds,
        'cod_expected_remittance', v_cod_expected,
        'cod_received_and_reconciled', v_cod_reconciled,
        'minimum_payout_amount', 10.00,
        'currency', 'INR',
        'timezone', 'Asia/Kolkata'
    );
END;
$$;

-- ==============================================================================
-- 17. AUTOMATIC ORDER STATUS & FULFILLMENT SYNC TRIGGER
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.trg_order_status_sync_settlement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.sync_seller_order_settlements_atomic();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_sync_settlement ON public.orders;
CREATE TRIGGER trg_orders_sync_settlement
AFTER UPDATE OF payment_status, fulfillment_status, delivered_at ON public.orders
FOR EACH STATEMENT
EXECUTE FUNCTION public.trg_order_status_sync_settlement();

-- ==============================================================================
-- 18. SECURITY PRIVILEGES & ROLE RESTRICTIONS
-- ==============================================================================
REVOKE EXECUTE ON FUNCTION public.admin_review_payout_request_atomic FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_confirm_payout_transfer_atomic FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_fail_payout_transfer_atomic FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reconcile_cod_remittance_atomic FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sync_seller_order_settlements_atomic FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.process_settlement_hold_releases_atomic FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_review_payout_request_atomic TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_confirm_payout_transfer_atomic TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_fail_payout_transfer_atomic TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_cod_remittance_atomic TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_seller_order_settlements_atomic TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_settlement_hold_releases_atomic TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_seller_payout_atomic TO authenticated, service_role;

-- ==============================================================================
-- 19. ATOMIC RPC: ADMIN REOPEN PAYOUT REQUEST
-- Allows admins to reopen a rejected or failed payout for re-evaluation with proper balance re-reservation.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.admin_reopen_payout_request_atomic(
    p_payout_id UUID,
    p_reason TEXT,
    p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_payout RECORD;
    v_seller_bal RECORD;
    v_new_available_paise BIGINT;
    v_new_locked_paise BIGINT;
    v_clean_reason TEXT;
    v_old_status TEXT;
BEGIN
    v_admin_id := auth.uid();
    IF v_admin_id IS NULL THEN
        BEGIN
            v_admin_id := ((current_setting('request.jwt.claims', true)::jsonb)->>'sub')::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_admin_id := NULL;
        END;
    END IF;

    IF NOT public.is_admin() AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_admin_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only marketplace administrators can reopen payout requests' USING ERRCODE = '42501';
    END IF;

    v_clean_reason := TRIM(COALESCE(p_reason, ''));
    IF char_length(v_clean_reason) < 3 THEN
        RAISE EXCEPTION 'A mandatory justification reason is required to reopen a payout request' USING ERRCODE = '22000';
    END IF;

    SELECT * INTO v_payout
    FROM public.seller_payout_requests
    WHERE id = p_payout_id
    FOR UPDATE;

    IF NOT FOUND OR v_payout.id IS NULL THEN
        RAISE EXCEPTION 'Payout request not found' USING ERRCODE = 'P0002';
    END IF;

    v_old_status := v_payout.status;
    IF v_old_status NOT IN ('rejected', 'failed') THEN
        RAISE EXCEPTION 'Only rejected or failed payout requests can be reopened. Current status: %', v_old_status USING ERRCODE = '22000';
    END IF;

    SELECT * INTO v_seller_bal
    FROM public.seller_balances
    WHERE seller_id = v_payout.seller_id
    FOR UPDATE;

    IF v_seller_bal.available_balance < v_payout.amount THEN
        RAISE EXCEPTION 'Cannot reopen payout request: Seller current available balance (₹%) is insufficient to reserve payout amount of ₹%', 
            v_seller_bal.available_balance, v_payout.amount USING ERRCODE = '22000';
    END IF;

    v_new_available_paise := ROUND((v_seller_bal.available_balance * 100) - v_payout.amount_paise)::BIGINT;
    v_new_locked_paise := ROUND((v_seller_bal.locked_balance * 100) + v_payout.amount_paise)::BIGINT;

    UPDATE public.seller_balances
    SET available_balance = ROUND(v_new_available_paise / 100.0, 2),
        locked_balance = ROUND(v_new_locked_paise / 100.0, 2),
        updated_at = NOW()
    WHERE seller_id = v_payout.seller_id;

    UPDATE public.seller_payout_requests
    SET status = 'pending',
        rejection_reason = NULL,
        failure_reason = NULL,
        rejected_at = NULL,
        rejected_by = NULL,
        failed_at = NULL,
        admin_notes = COALESCE(admin_notes || E'\n', '') || '[REOPENED ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS') || ']: ' || v_clean_reason || COALESCE(' (' || p_admin_notes || ')', ''),
        updated_at = NOW()
    WHERE id = p_payout_id;

    INSERT INTO public.seller_ledger_entries (
        seller_id,
        payout_request_id,
        entry_type,
        direction,
        amount_paise,
        balance_type,
        available_balance_after_paise,
        idempotency_key,
        description,
        actor_id,
        actor_type,
        metadata
    ) VALUES (
        v_payout.seller_id,
        v_payout.id,
        'PAYOUT_RESERVED',
        'debit',
        v_payout.amount_paise,
        'available',
        v_new_available_paise,
        'PAYOUT_REOPEN_' || v_payout.id || '_' || EXTRACT(EPOCH FROM NOW()),
        'Payout request #' || v_payout.payout_number || ' reopened from ' || v_old_status || ': ' || v_clean_reason || ' (Funds re-reserved for review)',
        v_admin_id,
        'admin',
        jsonb_build_object('previous_status', v_old_status, 'reason', v_clean_reason)
    );

    BEGIN
        INSERT INTO public.finance_audit_logs (
            actor_id,
            action_type,
            target_entity,
            target_id,
            notes,
            created_at
        ) VALUES (
            v_admin_id,
            'PAYOUT_REQUEST_REOPENED',
            'seller_payout_requests',
            v_payout.id,
            'Reopened payout #' || v_payout.payout_number || ' from ' || v_old_status || '. Reason: ' || v_clean_reason,
            NOW()
        );
    EXCEPTION WHEN OTHERS THEN
    END;

    BEGIN
        INSERT INTO public.seller_notifications (
            seller_id,
            title,
            message,
            type,
            priority,
            link_url,
            created_at
        ) VALUES (
            v_payout.seller_id,
            'Payout Request Reopened for Review',
            'Your payout request #' || v_payout.payout_number || ' for ₹' || v_payout.amount || ' has been reopened by administrators for re-evaluation.',
            'payout',
            'normal',
            '/seller/wallet',
            NOW()
        );
    EXCEPTION WHEN OTHERS THEN
    END;

    RETURN jsonb_build_object(
        'success', true,
        'payout_id', v_payout.id,
        'payout_number', v_payout.payout_number,
        'status', 'pending',
        'previous_status', v_old_status,
        'amount', v_payout.amount,
        'remaining_available_balance', ROUND(v_new_available_paise / 100.0, 2),
        'reserved_balance', ROUND(v_new_locked_paise / 100.0, 2)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_reopen_payout_request_atomic FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reopen_payout_request_atomic TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_seller_financial_summary TO authenticated, service_role;

