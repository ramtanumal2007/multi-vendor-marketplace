/**
 * VENDOSMITH Supabase Edge Guard
 *
 * Lightweight, zero-dependency environment validation helper designed for
 * Next.js Edge Runtime (middleware.ts) and Edge API routes.
 *
 * Standards:
 * - Uses only Web Standard APIs (URL, Set, RegExp).
 * - No Node.js built-ins (fs, path, crypto, child_process, process/buffer).
 * - Fails closed before any Supabase client (browser, SSR, admin) is instantiated.
 */

/**
 * Authoritative Production Supabase Project Reference.
 * Exact project ref: ddrwsbfrhuzunvgcezaw
 * Any TEST or staging environment connecting to this ref will fail-closed.
 */
export const PRODUCTION_SUPABASE_PROJECT_REF = "ddrwsbfrhuzunvgcezaw";

/**
 * Checks whether the given URL points to a local development environment.
 */
export function isLocalSupabaseUrl(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== "string") {
    return false;
  }
  try {
    const parsed = new URL(urlStr.trim());
    const hostname = parsed.hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

/**
 * Extracts the Supabase project reference from a URL.
 * Standard hosted Supabase URLs are in the form: https://<project-ref>.supabase.co
 * Local development URLs return null.
 */
export function extractSupabaseProjectRef(urlStr: string): string | null {
  if (!urlStr || typeof urlStr !== "string") {
    return null;
  }
  try {
    const parsed = new URL(urlStr.trim());
    const hostname = parsed.hostname.toLowerCase();

    if (isLocalSupabaseUrl(urlStr)) {
      return null;
    }

    // Match standard hosted Supabase domain patterns: <project-ref>.supabase.<tld>
    const match = hostname.match(/^([a-z0-9_-]+)\.supabase\.(co|in|net)$/i);
    if (match) {
      return match[1].toLowerCase();
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Identifies Production by exact authoritative hostname ddrwsbfrhuzunvgcezaw.supabase.co.
 * In Production mode, accepts ONLY the exact authoritative hostname over HTTPS with default port.
 * Does not rely on loose substring or segment matching.
 */
export function isProductionSupabaseUrl(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== "string") {
    return false;
  }
  try {
    const parsed = new URL(urlStr.trim());
    const hostname = parsed.hostname.toLowerCase();

    if (isLocalSupabaseUrl(urlStr)) {
      return false;
    }

    // Must be HTTPS protocol
    if (parsed.protocol !== "https:") {
      return false;
    }

    // Must not use non-standard port
    if (parsed.port && parsed.port !== "443") {
      return false;
    }

    return hostname === `${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`;
  } catch {
    return false;
  }
}

/**
 * Retrieves the set of approved staging project references.
 * Sources:
 * 1. Explicit allowlist array passed to function
 * 2. APPROVED_STAGING_SUPABASE_REFS (comma-separated env var)
 * 3. STAGING_SUPABASE_PROJECT_REF (single env var)
 * 4. NEXT_PUBLIC_STAGING_SUPABASE_REF (single env var)
 *
 * Production project ref or hostname is strictly excluded from staging allowlists.
 * Wildcard entries are ignored.
 */
export function getApprovedStagingProjectRefs(explicitAllowlist?: string[]): Set<string> {
  const refs = new Set<string>();

  const addIfSafe = (r: string) => {
    const trimmed = r.trim().toLowerCase();
    if (!trimmed || trimmed === "*" || trimmed === "all") {
      return;
    }
    // Production project ref or hostname can NEVER be an approved staging ref
    if (
      trimmed === PRODUCTION_SUPABASE_PROJECT_REF ||
      trimmed === `${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`
    ) {
      return;
    }
    refs.add(trimmed);
  };

  if (explicitAllowlist && Array.isArray(explicitAllowlist)) {
    for (const r of explicitAllowlist) {
      if (typeof r === "string") {
        addIfSafe(r);
      }
    }
  }

  const envRefs =
    process.env.APPROVED_STAGING_SUPABASE_REFS ||
    process.env.STAGING_SUPABASE_PROJECT_REF ||
    process.env.NEXT_PUBLIC_STAGING_SUPABASE_REF ||
    "";

  for (const r of envRefs.split(",")) {
    addIfSafe(r);
  }

  return refs;
}

export interface SupabaseValidationResult {
  valid: boolean;
  environment: "TEST" | "PRODUCTION";
  projectRef: string | null;
  isLocal: boolean;
  hostname: string;
}

/**
 * Validates Supabase URL against active environment safety rules.
 * Fails closed with descriptive errors that never expose secret keys.
 *
 * Rules:
 * 1. URL must be a valid absolute URL.
 * 2. When CASHFREE_ENVIRONMENT is TEST:
 *    - Production project ref 'ddrwsbfrhuzunvgcezaw' is strictly rejected.
 *    - Local development URLs (127.0.0.1, localhost) are permitted.
 *    - Hosted staging URLs must match an explicit approved staging project ref.
 *    - Unknown hosted staging project refs fail closed.
 * 3. When CASHFREE_ENVIRONMENT is PRODUCTION:
 *    - Local development URLs are strictly rejected.
 *    - Non-production hosted project refs are strictly rejected.
 *    - Only authoritative production project ref 'ddrwsbfrhuzunvgcezaw' is permitted.
 */
export function validateSupabaseConfig(
  rawUrl?: string,
  rawCashfreeEnv?: string,
  customStagingAllowlist?: string[]
): SupabaseValidationResult {
  const urlStr = (
    rawUrl ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ""
  ).trim();

  if (!urlStr) {
    throw new Error(
      "[SECURITY FAIL-CLOSED] Supabase URL is not configured (NEXT_PUBLIC_SUPABASE_URL is missing or empty)."
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error(
      "[SECURITY FAIL-CLOSED] Invalid Supabase URL format. Must be a valid absolute URL."
    );
  }

  // Determine target environment: default to TEST unless explicitly PRODUCTION / PROD / LIVE
  const envVal = (
    rawCashfreeEnv ||
    process.env.CASHFREE_ENVIRONMENT ||
    process.env.NEXT_PUBLIC_CASHFREE_ENVIRONMENT ||
    "TEST"
  )
    .trim()
    .toUpperCase();

  const environment: "TEST" | "PRODUCTION" =
    envVal === "PRODUCTION" || envVal === "PROD" || envVal === "LIVE"
      ? "PRODUCTION"
      : "TEST";

  const isLocal = isLocalSupabaseUrl(urlStr);
  const projectRef = extractSupabaseProjectRef(urlStr);
  const isProduction = isProductionSupabaseUrl(urlStr);
  const hostname = parsed.hostname.toLowerCase();

  // RULE A: When environment is TEST (or staging):
  if (environment === "TEST") {
    // 1. Unconditionally reject Production URL in TEST mode
    if (
      isProduction ||
      projectRef === PRODUCTION_SUPABASE_PROJECT_REF ||
      hostname === `${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`
    ) {
      throw new Error(
        `[CRITICAL SECURITY FAIL-CLOSED] Production Supabase project ref '${PRODUCTION_SUPABASE_PROJECT_REF}' is strictly prohibited when CASHFREE_ENVIRONMENT is 'TEST'. Refusing to initialize Supabase client.`
      );
    }

    // 2. Allow local development configuration (e.g., http://127.0.0.1:54321)
    if (isLocal) {
      return {
        valid: true,
        environment,
        projectRef: null,
        isLocal: true,
        hostname,
      };
    }

    // 3. For hosted staging, enforce approved project ref or allowlist
    const approvedStagingRefs = getApprovedStagingProjectRefs(customStagingAllowlist);
    const isApproved =
      (projectRef && approvedStagingRefs.has(projectRef)) ||
      approvedStagingRefs.has(hostname);

    if (!isApproved) {
      const targetIdentifier = projectRef ? `project ref '${projectRef}'` : `host '${hostname}'`;
      throw new Error(
        `[CRITICAL SECURITY FAIL-CLOSED] Hosted Supabase ${targetIdentifier} is not in the approved staging project allowlist. Unknown hosted staging project refs must fail closed. Set APPROVED_STAGING_SUPABASE_REFS or STAGING_SUPABASE_PROJECT_REF to authorize.`
      );
    }

    return {
      valid: true,
      environment,
      projectRef,
      isLocal: false,
      hostname,
    };
  }

  // RULE B: When environment is PRODUCTION:
  if (environment === "PRODUCTION") {
    // 1. Reject local development configuration in Production
    if (isLocal) {
      throw new Error(
        `[CRITICAL SECURITY FAIL-CLOSED] Local development Supabase URL ('${hostname}') is strictly prohibited when CASHFREE_ENVIRONMENT is 'PRODUCTION'. Production must connect to the authoritative remote database.`
      );
    }

    // 2. In Production mode, accept only the exact authoritative hostname over HTTPS with default port
    if (
      !isProduction ||
      hostname !== `${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co` ||
      projectRef !== PRODUCTION_SUPABASE_PROJECT_REF ||
      parsed.protocol !== "https:" ||
      (parsed.port && parsed.port !== "443")
    ) {
      const targetIdentifier = projectRef ? `project ref '${projectRef}'` : `host '${hostname}'`;
      throw new Error(
        `[CRITICAL SECURITY FAIL-CLOSED] Hosted Supabase ${targetIdentifier} does not match the authoritative Production project ref '${PRODUCTION_SUPABASE_PROJECT_REF}'. Refusing to initialize Production Supabase client with non-production database.`
      );
    }

    return {
      valid: true,
      environment,
      projectRef,
      isLocal: false,
      hostname,
    };
  }

  throw new Error("[SECURITY FAIL-CLOSED] Unhandled environment state in Supabase configuration validation.");
}
