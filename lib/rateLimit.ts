import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Distributed & In-Memory Rate Limiting Architecture for VENDOSMITH
 * 
 * 1. Distributed Rate Limiter:
 *    - Backed by persistent PostgreSQL table `public.rate_limit_counters`
 *    - Executed atomically via `public.check_rate_limit(p_key_hash, p_bucket_type, p_max_hits, p_window_seconds)`
 *    - Strict fail-closed behavior on database error (never silent bypass)
 *    - Cryptographic SHA-256 pseudonymization (zero raw PII in database)
 * 
 * 2. In-Memory Fallback:
 *    - Retained for non-distributed lightweight throttling where appropriate
 */

export interface DistributedRateLimitResult {
  success: boolean;
  limit: number;
  currentCount: number;
  remaining: number;
  resetAt: number; // Unix ms
  retryAfter: number; // seconds
}

/**
 * Deterministically pseudonymizes sensitive identifiers (IP, email)
 * using SHA-256 with a domain prefix so raw PII is never stored or transmitted to DB.
 */
export function hashRateLimitKey(prefix: string, rawIdentifier: string): string {
  const normalized = (rawIdentifier || "").trim().toLowerCase();
  return crypto
    .createHash("sha256")
    .update(`${prefix}:${normalized}`)
    .digest("hex");
}

/**
 * Executes atomic distributed rate limiting against PostgreSQL via RPC.
 * Fails closed if the database call errors or returns invalid data.
 */
export async function checkDistributedRateLimit(
  adminClient: SupabaseClient,
  options: {
    keyHash: string;
    bucketType: string;
    maxHits: number;
    windowSeconds: number;
  }
): Promise<DistributedRateLimitResult> {
  const { data, error } = await adminClient.rpc("check_rate_limit", {
    p_key_hash: options.keyHash,
    p_bucket_type: options.bucketType,
    p_max_hits: options.maxHits,
    p_window_seconds: options.windowSeconds,
  });

  if (error || !data) {
    // FAIL-CLOSED: throw so caller can fail closed and reject request
    throw new Error(`[RATE_LIMIT_DB_ERROR] ${error?.message || "Null response from rate limit RPC"}`);
  }

  const allowed = Boolean(data.allowed);
  const currentCount = Number(data.current_count) || 1;
  const maxHits = Number(data.max_hits) || options.maxHits;
  const resetAtMs = data.reset_at ? new Date(data.reset_at).getTime() : Date.now() + options.windowSeconds * 1000;
  const retryAfter = Number(data.retry_after) || Math.max(0, Math.ceil((resetAtMs - Date.now()) / 1000));

  return {
    success: allowed,
    limit: maxHits,
    currentCount,
    remaining: Math.max(0, maxHits - currentCount),
    resetAt: resetAtMs,
    retryAfter,
  };
}

// --------------------------------------------------------------------------
// In-Memory Rate Limiter (Process-Local)
// --------------------------------------------------------------------------
interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateLimitRecord>();

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function purgeExpiredRecords(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  memoryStore.forEach((record, key) => {
    if (record.resetAt <= now) {
      memoryStore.delete(key);
    }
  });
}

export interface RateLimitOptions {
  /** Maximum number of allowed requests in the time window (default: 60) */
  maxRequests?: number;
  /** Duration of window in milliseconds (default: 60,000 ms = 1 minute) */
  windowMs?: number;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

/**
 * Check and record a request against the process-local in-memory rate limiter.
 */
export function checkRateLimit(
  key: string,
  options: RateLimitOptions = {}
): RateLimitResult {
  const now = Date.now();
  purgeExpiredRecords(now);

  const maxRequests = options.maxRequests ?? 60;
  const windowMs = options.windowMs ?? 60 * 1000;

  const existing = memoryStore.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    memoryStore.set(key, { count: 1, resetAt });
    return {
      success: true,
      limit: maxRequests,
      remaining: maxRequests - 1,
      resetAt,
    };
  }

  if (existing.count >= maxRequests) {
    return {
      success: false,
      limit: maxRequests,
      remaining: 0,
      resetAt: existing.resetAt,
    };
  }

  existing.count += 1;
  return {
    success: true,
    limit: maxRequests,
    remaining: maxRequests - existing.count,
    resetAt: existing.resetAt,
  };
}
