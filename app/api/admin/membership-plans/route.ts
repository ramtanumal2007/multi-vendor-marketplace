import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET() {
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
              // Ignore in route handlers
            }
          },
        },
      }
    );

    // 1. Authenticate Admin
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Forbidden: Admin access required." },
        { status: 403 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: plans, error: queryErr } = await supabaseAdmin
      .from("marketplace_fee_rules")
      .select(`
        id,
        membership_plan,
        display_name,
        description,
        active,
        monthly_price,
        yearly_price,
        max_products,
        storage_limit_mb,
        admin_users_limit,
        seller_coupons_enabled,
        bulk_csv_enabled,
        ranking_boost_level,
        commission_rate,
        billing_duration,
        grace_period_days,
        min_payout_amount,
        escrow_hold_days,
        gst_rate,
        tcs_rate,
        tds_rate,
        platform_absorbs_coupons,
        created_at,
        updated_at,
        updated_by,
        profiles:updated_by (
          full_name,
          email
        )
      `)
      .order("monthly_price", { ascending: true });

    if (queryErr) {
      console.error("Error fetching membership plans:", queryErr);
      return NextResponse.json({ success: false, message: queryErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      plans: plans || [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("Admin membership plans GET error:", err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
