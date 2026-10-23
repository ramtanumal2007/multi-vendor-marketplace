import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/finance/settlements/release-holds
 * Admin manual trigger to release matured seller 7-day settlement holds.
 * Strictly requires authenticated session with ADMIN or SUPER_ADMIN role.
 */
export async function POST(req: Request) {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // ignore
            }
          },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const role = (profile?.role || "").toUpperCase();
    if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { success: false, message: "Forbidden: Administrator role required." },
        { status: 403 }
      );
    }

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: result, error: rpcErr } = await supabaseAdmin.rpc(
      "process_settlement_hold_releases_atomic"
    );

    if (rpcErr) {
      console.error("Admin hold release failed:", rpcErr);
      return NextResponse.json(
        { success: false, message: rpcErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Settlement hold releases executed successfully.",
      result: result ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
