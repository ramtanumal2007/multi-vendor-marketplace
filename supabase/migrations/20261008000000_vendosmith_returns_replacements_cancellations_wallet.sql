-- ==============================================================================
-- VENDOSMITH: RETURNS, REPLACEMENTS, REFUNDS, CANCELLATIONS & WALLET SYSTEM
-- Migration: 20261008000000_vendosmith_returns_replacements_cancellations_wallet.sql
-- Description:
--   1. Customer Wallet and Ledger-based Wallet Transactions
--   2. Item-level Return & Replacement Requests (RET-VSM-XXXXXX)
--   3. Audit Logging for Return/Replacement State Transitions
--   4. Order Cancellations with Reason Tracking & Inventory Restoration
--   5. Delivered Timestamp & Cancellation Timestamp Columns on Orders
--   6. Category Return Policy Attributes (is_returnable, return_window_days)
--   7. RLS Policies enforcing strict Customer, Seller, and Admin privacy boundaries
-- SAFETY NOTICE: Prepared locally. DO NOT RUN AUTOMATICALLY ON REMOTE PRODUCTION DB.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. EXTEND ORDERS TABLE WITH DELIVERY AND CANCELLATION TIMESTAMPS
-- ------------------------------------------------------------------------------
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS cancel_reason_code TEXT,
ADD COLUMN IF NOT EXISTS cancel_reason_text TEXT;

-- ------------------------------------------------------------------------------
-- 2. EXTEND CATEGORIES TABLE WITH RETURN POLICY ATTRIBUTES
-- ------------------------------------------------------------------------------
ALTER TABLE public.categories
ADD COLUMN IF NOT EXISTS is_returnable BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS return_window_days INT DEFAULT 7;

-- Set non-returnable categories: Cake & Grocery/Food
UPDATE public.categories
SET is_returnable = false, return_window_days = 0
WHERE slug IN ('cake', 'grocery-food')
   OR parent_id IN (SELECT id FROM public.categories WHERE slug IN ('cake', 'grocery-food'));

-- ------------------------------------------------------------------------------
-- 3. CUSTOMER WALLETS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
    balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_customer_wallets_customer_id ON public.customer_wallets(customer_id);

-- ------------------------------------------------------------------------------
-- 4. WALLET TRANSACTIONS TABLE (LEDGER-STYLE ACCOUNTING)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL REFERENCES public.customer_wallets(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN (
        'REPLACEMENT_PRICE_DIFFERENCE_CREDIT',
        'REFUND_WALLET_CREDIT',
        'WALLET_USED_FOR_REPLACEMENT',
        'WALLET_DEBIT',
        'ADMIN_ADJUSTMENT'
    )),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    direction TEXT NOT NULL CHECK (direction IN ('credit', 'debit')),
    balance_after NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    reference_type TEXT NOT NULL CHECK (reference_type IN ('replacement_request', 'return_request', 'order', 'admin_action')),
    reference_id TEXT NOT NULL,
    description TEXT NOT NULL,
    idempotency_key TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id ON public.wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_customer_id ON public.wallet_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_ref ON public.wallet_transactions(reference_type, reference_id);

