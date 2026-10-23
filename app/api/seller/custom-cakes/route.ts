import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/seller/custom-cakes
 * Retrieves custom cake requests assigned exclusively to the logged-in seller.
 */
export async function GET() {
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

    // Verify user is an approved seller
    const { data: sellerProf } = await supabaseAdmin
      .from("seller_profiles")
      .select("id, verification_status")
      .eq("id", user.id)
      .maybeSingle();

    if (!sellerProf || sellerProf.verification_status !== "approved") {
      return NextResponse.json({ success: false, message: "Seller access denied." }, { status: 403 });
    }

    const { data: requests, error } = await supabaseAdmin
      .from("custom_cake_requests")
      .select("*, stores(id, name)")
      .eq("assigned_seller_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({
        success: true,
        requests: [],
        notice: "No assigned custom cake requests.",
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
