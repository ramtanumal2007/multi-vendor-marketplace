import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { fetchCashfreeOrder, fetchCashfreeOrderPayments, CashfreePaymentItem } from "@/lib/cashfree";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
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
            } catch {
              // Ignore in route handlers
            }
          },
        },
      }
    );

    // 1. Authenticate Seller
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Please log in as a seller." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { cashfreeOrderId } = body;

    if (!cashfreeOrderId || typeof cashfreeOrderId !== "string") {
      return NextResponse.json(
        { success: false, message: "Missing or invalid Cashfree order ID." },
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 2. Fetch Subscription Invoice & Verify Ownership
    const { data: invoice, error: invoiceErr } = await supabaseAdmin
      .from("seller_subscription_invoices")
      .select("*")
      .eq("cashfree_order_id", cashfreeOrderId)
      .maybeSingle();

    if (invoiceErr || !invoice) {
      return NextResponse.json(
        { success: false, message: "Subscription invoice not found." },
        { status: 404 }
      );
    }

    if (invoice.seller_id !== user.id) {
      return NextResponse.json(
        { success: false, message: "Unauthorized: Invoice does not belong to your seller account." },
        { status: 403 }
      );
    }

    // 3. If already paid, return idempotent success immediately
    if (invoice.payment_status === "paid") {
      return NextResponse.json({
        success: true,
        message: "Membership already activated.",
        plan: invoice.plan,
        periodEnd: invoice.period_end,
      });
    }

    // 4. Authoritative Verification with Cashfree Gateway
    const cfOrder = await fetchCashfreeOrder(cashfreeOrderId);
    let cfPayments: CashfreePaymentItem[] = [];
    try {
      cfPayments = await fetchCashfreeOrderPayments(cashfreeOrderId);
    } catch (paymentFetchErr) {
      console.warn("Notice: could not fetch payment attempts:", paymentFetchErr);
    }

    const isOrderPaid = cfOrder.order_status === "PAID";
    const successfulPayment = cfPayments.find((p) => p.payment_status === "SUCCESS");

    if (!isOrderPaid && !successfulPayment) {
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

    // 5. Activate Membership via Atomic Database RPC
    const { data: activationResult, error: rpcErr } = await supabaseAdmin.rpc(
      "activate_seller_membership_subscription",
      {
        p_cashfree_order_id: cashfreeOrderId,
        p_payment_reference: paymentReference,
      }
    );

    if (rpcErr) {
      console.error("RPC activation error:", rpcErr);
      return NextResponse.json(
        { success: false, message: "Could not activate membership in database." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Membership successfully upgraded!",
      plan: activationResult.plan,
      billingCycle: activationResult.billing_cycle,
      periodEnd: activationResult.period_end,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("Seller membership verify error:", error);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
