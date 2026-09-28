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

    // 1. Cryptographic Signature Verification
    const isValid = verifyCashfreeWebhookSignature(rawBody, signature, timestamp);
    if (!isValid) {
      console.error("Seller membership webhook signature verification failed.");
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

    if (!cfOrderId) {
      return NextResponse.json({ error: "Missing order_id in webhook payload." }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 2. Check if this order exists in seller_subscription_invoices
    const { data: invoice } = await supabaseAdmin
      .from("seller_subscription_invoices")
      .select("id, payment_status")
      .eq("cashfree_order_id", cfOrderId)
      .maybeSingle();

    if (!invoice) {
      // Not a membership subscription order; ignore safely
      return NextResponse.json({ received: true, ignored: "not_a_subscription_order" });
    }

    // 3. Process payment status
    if (
      paymentStatus === "SUCCESS" ||
      eventType.toUpperCase().includes("SUCCESS")
    ) {
      const { data: result, error: rpcErr } = await supabaseAdmin.rpc(
        "activate_seller_membership_subscription",
        {
          p_cashfree_order_id: cfOrderId,
          p_payment_reference: String(cfPaymentId || cfOrderId),
        }
      );

      if (rpcErr) {
        console.error("Webhook activation error:", rpcErr);
        return NextResponse.json({ error: "Activation failed" }, { status: 500 });
      }

      return NextResponse.json({ received: true, activated: true, details: result });
    } else if (
      paymentStatus === "FAILED" ||
      paymentStatus === "USER_DROPPED" ||
      paymentStatus === "CANCELLED" ||
      eventType.toUpperCase().includes("FAILED")
    ) {
      // Mark invoice as failed, NEVER activate membership
      await supabaseAdmin
        .from("seller_subscription_invoices")
        .update({ payment_status: "failed", updated_at: new Date().toISOString() })
        .eq("cashfree_order_id", cfOrderId)
        .eq("payment_status", "pending");

      return NextResponse.json({ received: true, status: "marked_failed" });
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Error processing seller membership webhook:", err);
    return NextResponse.json({ error: "Webhook processing error" }, { status: 500 });
  }
}
