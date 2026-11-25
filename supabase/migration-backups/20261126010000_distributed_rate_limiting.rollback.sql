-- ==============================================================================
-- ROLLBACK: 20261126010000_distributed_rate_limiting.rollback.sql
-- PURPOSE: Rollback distributed rate limiting migration.
-- ==============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.cleanup_expired_rate_limits(INT);
DROP FUNCTION IF EXISTS public.check_rate_limit(TEXT, TEXT, INT, INT);
DROP TABLE IF EXISTS public.rate_limit_counters;

COMMIT;
