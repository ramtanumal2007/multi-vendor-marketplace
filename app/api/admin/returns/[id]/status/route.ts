import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createSupabaseAdminClient } from "@/lib/supabase";
import {
  insertReturnAuditLog,
  createReplacementOrderForReturnRequest,
  calculateFullTenderEligibleValue,
  getOrderWalletDebits,
} from "@/lib/return-service";

export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Formal Valid Transitions Matrix
const VALID_RETURN_TRANSITIONS: Record<string, string[]> = {
  RETURN_REQUESTED: ["RETURN_APPROVED", "RETURN_REJECTED"],
  RETURN_APPROVED: ["RETURN_PICKUP_SCHEDULED", "RETURN_REJECTED"],
  RETURN_PICKUP_SCHEDULED: ["RETURN_PICKED_UP", "RETURN_PICKUP_SCHEDULED", "RETURN_REJECTED"],
  RETURN_PICKED_UP: ["RETURN_RECEIVED_BY_SELLER", "RETURN_INSPECTION"],
  RETURN_RECEIVED_BY_SELLER: ["RETURN_INSPECTION", "REFUND_PROCESSING"],
  RETURN_INSPECTION: ["REFUND_PROCESSING", "RETURN_REJECTED"],
  REFUND_PROCESSING: ["REFUND_COMPLETED"],
  REFUND_COMPLETED: ["RETURN_CLOSED"],
  RETURN_REJECTED: [],
  RETURN_CLOSED: [],
};

const VALID_REPLACEMENT_TRANSITIONS: Record<string, string[]> = {
  REPLACEMENT_REQUESTED: ["REPLACEMENT_APPROVED", "RETURN_REJECTED"],
  REPLACEMENT_APPROVED: [
    "OLD_PRODUCT_PICKUP_PENDING",
    "REPLACEMENT_ORDER_CREATED",
    "REPLACEMENT_SCHEDULED",
    "REPLACEMENT_DISPATCHED",
    "REPLACEMENT_DELIVERED",
    "RETURN_REJECTED",
  ],
  OLD_PRODUCT_PICKUP_PENDING: [
    "OLD_PRODUCT_PICKUP_PENDING", // Reschedule
    "OLD_PRODUCT_PICKED_UP",      // Multi-step: old item collected
    "REPLACEMENT_ORDER_CREATED",
    "REPLACEMENT_DELIVERED",       // Simultaneous same-day exchange: collected & handed over in single visit
    "RETURN_REJECTED",
  ],
  OLD_PRODUCT_PICKED_UP: ["OLD_PRODUCT_RECEIVED", "REPLACEMENT_ORDER_CREATED", "REPLACEMENT_DISPATCHED", "REPLACEMENT_DELIVERED"],
  OLD_PRODUCT_RECEIVED: ["REPLACEMENT_ORDER_CREATED", "REPLACEMENT_DISPATCHED", "REPLACEMENT_DELIVERED"],
  REPLACEMENT_ORDER_CREATED: ["OLD_PRODUCT_PICKUP_PENDING", "REPLACEMENT_DISPATCHED", "REPLACEMENT_DELIVERED", "REPLACEMENT_CLOSED"],
  REPLACEMENT_DISPATCHED: ["REPLACEMENT_OUT_FOR_DELIVERY", "REPLACEMENT_DELIVERED"],
  REPLACEMENT_OUT_FOR_DELIVERY: ["REPLACEMENT_DELIVERED"],
  REPLACEMENT_DELIVERED: ["REPLACEMENT_CLOSED"],
  RETURN_REJECTED: [],
  REPLACEMENT_CLOSED: [],
};

