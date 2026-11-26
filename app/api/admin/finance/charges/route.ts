import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServerClient, createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function verifyAdminAuth() {
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

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    return {
      error: NextResponse.json(
        { success: false, message: "Forbidden: Admin access required." },
        { status: 403 }
      ),
    };
  }

  return { user, supabase };
}

export async function GET() {
  try {
    const auth = await verifyAdminAuth();
    if (auth.error) return auth.error;

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Fetch fee rules
    const { data: feeRules, error: feeErr } = await supabaseAdmin
      .from("marketplace_fee_rules")
      .select("*")
      .order("monthly_price", { ascending: true });

    if (feeErr) {
      return NextResponse.json({ success: false, message: feeErr.message }, { status: 500 });
    }

    // Fetch recent audit logs
    const { data: auditLogs } = await supabaseAdmin
      .from("finance_audit_logs")
      .select("id, actor_id, action_type, target_entity, target_id, old_values, new_values, notes, created_at, profiles:actor_id(full_name, email)")
      .order("created_at", { ascending: false })
      .limit(20);

    return NextResponse.json({
      success: true,
      feeRules: feeRules || [],
      auditLogs: auditLogs || [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await verifyAdminAuth();
    if (auth.error) return auth.error;
    const { user, supabase } = auth;

    const body = await req.json();

    const planFilter = body.plan ? body.plan.toUpperCase().trim() : null;
    if (planFilter && !["BASIC", "PRO", "BUSINESS"].includes(planFilter)) {
      return NextResponse.json(
        { success: false, message: "Invalid plan identifier. Must be BASIC, PRO, or BUSINESS." },
        { status: 400 }
      );
    }

    // Bounds checking
    if (body.gstRate !== undefined && (body.gstRate < 0 || body.gstRate > 1)) {
      return NextResponse.json({ success: false, message: "GST rate must be between 0.00 and 1.00." }, { status: 400 });
    }
    if (body.tcsRate !== undefined && (body.tcsRate < 0 || body.tcsRate > 1)) {
      return NextResponse.json({ success: false, message: "TCS rate must be between 0.00 and 1.00." }, { status: 400 });
    }
    if (body.tdsRate !== undefined && (body.tdsRate < 0 || body.tdsRate > 1)) {
      return NextResponse.json({ success: false, message: "TDS rate must be between 0.00 and 1.00." }, { status: 400 });
    }
    if (body.fixedPlatformFeePaise !== undefined && Number(body.fixedPlatformFeePaise) < 0) {
      return NextResponse.json({ success: false, message: "Fixed platform fee cannot be negative." }, { status: 400 });
    }

    const changeReason = typeof body.changeReason === "string" && body.changeReason.trim()
      ? body.changeReason.trim()
      : `Admin ${user.email} updated tax & platform charges configuration`;

    // Try RPC first
    const { data: rpcResult, error: rpcErr } = await supabase.rpc("admin_update_financial_charge_toggles", {
      p_plan: planFilter,
      p_gst_enabled: body.gstEnabled !== undefined ? Boolean(body.gstEnabled) : null,
      p_gst_rate: body.gstRate !== undefined ? Number(body.gstRate) : null,
      p_tcs_enabled: body.tcsEnabled !== undefined ? Boolean(body.tcsEnabled) : null,
      p_tcs_rate: body.tcsRate !== undefined ? Number(body.tcsRate) : null,
      p_tds_enabled: body.tdsEnabled !== undefined ? Boolean(body.tdsEnabled) : null,
      p_tds_rate: body.tdsRate !== undefined ? Number(body.tdsRate) : null,
      p_fixed_platform_fee_paise: body.fixedPlatformFeePaise !== undefined ? Math.round(Number(body.fixedPlatformFeePaise)) : null,
      p_fixed_platform_fee_enabled: body.fixedPlatformFeeEnabled !== undefined ? Boolean(body.fixedPlatformFeeEnabled) : null,
      p_change_reason: changeReason,
    });

    if (!rpcErr && rpcResult?.success) {
      try {
        revalidatePath("/admin/membership-plans");
        revalidatePath("/admin/finance");
        revalidatePath("/admin/finance/settings");
        revalidatePath("/seller/products/new");
        revalidatePath("/seller/membership");
      } catch {
        // Safe ignore
      }
      return NextResponse.json({ success: true, result: rpcResult });
    }

    // Direct fallback
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let query = supabaseAdmin.from("marketplace_fee_rules").select("*");
    if (planFilter) {
      query = query.eq("membership_plan", planFilter);
    }
    const { data: oldRows, error: fetchErr } = await query;

    if (fetchErr || !oldRows || oldRows.length === 0) {
      return NextResponse.json({ success: false, message: "Target fee rule(s) not found" }, { status: 404 });
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    };
    if (body.gstEnabled !== undefined) updatePayload.gst_enabled = Boolean(body.gstEnabled);
    if (body.gstRate !== undefined) updatePayload.gst_rate = Number(body.gstRate);
    if (body.tcsEnabled !== undefined) updatePayload.tcs_enabled = Boolean(body.tcsEnabled);
    if (body.tcsRate !== undefined) updatePayload.tcs_rate = Number(body.tcsRate);
    if (body.tdsEnabled !== undefined) updatePayload.tds_enabled = Boolean(body.tdsEnabled);
    if (body.tdsRate !== undefined) updatePayload.tds_rate = Number(body.tdsRate);
    if (body.fixedPlatformFeePaise !== undefined) updatePayload.fixed_platform_fee_paise = Math.round(Number(body.fixedPlatformFeePaise));
    if (body.fixedPlatformFeeEnabled !== undefined) updatePayload.fixed_platform_fee_enabled = Boolean(body.fixedPlatformFeeEnabled);

    for (const oldRow of oldRows) {
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from("marketplace_fee_rules")
        .update(updatePayload)
        .eq("id", oldRow.id)
        .select()
        .single();

      if (updateErr) {
        console.error("Error updating fee rule row:", updateErr);
        return NextResponse.json({ success: false, message: updateErr.message }, { status: 500 });
      }

      try {
        await supabaseAdmin.from("finance_audit_logs").insert({
          actor_id: user.id,
          action_type: "FINANCIAL_CHARGES_CONFIG_UPDATED",
          target_entity: "marketplace_fee_rules",
          target_id: updated.id,
          old_values: oldRow,
          new_values: { ...oldRow, ...updatePayload },
          notes: changeReason,
        });
      } catch {
        // Non-fatal
      }
    }

    try {
      revalidatePath("/admin/membership-plans");
      revalidatePath("/admin/finance");
      revalidatePath("/admin/finance/settings");
      revalidatePath("/seller/products/new");
      revalidatePath("/seller/membership");
    } catch {
      // Safe ignore
    }

    return NextResponse.json({ success: true, message: "Tax and platform charges updated successfully." });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("Admin charges PATCH error:", err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
