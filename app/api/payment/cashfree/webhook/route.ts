import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyCashfreeWebhookSignature } from "@/lib/cashfree";

export const dynamic = "force-dynamic";

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

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 2. Resolve Internal MY STORE Order
    interface WebhookTargetOrder {
      id: string;
      payment_status: string;
      payment_method: string;
      order_number: string;
    }

    let targetOrder: WebhookTargetOrder | null = null;

    if (internalOrderId) {
      const { data } = await supabase
        .from("orders")
        .select("id, payment_status, payment_method, order_number")
        .eq("id", internalOrderId)
        .maybeSingle();
      targetOrder = data;
    }

    if (!targetOrder && idempotencyKey) {
      const { data } = await supabase
        .from("orders")
        .select("id, payment_status, payment_method, order_number")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      targetOrder = data;
    }

    if (!targetOrder && internalOrderNumber) {
      const { data } = await supabase
        .from("orders")
        .select("id, payment_status, payment_method, order_number")
        .eq("order_number", internalOrderNumber)
        .maybeSingle();
      targetOrder = data;
    }

    if (!targetOrder && cfPaymentId) {
      const { data } = await supabase
        .from("orders")
        .select("id, payment_status, payment_method, order_number")
        .eq("razorpay_payment_id", String(cfPaymentId))
        .maybeSingle();
      targetOrder = data;
    }

    // 3. Handle Payment Success (PAYMENT_SUCCESS_WEBHOOK or payment_status === SUCCESS)
    const isSuccess =
      eventType === "PAYMENT_SUCCESS_WEBHOOK" ||
      paymentStatus === "SUCCESS" ||
      eventType === "ORDER_PAID_WEBHOOK";

    if (isSuccess && targetOrder) {
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
    }

    // 4. Handle Payment Failure (PAYMENT_FAILED_WEBHOOK or payment_status === FAILED)
    const isFailure =
      eventType === "PAYMENT_FAILED_WEBHOOK" ||
      eventType === "PAYMENT_USER_DROPPED_WEBHOOK" ||
      paymentStatus === "FAILED" ||
      paymentStatus === "USER_DROPPED";

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
    }

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    console.error("Cashfree webhook processing error:", err);
    const message = err instanceof Error ? err.message : "Webhook handling exception.";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
