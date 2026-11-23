import { createAdminClient } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { fetchCashfreeOrder, fetchCashfreeOrderPayments, CashfreePaymentItem } from "@/lib/cashfree";
import { createOrderRecord } from "@/lib/order-service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { cashfreeOrderId, orderPayload, customCakeRequestId } = body;

    if (!cashfreeOrderId) {
      return NextResponse.json(
        { success: false, message: "Missing Cashfree order identifier." },
        { status: 400 }
      );
    }

    // 1. Authoritative Server-to-Server Verification with Cashfree
    const cfOrder = await fetchCashfreeOrder(cashfreeOrderId);
    let cfPayments: CashfreePaymentItem[] = [];
    try {
      cfPayments = await fetchCashfreeOrderPayments(cashfreeOrderId);
    } catch (paymentFetchErr) {
      console.warn("Notice: could not fetch payment attempts list:", paymentFetchErr);
    }

    const isOrderPaid = cfOrder.order_status === "PAID";
    const successfulPayment = cfPayments.find((p) => p.payment_status === "SUCCESS");

    if (!isOrderPaid && !successfulPayment) {
      console.warn("Cashfree verification rejected: order is not paid.", {
        orderId: cashfreeOrderId,
        status: cfOrder.order_status,
        payments: cfPayments.map((p) => ({ id: p.cf_payment_id, status: p.payment_status })),
      });
      return NextResponse.json(
        {
          success: false,
          message: `Payment has not been confirmed by Cashfree. Status: ${cfOrder.order_status}`,
        },
        { status: 400 }
      );
    }

    const paymentReference = String(
      successfulPayment?.cf_payment_id || cfOrder.cf_order_id || cashfreeOrderId
    );

    const supabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // =========================================================================
    // BRANCH A: CUSTOM CAKE ORDER VERIFICATION & BINDING
    // =========================================================================
    const isCustomCake = Boolean(
      customCakeRequestId ||
      orderPayload?.isCustomCake ||
      cashfreeOrderId.startsWith("cf_cake_")
    );

    if (isCustomCake) {
      let query = supabase.from("custom_cake_requests").select("*");
      if (customCakeRequestId) {
        query = query.eq("id", customCakeRequestId);
      } else {
        query = query.eq("cashfree_order_id", cashfreeOrderId);
      }

      const { data: cakeReq, error: cakeErr } = await query.single();
      if (cakeErr || !cakeReq) {
        console.error("Custom cake request not found for Cashfree order:", cashfreeOrderId);
        return NextResponse.json(
          { success: false, message: "Custom cake request not found or invalid." },
          { status: 404 }
        );
      }

      // Check 1: Request Binding (cashfree_order_id must match)
      if (cakeReq.cashfree_order_id && cakeReq.cashfree_order_id !== cashfreeOrderId) {
        console.error("Cashfree order ID mismatch on Custom Cake request:", {
          expected: cakeReq.cashfree_order_id,
          received: cashfreeOrderId,
        });
        return NextResponse.json(
          { success: false, message: "Cashfree transaction does not match this Custom Cake request." },
          { status: 400 }
        );
      }

      // Check 2: Idempotency (if already converted, return existing order)
      if (cakeReq.status === "CONVERTED_TO_ORDER" && cakeReq.converted_order_id) {
        const { data: existingCakeOrd } = await supabase
          .from("orders")
          .select("id, order_number, invoice_number, total, payment_status, internal_status, fulfillment_status")
          .eq("id", cakeReq.converted_order_id)
          .maybeSingle();

        return NextResponse.json({
          success: true,
          order: existingCakeOrd,
          order_number: existingCakeOrd?.order_number,
          invoice_number: existingCakeOrd?.invoice_number,
          is_duplicate: true,
        });
      }

      // Check 3: Authoritative Quote Amount Strict Verification
      const quoteAmount = Number(cakeReq.seller_quote?.final_amount || 0);
      const paidAmount = Number(cfOrder.order_amount || 0);
      if (quoteAmount <= 0 || Math.abs(paidAmount - quoteAmount) > 0.01) {
        console.error("Cashfree amount mismatch for Custom Cake:", {
          quoteAmount,
          paidAmount,
          requestId: cakeReq.id,
        });
        return NextResponse.json(
          {
            success: false,
            message: `Payment amount mismatch. Quote total: ₹${quoteAmount}, Cashfree paid: ₹${paidAmount}. Order conversion rejected.`,
          },
          { status: 400 }
        );
      }

      // Check 4: Payment Reference Replay Protection
      const { data: reusedPayment } = await supabase
        .from("orders")
        .select("id, order_number")
        .eq("razorpay_payment_id", paymentReference)
        .maybeSingle();

      if (reusedPayment) {
        console.error("Cashfree payment reference has already been consumed:", paymentReference);
        return NextResponse.json(
          {
            success: false,
            message: `This payment transaction reference (${paymentReference}) has already been used for order #${reusedPayment.order_number}.`,
          },
          { status: 409 }
        );
      }

      // Check 5: Atomic Conversion via Approved Server Function
      const { data: rpcRes, error: rpcErr } = await supabase.rpc(
        "convert_custom_cake_to_order_server",
        {
          p_request_id: cakeReq.id,
          p_payment_method: "ONLINE",
          p_payment_status: "paid",
          p_internal_status: "CONFIRMED",
          p_fulfillment_status: "processing",
          p_payment_reference: paymentReference,
          p_cashfree_order_id: cashfreeOrderId,
        }
      );

      if (rpcErr || !rpcRes || !rpcRes.success) {
        console.error("Custom cake online order conversion failed:", rpcErr);
        return NextResponse.json(
          {
            success: false,
            message: rpcErr?.message || "Failed to convert verified Custom Cake payment into confirmed order.",
          },
          { status: 500 }
        );
      }

      // Log activity
      await supabase.from("custom_cake_activity_logs").insert({
        request_id: cakeReq.id,
        action: "CUSTOMER_PAID_ONLINE",
        actor_id: cakeReq.user_id,
        actor_role: "customer",
        actor_name: cakeReq.contact_name || "Customer",
        notes: `Customer completed Cashfree payment of ₹${paidAmount}. Order #${rpcRes.order_number} confirmed (Ref: ${paymentReference}).`,
      });

      return NextResponse.json({
        success: true,
        order_id: rpcRes.order_id,
        order_number: rpcRes.order_number,
        invoice_number: rpcRes.invoice_number,
        is_duplicate: rpcRes.is_duplicate || false,
      });
    }

    // =========================================================================
    // BRANCH B: STANDARD MARKETPLACE ORDER VERIFICATION
    // =========================================================================
    if (!orderPayload) {
      return NextResponse.json(
        { success: false, message: "Missing order details for standard marketplace checkout." },
        { status: 400 }
      );
    }

    const cleanIdempotencyKey = orderPayload.idempotencyKey?.trim() || null;
    const internalOrderId = orderPayload.orderId?.trim() || null;

    // Check 1: Currency validation
    if (cfOrder.order_currency !== "INR") {
      return NextResponse.json(
        {
          success: false,
          message: `Invalid currency: expected INR, received ${cfOrder.order_currency}`,
        },
        { status: 400 }
      );
    }

    // 2. Authoritative Draft Lookup & Binding (ISSUE-01 & ISSUE-02)
    // Query durable checkout draft persisted during create-order
    const { data: draftRow, error: draftErr } = await supabase
      .from("finance_audit_logs")
      .select("*")
      .eq("action_type", "CASHFREE_CHECKOUT_DRAFT")
      .eq("notes", cashfreeOrderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (draftErr) {
      console.error("Database error querying checkout draft:", draftErr);
      return NextResponse.json(
        { success: false, message: "Database error verifying checkout draft." },
        { status: 500 }
      );
    }

    if (!draftRow || !draftRow.new_values) {
      console.error("No matching checkout draft found for Cashfree order:", cashfreeOrderId);
      return NextResponse.json(
        {
          success: false,
          message: "No matching checkout draft found for this Cashfree order. Verification rejected.",
        },
        { status: 404 }
      );
    }

    const draft = draftRow.new_values as Record<string, any>;

    // 2a. Idempotency Key Binding
    if (cleanIdempotencyKey && draft.idempotencyKey && cleanIdempotencyKey !== draft.idempotencyKey) {
      console.error("Idempotency key mismatch on verification:", {
        expected: draft.idempotencyKey,
        received: cleanIdempotencyKey,
      });
      return NextResponse.json(
        { success: false, message: "Idempotency attempt mismatch for this Cashfree order." },
        { status: 409 }
      );
    }

    // 2b. Customer Identity Binding
    if (draft.userId) {
      // Authenticated checkout: must match draft.userId
      if (!orderPayload.userId || orderPayload.userId !== draft.userId) {
        console.error("Customer identity mismatch on verification:", {
          draftUserId: draft.userId,
          payloadUserId: orderPayload.userId,
        });
        return NextResponse.json(
          { success: false, message: "Customer identity does not match the authenticated checkout draft." },
          { status: 403 }
        );
      }
    } else {
      // Guest checkout: check that phone and email align with draft
      const draftPhone = String(draft.shippingAddress?.phone || draft.customerDetails?.phone || "").replace(/[^0-9]/g, "").slice(-10);
      const draftEmail = String(draft.email || draft.customerDetails?.email || "").trim().toLowerCase();
      const payloadPhone = String(orderPayload.shippingAddress?.phone || orderPayload.phone || "").replace(/[^0-9]/g, "").slice(-10);
      const payloadEmail = String(orderPayload.email || orderPayload.shippingAddress?.email || "").trim().toLowerCase();

      const phoneMatches = !draftPhone || !payloadPhone || draftPhone === payloadPhone;
      const emailMatches = !draftEmail || !payloadEmail || draftEmail === payloadEmail;

      if (!phoneMatches || !emailMatches) {
        console.error("Guest identity mismatch on verification:", {
          draftPhone, draftEmail, payloadPhone, payloadEmail,
        });
        return NextResponse.json(
          { success: false, message: "Guest contact details do not match the checkout draft." },
          { status: 403 }
        );
      }
    }

    // 2c. Authoritative Payment Amount Strict Verification (Integer Paise Precision)
    const gatewayPaise = Math.round(Number(cfOrder.order_amount) * 100);
    const draftPaise = Math.round(Number(draft.grandTotal) * 100);

    if (!Number.isFinite(gatewayPaise) || gatewayPaise <= 0) {
      return NextResponse.json(
        { success: false, message: "Invalid payment amount returned by gateway." },
        { status: 400 }
      );
    }

    if (gatewayPaise !== draftPaise) {
      console.error("Cashfree order amount mismatch:", {
        gatewayAmount: cfOrder.order_amount,
        gatewayPaise,
        draftAmount: draft.grandTotal,
        draftPaise,
      });
      return NextResponse.json(
        {
          success: false,
          message: `Payment amount mismatch. Gateway paid: ₹${(gatewayPaise / 100).toFixed(2)}, expected authoritative total: ₹${(draftPaise / 100).toFixed(2)}. Verification rejected.`,
        },
        { status: 400 }
      );
    }

    // Check 3: Check if already recovered by Webhook
    const { data: recoveredRow } = await supabase
      .from("finance_audit_logs")
      .select("new_values")
      .eq("action_type", "CASHFREE_ORDER_RECOVERED")
      .eq("notes", cashfreeOrderId)
      .limit(1)
      .maybeSingle();

    if (recoveredRow?.new_values?.orderId) {
      const { data: recOrder } = await supabase
        .from("orders")
        .select("*")
        .eq("id", recoveredRow.new_values.orderId)
        .maybeSingle();

      if (recOrder) {
        return NextResponse.json({
          success: true,
          order: recOrder,
          order_number: recOrder.order_number,
          invoice_number: recOrder.invoice_number,
          is_duplicate: true,
        });
      }
    }

    // Check 4: Idempotent Check: Look for existing order with this authoritative idempotency key
    interface ExistingOrderRow {
      id: string;
      user_id?: string | null;
      email?: string | null;
      shipping_address?: any;
      total: number;
      payment_status: string;
      payment_method?: string;
      order_number: string;
      invoice_number?: string;
      razorpay_payment_id?: string;
      internal_status?: string | null;
      status?: string | null;
      idempotency_key?: string | null;
    }

    const effectiveIdempotencyKey = cleanIdempotencyKey || draft.idempotencyKey;
    let existingOrder: ExistingOrderRow | null = null;

    if (effectiveIdempotencyKey) {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("idempotency_key", effectiveIdempotencyKey)
        .maybeSingle();
      existingOrder = data as ExistingOrderRow | null;
    }

    // Security Check: If caller provided an internalOrderId, it MUST match the authoritative existing order.
    // Client-supplied orderId is NEVER used to look up or bind an unlinked order.
    if (internalOrderId && existingOrder && existingOrder.id !== internalOrderId) {
      console.error("Order ID mismatch during Cashfree verification:", {
        payloadOrderId: internalOrderId,
        authoritativeOrderId: existingOrder.id,
      });
      return NextResponse.json(
        { success: false, message: "Order reference does not match checkout session." },
        { status: 400 }
      );
    }

    if (existingOrder) {
      // 4a. User Ownership Verification
      if (draft.userId) {
        if (existingOrder.user_id && existingOrder.user_id !== draft.userId) {
          console.error("Customer identity mismatch on existing order:", {
            draftUserId: draft.userId,
            orderUserId: existingOrder.user_id,
          });
          return NextResponse.json(
            { success: false, message: "Order ownership does not match authenticated checkout session." },
            { status: 403 }
          );
        }
      } else {
        // Guest checkout: verify guest email/phone matches if present
        const draftPhone = String(draft.shippingAddress?.phone || draft.customerDetails?.phone || "").replace(/[^0-9]/g, "").slice(-10);
        const draftEmail = String(draft.email || draft.customerDetails?.email || "").trim().toLowerCase();
        const orderPhone = String(existingOrder.shipping_address?.phone || "").replace(/[^0-9]/g, "").slice(-10);
        const orderEmail = String(existingOrder.email || existingOrder.shipping_address?.email || "").trim().toLowerCase();

        if (draftPhone && orderPhone && draftPhone !== orderPhone) {
          return NextResponse.json(
            { success: false, message: "Guest contact details do not match the existing order." },
            { status: 403 }
          );
        }
        if (draftEmail && orderEmail && draftEmail !== orderEmail) {
          return NextResponse.json(
            { success: false, message: "Guest contact details do not match the existing order." },
            { status: 403 }
          );
        }
      }

      // 4b. Strict Amount Verification in Integer Paise
      const existingOrderPaise = Math.round(Number(existingOrder.total) * 100);
      if (existingOrderPaise !== gatewayPaise || existingOrderPaise !== draftPaise) {
        console.error("Order total mismatch on existing order:", {
          existingOrderTotal: existingOrder.total,
          existingOrderPaise,
          gatewayPaise,
          draftPaise,
        });
        return NextResponse.json(
          { success: false, message: "Order total mismatch between order, draft, and payment gateway." },
          { status: 400 }
        );
      }

      // 4c. Cancelled Order Late Payment Protection
      const orderInternalStatus = (existingOrder.internal_status || existingOrder.status || "").toUpperCase();
      if (orderInternalStatus === "CANCELLED") {
        console.warn("Payment received for cancelled order:", {
          orderId: existingOrder.id,
          orderNumber: existingOrder.order_number,
          paymentReference,
        });
        try {
          await supabase.from("finance_audit_logs").insert({
            action_type: "PAYMENT_RECEIVED_FOR_CANCELLED_ORDER",
            target_entity: "orders",
            target_id: existingOrder.id,
            notes: cashfreeOrderId,
            new_values: {
              cfOrderId: cashfreeOrderId,
              cfPaymentId: paymentReference,
              orderId: existingOrder.id,
              orderNumber: existingOrder.order_number,
              amount: gatewayPaise / 100,
              status: "CANCELLED",
              reason: "Payment verified after order was already cancelled",
              timestamp: new Date().toISOString(),
            },
          });
        } catch (auditErr) {
          console.warn("Notice: Failed to insert cancelled order payment audit log:", auditErr);
        }

        return NextResponse.json(
          {
            success: false,
            message: "Order was previously cancelled. Payment captured but cannot be applied to cancelled order.",
            order_number: existingOrder.order_number,
            requires_reconciliation: true,
          },
          { status: 409 }
        );
      }

      // 4d. Idempotent Check: If already marked paid
      if (existingOrder.payment_status === "paid") {
        const existingPaymentRef = existingOrder.razorpay_payment_id ? String(existingOrder.razorpay_payment_id) : null;
        if (existingPaymentRef && existingPaymentRef !== paymentReference) {
          console.warn("Distinct captured Cashfree payment detected for already paid order:", {
            orderId: existingOrder.id,
            existingPaymentRef,
            incomingPaymentRef: paymentReference,
          });
          try {
            await supabase.from("finance_audit_logs").insert({
              action_type: "DUPLICATE_PAYMENT_CAPTURED",
              target_entity: "orders",
              target_id: existingOrder.id,
              notes: cashfreeOrderId,
              new_values: {
                cfOrderId: cashfreeOrderId,
                primaryPaymentId: existingPaymentRef,
                duplicatePaymentId: paymentReference,
                orderId: existingOrder.id,
                orderNumber: existingOrder.order_number,
                amount: gatewayPaise / 100,
                status: "DUPLICATE_PAYMENT",
                timestamp: new Date().toISOString(),
              },
            });
          } catch (auditErr) {
            console.warn("Notice: Failed to insert duplicate payment audit log:", auditErr);
          }
        }

        return NextResponse.json({
          success: true,
          order: existingOrder,
          order_number: existingOrder.order_number,
          invoice_number: existingOrder.invoice_number,
          is_duplicate: true,
        });
      }
    }

    // Check 5: Payment Replay Protection
    const { data: reusedPayment } = await supabase
      .from("orders")
      .select("id, order_number")
      .eq("razorpay_payment_id", paymentReference)
      .maybeSingle();

    if (reusedPayment && (!existingOrder || reusedPayment.id !== existingOrder.id)) {
      return NextResponse.json(
        {
          success: false,
          message: `This payment transaction reference (${paymentReference}) has already been consumed for order #${reusedPayment.order_number}.`,
        },
        { status: 409 }
      );
    }

    if (existingOrder) {
      // Update pending order to paid and link Cashfree payment reference
      const { data: updatedOrder, error: updateErr } = await supabase
        .from("orders")
        .update({
          payment_status: "paid",
          payment_method: "ONLINE",
          razorpay_payment_id: paymentReference,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingOrder.id)
        .select()
        .single();

      if (!updateErr && updatedOrder) {
        return NextResponse.json({
          success: true,
          order: updatedOrder,
          order_number: updatedOrder.order_number,
          invoice_number: updatedOrder.invoice_number,
        });
      }
    }

    // 6. Atomically Create Order via Server Function using Authoritative Draft Data
    const { orderId: _ignoredOrderId, ...safeOrderPayload } = orderPayload;
    const orderCreateResult = await createOrderRecord({
      ...safeOrderPayload,
      userId: draft.userId || orderPayload.userId,
      email: draft.email || orderPayload.email,
      shippingAddress: draft.shippingAddress || orderPayload.shippingAddress,
      paymentMethod: "ONLINE",
      paymentStatus: "paid",
      paymentReferenceId: paymentReference,
      idempotencyKey: effectiveIdempotencyKey,
      items: draft.items || orderPayload.items,
      couponCode: draft.validatedCouponCode || orderPayload.couponCode,
      shippingCost: draft.finalShippingCost ?? orderPayload.shippingCost,
      cityRuleName: draft.cityRuleName || orderPayload.cityRuleName,
      walletAmountApplied: draft.appliedWallet ?? orderPayload.walletAmountApplied,
    });

    if (!orderCreateResult.success) {
      console.error("Order creation failed after Cashfree verification:", orderCreateResult.message);
      return NextResponse.json(
        {
          success: false,
          message: orderCreateResult.message || `Payment captured (${paymentReference}) but order registration encountered an error.`,
        },
        { status: 500 }
      );
    }

    // 7. Persist Verification Audit Record
    if (orderCreateResult.order?.id) {
      try {
        await supabase.from("finance_audit_logs").insert({
          action_type: "CASHFREE_ORDER_VERIFIED",
          target_entity: "orders",
          target_id: orderCreateResult.order.id as string,
          notes: cashfreeOrderId,
          new_values: {
            cfOrderId: cashfreeOrderId,
            cfPaymentId: paymentReference,
            orderId: orderCreateResult.order.id,
            orderNumber: orderCreateResult.order_number,
            verifiedAmount: gatewayPaise / 100,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (auditErr) {
        console.warn("Notice: Failed to insert CASHFREE_ORDER_VERIFIED audit log:", auditErr);
      }
    }

    return NextResponse.json({
      success: true,
      order: orderCreateResult.order,
      order_number: orderCreateResult.order_number,
      invoice_number: orderCreateResult.invoice_number,
      is_duplicate: orderCreateResult.is_duplicate || false,
    });
  } catch (err: unknown) {
    console.error("Cashfree verification error:", err);
    const message = err instanceof Error ? err.message : "Payment verification failure.";
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
