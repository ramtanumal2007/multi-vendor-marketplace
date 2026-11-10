-- ==============================================================================
-- VENDOSMITH: REPLACEMENT TO REAL ORDER CONVERSION & WALLET CHECKOUT SCHEMA
-- Migration: 20261011000000_vendosmith_replacement_orders_and_wallet_checkout.sql
-- Description:
--   1. Orders Table Extensions:
--      - is_replacement (BOOLEAN): Identifies replacement orders
--      - original_order_id (UUID): Durable reference to the parent original order
--      - replacement_request_id (UUID): Durable reference to the return/replacement request
--      - replacement_difference (NUMERIC): Price difference (+payable / -credit due)
--      - replacement_original_value (NUMERIC): Authoritative eligible value of returned item
--      - wallet_amount_applied (NUMERIC): Authoritative customer wallet debit applied at checkout
--   2. Indexes for fast order history and replacement tracking queries
--   3. Upgraded get_seller_orders() RPC to expose replacement attribution safely
--
-- CRITICAL SAFETY NOTICE:
-- Prepared for local staging and architectural compliance.
-- DO NOT EXECUTE AUTOMATICALLY ON REMOTE PRODUCTION DATABASE WITHOUT APPROVAL.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. EXTEND ORDERS TABLE WITH REPLACEMENT ATTRIBUTES & WALLET USAGE
-- ------------------------------------------------------------------------------
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS is_replacement BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS original_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS replacement_request_id UUID REFERENCES public.return_requests(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS replacement_difference NUMERIC(12, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS replacement_original_value NUMERIC(12, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS wallet_amount_applied NUMERIC(12, 2) DEFAULT 0.00;

COMMENT ON COLUMN public.orders.is_replacement IS 'Flag indicating order was created from a validated replacement exchange';
COMMENT ON COLUMN public.orders.original_order_id IS 'Durable foreign key to the original order from which this replacement originated';
COMMENT ON COLUMN public.orders.replacement_request_id IS 'Durable foreign key to the parent return_requests record';
COMMENT ON COLUMN public.orders.replacement_difference IS 'Price difference (+ve customer owed difference, -ve customer credit due)';
COMMENT ON COLUMN public.orders.replacement_original_value IS 'Authoritative value of the original returned item credited towards replacement';
COMMENT ON COLUMN public.orders.wallet_amount_applied IS 'Amount of customer wallet balance applied as discount/tender towards order total';

-- ------------------------------------------------------------------------------
-- 2. INDEXES FOR HIGH-PERFORMANCE QUERYING
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_is_replacement 
ON public.orders(is_replacement) 
WHERE is_replacement = true;

CREATE INDEX IF NOT EXISTS idx_orders_original_order_id 
ON public.orders(original_order_id);

CREATE INDEX IF NOT EXISTS idx_orders_replacement_request_id 
ON public.orders(replacement_request_id);

-- Ensure return_requests has foreign key index on replacement_order_id
CREATE INDEX IF NOT EXISTS idx_return_requests_replacement_order_id 
ON public.return_requests(replacement_order_id);

COMMIT;