/**
 * POST /api/admin/returns/[id]/status
 * Admin advances return/replacement state machine and records audit trail.
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

    // Verify admin role
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "admin") {
      return NextResponse.json({ success: false, message: "Admin access required." }, { status: 403 });
    }

    const body = await req.json();
    const { newStatus, notes, pickupScheduledDate, pickupStatus } = body;

    if (!newStatus) {
      return NextResponse.json({ success: false, message: "New status is required." }, { status: 400 });
    }

    // Fetch existing request
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.id);
    const { data: existing, error: existErr } = await supabaseAdmin
      .from("return_requests")
      .select("*")
      .eq(isUuid ? "id" : "return_number", params.id)
      .maybeSingle();

    if (existErr || !existing) {
      return NextResponse.json({ success: false, message: "Return request not found." }, { status: 404 });
    }

    const prevStatus = existing.status;
    const isReplacement = existing.request_type === "replacement";

    // 1. Prevent duplicate transition to the same status (unless rescheduling pickup)
    const isReschedule =
      (newStatus === "RETURN_PICKUP_SCHEDULED" && prevStatus === "RETURN_PICKUP_SCHEDULED") ||
      (newStatus === "OLD_PRODUCT_PICKUP_PENDING" && prevStatus === "OLD_PRODUCT_PICKUP_PENDING");

    if (prevStatus === newStatus && !isReschedule) {
      return NextResponse.json(
        { success: false, message: `Request is already in status ${prevStatus}.` },
        { status: 400 }
      );
    }

    // 2. Validate Allowed Transitions Matrix
    const allowedTransitions = isReplacement
      ? VALID_REPLACEMENT_TRANSITIONS[prevStatus] || []
      : VALID_RETURN_TRANSITIONS[prevStatus] || [];

    if (!allowedTransitions.includes(newStatus)) {
      return NextResponse.json(
        {
          success: false,
          message: `Invalid state transition from ${prevStatus} to ${newStatus} for ${existing.request_type}.`,
        },
        { status: 400 }
      );
    }

    // 3. Validate Pickup/Exchange Scheduling
    if (newStatus === "RETURN_PICKUP_SCHEDULED" || newStatus === "OLD_PRODUCT_PICKUP_PENDING") {
      if (prevStatus === "RETURN_REQUESTED" || prevStatus === "REPLACEMENT_REQUESTED") {
        return NextResponse.json(
          {
            success: false,
            message: `Please approve the ${existing.request_type} request before scheduling courier pickup.`,
          },
          { status: 400 }
        );
      }

      if (!pickupScheduledDate) {
        return NextResponse.json(
          { success: false, message: "Pickup date and time are required to schedule courier." },
          { status: 400 }
        );
      }

      const scheduledDate = new Date(pickupScheduledDate);
      if (isNaN(scheduledDate.getTime())) {
        return NextResponse.json(
          { success: false, message: "Invalid pickup date/time format." },
          { status: 400 }
        );
      }

      const now = new Date();
      // Allow 15 min grace period for submission latency
      if (scheduledDate.getTime() < now.getTime() - 15 * 60 * 1000) {
        return NextResponse.json(
          { success: false, message: "Pickup date and time cannot be in the past." },
          { status: 400 }
        );
      }
    }

    const updatePayload: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (pickupStatus) {
      updatePayload.pickup_status = pickupStatus;
    }
    if (pickupScheduledDate) {
      updatePayload.pickup_scheduled_date = new Date(pickupScheduledDate).toISOString();
    }

    if (newStatus === "RETURN_PICKUP_SCHEDULED" || newStatus === "OLD_PRODUCT_PICKUP_PENDING") {
      updatePayload.pickup_status = "SCHEDULED";
    } else if (
      newStatus === "RETURN_PICKED_UP" ||
      newStatus === "OLD_PRODUCT_PICKED_UP" ||
      newStatus === "REPLACEMENT_DELIVERED"
    ) {
      updatePayload.pickup_status = "PICKED_UP";
    }

    // For replacement completion (REPLACEMENT_DELIVERED or REPLACEMENT_CLOSED),
    // enforce historical pricing and full-tender reconciliation, and prioritize atomic database RPC
    const isReplacementCompletion =
      isReplacement && (newStatus === "REPLACEMENT_DELIVERED" || newStatus === "REPLACEMENT_CLOSED");

    let replacementOrderCreated = false;
    let createdOrderNumber: string | undefined = undefined;

    if (isReplacementCompletion) {
      // 1. Fetch original order and verify historical pricing
      const { data: origOrder } = await supabaseAdmin
        .from("orders")
        .select("id, subtotal, total, discount_amount, shipping_cost, tax_amount")
        .eq("id", existing.order_id)
        .maybeSingle();

      if (!origOrder) {
        return NextResponse.json(
          { success: false, message: "Historical integrity violation: Original order record not found." },
          { status: 400 }
        );
      }

      if (!existing.order_item_id) {
        return NextResponse.json(
          { success: false, message: "Historical integrity violation: Return request is missing order_item_id link." },
          { status: 400 }
        );
      }

      const { data: origItem } = await supabaseAdmin
        .from("order_items")
        .select("id, order_id, product_id, unit_price, quantity, line_total")
        .eq("id", existing.order_item_id)
        .eq("order_id", existing.order_id)
        .eq("product_id", existing.product_id)
        .maybeSingle();

      if (!origItem) {
        return NextResponse.json(
          {
            success: false,
            message: "Historical integrity violation: Original order item not found or does not match return request order and product.",
          },
          { status: 400 }
        );
      }

      if (!origItem.unit_price || Number(origItem.unit_price) <= 0) {
        return NextResponse.json(
          { success: false, message: "Historical integrity violation: Original order item unit price is missing or invalid." },
          { status: 400 }
        );
      }

      // 2. Full-Tender Reconciliation
      const walletDebitAmount = await getOrderWalletDebits(supabaseAdmin, origOrder.id);
      const origReturnedQty = Number(existing.quantity || 1);
      const fullTenderCalc = calculateFullTenderEligibleValue({
        itemUnitPrice: Number(origItem.unit_price),
        purchasedQuantity: Number(origItem.quantity || origReturnedQty),
        returnedQuantity: origReturnedQty,
        orderSubtotal: Number(origOrder.subtotal || origItem.line_total || 0),
        orderDiscountAmount: Number(origOrder.discount_amount || 0),
        orderTotal: Number(origOrder.total || 0),
        walletDebitAmount,
      });

      const netOrderObligation = Number(
        (
          Number(origOrder.subtotal || 0) -
          Number(origOrder.discount_amount || 0) +
          Number(origOrder.shipping_cost || 0) +
          Number(origOrder.tax_amount || 0)
        ).toFixed(2)
      );

      // Reconcile recorded tender sources and prevent double-counting:
      let totalTenderRecorded = 0;
      let codOrGatewayTender = 0;

      if (walletDebitAmount > 0 && Math.abs(Number(origOrder.total || 0) - netOrderObligation) <= 0.05) {
        // Case 1: Order total is ALREADY the gross total inclusive of wallet tender: do not double-count!
        codOrGatewayTender = Math.max(0, Number(origOrder.total || 0) - walletDebitAmount);
        totalTenderRecorded = Number(origOrder.total || 0);
      } else if (Math.abs((walletDebitAmount + Number(origOrder.total || 0)) - netOrderObligation) <= 0.05) {
        // Case 2: Standard checkout: order total is the remainder after wallet debit
        codOrGatewayTender = Number(origOrder.total || 0);
        totalTenderRecorded = Number((walletDebitAmount + codOrGatewayTender).toFixed(2));
      } else if (walletDebitAmount === 0 && Math.abs(Number(origOrder.total || 0) - netOrderObligation) <= 0.05) {
        // Case 3: Zero wallet debits, 100% gateway/COD tender
        codOrGatewayTender = Number(origOrder.total || 0);
        totalTenderRecorded = Number(origOrder.total || 0);
      } else {
        return NextResponse.json(
          {
            success: false,
            message: `Tender reconciliation failure: Recorded tenders (Wallet: ₹${walletDebitAmount}, Order Total: ₹${origOrder.total}) do not reconcile with net order obligation (₹${netOrderObligation}).`,
          },
          { status: 400 }
        );
      }

      const authoritativeEligibleValue = fullTenderCalc.eligibleOriginalValue;
      if (authoritativeEligibleValue > totalTenderRecorded + 0.05) {
        return NextResponse.json(
          {
            success: false,
            message: `Tender reconciliation failure: Eligible original value (₹${authoritativeEligibleValue}) exceeds total recorded tenders (₹${totalTenderRecorded}).`,
          },
          { status: 400 }
        );
      }

      // Ensure replacement order exists if required
      if (!existing.replacement_order_id) {
        try {
          const orderResult = await createReplacementOrderForReturnRequest(supabaseAdmin, existing.id);
          if (orderResult.success) {
            replacementOrderCreated = true;
            createdOrderNumber = orderResult.order_number;
          }
        } catch (orderErr) {
          console.error("Replacement order creation notice:", orderErr);
        }
      }

      // 3. Execute Atomic Database RPC (Single transaction: status update, ledger row, and wallet credit)
      try {
        const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc("settle_replacement_credit_atomic", {
          p_return_request_id: existing.id,
          p_actor_id: user.id,
          p_notes: notes || `Admin transitioned replacement status to ${newStatus}`,
          p_target_status: newStatus,
        });

        if (rpcErr) {
          console.error("[FINANCIAL_SAFETY] Database RPC settle_replacement_credit_atomic error:", rpcErr);
          return NextResponse.json(
            {
              success: false,
              message: `Atomic replacement credit settlement RPC error: ${rpcErr.message}. Status transition and credit settlement aborted for financial safety.`,
            },
            { status: 500 }
          );
        }

        if (!rpcRes || !rpcRes.success) {
          // RPC returned a business failure (e.g. lifecycle violation or tender failure)
          return NextResponse.json(
            {
              success: false,
              message: rpcRes?.error || "Atomic replacement credit settlement failed.",
            },
            { status: 400 }
          );
        }

        // Atomic transaction succeeded: status updated, audit recorded, and wallet credit disbursed
        return NextResponse.json({
          success: true,
          message: `Status updated to ${newStatus}`,
          newStatus: rpcRes.final_status || newStatus,
          walletCredited: Boolean(rpcRes.credited),
          walletAmountCredited: Number(rpcRes.credited_amount || 0),
          replacementOrderCreated,
          createdOrderNumber,
          settlementExecutionMode: "DATABASE_RPC_ATOMIC",
        });
      } catch (rpcCatchErr) {
        console.error("[FINANCIAL_SAFETY] RPC invocation exception:", rpcCatchErr);
        const errMsg = rpcCatchErr instanceof Error ? rpcCatchErr.message : "Internal RPC execution failure";
        return NextResponse.json(
          {
            success: false,
            message: `Atomic replacement credit settlement exception: ${errMsg}. Status transition and credit settlement aborted for financial safety.`,
          },
          { status: 500 }
        );
      }
    }

    // 4. Update Return Request Record (Only for intermediate non-settlement statuses)
    const { error: updErr } = await supabaseAdmin
      .from("return_requests")
      .update(updatePayload)
      .eq("id", existing.id);

    if (updErr) {
      return NextResponse.json({ success: false, message: updErr.message }, { status: 500 });
    }

    // 5. Automated Persistent Replacement Order Creation on Approval / Scheduling (for intermediate statuses)
    if (
      isReplacement &&
      (newStatus === "REPLACEMENT_APPROVED" ||
        newStatus === "REPLACEMENT_ORDER_CREATED" ||
        newStatus === "OLD_PRODUCT_PICKUP_PENDING") &&
      !existing.replacement_order_id
    ) {
      try {
        const orderResult = await createReplacementOrderForReturnRequest(supabaseAdmin, existing.id);
        if (orderResult.success) {
          replacementOrderCreated = true;
          createdOrderNumber = orderResult.order_number;
        } else {
          console.warn("Replacement order creation notice:", orderResult.message);
        }
      } catch (orderErr) {
        console.error("Replacement order creation notice:", orderErr);
      }
    }

    // 6. Insert Audit Log (For intermediate non-settlement statuses)
    await insertReturnAuditLog(supabaseAdmin, {
      returnRequestId: existing.id,
      actorType: "admin",
      actorId: user.id,
      action: `ADMIN_STATUS_UPDATE_${newStatus}`,
      previousStatus: prevStatus,
      newStatus,
      notes: notes || `Admin transitioned ${existing.request_type} status from ${prevStatus} to ${newStatus}`,
      metadata: {
        pickupScheduledDate,
        pickupStatus: updatePayload.pickup_status,
        walletCredited: false,
        walletAmountCredited: 0,
        replacementOrderCreated,
        createdOrderNumber,
        settlementExecutionMode: "NONE",
      },
    });

    return NextResponse.json({
      success: true,
      message: `Status updated to ${newStatus}`,
      newStatus,
      walletCredited: false,
      walletAmountCredited: 0,
      replacementOrderCreated,
      createdOrderNumber,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
