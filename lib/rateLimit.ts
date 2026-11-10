/**
 * Lightweight In-Memory Sliding-Window Rate Limiter
 * 
 * Provides per-process request throttling suitable for Node.js server runtimes.
 * 
 * Architecture Note:
 * - Operates in-process memory with automatic cleanup of expired buckets.
 * - In distributed serverless clusters with multiple warm instances, rate-limit
 *   counters are tracked per instance. For cluster-wide coordination in high-scale
 *   environments, this interface can seamlessly be backed by Redis / Upstash.
 */

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateLimitRecord>();

// Periodic cleanup of expired records every 5 minutes to prevent memory leak
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
 * Check and record a request against the rate limiter.
 * 
 * @param key Unique identifier (e.g. `seller-inv:${userId}` or `ip:${ipAddress}`)
 * @param options Rate limit window and request cap options
 * @returns RateLimitResult with pass/fail and remaining budget
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
    // New window
    const resetAt = now + windowMs;
    memoryStore.set(key, { count: 1, resetAt });
    return {
      success: true,
      limit: maxRequests,
      remaining: maxRequests - 1,
      resetAt,
    };
  }

  // Existing window
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
