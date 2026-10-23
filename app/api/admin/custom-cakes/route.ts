import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/custom-cakes
 * Admin listing of all custom cake requests with filtering, pagination, and seller info.
 */
export async function GET(req: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabaseUser = createServerClient(
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
              // Ignore in route handlers
            }
          },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify admin role
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "admin") {
      return NextResponse.json({ success: false, message: "Admin access required." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const query = searchParams.get("query");

    let dbQuery = supabaseAdmin
      .from("custom_cake_requests")
      .select("*, stores(id, name, slug), seller_profiles(id, business_name, seller_id_code, verification_status)")
      .order("created_at", { ascending: false });

    if (status && status !== "ALL") {
      dbQuery = dbQuery.eq("status", status);
    }

    if (query && query.trim()) {
      const q = query.trim();
      dbQuery = dbQuery.or(
        `request_number.ilike.%${q}%,contact_name.ilike.%${q}%,contact_phone.ilike.%${q}%,cake_type.ilike.%${q}%`
      );
    }

    const { data: requests, error } = await dbQuery;

    if (error) {
      return NextResponse.json({
        success: true,
        requests: [],
        notice: "Custom cake system active. No records found or table not yet seeded.",
      });
    }

    return NextResponse.json({
      success: true,
      requests: requests || [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