-- ------------------------------------------------------------------------------
-- 5. RETURN & REPLACEMENT REQUESTS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.return_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_number TEXT UNIQUE NOT NULL,
    request_type TEXT NOT NULL CHECK (request_type IN ('return', 'replacement')),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    seller_id UUID REFERENCES public.seller_profiles(id) ON DELETE SET NULL,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity INT NOT NULL CHECK (quantity > 0),
    reason_code TEXT NOT NULL CHECK (reason_code IN (
        'DEFECTIVE_DAMAGED',
        'QUALITY_NOT_SATISFACTORY',
        'SIZE_FIT_ISSUE',
        'WRONG_PRODUCT',
        'DOES_NOT_MATCH_DESCRIPTION',
        'OTHER'
    )),
    reason_text TEXT,
    -- Refund Fields (Admin-Only Visibility for Bank/UPI credentials)
    refund_method TEXT CHECK (refund_method IN ('UPI', 'BANK_ACCOUNT', 'WALLET', 'NONE')),
    refund_details JSONB DEFAULT '{}'::jsonb,
    refund_amount NUMERIC(12, 2) DEFAULT 0.00,
    refund_payment_reference TEXT,
    refund_processed_at TIMESTAMPTZ,
    refund_processed_by UUID REFERENCES public.profiles(id),
    -- Replacement-Specific Fields
    replacement_product_id UUID REFERENCES public.products(id),
    replacement_quantity INT CHECK (replacement_quantity IS NULL OR replacement_quantity > 0),
    replacement_seller_id UUID REFERENCES public.seller_profiles(id),
    replacement_price_difference NUMERIC(12, 2) DEFAULT 0.00,
    replacement_payment_method TEXT CHECK (replacement_payment_method IN ('UPI', 'ONLINE', 'COD', 'WALLET', 'NONE')),
    replacement_payment_status TEXT CHECK (replacement_payment_status IN ('pending', 'paid', 'not_applicable')) DEFAULT 'pending',
    replacement_payment_reference TEXT,
    replacement_order_id UUID REFERENCES public.orders(id),
    -- Overall Lifecycle State Machine
    status TEXT NOT NULL DEFAULT 'RETURN_REQUESTED' CHECK (status IN (
        -- Return States
        'RETURN_REQUESTED',
        'RETURN_APPROVED',
        'RETURN_REJECTED',
        'RETURN_PICKUP_SCHEDULED',
        'RETURN_PICKUP_ASSIGNED',
        'RETURN_PICKED_UP',
        'RETURN_RECEIVED_BY_SELLER',
        'RETURN_INSPECTION',
        'REFUND_APPROVED',
        'REFUND_PROCESSING',
        'REFUND_COMPLETED',
        'RETURN_CLOSED',
        -- Replacement States
        'REPLACEMENT_REQUESTED',
        'REPLACEMENT_APPROVED',
        'OLD_PRODUCT_PICKUP_PENDING',
        'OLD_PRODUCT_PICKED_UP',
        'OLD_PRODUCT_RECEIVED',
        'REPLACEMENT_PAYMENT_PENDING',
        'REPLACEMENT_PAYMENT_COMPLETED',
        'REPLACEMENT_ORDER_CREATED',
        'REPLACEMENT_DISPATCHED',
        'REPLACEMENT_OUT_FOR_DELIVERY',
        'REPLACEMENT_DELIVERED',
        'REPLACEMENT_CLOSED'
    )),
    seller_received_at TIMESTAMPTZ,
    seller_received_confirmed_by UUID REFERENCES public.profiles(id),
    pickup_status TEXT DEFAULT 'PICKUP_PENDING',
    pickup_scheduled_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_return_requests_order_id ON public.return_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_return_requests_order_item_id ON public.return_requests(order_item_id);
CREATE INDEX IF NOT EXISTS idx_return_requests_customer_id ON public.return_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_return_requests_seller_id ON public.return_requests(seller_id);
CREATE INDEX IF NOT EXISTS idx_return_requests_status ON public.return_requests(status);
CREATE INDEX IF NOT EXISTS idx_return_requests_return_number ON public.return_requests(return_number);
-- Ensure at most one active return or replacement request exists per order item
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_return_per_item ON public.return_requests(order_item_id) 
WHERE status NOT IN ('RETURN_CLOSED', 'RETURN_REJECTED', 'REPLACEMENT_CLOSED');

-- ------------------------------------------------------------------------------
-- 6. RETURN & REPLACEMENT AUDIT LOGS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.return_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_request_id UUID NOT NULL REFERENCES public.return_requests(id) ON DELETE CASCADE,
    actor_type TEXT NOT NULL CHECK (actor_type IN ('customer', 'seller', 'admin', 'system')),
    actor_id UUID REFERENCES public.profiles(id),
    action TEXT NOT NULL,
    previous_status TEXT,
    new_status TEXT,
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_return_audit_logs_request_id ON public.return_audit_logs(return_request_id);

