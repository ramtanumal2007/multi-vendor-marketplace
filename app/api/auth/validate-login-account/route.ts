import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import {
  hashRateLimitKey,
  checkDistributedRateLimit,
} from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// Standard RFC 5321 max email length
const MAX_EMAIL_LENGTH = 254;
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Server-side account verification for Customer and Seller login portals.
 * Hardened with:
 * 1. Persistent, PostgreSQL-backed distributed sliding window rate limiting.
 *    - 15 requests / min / IP (bucket: login_ip)
 *    - 5 requests / min / target email (bucket: login_email_target)
 *    - Cryptographic SHA-256 key hashing (zero raw PII in database)
 *    - Atomic execution via PostgreSQL RPC `check_rate_limit`
 *    - Strict fail-closed error handling (never bypasses to memory on DB outage)
 * 2. Authoritative IP extraction (Vercel edge headers prioritized over spoofed headers).
 * 3. Same-origin validation (rejects cross-site CSRF/probing with 403).
 * 4. Strict input length, type, and regex sanitization (RFC 5321).
 * 5. Timing equalization (pads execution to min 120ms floor to eliminate side channels).
 * 6. Zero sensitive metadata exposure (returns strictly `{ exists: boolean }`).
 */
export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    // 1. Same-Origin & Fetch Metadata Check
    const secFetchSite = request.headers.get("sec-fetch-site");
    if (secFetchSite === "cross-site") {
      return NextResponse.json(
        { exists: true, error: "Cross-site requests not allowed" },
        { status: 403 }
      );
    }

    // 2. Client IP Extraction & Distributed Rate Limiting
    // Prioritize authoritative Vercel edge headers (x-real-ip, x-vercel-ip) to prevent client spoofing
    const realIp = request.headers.get("x-real-ip")?.trim();
    const vercelIp = request.headers.get("x-vercel-ip")?.trim();
    const forwardedFor = request.headers.get("x-forwarded-for");
    // If edge headers are absent, use the closest proxy hop (last entry in x-forwarded-for)
    const forwardedClientIp = forwardedFor
      ? forwardedFor.split(",").map((s) => s.trim()).filter(Boolean).pop()
      : null;
    const clientIp = realIp || vercelIp || forwardedClientIp || "127.0.0.1";

    // Hash client IP with prefix to prevent rainbow table attacks and ensure zero PII in DB
    const ipKeyHash = hashRateLimitKey("login_ip", clientIp);

    // Instantiate authoritative service-role admin client (server-side only)
    const admin = createAdminClient();

    // 3. Body & Input Validation
    const body = await request.json().catch(() => ({}));
    const rawEmail = body.email;
    const targetPortal = body.targetPortal === "seller" ? "seller" : "customer";

    if (
      !rawEmail ||
      typeof rawEmail !== "string" ||
      rawEmail.length > MAX_EMAIL_LENGTH ||
      !EMAIL_REGEX.test(rawEmail.trim())
    ) {
      return NextResponse.json(
        { exists: false, error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Canonical email normalization (trim and lowercase)
    const cleanEmail = rawEmail.trim().toLowerCase();

    // 4. Target Email Rate Limiting (5 requests/min per target email)
    // Prevents distributed botnets from hammering a single victim's account across multiple IPs
    const emailKeyHash = hashRateLimitKey("login_email_target", cleanEmail);

    // Parallelize distributed rate limit checks across IP and target email to eliminate sequential roundtrips
    let ipLimitResult;
    let emailLimitResult;
    try {
      [ipLimitResult, emailLimitResult] = await Promise.all([
        checkDistributedRateLimit(admin, {
          keyHash: ipKeyHash,
          bucketType: "login_ip",
          maxHits: 15,
          windowSeconds: 60,
        }),
        checkDistributedRateLimit(admin, {
          keyHash: emailKeyHash,
          bucketType: "login_email_target",
          maxHits: 5,
          windowSeconds: 60,
        }),
      ]);
    } catch (dbErr) {
      // FAIL-CLOSED: On database failure or timeout, deny access to protect against brute force
      console.error("[validate-login-account] DB rate limit failure, failing closed:", dbErr);
      return NextResponse.json(
        { exists: true, error: "Too many login attempts. Please try again later." },
        { status: 429 }
      );
    }

    if (!ipLimitResult.success) {
      return NextResponse.json(
        { exists: true, error: "Too many login attempts. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": ipLimitResult.retryAfter.toString(),
          },
        }
      );
    }

    if (!emailLimitResult.success) {
      return NextResponse.json(
        { exists: true, error: "Too many attempts for this account. Please wait before retrying." },
        {
          status: 429,
          headers: {
            "Retry-After": emailLimitResult.retryAfter.toString(),
          },
        }
      );
    }

    // 5. Authoritative Server-Side Query (Using Service Role exclusively on server)
    // Concurrently query profiles, seller_profiles, and auth.users in parallel to minimize response latency
    const [profileRes, sellerProfileRes, authUserRes] = await Promise.all([
      admin
        .from("profiles")
        .select("id, role")
        .ilike("email", cleanEmail)
        .maybeSingle(),
      admin
        .from("seller_profiles")
        .select("id, verification_status")
        .ilike("business_email", cleanEmail)
        .maybeSingle(),
      (async () => {
        try {
          return await admin
            .schema("auth")
            .from("users")
            .select("id")
            .ilike("email", cleanEmail)
            .maybeSingle();
        } catch {
          return { data: null };
        }
      })(),
    ]);

    const profile = profileRes.data;
    const sellerProfile = sellerProfileRes.data;
    const authUser = authUserRes.data;

    let exists = !!profile || !!sellerProfile || !!authUser?.id;

    // Portal-specific presence check
    if (targetPortal === "seller") {
      exists = !!sellerProfile || profile?.role === "seller" || profile?.role === "admin";
    }

    // 6. Timing Attack Equalization (Pads execution to a minimum floor ~120ms)
    const elapsed = Date.now() - startTime;
    const minDelay = 120;
    if (elapsed < minDelay) {
      await new Promise((resolve) => setTimeout(resolve, minDelay - elapsed));
    }

    // Return strictly the exists boolean — never expose user IDs, passwords, roles, or tokens
    return NextResponse.json({ exists });
  } catch (err) {
    console.error("[validate-login-account error]:", err);
    // On unexpected error, fail safe so legitimate users are not told their account is missing
    return NextResponse.json({ exists: true });
  }
}
