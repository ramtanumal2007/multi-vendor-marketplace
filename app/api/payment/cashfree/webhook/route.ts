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
      const { error: auditError } = await supabase.from("finance_audit_logs").insert({
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
      if (auditError) {
        console.error("Failed to persist incoming webhook audit log:", auditError);
        return NextResponse.json({ error: "Webhook audit persistence failed. Please retry." }, { status: 503 });
      }
    } catch (auditErr) {
      console.error("Failed to persist incoming webhook audit log:", auditErr);
      return NextResponse.json({ error: "Webhook audit persistence failed. Please retry." }, { status: 503 });
    }

    // 3. Resolve Internal MY STORE Order
    interface WebhookTargetOrder {
      id: string;
      payment_status: string;
      payment_method: string;
      order_number: string;
      total: number;
      internal_status?: string | null;
      status?: string | null;
      razorpay_payment_id?: string | null;
      user_id?: string | null;
    }

    let targetOrder: WebhookTargetOrder | null = null;

    if (internalOrderId && isValidWebhookIdentifier(internalOrderId)) {
      const { data } = await supabase
        .from("orders")
        .select("id, payment_status, payment_method, order_number, total, internal_status, status, razorpay_payment_id, user_id")
        .eq("id", internalOrderId)
        .maybeSingle();
      targetOrder = data as WebhookTargetOrder | null;
    }

    if (!targetOrder && idempotencyKey && isValidWebhookIdentifier(idempotencyKey)) {
      const { data } = await supabase
        .from("orders")
        .select("id, payment_status, payment_method, order_number, total, internal_status, status, razorpay_payment_id, user_id")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      targetOrder = data as WebhookTargetOrder | null;
    }

    if (!targetOrder && internalOrderNumber && isValidWebhookIdentifier(internalOrderNumber)) {
      const { data } = await supabase
        .from("orders")
        .select("id, payment_status, payment_method, order_number, total, internal_status, status, razorpay_payment_id, user_id")
        .eq("order_number", internalOrderNumber)
        .maybeSingle();
      targetOrder = data as WebhookTargetOrder | null;
    }

    if (!targetOrder && cfPaymentId && isValidWebhookIdentifier(String(cfPaymentId))) {
      const { data } = await supabase
        .from("orders")
        .select("id, payment_status, payment_method, order_number, total, internal_status, status, razorpay_payment_id, user_id")
        .eq("razorpay_payment_id", String(cfPaymentId))
        .maybeSingle();
      targetOrder = data as WebhookTargetOrder | null;
    }

    if (!targetOrder && cfOrderId && isValidWebhookIdentifier(String(cfOrderId))) {
      const { data } = await supabase
        .from("orders")
        .select("id, payment_status, payment_method, order_number, total, internal_status, status, razorpay_payment_id, user_id")
        .eq("razorpay_payment_id", String(cfOrderId))
        .maybeSingle();
      targetOrder = data as WebhookTargetOrder | null;
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

        // Inspect every supplied reference path, not just the first one that matches.
        // A refund_id and cf_refund_id that point to different orders must fail closed.
        const cancellationCandidates: Array<{
          id: string;
          order_id: string;
          metadata: any;
          cancelled_at?: string;
        }> = [];
        const seenCancellationIds = new Set<string>();

        for (const { path, val } of searchSpecs) {
          if (!val || !isValidWebhookIdentifier(val)) continue;

          const { data: candRows, error: cancErr } = await supabase
            .from("order_cancellations")
            .select("id, order_id, metadata, cancelled_at")
            .eq(path, val)
            .order("cancelled_at", { ascending: false })
            .limit(1000);

          if (cancErr) {
            console.error(`Database error querying order_cancellations via ${path}:`, cancErr);
            return NextResponse.json({ error: "Database error during cancellation lookup." }, { status: 500 });
          }

          // A saturated result set cannot prove uniqueness. Do not guess an order.
          if ((candRows || []).length >= 1000) {
            console.error("Cancellation refund reference lookup reached its safety limit:", { path, val });
            return NextResponse.json(
              { error: "Refund reference matched too many cancellation records to resolve safely." },
              { status: 409 }
            );
          }

          for (const candidate of candRows || []) {
            if (!seenCancellationIds.has(candidate.id)) {
              seenCancellationIds.add(candidate.id);
              cancellationCandidates.push(candidate);
            }
          }
        }

        if (cancellationCandidates.length > 0) {
          const distinctOrderIds = Array.from(new Set(cancellationCandidates.map((c) => c.order_id)));

          if (distinctOrderIds.length > 1) {
            if (!refundOrderId || !isValidWebhookIdentifier(refundOrderId)) {
              console.error("Ambiguous cancellation refund reference matched multiple orders:", distinctOrderIds);
              return NextResponse.json(
                { error: "Ambiguous refund reference matched multiple orders and no trusted order identifier was supplied." },
                { status: 409 }
              );
            }

            const { data: candidateOrders, error: candidateOrdersError } = await supabase
              .from("orders")
              .select("id, payment_status, payment_method, order_number, total, razorpay_payment_id")
              .in("id", distinctOrderIds);

            if (candidateOrdersError) {
              console.error("Database error verifying ambiguous cancellation orders:", candidateOrdersError);
              return NextResponse.json({ error: "Database error during order verification." }, { status: 500 });
            }

            const matchingOrders = (candidateOrders || []).filter((ord) =>
              ord.id === refundOrderId ||
              ord.order_number === refundOrderId ||
              ord.razorpay_payment_id === refundOrderId
            );

            if (matchingOrders.length !== 1) {
              return NextResponse.json(
                { error: "Ambiguous refund reference could not be resolved to exactly one order." },
                { status: 409 }
              );
            }

            refundOrder = matchingOrders[0];
            matchedCancellation =
              cancellationCandidates
                .filter((candidate) => candidate.order_id === refundOrder!.id)
                .sort((a, b) => (Date.parse(b.cancelled_at || "") || 0) - (Date.parse(a.cancelled_at || "") || 0))[0] || null;
          } else {
            // Multiple records for the same order are not a cross-order ambiguity.
            // Select the newest order-level/metadata candidate; the atomic RPC then
            // performs its own order-row lock and deterministic cancellation-row lookup.
            matchedCancellation = cancellationCandidates
              .sort((a, b) => (Date.parse(b.cancelled_at || "") || 0) - (Date.parse(a.cancelled_at || "") || 0))[0];
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

      // Atomic reconciliation is mandatory. The application fallback below was
      // unsafe under concurrent webhook delivery because it had no row-level lock.
      // If the RPC migration is not installed or the database is unavailable,
      // return a retryable response so Cashfree can redeliver the webhook.
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

        if (rpcError) {
          console.error("Atomic Cashfree refund reconciliation unavailable; requesting webhook retry:", rpcError);
          return NextResponse.json(
            { error: "Atomic refund reconciliation is unavailable. Webhook retry required." },
            { status: 503 }
          );
        }

        if (!rpcResult || typeof rpcResult !== "object") {
          console.error("Atomic Cashfree refund reconciliation returned an invalid result:", rpcResult);
          return NextResponse.json(
            { error: "Atomic refund reconciliation returned an invalid result. Webhook retry required." },
            { status: 503 }
          );
        }

        const resObj = rpcResult as Record<string, unknown>;
        if (resObj.success === false) {
          console.error("reconcile_cashfree_refund_atomic RPC rejected refund:", resObj);
          const errMsg = String(resObj.message || resObj.error || "Refund reconciliation rejected.");
          const statusCode = resObj.error === "ORDER_NOT_FOUND" ? 404 : 400;
          return NextResponse.json({ error: errMsg, details: resObj }, { status: statusCode });
        }
        return NextResponse.json(resObj);
      } catch (rpcCatchErr) {
        console.error("Atomic Cashfree refund reconciliation threw; requesting webhook retry:", rpcCatchErr);
        return NextResponse.json(
          { error: "Atomic refund reconciliation failed. Webhook retry required." },
          { status: 503 }
        );
      }

      // Default acknowledgement for other unclassified refund states
      return NextResponse.json({
        received: true,
        unclassified_refund_status: rawRefundStatus,
        ...(refundOrder ? { orderId: refundOrder!.id } : {}),
      });
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

      // Require exact amount match in integer paise; reject both underpayment and overpayment.
      if (paidPaise !== expectedPaise) {
        console.error(
          `Payment amount mismatch rejected for order ${targetOrder.order_number}: received ₹${paidAmount} (${paidPaise} paise), expected ₹${expectedTotal} (${expectedPaise} paise)`
        );
        return NextResponse.json(
          { error: "Payment amount does not match authoritative order total. Payment rejected." },
          { status: 400 }
        );
      }

      // 4a. Cancelled Order Late Payment Protection
      const orderInternalStatus = (targetOrder.internal_status || targetOrder.status || "").toUpperCase();
      if (orderInternalStatus === "CANCELLED") {
        console.warn(`Payment success received for cancelled order ${targetOrder.order_number}:`, {
          orderId: targetOrder.id,
          cfOrderId,
          cfPaymentId,
          paidAmount,
        });

        // Safely and idempotently log to finance_audit_logs
        try {
          const incomingRef = String(cfPaymentId || cfOrderId || "unidentified");
          const { data: existingLog } = await supabase
            .from("finance_audit_logs")
            .select("id")
            .eq("action_type", "PAYMENT_RECEIVED_FOR_CANCELLED_ORDER")
            .eq("target_id", targetOrder.id)
            .eq("notes", incomingRef)
            .maybeSingle();

          if (!existingLog) {
            await supabase.from("finance_audit_logs").insert({
              action_type: "PAYMENT_RECEIVED_FOR_CANCELLED_ORDER",
              target_entity: "orders",
              target_id: targetOrder.id,
              notes: incomingRef,
              new_values: {
                cfOrderId,
                cfPaymentId,
                orderId: targetOrder.id,
                orderNumber: targetOrder.order_number,
                amount: paidAmount,
                paidPaise,
                status: "CANCELLED",
                reason: "Payment succeeded after order was cancelled",
                timestamp: new Date().toISOString(),
              },
            });
          }
        } catch (auditErr) {
          console.error("Failed to insert audit log for cancelled order payment:", auditErr);
        }

        // Return HTTP 200 with clear action_required so Cashfree does not endlessly retry an already recorded event
        return NextResponse.json({
          received: true,
          reconciled: false,
          orderId: targetOrder.id,
          status: "CANCELLED_ORDER_PAYMENT_RECORDED",
          action_required: "REFUND_OR_MANUAL_REVIEW",
        });
      }

      // 4b. Duplicate Captured Payment Detection Across Attempts
      const incomingPaymentRef = cfPaymentId ? String(cfPaymentId) : (cfOrderId ? String(cfOrderId) : null);
      const existingPaymentRef = targetOrder.razorpay_payment_id ? String(targetOrder.razorpay_payment_id) : null;

      if (targetOrder.payment_status === "paid") {
        if (existingPaymentRef && incomingPaymentRef && existingPaymentRef !== incomingPaymentRef) {
          console.warn(
            `Distinct captured Cashfree payment detected for order ${targetOrder.order_number}: incoming ${incomingPaymentRef}, existing ${existingPaymentRef}`
          );

          // Idempotent duplicate payment audit logging
          try {
            const { data: existingDupLog } = await supabase
              .from("finance_audit_logs")
              .select("id")
              .eq("action_type", "DUPLICATE_PAYMENT_CAPTURED")
              .eq("target_id", targetOrder.id)
              .eq("notes", incomingPaymentRef)
              .maybeSingle();

            if (!existingDupLog) {
              await supabase.from("finance_audit_logs").insert({
                action_type: "DUPLICATE_PAYMENT_CAPTURED",
                target_entity: "orders",
                target_id: targetOrder.id,
                notes: incomingPaymentRef,
                new_values: {
                  cfOrderId,
                  cfPaymentId: incomingPaymentRef,
                  primaryPaymentId: existingPaymentRef,
                  duplicatePaymentId: incomingPaymentRef,
                  orderId: targetOrder.id,
                  orderNumber: targetOrder.order_number,
                  amount: paidAmount,
                  paidPaise,
                  status: "DUPLICATE_PAYMENT",
                  reason: "Distinct successful payment captured for already-paid order",
                  timestamp: new Date().toISOString(),
                },
              });
            }
          } catch (auditErr) {
            console.error("Failed to insert duplicate payment audit log:", auditErr);
          }

          return NextResponse.json({
            received: true,
            reconciled: false,
            orderId: targetOrder.id,
            status: "DUPLICATE_PAYMENT_RECORDED",
            action_required: "REFUND_REQUIRED_DUPLICATE_CHARGE",
            primaryPaymentId: existingPaymentRef,
            duplicatePaymentId: incomingPaymentRef,
          });
        }

        // Repeated identical payment event: return 200 idempotent acknowledgment
        return NextResponse.json({
          received: true,
          reconciled: true,
          orderId: targetOrder.id,
          is_duplicate_event: true,
        });
      }

      // Idempotent reconciliation: Update only if not already marked paid
      const { error: paymentUpdateError } = await supabase
        .from("orders")
        .update({
          payment_status: "paid",
          payment_method: "ONLINE",
          razorpay_payment_id: String(cfPaymentId || cfOrderId),
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetOrder.id);
      if (paymentUpdateError) {
        console.error(`Failed to reconcile paid status for order ${targetOrder.order_number}:`, paymentUpdateError);
        return NextResponse.json({ error: "Payment status update failed. Please retry." }, { status: 503 });
      }
      console.log(`Reconciled order ${targetOrder.order_number} to paid via Cashfree webhook.`);

      return NextResponse.json({ received: true, reconciled: true, orderId: targetOrder.id });
    }

    if (isFailure && targetOrder) {
      // Safety rule: Never overwrite an already confirmed successful payment with failed!
      if (targetOrder.payment_status !== "paid") {
        const { error: paymentUpdateError } = await supabase
          .from("orders")
          .update({
            payment_status: "failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", targetOrder.id);
        if (paymentUpdateError) {
          console.error(`Failed to mark order ${targetOrder.order_number} as failed:`, paymentUpdateError);
          return NextResponse.json({ error: "Payment failure status update failed. Please retry." }, { status: 503 });
        }
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

        // Validate currency and amount strictly in integer paise (identical to linked path)
        const rawPaidAmount = paymentData.payment_amount ?? orderData.order_amount;
        const paidAmount = Number(rawPaidAmount);
        const expectedAmount = Number(draft.grandTotal || 0);
        const currency = String(paymentData.payment_currency || orderData.order_currency || "INR").toUpperCase();

        const paidPaise = Math.round(paidAmount * 100);
        const expectedPaise = Math.round(expectedAmount * 100);

        const isAmountValid =
          rawPaidAmount !== null &&
          rawPaidAmount !== undefined &&
          typeof rawPaidAmount !== "boolean" &&
          Number.isFinite(paidAmount) &&
          paidAmount > 0 &&
          Number.isFinite(expectedAmount) &&
          expectedAmount > 0 &&
          paidPaise === expectedPaise;

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
            } catch { }

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
