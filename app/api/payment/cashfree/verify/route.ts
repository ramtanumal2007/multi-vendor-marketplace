import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { fetchCashfreeOrder, fetchCashfreeOrderPayments, CashfreePaymentItem } from "@/lib/cashfree";
import { createOrderRecord } from "@/lib/order-service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { cashfreeOrderId, orderPayload } = body;

    if (!cashfreeOrderId || !orderPayload) {
      return NextResponse.json(
        { success: false, message: "Missing Cashfree order identifier or order details." },
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

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const cleanIdempotencyKey = orderPayload.idempotencyKey?.trim() || null;
    const internalOrderId = orderPayload.orderId?.trim() || null;

    // 2. Idempotent Check: Look for existing order with this attempt ID or order ID
    interface ExistingOrderRow {
      id: string;
      payment_status: string;
      payment_method?: string;
      order_number: string;
      invoice_number?: string;
      razorpay_payment_id?: string;
    }

    let existingOrder: ExistingOrderRow | null = null;
    if (internalOrderId) {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("id", internalOrderId)
        .maybeSingle();
      existingOrder = data;
    }

    if (!existingOrder && cleanIdempotencyKey) {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("idempotency_key", cleanIdempotencyKey)
        .maybeSingle();
      existingOrder = data;
    }

    if (existingOrder) {
      // Idempotent: If already marked paid, return immediately
      if (existingOrder.payment_status === "paid") {
        return NextResponse.json({
          success: true,
          order: existingOrder,
          order_number: existingOrder.order_number,
          invoice_number: existingOrder.invoice_number,
          is_duplicate: true,
        });
      }

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

    // 3. Fallback: Atomically Create Order via Server Function if not already created
    const orderCreateResult = await createOrderRecord({
      ...orderPayload,
      paymentMethod: "ONLINE",
      paymentStatus: "paid",
      paymentReferenceId: paymentReference,
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
