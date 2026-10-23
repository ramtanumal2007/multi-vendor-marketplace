import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createSupabaseAdminClient } from "@/lib/supabase";
import { insertReturnAuditLog } from "@/lib/return-service";

export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/seller/returns/[id]/dispatch
 * Replacement merchant acknowledges preparation and dispatches assigned replacement product(s).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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
            } catch {}
          },
        },
      }
    );

    const {
      data: { user },
      error: authErr,
    } = await supabaseUser.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Verify approved seller
    const { data: sellerProf } = await supabaseAdmin
      .from("seller_profiles")
      .select("id, verification_status, business_name")
      .eq("id", user.id)
      .maybeSingle();

    if (!sellerProf || sellerProf.verification_status !== "approved") {
      return NextResponse.json({ success: false, message: "Seller access denied." }, { status: 403 });
    }

    // Fetch return request
    const { data: returnReq, error: fetchErr } = await supabaseAdmin
      .from("return_requests")
      .select("*")
      .eq("id", params.id)
      .single();

    if (fetchErr || !returnReq) {
      return NextResponse.json({ success: false, message: "Return request not found." }, { status: 404 });
    }

    if (returnReq.request_type !== "replacement") {
      return NextResponse.json({ success: false, message: "Action only valid for replacement requests." }, { status: 400 });
    }

    const refDetails = (returnReq.refund_details || {}) as Record<string, unknown>;
    const replItems = Array.isArray(refDetails.replacementItems)
      ? (refDetails.replacementItems as Array<Record<string, unknown>>)
      : [];

    const isPrimaryReplSeller = returnReq.replacement_seller_id === user.id;
    const hasAssignedItem = replItems.some((it) => it.sellerId === user.id);

    if (!isPrimaryReplSeller && !hasAssignedItem) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. You are not an assigned replacement merchant for this request." },
        { status: 403 }
      );
    }

    const prevStatus = returnReq.status;
    const validDispatchFrom = [
      "OLD_PRODUCT_PICKUP_PENDING",
      "OLD_PRODUCT_PICKED_UP",
      "OLD_PRODUCT_RECEIVED",
      "REPLACEMENT_ORDER_CREATED",
      "REPLACEMENT_APPROVED",
    ];

    if (!validDispatchFrom.includes(prevStatus) && prevStatus !== "REPLACEMENT_DISPATCHED") {
      return NextResponse.json(
        {
          success: false,
          message: `Cannot dispatch replacement while request is in status ${prevStatus}.`,
        },
        { status: 400 }
      );
    }

    const newStatus = "REPLACEMENT_DISPATCHED";

    // Update return request status if it hasn't reached or surpassed REPLACEMENT_DISPATCHED
    if (prevStatus !== "REPLACEMENT_DISPATCHED" && prevStatus !== "REPLACEMENT_DELIVERED" && prevStatus !== "REPLACEMENT_CLOSED") {
      const { error: updErr } = await supabaseAdmin
        .from("return_requests")
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", params.id);

      if (updErr) {
        return NextResponse.json({ success: false, message: updErr.message }, { status: 500 });
      }
    }

    // Record audit log
    await insertReturnAuditLog(supabaseAdmin, {
      returnRequestId: params.id,
      actorType: "seller",
      actorId: user.id,
      action: "SELLER_DISPATCHED_REPLACEMENT",
      previousStatus: prevStatus,
      newStatus,
      notes: `Merchant ${sellerProf.business_name} dispatched assigned replacement package.`,
      metadata: {
        sellerId: user.id,
        businessName: sellerProf.business_name,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Replacement shipment dispatched successfully.",
      newStatus,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