-- ------------------------------------------------------------------------------
-- 7. ORDER CANCELLATIONS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_cancellations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reason_code TEXT NOT NULL CHECK (reason_code IN (
        'ORDERED_BY_MISTAKE',
        'FOUND_BETTER_PRICE',
        'DELIVERY_TAKING_TOO_LONG',
        'NO_LONGER_NEEDED',
        'OTHER'
    )),
    reason_text TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    cancelled_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_order_cancellations_order_id ON public.order_cancellations(order_id);
CREATE INDEX IF NOT EXISTS idx_order_cancellations_customer_id ON public.order_cancellations(customer_id);

-- ------------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY (RLS) & PRIVACY POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.customer_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_cancellations ENABLE ROW LEVEL SECURITY;

-- Customer Wallets Policies
DROP POLICY IF EXISTS "Customers view own wallet" ON public.customer_wallets;
DROP POLICY IF EXISTS "Admin full access customer wallets" ON public.customer_wallets;

CREATE POLICY "Customers view own wallet" ON public.customer_wallets
FOR SELECT USING (auth.uid() = customer_id);

CREATE POLICY "Admin full access customer wallets" ON public.customer_wallets
FOR ALL USING (public.is_admin());

-- Wallet Transactions Policies
DROP POLICY IF EXISTS "Customers view own transactions" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Admin full access wallet transactions" ON public.wallet_transactions;

CREATE POLICY "Customers view own transactions" ON public.wallet_transactions
FOR SELECT USING (auth.uid() = customer_id);

CREATE POLICY "Admin full access wallet transactions" ON public.wallet_transactions
FOR ALL USING (public.is_admin());

-- Return Requests Policies
DROP POLICY IF EXISTS "Customers view own return requests" ON public.return_requests;
DROP POLICY IF EXISTS "Customers insert own return requests" ON public.return_requests;
DROP POLICY IF EXISTS "Sellers view own return requests" ON public.return_requests;
DROP POLICY IF EXISTS "Sellers confirm product received" ON public.return_requests;
DROP POLICY IF EXISTS "Admin full access return requests" ON public.return_requests;

CREATE POLICY "Customers view own return requests" ON public.return_requests
FOR SELECT USING (auth.uid() = customer_id);

CREATE POLICY "Customers insert own return requests" ON public.return_requests
FOR INSERT WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Sellers view own return requests" ON public.return_requests
FOR SELECT USING (
    (seller_id IS NOT NULL AND auth.uid() = seller_id) 
    OR (request_type = 'replacement' AND auth.uid() = replacement_seller_id)
);

-- Column-level Security: Prevent direct client PostgREST leakage of customer refund credentials
REVOKE SELECT (refund_details) ON public.return_requests FROM authenticated, anon;

CREATE POLICY "Admin full access return requests" ON public.return_requests
FOR ALL USING (public.is_admin());

-- Return Audit Logs Policies
DROP POLICY IF EXISTS "Customers view own audit logs" ON public.return_audit_logs;
DROP POLICY IF EXISTS "Sellers view audit logs for own returns" ON public.return_audit_logs;
DROP POLICY IF EXISTS "Admin full access return audit logs" ON public.return_audit_logs;

CREATE POLICY "Customers view own audit logs" ON public.return_audit_logs
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.return_requests r
        WHERE r.id = return_audit_logs.return_request_id
        AND r.customer_id = auth.uid()
    )
);

CREATE POLICY "Sellers view audit logs for own returns" ON public.return_audit_logs
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.return_requests r
        WHERE r.id = return_audit_logs.return_request_id
        AND (r.seller_id = auth.uid() OR r.replacement_seller_id = auth.uid())
    )
);

CREATE POLICY "Admin full access return audit logs" ON public.return_audit_logs
FOR ALL USING (public.is_admin());

-- Order Cancellations Policies
DROP POLICY IF EXISTS "Customers view own cancellations" ON public.order_cancellations;
DROP POLICY IF EXISTS "Admin full access cancellations" ON public.order_cancellations;

CREATE POLICY "Customers view own cancellations" ON public.order_cancellations
FOR SELECT USING (auth.uid() = customer_id);

CREATE POLICY "Admin full access cancellations" ON public.order_cancellations
FOR ALL USING (public.is_admin());

COMMIT;
