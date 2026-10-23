import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/custom-cakes/sellers
 * Returns approved sellers only for custom cake request forwarding (Rule P).
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

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "admin") {
      return NextResponse.json({ success: false, message: "Admin access required." }, { status: 403 });
    }

    // Only approved sellers
    const { data: sellers, error } = await supabaseAdmin
      .from("seller_profiles")
      .select("id, business_name, seller_id_code, verification_status")
      .eq("verification_status", "approved")
      .order("business_name", { ascending: true });

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    // Also get their stores
    const sellerIds = (sellers || []).map((s) => s.id);
    const { data: stores } = await supabaseAdmin
      .from("stores")
      .select("id, name, seller_id, status")
      .in("seller_id", sellerIds);

    const storeMap = new Map();
    (stores || []).forEach((st) => {
      if (!storeMap.has(st.seller_id)) {
        storeMap.set(st.seller_id, st);
      }
    });

    const eligibleSellers = (sellers || []).map((s) => ({
      ...s,
      store: storeMap.get(s.id) || null,
    }));

    return NextResponse.json({
      success: true,
      sellers: eligibleSellers,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
