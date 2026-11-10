/**
 * VENDOSMITH Database Transient Retry Utility
 * Handles PostgreSQL transient concurrency codes:
 * - 40P01: deadlock_detected
 * - 40001: serialization_failure
 * 
 * Applies exponential backoff with random jitter.
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

const TRANSIENT_PG_CODES = new Set(["40P01", "40001"]);

export function isTransientDbError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const err = error as { code?: string; message?: string; details?: string };
  if (err.code && TRANSIENT_PG_CODES.has(err.code)) {
    return true;
  }

  const msg = (err.message || "").toLowerCase();
  const details = (err.details || "").toLowerCase();

  return (
    msg.includes("deadlock detected") ||
    msg.includes("could not serialize access") ||
    details.includes("deadlock detected") ||
    details.includes("could not serialize access")
  );
}

export async function withDbRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const initialDelay = options.initialDelayMs ?? 100;
  const maxDelay = options.maxDelayMs ?? 1500;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await operation(attempt);
    } catch (err: unknown) {
      lastError = err;

      if (attempt > maxRetries || !isTransientDbError(err)) {
        throw err;
      }

      // Exponential backoff with jitter
      const exponentialDelay = initialDelay * Math.pow(2, attempt - 1);
      const jitter = Math.random() * 50;
      const delayMs = Math.min(exponentialDelay + jitter, maxDelay);

      if (options.onRetry) {
        options.onRetry(err, attempt, delayMs);
      } else {
        console.warn(`[DB Concurrency Retry] Attempt ${attempt} failed with transient error. Retrying in ${Math.round(delayMs)}ms...`);
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}
