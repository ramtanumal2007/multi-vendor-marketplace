import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { getPlanPricing } from "@/lib/membership";
import { createCashfreeOrder } from "@/lib/cashfree";

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

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 2. Verify Seller Profile
    const { data: sellerProfile, error: profileErr } = await supabaseAdmin
      .from("seller_profiles")
      .select("id, business_name, business_email, phone, verification_status")
      .eq("id", user.id)
      .maybeSingle();

    if (profileErr || !sellerProfile || sellerProfile.verification_status !== "approved") {
      return NextResponse.json(
        { success: false, message: "Only approved sellers can upgrade their membership." },
        { status: 403 }
      );
    }

    // 3. Validate Request Payload
    const body = await req.json();
    const { plan, billingCycle } = body;

    if (plan !== "PRO" && plan !== "BUSINESS") {
      return NextResponse.json(
        { success: false, message: "Invalid membership plan selected. Must be PRO or BUSINESS." },
        { status: 400 }
      );
    }

    const safeCycle: "MONTHLY" | "YEARLY" = billingCycle === "YEARLY" ? "YEARLY" : "MONTHLY";

    // 4. Authoritative Pricing Calculation (Fetch live rules from DB, never trust client prices)
    const { data: feeRule } = await supabaseAdmin
      .from("marketplace_fee_rules")
      .select("*")
      .eq("membership_plan", plan)
      .maybeSingle();

    const pricing = getPlanPricing(plan, safeCycle, feeRule || undefined);

    // 5. Generate Safe Order ID for Cashfree (max 50 chars, alphanumeric + _ -)
    const shortSeller = user.id.replace(/-/g, "").substring(0, 8);
    const timestamp = Date.now().toString(36);
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    const cashfreeOrderId = `MEM_${shortSeller}_${timestamp}_${randomSuffix}`.toUpperCase();

    // 6. Create Cashfree Order
    const customerPhone = sellerProfile.phone?.replace(/[^0-9]/g, "") || "9999999999";
    const safePhone = customerPhone.length >= 10 ? customerPhone.substring(customerPhone.length - 10) : "9999999999";

    const cfOrder = await createCashfreeOrder({
      orderId: cashfreeOrderId,
      orderAmount: pricing.totalAmount,
      orderCurrency: "INR",
      customerDetails: {
        customer_id: user.id.substring(0, 40),
        customer_name: (sellerProfile.business_name || "Seller Partner").substring(0, 50),
        customer_email: sellerProfile.business_email || user.email || "seller@store.com",
        customer_phone: safePhone,
      },
      orderNote: `Vendosmith ${plan} Membership (${safeCycle})`,
      orderTags: {
        type: "SELLER_MEMBERSHIP",
        plan: plan,
        cycle: safeCycle,
        seller_id: user.id,
      },
    });

    // 7. Save Pending Subscription Invoice
    const { error: invoiceErr } = await supabaseAdmin
      .from("seller_subscription_invoices")
      .insert({
        seller_id: user.id,
        plan: plan,
        billing_cycle: safeCycle,
        base_amount: pricing.baseAmount,
        tax_amount: pricing.taxAmount,
        total_amount: pricing.totalAmount,
        cashfree_order_id: cfOrder.order_id,
        payment_status: "pending",
      });

    if (invoiceErr) {
      console.error("Error creating subscription invoice record:", invoiceErr);
      return NextResponse.json(
        { success: false, message: "Could not create subscription invoice record." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      paymentSessionId: cfOrder.payment_session_id,
      orderId: cfOrder.order_id,
      pricing: pricing,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("Seller membership checkout error:", error);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
