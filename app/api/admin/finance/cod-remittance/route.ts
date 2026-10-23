import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/finance/cod-remittance
 * Returns delivered COD orders awaiting courier remittance and history of recorded batches.
 */
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

    if (profile?.role !== "admin") {
      return NextResponse.json({ success: false, message: "Forbidden: Admin access required." }, { status: 403 });
    }

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Fetch already reconciled COD order IDs
    const { data: reconciledRemittances, error: recErr } = await supabaseAdmin
      .from("cod_order_remittances")
      .select("order_id");

    if (recErr) {
      console.error("Database error fetching reconciled remittances:", recErr);
      throw new Error(`Failed to fetch reconciled remittances: ${recErr.message}`);
    }

    const reconciledOrderIds = (reconciledRemittances || [])
      .map((r) => r.order_id)
      .filter((id): id is string => Boolean(id));

    // 2. Delivered COD orders awaiting courier remittance
    let ordersQuery = supabaseAdmin
      .from("orders")
      .select(`
        id,
        order_number,
        invoice_number,
        total,
        payment_method,
        payment_status,
        fulfillment_status,
        delivered_at,
        created_at,
        tracking_number,
        tracking_carrier
      `)
      .eq("payment_method", "COD")
      .eq("fulfillment_status", "delivered");

    if (reconciledOrderIds.length > 0) {
      ordersQuery = ordersQuery.not("id", "in", `(${reconciledOrderIds.join(",")})`);
    }

    const { data: pendingCodOrders, error: codErr } = await ordersQuery.order("created_at", { ascending: false });

    if (codErr) {
      console.error("Database error fetching pending COD orders:", codErr);
      throw new Error(`Failed to fetch pending COD orders: ${codErr.message}`);
    }

    // 3. Remittance Batches history
    const { data: batches, error: batchErr } = await supabaseAdmin
      .from("cod_remittance_batches")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (batchErr) {
      console.error("Database error fetching COD batches:", batchErr);
      throw new Error(`Failed to fetch COD batches: ${batchErr.message}`);
    }

    const mappedOrders = (pendingCodOrders || []).map((o) => {
      const amt = typeof o.total === "number" ? o.total : Number(o.total || 0);
      const safeTotal = Number.isFinite(amt) ? amt : 0;
      return {
        id: o.id,
        order_number: o.order_number,
        invoice_number: o.invoice_number,
        total_amount: safeTotal,
        total: safeTotal,
        delivered_at: o.delivered_at,
        created_at: o.created_at,
        courier_tracking_id: o.tracking_number || null,
        tracking_number: o.tracking_number,
        tracking_carrier: o.tracking_carrier,
        payment_method: o.payment_method,
        fulfillment_status: o.fulfillment_status,
        remittance_status: "PENDING",
      };
    });

    const mappedBatches = (batches || []).map((b) => ({
      id: b.id,
      batch_reference: b.batch_reference,
      courier_partner: b.courier_partner,
      remittance_date: b.remittance_date,
      total_collected: Number(b.total_collected_paise || 0) / 100.0,
      orders_count: b.orders_count,
      notes: b.notes,
      created_at: b.created_at,
    }));

    return NextResponse.json({
      success: true,
      orders: mappedOrders,
      pendingOrders: mappedOrders,
      batches: mappedBatches,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
