import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/finance/cod-remittance/reconcile
 * Records a courier remittance batch and marks included delivered COD orders as reconciled.
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

    if (profile?.role !== "admin") {
      return NextResponse.json({ success: false, message: "Forbidden: Admin access required." }, { status: 403 });
    }

    const body = await req.json();
    const batchReference = body.batchReference || body.remittance_reference || body.batch_reference;
    const courierPartner = body.courierPartner || body.courier_name || body.courier_partner;
    const remittanceDate = body.remittanceDate || body.remittance_date || new Date().toISOString().slice(0, 10);
    const orderIds = body.orderIds || body.order_ids;
    const notes = body.notes || body.note;

    if (!batchReference || batchReference.trim().length < 3) {
      return NextResponse.json(
        { success: false, message: "A valid courier remittance batch reference is required (min 3 characters)." },
        { status: 400 }
      );
    }

    if (!courierPartner || courierPartner.trim().length === 0) {
      return NextResponse.json(
        { success: false, message: "Courier partner name is required." },
        { status: 400 }
      );
    }

    if (!remittanceDate) {
      return NextResponse.json(
        { success: false, message: "Remittance date is required." },
        { status: 400 }
      );
    }

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json(
        { success: false, message: "Please select at least one delivered COD order to reconcile." },
        { status: 400 }
      );
    }

    const { data: rpcRes, error: rpcErr } = await supabase.rpc("reconcile_cod_remittance_atomic", {
      p_batch_reference: batchReference.trim().toUpperCase(),
      p_courier_partner: courierPartner.trim(),
      p_remittance_date: remittanceDate,
      p_order_ids: orderIds,
      p_notes: notes ? notes.trim() : null,
    });

    if (rpcErr) {
      console.error("Reconcile COD remittance error:", rpcErr);
      return NextResponse.json(
        { success: false, message: rpcErr.message || "Failed to reconcile COD remittance batch." },
        { status: 400 }
      );
    }

    return NextResponse.json(rpcRes);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
