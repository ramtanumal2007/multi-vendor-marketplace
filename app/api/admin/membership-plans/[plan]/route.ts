import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: { plan: string } }
) {
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

    const planUpper = params.plan?.toUpperCase().trim();
    if (!["BASIC", "PRO", "BUSINESS"].includes(planUpper)) {
      return NextResponse.json(
        { success: false, message: "Invalid plan identifier. Must be BASIC, PRO, or BUSINESS." },
        { status: 400 }
      );
    }

    const body = await req.json();

    // Bounds checking
    if (body.monthlyPrice < 0 || body.yearlyPrice < 0) {
      return NextResponse.json({ success: false, message: "Prices cannot be negative." }, { status: 400 });
    }
    if (body.commissionRate < 0 || body.commissionRate > 1) {
      return NextResponse.json(
        { success: false, message: "Commission rate must be between 0.00 and 1.00 (e.g. 0.08 for 8%)." },
        { status: 400 }
      );
    }
    if (body.gstRate < 0 || body.gstRate > 1) {
      return NextResponse.json({ success: false, message: "GST rate must be between 0.00 and 1.00." }, { status: 400 });
    }
    if (body.tcsRate < 0 || body.tcsRate > 1) {
      return NextResponse.json({ success: false, message: "TCS rate must be between 0.00 and 1.00." }, { status: 400 });
    }
    if (body.tdsRate < 0 || body.tdsRate > 1) {
      return NextResponse.json({ success: false, message: "TDS rate must be between 0.00 and 1.00." }, { status: 400 });
    }
    if (body.minPayoutAmount < 0 || body.escrowHoldDays < 0 || body.gracePeriodDays < 0) {
      return NextResponse.json({ success: false, message: "Payout/membership days and amounts cannot be negative." }, { status: 400 });
    }

    // Try RPC first
    const { data: rpcResult, error: rpcErr } = await supabase.rpc("admin_update_membership_plan", {
      p_plan: planUpper,
      p_display_name: body.displayName || planUpper,
      p_description: body.description || "",
      p_active: body.active !== undefined ? Boolean(body.active) : true,
      p_monthly_price: Number(body.monthlyPrice) || 0,
      p_yearly_price: Number(body.yearlyPrice) || 0,
      p_max_products: body.maxProducts === null || body.maxProducts === "" || body.maxProducts === undefined ? null : Number(body.maxProducts),
      p_storage_limit_mb: Number(body.storageLimitMB) || 500,
      p_admin_users_limit: body.adminUsersLimit === null || body.adminUsersLimit === "" || body.adminUsersLimit === undefined ? null : Number(body.adminUsersLimit),
      p_seller_coupons_enabled: Boolean(body.sellerCouponsEnabled),
      p_bulk_csv_enabled: Boolean(body.bulkCsvEnabled),
      p_ranking_boost_level: body.rankingBoostLevel || "Standard",
      p_commission_rate: Number(body.commissionRate) || 0,
      p_billing_duration: body.billingDuration || "Monthly / Yearly",
      p_grace_period_days: Number(body.gracePeriodDays) || 7,
      p_min_payout_amount: Number(body.minPayoutAmount) || 1000,
      p_escrow_hold_days: Number(body.escrowHoldDays) || 7,
      p_gst_rate: Number(body.gstRate) || 0.18,
      p_tcs_rate: Number(body.tcsRate) || 0.005,
      p_tds_rate: Number(body.tdsRate) || 0.001,
    });

    if (!rpcErr && rpcResult?.success) {
      return NextResponse.json({ success: true, result: rpcResult });
    }

    // Direct fallback with service_role if RPC unapplied
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: oldRow } = await supabaseAdmin
      .from("marketplace_fee_rules")
      .select("*")
      .eq("membership_plan", planUpper)
      .maybeSingle();

    const updatePayload: Record<string, unknown> = {
      display_name: body.displayName || planUpper,
      description: body.description || "",
      active: body.active !== undefined ? Boolean(body.active) : true,
      monthly_price: Number(body.monthlyPrice) || 0,
      yearly_price: Number(body.yearlyPrice) || 0,
      max_products: body.maxProducts === null || body.maxProducts === "" || body.maxProducts === undefined ? null : Number(body.maxProducts),
      storage_limit_mb: Number(body.storageLimitMB) || 500,
      admin_users_limit: body.adminUsersLimit === null || body.adminUsersLimit === "" || body.adminUsersLimit === undefined ? null : Number(body.adminUsersLimit),
      seller_coupons_enabled: Boolean(body.sellerCouponsEnabled),
      bulk_csv_enabled: Boolean(body.bulkCsvEnabled),
      ranking_boost_level: body.rankingBoostLevel || "Standard",
      commission_rate: Number(body.commissionRate) || 0,
      billing_duration: body.billingDuration || "Monthly / Yearly",
      grace_period_days: Number(body.gracePeriodDays) || 7,
      min_payout_amount: Number(body.minPayoutAmount) || 1000,
      escrow_hold_days: Number(body.escrowHoldDays) || 7,
      gst_rate: Number(body.gstRate) || 0.18,
      tcs_rate: Number(body.tcsRate) || 0.005,
      tds_rate: Number(body.tdsRate) || 0.001,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("marketplace_fee_rules")
      .update(updatePayload)
      .eq("membership_plan", planUpper)
      .select()
      .single();

    if (updateErr) {
      console.error("Error updating fee rule:", updateErr);
      return NextResponse.json({ success: false, message: updateErr.message }, { status: 500 });
    }

    // Try logging to finance_audit_logs
    try {
      await supabaseAdmin.from("finance_audit_logs").insert({
        actor_id: user.id,
        action_type: "MEMBERSHIP_PLAN_UPDATED",
        target_entity: "marketplace_fee_rules",
        target_id: updated?.id || null,
        old_values: oldRow || {},
        new_values: updatePayload,
        notes: `Admin ${user.email} updated ${planUpper} membership plan rules`,
      });
    } catch {
      // Non-fatal if table not yet created in dev
    }

    return NextResponse.json({ success: true, plan: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("Admin membership plans PATCH error:", err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
