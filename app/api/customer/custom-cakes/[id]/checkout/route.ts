import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createAdminClient } from "@/lib/supabase";
import { createCashfreeOrder } from "@/lib/cashfree";

export const dynamic = "force-dynamic";

/**
 * POST /api/customer/custom-cakes/[id]/checkout
 * Initiates checkout for an accepted custom cake quote:
 * - COD: Atomically converts to confirmed order in 'ORDERED' / 'pending' fulfillment status.
 * - ONLINE: Generates Cashfree order session bound to the authoritative quote final_amount.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    if (!id) {
      return NextResponse.json({ success: false, message: "Request ID is required." }, { status: 400 });
    }

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
            } catch {
              // Ignore in route handlers
            }
          },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Strict Email Verification: auth.users -> profiles -> STOP if missing
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .maybeSingle();

    const customerEmail = user.email || profile?.email || null;
    if (!customerEmail || !customerEmail.includes("@")) {
      return NextResponse.json(
        {
          success: false,
          message: "A verified email address is missing from your account. Please update your profile before checking out.",
        },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const paymentMethod = (body.paymentMethod || "COD").toUpperCase();

    // 2. Fetch Custom Cake Request with ownership check
    const { data: request, error: reqErr } = await supabaseAdmin
      .from("custom_cake_requests")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (reqErr || !request) {
      return NextResponse.json(
        { success: false, message: "Custom cake request not found or access denied." },
        { status: 404 }
      );
    }

    // 3. Idempotency Check
    if (request.status === "CONVERTED_TO_ORDER" && request.converted_order_id) {
      const { data: existingOrd } = await supabaseAdmin
        .from("orders")
        .select("id, order_number, invoice_number, payment_status, internal_status, fulfillment_status")
        .eq("id", request.converted_order_id)
        .maybeSingle();

      return NextResponse.json({
        success: true,
        is_duplicate: true,
        order_id: request.converted_order_id,
        order_number: existingOrd?.order_number,
        invoice_number: existingOrd?.invoice_number,
        message: "Order has already been created for this custom cake request.",
      });
    }

    if (request.status !== "QUOTED" && request.status !== "CUSTOMER_ACCEPTED") {
      return NextResponse.json(
        { success: false, message: `Cannot proceed with checkout in '${request.status}' status.` },
        { status: 400 }
      );
    }

    const quote = request.seller_quote;
    if (!quote || quote.final_amount === undefined || quote.final_amount === null) {
      return NextResponse.json(
        { success: false, message: "No valid quote found on this request to checkout." },
        { status: 400 }
      );
    }

    const quoteFinalAmount = Number(quote.final_amount);
    if (isNaN(quoteFinalAmount) || quoteFinalAmount <= 0) {
      return NextResponse.json(
        { success: false, message: "Invalid quote amount. Cannot process checkout." },
        { status: 400 }
      );
    }

    // =========================================================================
    // CASE A: CASH ON DELIVERY (COD)
    // =========================================================================
    if (paymentMethod === "COD") {
      const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
        "convert_custom_cake_to_order_server",
        {
          p_request_id: request.id,
          p_payment_method: "COD",
          p_payment_status: "pending",
          p_internal_status: "ORDERED",
          p_fulfillment_status: "pending",
          p_payment_reference: null,
          p_cashfree_order_id: null,
        }
      );

      if (rpcError || !rpcResult || !rpcResult.success) {
        console.error("Custom cake COD order conversion failed:", rpcError);
        return NextResponse.json(
          {
            success: false,
            message: rpcError?.message || "Failed to convert custom cake request to order.",
          },
          { status: 500 }
        );
      }

      await supabaseAdmin.from("custom_cake_activity_logs").insert({
        request_id: request.id,
        action: "CUSTOMER_ACCEPTED_COD",
        actor_id: user.id,
        actor_role: "customer",
        actor_name: request.contact_name || "Customer",
        notes: `Customer accepted quote of ₹${quoteFinalAmount} with Cash on Delivery. Order #${rpcResult.order_number} created.`,
      });

      return NextResponse.json({
        success: true,
        order_id: rpcResult.order_id,
        order_number: rpcResult.order_number,
        invoice_number: rpcResult.invoice_number,
        payment_method: "COD",
      });
    }

    // =========================================================================
    // CASE B: ONLINE CASHFREE PAYMENT SESSION GENERATION
    // =========================================================================
    if (paymentMethod === "ONLINE") {
      const safeOrderId = `cf_cake_${request.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)}_${Date.now()}`.slice(0, 45);

      const cfResponse = await createCashfreeOrder({
        orderId: safeOrderId,
        orderAmount: quoteFinalAmount,
        orderCurrency: "INR",
        customerDetails: {
          customer_id: user.id,
          customer_name: request.contact_name || "Customer",
          customer_email: customerEmail,
          customer_phone: request.contact_phone || "9999999999",
        },
        orderNote: `Custom Cake Request #${request.request_number || request.id.slice(0, 8)}`,
        orderTags: {
          custom_cake_request_id: request.id,
          user_id: user.id,
          quote_amount: String(quoteFinalAmount),
        },
      });

      // Bind Cashfree order ID to custom_cake_requests
      const boundCfOrderId = cfResponse.order_id || safeOrderId;
      await supabaseAdmin
        .from("custom_cake_requests")
        .update({
          cashfree_order_id: boundCfOrderId,
          status: "CUSTOMER_ACCEPTED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", request.id);

      await supabaseAdmin.from("custom_cake_activity_logs").insert({
        request_id: request.id,
        action: "CUSTOMER_INITIATED_ONLINE_PAYMENT",
        actor_id: user.id,
        actor_role: "customer",
        actor_name: request.contact_name || "Customer",
        notes: `Customer initiated Cashfree payment session for ₹${quoteFinalAmount} (Cashfree Order: ${boundCfOrderId}).`,
      });

      return NextResponse.json({
        success: true,
        payment_session_id: cfResponse.payment_session_id,
        cashfree_order_id: boundCfOrderId,
        order_amount: quoteFinalAmount,
      });
    }

    return NextResponse.json(
      { success: false, message: `Unsupported payment method: ${paymentMethod}` },
      { status: 400 }
    );
  } catch (err: unknown) {
    console.error("Custom cake checkout error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
