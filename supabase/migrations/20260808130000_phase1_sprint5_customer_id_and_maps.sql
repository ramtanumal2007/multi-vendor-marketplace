-- ==============================================================================
-- PHASE 1 SPRINT 5: CUSTOMER ID CODE & GOOGLE MAPS DELIVERY EXTENSIONS
-- DO NOT EXECUTE AUTOMATICALLY. Run manually in Supabase SQL Editor if needed.
-- ==============================================================================

BEGIN;

-- 1. ADD CUSTOMER ID CODE COLUMN TO PROFILES TABLE
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS customer_id_code TEXT;

-- 2. ADD LANDMARK & GOOGLE MAPS URL COLUMNS TO ADDRESSES TABLE
ALTER TABLE public.addresses
ADD COLUMN IF NOT EXISTS landmark TEXT,
ADD COLUMN IF NOT EXISTS google_maps_url TEXT;

-- 3. ADD SELLER PROCESSING DAYS TO STORES TABLE
ALTER TABLE public.stores
ADD COLUMN IF NOT EXISTS processing_time_days INT DEFAULT 1;

COMMIT;
