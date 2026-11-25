-- ==============================================================================
-- MIGRATION: 20261126010000_distributed_rate_limiting.sql
-- PURPOSE:
-- 1. Create logged table public.rate_limit_counters for persistent distributed rate limiting.
-- 2. Implement atomic PostgreSQL RPC public.check_rate_limit(TEXT, TEXT, INT, INT) with sliding window.
-- 3. Implement cleanup RPC public.cleanup_expired_rate_limits(INT) for expired counters.
-- 4. Enforce strict least-privilege security: REVOKE from public/anon/authenticated, GRANT to service_role only.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. TABLE: public.rate_limit_counters
-- Standard logged table (NOT unlogged) with primary key on pseudonymized key_hash.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  key_hash VARCHAR(64) PRIMARY KEY,
  bucket_type VARCHAR(32) NOT NULL DEFAULT 'default',
  count INT NOT NULL DEFAULT 1 CHECK (count >= 0),
  reset_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Index for efficient cleanup queries and window inspection
CREATE INDEX IF NOT EXISTS idx_rate_limit_counters_reset_at 
  ON public.rate_limit_counters (reset_at);

-- ------------------------------------------------------------------------------
-- 2. TABLE SECURITY & PERMISSIONS
-- Least privilege: strictly accessible by service_role only.
-- ------------------------------------------------------------------------------
ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.rate_limit_counters FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.rate_limit_counters TO service_role;

-- ------------------------------------------------------------------------------
-- 3. RPC: public.check_rate_limit
-- Atomically increments or resets the counter under concurrency.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key_hash TEXT,
  p_bucket_type TEXT,
  p_max_hits INT,
  p_window_seconds INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_reset_at TIMESTAMPTZ;
  v_count INT;
  v_allowed BOOLEAN;
  v_retry_after INT;
BEGIN
  -- Strict validation of inputs
  IF p_key_hash IS NULL OR length(p_key_hash) <> 64 THEN
    RAISE EXCEPTION 'INVALID_KEY_HASH: Must be 64-character SHA-256 hex string';
  END IF;
  IF p_max_hits IS NULL OR p_max_hits < 1 THEN
    RAISE EXCEPTION 'INVALID_MAX_HITS: Must be greater than 0';
  END IF;
  IF p_window_seconds IS NULL OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'INVALID_WINDOW_SECONDS: Must be greater than 0';
  END IF;

  -- Atomic upsert:
  -- If key is missing -> insert count = 1, reset_at = v_now + window
  -- If key exists:
  --   If reset_at <= v_now (window expired) -> reset count = 1, reset_at = v_now + window
  --   If reset_at > v_now (window active) -> count = count + 1, retain reset_at
  INSERT INTO public.rate_limit_counters (
    key_hash,
    bucket_type,
    count,
    reset_at,
    updated_at
  )
  VALUES (
    p_key_hash,
    COALESCE(p_bucket_type, 'default'),
    1,
    v_now + (p_window_seconds || ' seconds')::INTERVAL,
    v_now
  )
  ON CONFLICT (key_hash) DO UPDATE
    SET count = CASE
                  WHEN public.rate_limit_counters.reset_at <= v_now THEN 1
                  ELSE public.rate_limit_counters.count + 1
                END,
        reset_at = CASE
                     WHEN public.rate_limit_counters.reset_at <= v_now THEN v_now + (p_window_seconds || ' seconds')::INTERVAL
                     ELSE public.rate_limit_counters.reset_at
                   END,
        bucket_type = EXCLUDED.bucket_type,
        updated_at = v_now
  RETURNING count, reset_at INTO v_count, v_reset_at;

  v_allowed := (v_count <= p_max_hits);
  v_retry_after := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_reset_at - v_now)))::INT);

  -- Safe opportunistic batch cleanup of stale records older than 15 minutes (2% probability)
  IF (random() < 0.02) THEN
    DELETE FROM public.rate_limit_counters
    WHERE reset_at < (v_now - INTERVAL '15 minutes')
      AND ctid IN (
        SELECT ctid FROM public.rate_limit_counters
        WHERE reset_at < (v_now - INTERVAL '15 minutes')
        LIMIT 100
      );
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'current_count', v_count,
    'max_hits', p_max_hits,
    'reset_at', v_reset_at,
    'retry_after', v_retry_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, TEXT, INT, INT) TO service_role;

-- ------------------------------------------------------------------------------
-- 4. RPC: public.cleanup_expired_rate_limits
-- Explicit maintenance function to prune expired counter records.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_expired_rate_limits(
  p_older_than_minutes INT DEFAULT 15
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted_count INT;
BEGIN
  DELETE FROM public.rate_limit_counters
  WHERE reset_at < (clock_timestamp() - (p_older_than_minutes || ' minutes')::INTERVAL);
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_rate_limits(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_rate_limits(INT) TO service_role;

COMMIT;
