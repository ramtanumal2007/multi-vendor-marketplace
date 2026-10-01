-- ==============================================================================
-- Rollback Migration: 20261001000000_seller_workflow_lifecycle_fix_rollback.sql
-- ==============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.reconsider_seller(UUID, TEXT);
DROP FUNCTION IF EXISTS public.reconsider_seller(UUID);

-- Note: We preserve columns on seller_profiles and seller_application_events
-- to ensure historical audit data integrity is never corrupted during rollback.

COMMIT;
