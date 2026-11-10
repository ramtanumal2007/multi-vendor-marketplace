import {
  createBrowserClient,
  createServerClient as ssrCreateServerClient,
  type CookieMethodsServer,
  type CookieMethodsServerDeprecated,
  type CookieOptionsWithName,
  type CookieOptions,
} from '@supabase/ssr'
import {
  createClient as createSupabaseJsClient,
  type SupabaseClient,
  type SupabaseClientOptions,
} from '@supabase/supabase-js'

export type {
  SupabaseClient,
  SupabaseClientOptions,
  CookieMethodsServer,
  CookieMethodsServerDeprecated,
  CookieOptionsWithName,
  CookieOptions,
};


import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  isLocalSupabaseUrl,
  extractSupabaseProjectRef,
  isProductionSupabaseUrl,
  getApprovedStagingProjectRefs,
  validateSupabaseConfig,
  type SupabaseValidationResult,
} from './supabase-edge-guard';

export {
  PRODUCTION_SUPABASE_PROJECT_REF,
  isLocalSupabaseUrl,
  extractSupabaseProjectRef,
  isProductionSupabaseUrl,
  getApprovedStagingProjectRefs,
  validateSupabaseConfig,
  type SupabaseValidationResult,
};

let client: ReturnType<typeof createBrowserClient> | undefined;

/**
 * Resets the cached singleton client (primarily for testing and environment switching).
 */
export function resetSupabaseClientCache(): void {
  client = undefined;
}

/**
 * Overloaded createClient:
 * 1. createClient() -> Returns browser/SSR client with anon key.
 * 2. createClient(url, key, options?) -> Returns validated server-side SupabaseClient.
 */
export function createClient(): ReturnType<typeof createBrowserClient>;
export function createClient(
  supabaseUrl: string,
  supabaseKey: string,
  options?: SupabaseClientOptions<"public">
): SupabaseClient;
export function createClient(
  supabaseUrl?: string,
  supabaseKey?: string,
  options?: SupabaseClientOptions<"public">
): any {
  if (!supabaseUrl && !supabaseKey) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
      throw new Error(
        "[SECURITY FAIL-CLOSED] Missing Supabase configuration (NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set)."
      );
    }

    // Enforce environment validation before client instantiation
    validateSupabaseConfig(url);

    if (typeof window === "undefined") {
      return createBrowserClient(url, anonKey);
    }
    if (!client) {
      client = createBrowserClient(url, anonKey);
    }
    return client;
  }

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "[SECURITY FAIL-CLOSED] Missing Supabase configuration (URL or Key is not provided)."
    );
  }

  // Enforce environment validation on direct server-side initialization
  validateSupabaseConfig(supabaseUrl);

  return createSupabaseJsClient(supabaseUrl, supabaseKey, options);
}

/**
 * Creates an authoritative server-side Supabase admin client (using SUPABASE_SERVICE_ROLE_KEY)
 * with fail-closed environment validation.
 */
export function createAdminClient(
  customUrl?: string,
  customKey?: string,
  options?: SupabaseClientOptions<"public">
): SupabaseClient {
  const url = (customUrl || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const key = (customKey || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  if (!url || !key) {
    throw new Error(
      "[SECURITY FAIL-CLOSED] Missing Supabase admin configuration (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set)."
    );
  }

  validateSupabaseConfig(url);

  return createSupabaseJsClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    ...options,
  });
}

/**
 * Alias for createAdminClient for explicit service-role naming.
 */
export const createServiceRoleClient = createAdminClient;

/**
 * Alias for createAdminClient matching the createSupabaseAdminClient import convention.
 */
export const createSupabaseAdminClient = createAdminClient;

/**
 * Creates an anonymous public server-side Supabase client (using NEXT_PUBLIC_SUPABASE_ANON_KEY)
 * with fail-closed environment validation.
 */
export function createAnonClient(
  customUrl?: string,
  customKey?: string,
  options?: SupabaseClientOptions<"public">
): SupabaseClient {
  const url = (customUrl || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const anonKey = (customKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

  if (!url || !anonKey) {
    throw new Error(
      "[SECURITY FAIL-CLOSED] Missing Supabase anon configuration (NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set)."
    );
  }

  validateSupabaseConfig(url);

  return createSupabaseJsClient(url, anonKey, options);
}

export type SSROptions<SchemaName extends string = "public"> = SupabaseClientOptions<SchemaName> & {
  cookieOptions?: CookieOptionsWithName;
  cookies: CookieMethodsServer | CookieMethodsServerDeprecated;
  cookieEncoding?: "raw" | "base64url";
};

/**
 * Creates a guarded server-side SSR Supabase client (using @supabase/ssr)
 * with fail-closed environment validation before any client is instantiated.
 */
export function createServerClientSSR<
  Database = any,
  SchemaName extends string & keyof Omit<Database, "__InternalSupabase"> = "public" extends keyof Omit<Database, "__InternalSupabase">
    ? "public"
    : string & keyof Omit<Database, "__InternalSupabase">
>(
  supabaseUrl: string,
  supabaseKey: string,
  options: SSROptions<SchemaName>
): SupabaseClient<Database, SchemaName> {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "[SECURITY FAIL-CLOSED] Missing Supabase configuration (URL or Key is not provided)."
    );
  }
  validateSupabaseConfig(supabaseUrl);
  return (ssrCreateServerClient as any)(supabaseUrl, supabaseKey, options);
}

/**
 * Explicit alias for createServerClientSSR adhering to guarded client conventions.
 */
export const createGuardedSSRClient = createServerClientSSR;

/**
 * Creates a validated server-side Supabase client.
 * Supports both:
 * 1. @supabase/ssr client with cookie handling (when options.cookies is provided)
 * 2. @supabase/supabase-js direct client
 */
export function createServerClient<
  Database = any,
  SchemaName extends string & keyof Omit<Database, "__InternalSupabase"> = "public" extends keyof Omit<Database, "__InternalSupabase">
    ? "public"
    : string & keyof Omit<Database, "__InternalSupabase">
>(
  supabaseUrl: string,
  supabaseKey: string,
  options: SSROptions<SchemaName>
): SupabaseClient<Database, SchemaName>;
export function createServerClient<
  Database = any,
  SchemaName extends string & keyof Omit<Database, "__InternalSupabase"> = "public" extends keyof Omit<Database, "__InternalSupabase">
    ? "public"
    : string & keyof Omit<Database, "__InternalSupabase">
>(
  url: string,
  key: string,
  options?: SupabaseClientOptions<SchemaName>
): SupabaseClient<Database, SchemaName>;
export function createServerClient(
  url: string,
  key: string,
  options?: any
): any {
  if (!url || !key) {
    throw new Error(
      "[SECURITY FAIL-CLOSED] Missing Supabase configuration (URL or Key is not provided)."
    );
  }

  validateSupabaseConfig(url);

  if (options && options.cookies) {
    return (ssrCreateServerClient as any)(url, key, options);
  }

  return createSupabaseJsClient(url, key, options);
}



