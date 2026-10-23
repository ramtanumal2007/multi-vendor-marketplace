import { createAdminClient } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { verifyCashfreeWebhookSignature } from "@/lib/cashfree";
import { createOrderRecord } from "@/lib/order-service";

export const dynamic = "force-dynamic";

/**
 * Validates external webhook identifier strings to prevent PostgREST syntax errors
 * or query malformations while preserving legitimate Cashfree IDs, UUIDs, ARNs, and order numbers.
 */
function isValidWebhookIdentifier(id: unknown): id is string {
  if (typeof id !== "string") return false;
  const trimmed = id.trim();
  return trimmed.length > 0 && trimmed.length <= 128 && /^[a-zA-Z0-9_\-.:]+$/.test(trimmed);
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-webhook-signature");
    const timestamp = req.headers.get("x-webhook-timestamp");

    if (!signature || !timestamp) {
      return NextResponse.json(
        { error: "Missing required Cashfree webhook signature headers." },
        { status: 400 }
      );
    }

    // 1. Cryptographic Signature Verification (HMAC SHA-256 Base64 with timing-safe comparison)
    const isValid = verifyCashfreeWebhookSignature(rawBody, signature, timestamp);
    if (!isValid) {
      console.error("Cashfree webhook signature verification failed.");
      return NextResponse.json(
        { error: "Invalid webhook signature." },
        { status: 400 }
      );
    }

    const payload = JSON.parse(rawBody);
    const eventType = payload.type || payload.event || "";
    const eventData = payload.data || {};
    const orderData = eventData.order || {};
    const paymentData = eventData.payment || {};

    const cfOrderId = orderData.order_id || payload.order_id;
    const cfPaymentId = paymentData.cf_payment_id || eventData.cf_payment_id;
    const paymentStatus = (paymentData.payment_status || "").toUpperCase();

    const orderTags = orderData.order_tags || {};
    const internalOrderId = orderTags.internalOrderId;
    const internalOrderNumber = orderTags.internalOrderNumber;
    const idempotencyKey = orderTags.idempotencyKey;

    const supabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 2. Persist Verified Webhook Event Durably Before Processing / Acknowledging
    try {
      await supabase.from("finance_audit_logs").insert({
        action_type: "CASHFREE_WEBHOOK_RECEIVED",
        target_entity: "cashfree_webhook",
        notes: String(cfOrderId || cfPaymentId || "unidentified"),
        new_values: {
          eventType,
          cfOrderId,
          cfPaymentId,
          paymentStatus,
          orderAmount: orderData.order_amount,
          orderCurrency: orderData.order_currency,
          paymentAmount: paymentData.payment_amount,
          paymentCurrency: paymentData.payment_currency,
          timestamp,
          payload,
        },
      });
    } catch (auditErr) {
      console.warn("Failed to persist incoming webhook audit log:", auditErr);
    }

    // 3. Resolve Internal MY STORE Order
    interface WebhookTargetOrder {
      id: string;
      payment_status: string;
      payment_method: string;
      order_number: string;
      total: number;
    }

    let targetOrder: WebhookTargetOrder | null = null;

    if (internalOrderId && isValidWebhookIdentifier(internalOrderId)) {
      const { data } = await supabase
        .from("orders")
        .select("id, payment_status, payment_method, order_number, total")
        .eq("id", internalOrderId)
        .maybeSingle();
      targetOrder = data;
    }

    if (!targetOrder && idempotencyKey && isValidWebhookIdentifier(idempotencyKey)) {
      const { data } = await supabase
        .from("orders")
        .select("id, payment_status, payment_method, order_number, total")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      targetOrder = data;
    }

    if (!targetOrder && internalOrderNumber && isValidWebhookIdentifier(internalOrderNumber)) {
      const { data } = await supabase
        .from("orders")
        .select("id, payment_status, payment_method, order_number, total")
        .eq("order_number", internalOrderNumber)
        .maybeSingle();
      targetOrder = data;
    }

    if (!targetOrder && cfPaymentId && isValidWebhookIdentifier(String(cfPaymentId))) {
      const { data } = await supabase
        .from("orders")
        .select("id, payment_status, payment_method, order_number, total")
        .eq("razorpay_payment_id", String(cfPaymentId))
        .maybeSingle();
      targetOrder = data;
    }

    if (!targetOrder && cfOrderId && isValidWebhookIdentifier(String(cfOrderId))) {
      const { data } = await supabase
        .from("orders")
        .select("id, payment_status, payment_method, order_number, total")
        .eq("razorpay_payment_id", String(cfOrderId))
        .maybeSingle();
      targetOrder = data;
    }

    // 4. Handle Cashfree Refund Events (REFUND_STATUS_WEBHOOK, REFUND_SUCCESS_WEBHOOK, REFUND_FAILED_WEBHOOK)
    const refundData = (eventData.refund || (eventType.startsWith("REFUND_") ? eventData : null)) as Record<string, unknown> | null;
    const isRefundEvent =
      eventType === "REFUND_STATUS_WEBHOOK" ||
      eventType === "REFUND_SUCCESS_WEBHOOK" ||
      eventType === "REFUND_FAILED_WEBHOOK" ||
      Boolean(eventData.refund) ||
      Boolean(refundData && (refundData.refund_id || refundData.cf_refund_id));

    if (isRefundEvent) {
      const refundId = String(refundData?.refund_id || eventData.refund_id || "");
      const cfRefundId = String(refundData?.cf_refund_id || eventData.cf_refund_id || "");
      const refundOrderId = String(refundData?.order_id || orderData.order_id || payload.order_id || "");
      const rawRefundStatus = String(
        refundData?.refund_status ||
        refundData?.status ||
        eventData.refund_status ||
        (eventType === "REFUND_SUCCESS_WEBHOOK" ? "SUCCESS" : eventType === "REFUND_FAILED_WEBHOOK" ? "FAILED" : "")
      ).toUpperCase();
      const refundAmount = Number(refundData?.refund_amount || eventData.refund_amount || 0);
      const refundCurrency = String(refundData?.refund_currency || orderData.order_currency || "INR").toUpperCase();
      const refundArn = refundData?.refund_arn || eventData.refund_arn ? String(refundData?.refund_arn || eventData.refund_arn) : null;
      const refundNote = String(refundData?.refund_note || refundData?.status_description || eventData.status_description || "");

      // 4a. Match target order for refund
      let refundOrder = targetOrder;

      if (!refundOrder && refundOrderId && isValidWebhookIdentifier(refundOrderId)) {
        // Safe exact match queries prioritizing UUID primary key, order_number, and gateway payment reference
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(refundOrderId);
        if (isUuid) {
          const { data: ord, error: ordErr } = await supabase
            .from("orders")
            .select("id, payment_status, payment_method, order_number, total, razorpay_payment_id")
            .eq("id", refundOrderId)
            .maybeSingle();
          if (ordErr) {
            console.error("Database error querying order by UUID:", ordErr);
            return NextResponse.json({ error: "Database error during order lookup." }, { status: 500 });
          }
          if (ord) refundOrder = ord;
        }

        if (!refundOrder) {
          const { data: ord, error: ordErr } = await supabase
            .from("orders")
            .select("id, payment_status, payment_method, order_number, total, razorpay_payment_id")
            .eq("order_number", refundOrderId)
            .maybeSingle();
          if (ordErr) {
            console.error("Database error querying order by order_number:", ordErr);
            return NextResponse.json({ error: "Database error during order lookup." }, { status: 500 });
          }
          if (ord) refundOrder = ord;
        }

        if (!refundOrder) {
          const { data: ord, error: ordErr } = await supabase
            .from("orders")
            .select("id, payment_status, payment_method, order_number, total, razorpay_payment_id")
            .eq("razorpay_payment_id", refundOrderId)
            .maybeSingle();
          if (ordErr) {
            console.error("Database error querying order by payment reference:", ordErr);
            return NextResponse.json({ error: "Database error during order lookup." }, { status: 500 });
          }
          if (ord) refundOrder = ord;
        }
      }

      // If not resolved by direct order ID, match by persisted cancellation metadata refund references
      if (!refundOrder && (refundId || cfRefundId)) {
        let matchedCancellation: { id: string; order_id: string; metadata: any } | null = null;

        // Path search sequence ensuring 100% backward compatibility with all metadata shapes:
        // 1. Current standard: metadata.gateway_refund_response.refund_id
        // 2. Gateway assigned: metadata.gateway_refund_response.cf_refund_id
        // 3. Webhook updated: metadata.gateway_refund_id
        // 4. Legacy root refund_id: metadata.refund_id
        // 5. Legacy root cf_refund_id: metadata.cf_refund_id
        const searchSpecs = [
          { path: "metadata->gateway_refund_response->>refund_id", val: refundId },
          { path: "metadata->gateway_refund_response->>cf_refund_id", val: cfRefundId },
          { path: "metadata->>gateway_refund_id", val: refundId || cfRefundId },
          { path: "metadata->>refund_id", val: refundId },
          { path: "metadata->>cf_refund_id", val: cfRefundId },
        ];

        for (const { path, val } of searchSpecs) {
          if (!val || !isValidWebhookIdentifier(val)) continue;

          // Fetch candidate cancellations ordered by cancelled_at DESC (fetching 2 to guard against ambiguity)
          const { data: candRows, error: cancErr } = await supabase
            .from("order_cancellations")
            .select("id, order_id, metadata, cancelled_at")
            .eq(path, val)
            .order("cancelled_at", { ascending: false })
            .limit(2);

          if (cancErr) {
            console.error(`Database error querying order_cancellations via ${path}:`, cancErr);
            return NextResponse.json({ error: "Database error during cancellation lookup." }, { status: 500 });
          }

          if (candRows && candRows.length > 0) {
            if (candRows.length > 1) {
              const distinctOrderIds = Array.from(new Set(candRows.map((c) => c.order_id)));
              if (distinctOrderIds.length > 1) {
                console.error("Ambiguous cancellation refund reference detected across distinct orders:", {
                  val,
                  distinctOrderIds,
                });
                // Attempt resolution using webhook refundOrderId if available
                if (refundOrderId && isValidWebhookIdentifier(refundOrderId)) {
                  for (const cand of candRows) {
                    const { data: ord, error: ordErr } = await supabase
                      .from("orders")
                      .select("id, payment_status, payment_method, order_number, total, razorpay_payment_id")
                      .eq("id", cand.order_id)
                      .maybeSingle();

                    if (ordErr) {
                      return NextResponse.json({ error: "Database error during order verification." }, { status: 500 });
                    }

                    if (
                      ord &&
                      (ord.id === refundOrderId ||
                        ord.order_number === refundOrderId ||
                        ord.razorpay_payment_id === refundOrderId)
                    ) {
                      matchedCancellation = cand;
                      refundOrder = ord;
                      break;
                    }
                  }
                  if (!matchedCancellation) {
                    return NextResponse.json(
                      { error: "Ambiguous refund reference could not be resolved to a unique order." },
                      { status: 409 }
                    );
                  }
                } else {
                  return NextResponse.json(
                    { error: "Ambiguous refund reference matched multiple distinct orders." },
                    { status: 409 }
                  );
                }
              } else {
                matchedCancellation = candRows[0];
              }
            } else {
              matchedCancellation = candRows[0];
            }

            break; // Stop after first successful matching spec
          }
        }

        // If matched cancellation resolved without pre-fetching order, fetch and cross-validate order now
        if (matchedCancellation && !refundOrder) {
          const { data: ord, error: ordErr } = await supabase
            .from("orders")
            .select("id, payment_status, payment_method, order_number, total, razorpay_payment_id")
            .eq("id", matchedCancellation.order_id)
            .maybeSingle();

          if (ordErr) {
            console.error("Database error fetching order for matched cancellation:", ordErr);
            return NextResponse.json({ error: "Database error during order verification." }, { status: 500 });
          }

          if (ord) {
            // Strict Cross-Order Validation: If webhook provided an order_id, verify it doesn't contradict
            if (refundOrderId && isValidWebhookIdentifier(refundOrderId)) {
              const matchesOrder =
                ord.id === refundOrderId ||
                ord.order_number === refundOrderId ||
                ord.razorpay_payment_id === refundOrderId;

              if (!matchesOrder) {
                console.error("Security mismatch: Cancellation order does not match refund event orderId:", {
                  cancellationOrderId: ord.id,
                  refundOrderId,
                });
                return NextResponse.json({ error: "Cross-order refund verification mismatch." }, { status: 409 });
              }
            }
            refundOrder = ord;
          }
        }
      }

      // If not resolved, match by return requests using safe exact matches
      if (!refundOrder && (refundId || cfRefundId)) {
        let matchedOrderId: string | null = null;

        if (refundId && isValidWebhookIdentifier(refundId)) {
          const { data: retReq, error: retErr } = await supabase
            .from("return_requests")
            .select("order_id")
            .eq("refund_payment_reference", refundId)
            .limit(1)
            .maybeSingle();

          if (retErr) {
            console.error("Database error querying return_requests by refundId:", retErr);
            return NextResponse.json({ error: "Database error during return lookup." }, { status: 500 });
          }
          if (retReq?.order_id) matchedOrderId = retReq.order_id;
        }

        if (!matchedOrderId && cfRefundId && isValidWebhookIdentifier(cfRefundId)) {
          const { data: retReq, error: retErr } = await supabase
            .from("return_requests")
            .select("order_id")
            .eq("refund_payment_reference", cfRefundId)
            .limit(1)
            .maybeSingle();

          if (retErr) {
            console.error("Database error querying return_requests by cfRefundId:", retErr);
            return NextResponse.json({ error: "Database error during return lookup." }, { status: 500 });
          }
          if (retReq?.order_id) matchedOrderId = retReq.order_id;
        }

        if (matchedOrderId) {
          const { data: ord, error: ordErr } = await supabase
            .from("orders")
            .select("id, payment_status, payment_method, order_number, total, razorpay_payment_id")
            .eq("id", matchedOrderId)
            .maybeSingle();

          if (ordErr) {
            console.error("Database error fetching order for return request:", ordErr);
            return NextResponse.json({ error: "Database error during order verification." }, { status: 500 });
          }
          if (ord) refundOrder = ord;
        }
      }

      // Unlinked refund event safety
      if (!refundOrder) {
        console.error("Unlinked refund event could not be resolved to order:", { refundId, cfRefundId, refundOrderId });
        return NextResponse.json(
          {
            error: "Unlinked refund event could not be resolved to an existing order or cancellation record.",
            refundId,
            cfRefundId,
            orderId: refundOrderId,
          },
          { status: 422 }
        );
      }

      // Currency check
      if (refundCurrency !== "INR") {
        console.error(`Invalid currency in refund webhook: ${refundCurrency}`);
        return NextResponse.json({ error: "Invalid currency." }, { status: 400 });
      }

      const orderTotal = Number(refundOrder.total || 0);

      // 4a. Attempt atomic database reconciliation with row locking if RPC is available
      try {
        const { data: rpcResult, error: rpcError } = await supabase.rpc("reconcile_cashfree_refund_atomic", {
          p_order_id: refundOrder.id,
          p_refund_id: refundId || null,
          p_cf_refund_id: cfRefundId || null,
          p_refund_amount: refundAmount,
          p_refund_arn: refundArn || null,
          p_refund_status: rawRefundStatus,
          p_event_type: eventType,
          p_refund_note: refundNote || null,
          p_timestamp: timestamp ? new Date(Number(timestamp) * 1000).toISOString() : new Date().toISOString(),
        });

        if (!rpcError && rpcResult && typeof rpcResult === "object") {
          const resObj = rpcResult as Record<string, unknown>;
          if (resObj.success === false) {
            console.error("reconcile_cashfree_refund_atomic RPC rejected refund:", resObj);
            const errMsg = String(resObj.message || resObj.error || "Refund reconciliation rejected.");
            const statusCode = resObj.error === "ORDER_NOT_FOUND" ? 404 : 400;
            return NextResponse.json({ error: errMsg, details: resObj }, { status: statusCode });
          } else {
            return NextResponse.json(resObj);
          }
        }
        if (rpcError) {
          console.warn("reconcile_cashfree_refund_atomic RPC execution error:", rpcError);
          // Only fall back to application reconciliation if the RPC is genuinely not installed
          const isFunctionMissing = rpcError.code === "PGRST202" ||
                                    rpcError.message?.includes("function") ||
                                    rpcError.message?.includes("not found");
          if (!isFunctionMissing) {
            return NextResponse.json(
              { error: "Atomic refund reconciliation failed in database.", details: rpcError.message },
              { status: 500 }
            );
          }
        }
      } catch (rpcCatchErr) {
        // Fall back cleanly if RPC is not yet applied in current database environment
        console.warn("reconcile_cashfree_refund_atomic RPC fallback to application reconciliation:", rpcCatchErr);
      }

      // 4b. Application-Level Fallback Reconciliation (Exact Integer Paise Precision)
      // Guard: An order that was never paid (pending or failed) cannot be refunded
      if (refundOrder.payment_status !== "paid" && refundOrder.payment_status !== "refunded") {
        console.error(`Cannot refund order #${refundOrder.order_number} with payment status '${refundOrder.payment_status}'.`);
        return NextResponse.json(
          { error: `Cannot refund order #${refundOrder.order_number} with payment status '${refundOrder.payment_status}'. Only paid orders can be refunded.` },
          { status: 400 }
        );
      }

      // Deterministically fetch primary cancellation record (order-level first, then latest cancelled_at)
      const { data: cancellations } = await supabase
        .from("order_cancellations")
        .select("id, metadata, order_item_id, cancelled_at")
        .eq("order_id", refundOrder.id)
        .order("cancelled_at", { ascending: false });

      const cancellation = cancellations && cancellations.length > 0
        ? (cancellations.find((c: { order_item_id?: string | null }) => c.order_item_id === null) || cancellations[0])
        : null;

      const existingMeta = (cancellation?.metadata || {}) as Record<string, unknown>;

      interface ConfirmedRefundItem {
        refund_id: string;
        cf_refund_id?: string;
        amount: number;
        arn?: string | null;
        status: string;
        confirmed_at: string;
      }

      // Reconstruct list of previously confirmed refunds
      let recordedRefunds: ConfirmedRefundItem[] = Array.isArray(existingMeta.successful_refunds)
        ? [...(existingMeta.successful_refunds as ConfirmedRefundItem[])]
        : [];

      // Check legacy single-refund metadata fields if successful_refunds array is not yet seeded
      if (
        recordedRefunds.length === 0 &&
        existingMeta.gateway_refund_status === "SUCCESS" &&
        (existingMeta.gateway_refund_id || existingMeta.refund_id)
      ) {
        recordedRefunds.push({
          refund_id: String(existingMeta.gateway_refund_id || existingMeta.refund_id),
          cf_refund_id: existingMeta.cf_refund_id ? String(existingMeta.cf_refund_id) : undefined,
          amount: Number(existingMeta.gateway_refund_amount || 0),
          arn: existingMeta.gateway_refund_arn ? String(existingMeta.gateway_refund_arn) : null,
          status: "SUCCESS",
          confirmed_at: String(existingMeta.gateway_refund_confirmed_at || new Date().toISOString()),
        });
      }

      // Check finance_audit_logs for any previous confirmed refunds (both partial and full)
      const { data: auditLogs } = await supabase
        .from("finance_audit_logs")
        .select("new_values")
        .eq("target_entity", "orders")
        .eq("target_id", refundOrder.id)
        .in("action_type", ["CASHFREE_REFUND_CONFIRMED", "CASHFREE_PARTIAL_REFUND_CONFIRMED"]);

      if (auditLogs && auditLogs.length > 0) {
        for (const log of auditLogs) {
          const vals = (log.new_values || {}) as Record<string, unknown>;
          const aRefId = String(vals.refundId || vals.cfRefundId || "");
          if (aRefId && !recordedRefunds.some((r) => r.refund_id === aRefId || (r.cf_refund_id && r.cf_refund_id === aRefId))) {
            recordedRefunds.push({
              refund_id: aRefId,
              cf_refund_id: vals.cfRefundId ? String(vals.cfRefundId) : undefined,
              amount: Number(vals.refundAmount || 0),
              arn: vals.refundArn ? String(vals.refundArn) : null,
              status: "SUCCESS",
              confirmed_at: String(vals.timestamp || new Date().toISOString()),
            });
          }
        }
      }

      // 4c. Idempotency Check at specific refund event level
      const currentRefKey = refundId || cfRefundId;
      const isCurrentEventAlreadyProcessed = Boolean(
        currentRefKey &&
        recordedRefunds.some(
          (r) =>
            (refundId && (r.refund_id === refundId || r.cf_refund_id === refundId)) ||
            (cfRefundId && (r.cf_refund_id === cfRefundId || r.refund_id === cfRefundId))
        )
      );

      if (isCurrentEventAlreadyProcessed) {
        console.log(`Refund event ${currentRefKey} for order #${refundOrder.order_number} already processed. Idempotent skip.`);
        return NextResponse.json({
          received: true,
          already_processed: true,
          orderId: refundOrder.id,
          refundId: currentRefKey,
          cumulative_refund_amount: recordedRefunds.reduce((sum, r) => sum + Number(r.amount || 0), 0),
        });
      }

      // If entire order is already marked refunded and cumulative total reached:
      if (refundOrder.payment_status === "refunded") {
        console.log(`Order #${refundOrder.order_number} is already marked fully refunded. Idempotent skip.`);
        return NextResponse.json({
          received: true,
          already_refunded: true,
          orderId: refundOrder.id,
          refundId: currentRefKey,
        });
      }

      // 4d. Exact Integer Paise Arithmetic (Zero Slack, No ₹0.05 tolerance)
      const orderTotalPaise = Math.round(orderTotal * 100);
      const refundAmountPaise = Math.round(refundAmount * 100);
      const previousCumulativePaise = recordedRefunds.reduce((sum, r) => sum + Math.round(Number(r.amount || 0) * 100), 0);
      const newCumulativePaise = previousCumulativePaise + refundAmountPaise;

      // Authoritative cumulative amount check with exact integer paise precision
      if (refundAmountPaise > 0 && newCumulativePaise > orderTotalPaise) {
        console.error(`Refund amount ₹${refundAmount} (cumulative ₹${(newCumulativePaise / 100).toFixed(2)}) exceeds authoritative order total ₹${orderTotal}`);
        return NextResponse.json(
          { error: "Cumulative refund amount exceeds authoritative order total." },
          { status: 400 }
        );
      }

      const nowIso = new Date().toISOString();

      if (rawRefundStatus === "SUCCESS" || eventType === "REFUND_SUCCESS_WEBHOOK") {
        const isFullyRefunded = newCumulativePaise >= orderTotalPaise;
        const newCumulativeRefund = Math.round(newCumulativePaise) / 100;
        const remainingPaise = Math.max(0, orderTotalPaise - newCumulativePaise);
        const remainingAmount = Math.round(remainingPaise) / 100;

        // Record this successful refund item
        recordedRefunds.push({
          refund_id: refundId || cfRefundId || `ref_${Date.now()}`,
          cf_refund_id: cfRefundId || undefined,
          amount: refundAmount,
          arn: refundArn,
          status: "SUCCESS",
          confirmed_at: nowIso,
        });

        // ONLY transition orders.payment_status to 'refunded' if cumulative refunds reach or exceed order total!
        // Respects orders_payment_status_check constraint: ('pending', 'paid', 'failed', 'refunded').
        if (isFullyRefunded) {
          await supabase
            .from("orders")
            .update({
              payment_status: "refunded",
              updated_at: nowIso,
            })
            .eq("id", refundOrder.id);
          console.log(`Order #${refundOrder.order_number} fully refunded (cumulative: ₹${newCumulativeRefund} / ₹${orderTotal}). payment_status -> refunded.`);
        } else {
          console.log(`Order #${refundOrder.order_number} partially refunded (cumulative: ₹${newCumulativeRefund} / ₹${orderTotal}). payment_status remains paid.`);
        }

        // Persist cumulative refund records in cancellation metadata
        if (cancellation) {
          await supabase
            .from("order_cancellations")
            .update({
              metadata: {
                ...existingMeta,
                successful_refunds: recordedRefunds,
                cumulative_refund_amount: newCumulativeRefund,
                gateway_refund_status: isFullyRefunded ? "SUCCESS" : "PARTIAL_SUCCESS",
                gateway_refund_arn: refundArn || existingMeta.gateway_refund_arn,
                gateway_refund_id: refundId || cfRefundId || existingMeta.gateway_refund_id,
                gateway_refund_amount: newCumulativeRefund,
                gateway_refund_confirmed_at: nowIso,
                remaining_refundable_amount: remainingAmount,
                gateway_refund_response: {
                  ...(typeof existingMeta.gateway_refund_response === "object" ? existingMeta.gateway_refund_response : {}),
                  status: isFullyRefunded ? "SUCCESS" : "PARTIAL_SUCCESS",
                  cf_refund_id: cfRefundId,
                  refund_id: refundId,
                  refund_arn: refundArn,
                  cumulative_amount: newCumulativeRefund,
                },
              },
            })
            .eq("id", cancellation.id);
        }

        try {
          await supabase.from("finance_audit_logs").insert({
            action_type: isFullyRefunded ? "CASHFREE_REFUND_CONFIRMED" : "CASHFREE_PARTIAL_REFUND_CONFIRMED",
            target_entity: "orders",
            target_id: refundOrder.id,
            notes: String(cfRefundId || refundId || refundOrder.order_number),
            new_values: {
              orderId: refundOrder.id,
              orderNumber: refundOrder.order_number,
              refundId,
              cfRefundId,
              refundAmount,
              cumulativeRefundAmount: newCumulativeRefund,
              orderTotal,
              isFullyRefunded,
              refundArn,
              status: "SUCCESS",
              timestamp,
            },
          });
        } catch {}

        return NextResponse.json({
          received: true,
          refunded: isFullyRefunded,
          is_partial: !isFullyRefunded,
          status: "SUCCESS",
          orderId: refundOrder.id,
          refundId: refundId || cfRefundId,
          cumulative_refund_amount: newCumulativeRefund,
          remaining_amount: remainingAmount,
        });
      }

      if (rawRefundStatus === "PENDING") {
        // Late arrival protection: If this refund ID was already confirmed SUCCESS, do not downgrade
        if (isCurrentEventAlreadyProcessed) {
          return NextResponse.json({ received: true, already_processed: true, orderId: refundOrder.id });
        }

        // Keep payment_status as paid (do not treat pending as success)
        if (cancellation) {
          await supabase
            .from("order_cancellations")
            .update({
              metadata: {
                ...existingMeta,
                gateway_refund_status: "PENDING",
                gateway_refund_id: refundId || cfRefundId || existingMeta.gateway_refund_id,
              },
            })
            .eq("id", cancellation.id);
        }

        const refundKey = String(cfRefundId || refundId || refundOrder.order_number);
        // Prevent duplicate PENDING audit logs
        const { data: existingPendingLog } = await supabase
          .from("finance_audit_logs")
          .select("id")
          .eq("target_entity", "orders")
          .eq("target_id", refundOrder.id)
          .eq("action_type", "CASHFREE_REFUND_PENDING")
          .eq("notes", refundKey)
          .limit(1)
          .maybeSingle();

        if (existingPendingLog) {
          return NextResponse.json({
            received: true,
            already_processed: true,
            refunded: false,
            status: "PENDING",
            orderId: refundOrder.id,
          });
        }

        try {
          await supabase.from("finance_audit_logs").insert({
            action_type: "CASHFREE_REFUND_PENDING",
            target_entity: "orders",
            target_id: refundOrder.id,
            notes: refundKey,
            new_values: {
              orderId: refundOrder.id,
              refundId,
              cfRefundId,
              refundAmount,
              status: "PENDING",
              timestamp,
            },
          });
        } catch {}

        return NextResponse.json({
          received: true,
          refunded: false,
          status: "PENDING",
          orderId: refundOrder.id,
        });
      }

      if (rawRefundStatus === "FAILED" || rawRefundStatus === "CANCELLED" || eventType === "REFUND_FAILED_WEBHOOK") {
        // Late arrival protection: If this refund ID was already confirmed SUCCESS, do not downgrade
        if (isCurrentEventAlreadyProcessed) {
          return NextResponse.json({ received: true, already_processed: true, orderId: refundOrder.id });
        }

        // Keep payment_status as paid. Record failure in metadata and audit log.
        if (cancellation) {
          await supabase
            .from("order_cancellations")
            .update({
              metadata: {
                ...existingMeta,
                gateway_refund_status: "FAILED",
                gateway_refund_failure_reason: refundNote || "Gateway refund declined by bank",
                gateway_refund_id: refundId || cfRefundId || existingMeta.gateway_refund_id,
              },
            })
            .eq("id", cancellation.id);
        }

        const refundKey = String(cfRefundId || refundId || refundOrder.order_number);
        // Prevent duplicate FAILED audit logs
        const { data: existingFailedLog } = await supabase
          .from("finance_audit_logs")
          .select("id")
          .eq("target_entity", "orders")
          .eq("target_id", refundOrder.id)
          .eq("action_type", "CASHFREE_REFUND_FAILED")
          .eq("notes", refundKey)
          .limit(1)
          .maybeSingle();

        if (existingFailedLog) {
          return NextResponse.json({
            received: true,
            already_processed: true,
            refunded: false,
            status: "FAILED",
            orderId: refundOrder.id,
          });
        }

        try {
          await supabase.from("finance_audit_logs").insert({
            action_type: "CASHFREE_REFUND_FAILED",
            target_entity: "orders",
            target_id: refundOrder.id,
            notes: refundKey,
            new_values: {
              orderId: refundOrder.id,
              refundId,
              cfRefundId,
              refundAmount,
              status: "FAILED",
              reason: refundNote,
              timestamp,
            },
          });
        } catch {}

        return NextResponse.json({
          received: true,
          refunded: false,
          status: "FAILED",
          orderId: refundOrder.id,
        });
      }

      // Default acknowledgement for other unclassified refund states
      return NextResponse.json({ received: true, unclassified_refund_status: rawRefundStatus, orderId: refundOrder.id });
    }

    // 5. Handle Payment Success (PAYMENT_SUCCESS_WEBHOOK or payment_status === SUCCESS)
    const isSuccess =
      eventType === "PAYMENT_SUCCESS_WEBHOOK" ||
      paymentStatus === "SUCCESS" ||
      eventType === "ORDER_PAID_WEBHOOK";

    const isFailure =
      eventType === "PAYMENT_FAILED_WEBHOOK" ||
      eventType === "PAYMENT_USER_DROPPED_WEBHOOK" ||
      paymentStatus === "FAILED" ||
      paymentStatus === "USER_DROPPED";

    if (isSuccess && targetOrder) {
      // 1. Validate currency strictly to INR
      const currency = String(paymentData.payment_currency || orderData.order_currency || "INR").toUpperCase();
      if (currency !== "INR") {
        console.error(`Invalid currency received in webhook for order ${targetOrder.order_number}: ${currency}`);
        return NextResponse.json({ error: "Invalid currency. Only INR is supported." }, { status: 400 });
      }

      // 2. Validate trusted gateway payment amount against authoritative order total
      const rawPaidAmount = paymentData.payment_amount ?? orderData.order_amount;
      const paidAmount = Number(rawPaidAmount);
      const expectedTotal = Number(targetOrder.total);

      // Treat missing, non-numeric, non-finite, or <= 0 amounts as strictly invalid (reject zero amount)
      if (
        rawPaidAmount === null ||
        rawPaidAmount === undefined ||
        typeof rawPaidAmount === "boolean" ||
        !Number.isFinite(paidAmount) ||
        paidAmount <= 0
      ) {
        console.error(`Invalid or zero payment amount in webhook for order ${targetOrder.order_number}: ${rawPaidAmount}`);
        return NextResponse.json(
          { error: "Invalid payment amount: missing, non-finite, or zero amount is not acceptable." },
          { status: 400 }
        );
      }

      if (!Number.isFinite(expectedTotal) || expectedTotal <= 0) {
        console.error(`Invalid authoritative order total for order ${targetOrder.order_number}: ${expectedTotal}`);
        return NextResponse.json(
          { error: "Authoritative order total is invalid." },
          { status: 400 }
        );
      }

      // Exact integer paise arithmetic to prevent floating-point inaccuracies
      const paidPaise = Math.round(paidAmount * 100);
      const expectedPaise = Math.round(expectedTotal * 100);

      // Reject underpayment strictly
      if (paidPaise < expectedPaise) {
        console.error(
          `Underpayment rejected for order ${targetOrder.order_number}: received ₹${paidAmount} (${paidPaise} paise), expected ₹${expectedTotal} (${expectedPaise} paise)`
        );
        return NextResponse.json(
          { error: "Payment amount is less than authoritative order total. Underpayment rejected." },
          { status: 400 }
        );
      }

      // Idempotent reconciliation: Update only if not already marked paid
      if (targetOrder.payment_status !== "paid") {
        await supabase
          .from("orders")
          .update({
            payment_status: "paid",
            payment_method: "ONLINE",
            razorpay_payment_id: String(cfPaymentId || cfOrderId),
            updated_at: new Date().toISOString(),
          })
          .eq("id", targetOrder.id);
        console.log(`Reconciled order ${targetOrder.order_number} to paid via Cashfree webhook.`);
      }

      return NextResponse.json({ received: true, reconciled: true, orderId: targetOrder.id });
    }

    if (isFailure && targetOrder) {
      // Safety rule: Never overwrite an already confirmed successful payment with failed!
      if (targetOrder.payment_status !== "paid") {
        await supabase
          .from("orders")
          .update({
            payment_status: "failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", targetOrder.id);
        console.log(`Order ${targetOrder.order_number} marked as failed via Cashfree webhook.`);
      }
      return NextResponse.json({ received: true, status: "failed", orderId: targetOrder.id });
    }

    // 5. Handle Webhook-Before-Redirect / Unlinked Paid Event Recovery
    if (isSuccess && !targetOrder) {
      // Look up durable checkout draft
      const { data: draftRow } = await supabase
        .from("finance_audit_logs")
        .select("*")
        .eq("action_type", "CASHFREE_CHECKOUT_DRAFT")
        .eq("notes", cfOrderId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (draftRow && draftRow.new_values) {
        const draft = draftRow.new_values;

        // Validate currency and amount strictly
        const rawPaidAmount = paymentData.payment_amount ?? orderData.order_amount;
        const paidAmount = Number(rawPaidAmount);
        const expectedAmount = Number(draft.grandTotal || 0);
        const currency = String(paymentData.payment_currency || orderData.order_currency || "INR").toUpperCase();

        const isAmountValid =
          rawPaidAmount !== null &&
          rawPaidAmount !== undefined &&
          typeof rawPaidAmount !== "boolean" &&
          Number.isFinite(paidAmount) &&
          paidAmount > 0 &&
          Number.isFinite(expectedAmount) &&
          expectedAmount > 0 &&
          Math.abs(Math.round(paidAmount * 100) - Math.round(expectedAmount * 100)) <= 1;

        if (currency === "INR" && isAmountValid) {
          // Authoritatively instantiate order from durable draft
          const orderRes = await createOrderRecord({
            userId: draft.userId,
            email: draft.email,
            shippingAddress: draft.shippingAddress,
            paymentMethod: "ONLINE",
            paymentStatus: "paid",
            paymentReferenceId: String(cfPaymentId || cfOrderId),
            items: draft.items,
            couponCode: draft.validatedCouponCode,
            shippingCost: draft.finalShippingCost,
            walletAmountApplied: draft.appliedWallet,
            cityRuleName: draft.cityRuleName,
            idempotencyKey: draft.idempotencyKey,
          });

          if (orderRes.success && orderRes.order?.id) {
            console.log(`Successfully recovered order #${orderRes.order_number} from Cashfree webhook.`);
            try {
              await supabase.from("finance_audit_logs").insert({
                action_type: "CASHFREE_ORDER_RECOVERED",
                target_entity: "orders",
                target_id: orderRes.order.id as string,
                notes: String(cfOrderId),
                new_values: {
                  cfOrderId,
                  cfPaymentId,
                  orderId: orderRes.order.id,
                  orderNumber: orderRes.order_number,
                },
              });
            } catch {}

            return NextResponse.json({
              received: true,
              recovered: true,
              orderId: orderRes.order.id,
              orderNumber: orderRes.order_number,
            });
          }
        }
      }

      // If an unlinked paid event cannot be recovered or resolved:
      // STRICT SAFETY: Never return a success acknowledgement after silently discarding an unlinked paid event.
      console.error("Unlinked paid webhook event could not be resolved:", { cfOrderId, cfPaymentId });
      return NextResponse.json(
        {
          error: "Unlinked payment event could not be resolved to an existing order or checkout draft.",
          cfOrderId,
          cfPaymentId,
        },
        { status: 422 }
      );
    }

    // 6. Unlinked failure acknowledgement (user dropped before completing payment)
    return NextResponse.json({ received: true, unlinked: true });
  } catch (err: unknown) {
    console.error("Cashfree webhook processing error:", err);
    return NextResponse.json(
      { error: "Internal server error during webhook processing." },
      { status: 500 }
    );
  }
}
