import crypto from "crypto";
import { createAdminClient, createServerClient } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  createCashfreeOrder,
  fetchCashfreeOrder,
  getCashfreeEnvironment,
} from "@/lib/cashfree";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      items = [],
      shippingAddress,
      couponCode,
      shippingCost,
      cityRuleName,
      idempotencyKey,
      customerDetails = {},
      userId: requestedUserId,
      email,
    } = body;

    // Resolve authenticated identity from the verified Supabase session.
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
              // Cookie refresh may be unavailable in this context.
            }
          },
        },
      }
    );

    const {
      data: { user: authUser },
      error: authErr,
    } = await supabaseUser.auth.getUser();

    if (authErr && authErr.name !== "AuthSessionMissingError") {
      return NextResponse.json(
        { success: false, message: "Unable to verify your session." },
        { status: 401 }
      );
    }

    if (requestedUserId && (!authUser || requestedUserId !== authUser.id)) {
      return NextResponse.json(
        { success: false, message: "Authenticated user ID mismatch." },
        { status: 403 }
      );
    }

    const userId = authUser?.id ?? null;

    // A. Validate Cart Items
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, message: "Cart is empty. Cannot initiate payment." },
        { status: 400 }
      );
    }

    // B. Validate Delivery Address
    if (shippingAddress) {
      if (!shippingAddress.full_name || !shippingAddress.phone || !shippingAddress.city) {
        return NextResponse.json(
          { success: false, message: "Incomplete delivery address provided." },
          { status: 400 }
        );
      }
    }

    const supabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Authoritative Product Metadata & Stock Check from Database
    const productIds = items.map((i: { productId?: string }) => i.productId).filter(Boolean);
    const { data: dbProducts, error: dbProdErr } = await supabase
      .from("products")
      .select("id, title, price, sale_price, stock_quantity, track_inventory, allow_backorders, store_id, category_id, tax_rate, categories(tax_rate)")
      .in("id", productIds);

    if (dbProdErr || !dbProducts) {
      return NextResponse.json(
        { success: false, message: "Failed to verify catalog pricing." },
        { status: 500 }
      );
    }

    interface DbProductSummary {
      id: string;
      title: string;
      price: number;
      sale_price?: number | null;
      stock_quantity?: number | null;
      track_inventory?: boolean;
      allow_backorders?: boolean;
      store_id?: string;
      category_id?: string;
      tax_rate?: number | null;
      categories?: { tax_rate?: number | null } | Array<{ tax_rate?: number | null }> | null;
    }

    const dbProdMap = new Map<string, DbProductSummary>(
      (dbProducts as DbProductSummary[]).map((p) => [p.id, p])
    );

    // 2. Authoritative Subtotal Calculation & Stock Revalidation
    let recalculatedSubtotal = 0;
    for (const item of items) {
      const dbP = dbProdMap.get(item.productId);
      if (!dbP) {
        return NextResponse.json(
          { success: false, message: `Product "${item.title}" is no longer available.` },
          { status: 400 }
        );
      }

      // Check stock before contacting payment gateway
      if (dbP.track_inventory && !dbP.allow_backorders) {
        const availableStock = dbP.stock_quantity ?? 0;
        if (availableStock < item.quantity) {
          return NextResponse.json(
            {
              success: false,
              message: `Insufficient stock for "${dbP.title}". Requested: ${item.quantity}, Available: ${availableStock}.`,
            },
            { status: 409 }
          );
        }
      }

      const hasDiscount = Boolean(dbP.sale_price && dbP.sale_price > 0 && dbP.sale_price < dbP.price);
      const effectivePrice = hasDiscount ? Number(dbP.sale_price) : Number(dbP.price);
      recalculatedSubtotal += effectivePrice * Number(item.quantity);
    }

    // 3. Authoritative Coupon Revalidation & Discount Calculation
    let validatedDiscountAmount = 0;
    let validatedCouponCode: string | null = null;
    if (couponCode && typeof couponCode === "string" && couponCode.trim()) {
      const cleanCode = couponCode.trim().toUpperCase();
      const { data: coupon } = await supabase
        .from("coupons")
        .select("*")
        .eq("code", cleanCode)
        .single();

      if (coupon && coupon.is_active) {
        const now = new Date();
        const isValidDates =
          (!coupon.valid_from || new Date(coupon.valid_from) <= now) &&
          (!coupon.valid_to || new Date(coupon.valid_to) >= now);

        const minOrder = Number(coupon.min_order_amount || 0);
        const isValidMinOrder = recalculatedSubtotal >= minOrder;

        const maxRedemptions = coupon.max_total_redemptions ?? coupon.usage_limit;
        const currentTimesUsed = coupon.times_used ?? coupon.usage_count ?? 0;
        const isValidLimits =
          maxRedemptions === null || maxRedemptions === undefined || currentTimesUsed < maxRedemptions;

        if (isValidDates && isValidMinOrder && isValidLimits) {
          let eligibleSubtotal = recalculatedSubtotal;
          const targetType = coupon.target_type || "all";
          const targetSellers = coupon.target_sellers || [];
          const appCategories = coupon.applicable_categories || [];
          const appProducts = coupon.applicable_products || [];

          if (
            targetType === "category" ||
            targetType === "product" ||
            targetType === "seller" ||
            appCategories.length > 0 ||
            appProducts.length > 0 ||
            targetSellers.length > 0
          ) {
            let matchingSubtotal = 0;
            for (const item of items) {
              const dbP = dbProdMap.get(item.productId);
              let isEligible = false;
              if (targetType === "product" || appProducts.length > 0) {
                if (appProducts.includes(item.productId)) isEligible = true;
              } else if (targetType === "category" || appCategories.length > 0) {
                if (dbP?.category_id && appCategories.includes(dbP.category_id)) isEligible = true;
              } else if (targetType === "seller" || targetSellers.length > 0) {
                if (dbP?.store_id && targetSellers.includes(dbP.store_id)) isEligible = true;
              } else {
                isEligible = true;
              }

              if (isEligible && dbP) {
                const hasDiscount = Boolean(dbP.sale_price && dbP.sale_price > 0 && dbP.sale_price < dbP.price);
                const effectivePrice = hasDiscount ? Number(dbP.sale_price) : Number(dbP.price);
                matchingSubtotal += effectivePrice * Number(item.quantity);
              }
            }
            eligibleSubtotal = matchingSubtotal;
          }

          if (eligibleSubtotal > 0) {
            const val = Number(coupon.value || 0);
            if (coupon.type === "percentage") {
              validatedDiscountAmount = (eligibleSubtotal * val) / 100;
            } else {
              validatedDiscountAmount = Math.min(eligibleSubtotal, val);
            }
            validatedDiscountAmount = Math.round(validatedDiscountAmount * 100) / 100;
            validatedCouponCode = cleanCode;
          }
        }
      }
    }

    // 4. Authoritative Tax Calculation
    const { data: settingsData } = await supabase
      .from("site_settings")
      .select("default_tax_rate, free_delivery_threshold")
      .single();

    const globalTaxRate = Number(settingsData?.default_tax_rate || 0);
    const freeThreshold = Number(settingsData?.free_delivery_threshold || 500);

    let recalculatedTax = 0;
    for (const item of items) {
      const dbP = dbProdMap.get(item.productId);
      if (!dbP) continue;
      const catObj = Array.isArray(dbP.categories) ? dbP.categories[0] : dbP.categories;
      const effectiveTaxRate =
        dbP.tax_rate !== null && dbP.tax_rate !== undefined
          ? Number(dbP.tax_rate)
          : catObj?.tax_rate !== null && catObj?.tax_rate !== undefined
            ? Number(catObj.tax_rate)
            : globalTaxRate;

      const hasDiscount = Boolean(dbP.sale_price && dbP.sale_price > 0 && dbP.sale_price < dbP.price);
      const effectivePrice = hasDiscount ? Number(dbP.sale_price) : Number(dbP.price);
      recalculatedTax += (effectivePrice * Number(item.quantity) * effectiveTaxRate) / 100;
    }
    recalculatedTax = Math.round(recalculatedTax * 100) / 100;

    // 5. Authoritative Shipping Fee Calculation
    let finalShippingCost = shippingCost !== undefined && shippingCost !== null ? Number(shippingCost) : 40;
    if (recalculatedSubtotal >= freeThreshold && freeThreshold > 0) {
      finalShippingCost = 0;
    }

    // 6. Authoritative Grand Total
    const subtotalAfterCoupon = Math.max(0, recalculatedSubtotal - validatedDiscountAmount);
    let grandTotal = Math.round((subtotalAfterCoupon + finalShippingCost + recalculatedTax) * 100) / 100;

    const appliedWallet = body.walletAmountApplied && Number(body.walletAmountApplied) > 0 ? Number(body.walletAmountApplied) : 0;
    if (appliedWallet > 0) {
      if (userId) {
        const { data: userWallet } = await supabase
          .from("customer_wallets")
          .select("balance")
          .eq("customer_id", userId)
          .maybeSingle();
        if (!userWallet || Number(userWallet.balance || 0) < appliedWallet) {
          return NextResponse.json(
            { success: false, message: "Insufficient wallet balance." },
            { status: 400 }
          );
        }
      }
      grandTotal = Math.max(0, Math.round((grandTotal - appliedWallet) * 100) / 100);
    }

    if (grandTotal < 1) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Remaining payable is less than ₹1.00. Please complete order directly with your wallet balance or select Cash on Delivery.",
        },
        { status: 400 }
      );
    }

    // 7. Validate Idempotency Key & Compute Deterministic Gateway Order ID
    const rawKey = typeof idempotencyKey === "string" ? idempotencyKey.trim() : "";
    if (!rawKey || rawKey.length < 16 || rawKey.length > 64 || !/^[a-zA-Z0-9_\-.:]+$/.test(rawKey)) {
      return NextResponse.json(
        { success: false, message: "Invalid or missing checkout idempotency key." },
        { status: 400 }
      );
    }

    const normalizedPhone = (customerDetails.phone || shippingAddress?.phone || "").replace(/[^0-9]/g, "").slice(-10);
    const normalizedEmail = (email || customerDetails.email || shippingAddress?.email || "").trim().toLowerCase();

    const idScope = userId ? `user_${userId}` : `guest_${normalizedPhone || "nophone"}_${normalizedEmail || "noemail"}`;
    const idSeed = `${idScope}_${rawKey}`;
    const baseHash = crypto.createHash("sha256").update(idSeed).digest("hex").slice(0, 24);

    // Compute canonical checkout fingerprint for tampering & reuse protection
    const canonicalPayload = {
      identity: {
        scope: userId ? "authenticated" : "guest",
        userId: userId || null,
        email: normalizedEmail,
        phone: normalizedPhone,
      },
      items: items
        .map((it: { productId: string; quantity: number }) => {
          const dbP = dbProdMap.get(it.productId);
          const hasDiscount = Boolean(dbP?.sale_price && dbP.sale_price > 0 && dbP.sale_price < dbP.price);
          const authoritativePrice = hasDiscount ? Number(dbP?.sale_price) : Number(dbP?.price);
          return {
            productId: String(it.productId).trim(),
            quantity: Number(it.quantity),
            unitPricePaise: Math.round(authoritativePrice * 100),
          };
        })
        .sort((a: { productId: string }, b: { productId: string }) => a.productId.localeCompare(b.productId)),
      pricingPaise: {
        subtotalPaise: Math.round(recalculatedSubtotal * 100),
        discountPaise: Math.round(validatedDiscountAmount * 100),
        taxPaise: Math.round(recalculatedTax * 100),
        shippingPaise: Math.round(finalShippingCost * 100),
        walletPaise: Math.round(appliedWallet * 100),
        grandTotalPaise: Math.round(grandTotal * 100),
        currency: "INR",
      },
      coupon: validatedCouponCode ? validatedCouponCode.trim().toUpperCase() : null,
      shippingAddress: {
        fullName: (shippingAddress?.full_name || "").trim().toLowerCase(),
        phone: normalizedPhone,
        city: (shippingAddress?.city || "").trim().toLowerCase(),
        postalCode: (shippingAddress?.postal_code || "").trim(),
        addressLine1: (shippingAddress?.address_line1 || "").trim().toLowerCase(),
      },
    };

    const canonicalFingerprint = crypto
      .createHash("sha256")
      .update(JSON.stringify(canonicalPayload))
      .digest("hex");

    // 8. Preflight Check for Authoritative Existing Orders (idempotency & paid status)
    const { data: existingOrders, error: orderQueryErr } = await supabase
      .from("orders")
      .select("id, order_number, payment_status, internal_status, total")
      .eq("idempotency_key", rawKey)
      .limit(2);

    if (orderQueryErr) {
      console.error("Order preflight check error:", orderQueryErr);
      return NextResponse.json(
        { success: false, message: "Database error verifying existing order status." },
        { status: 500 }
      );
    }

    if (existingOrders && existingOrders.length > 0) {
      const paidOrder = existingOrders.find(
        (o) => o.payment_status === "paid" || o.payment_status === "completed" || o.internal_status === "COMPLETED"
      );
      if (paidOrder) {
        return NextResponse.json(
          {
            success: false,
            message: `Checkout attempt already paid and completed for order #${paidOrder.order_number}.`,
            orderNumber: paidOrder.order_number,
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        {
          success: false,
          message: `An order (#${existingOrders[0].order_number}) is already associated with this checkout attempt.`,
          orderNumber: existingOrders[0].order_number,
        },
        { status: 409 }
      );
    }

    // Check if an order was already recovered from this checkout draft by the webhook
    const { data: recoveredRows, error: recErr } = await supabase
      .from("finance_audit_logs")
      .select("id, new_values")
      .eq("action_type", "CASHFREE_ORDER_RECOVERED")
      .like("notes", `CF_ORD_${baseHash}%`)
      .limit(1);

    if (recErr) {
      console.error("Draft recovery verification error:", recErr);
      return NextResponse.json(
        { success: false, message: "Database error checking recovered checkout state." },
        { status: 500 }
      );
    }

    if (recoveredRows && recoveredRows.length > 0) {
      return NextResponse.json(
        { success: false, message: "This checkout attempt was already recovered and paid." },
        { status: 409 }
      );
    }

    // 9. Preflight Check for Existing Active Draft
    const { data: latestDraftRow, error: draftQueryErr } = await supabase
      .from("finance_audit_logs")
      .select("new_values, created_at")
      .eq("action_type", "CASHFREE_CHECKOUT_DRAFT")
      .like("notes", `CF_ORD_${baseHash}%`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (draftQueryErr) {
      console.error("Checkout draft preflight query error:", draftQueryErr);
      return NextResponse.json(
        { success: false, message: "Database error during checkout verification." },
        { status: 500 }
      );
    }

    let attemptCount = 1;
    if (latestDraftRow?.new_values) {
      const prevDraft = latestDraftRow.new_values;

      // Terminal check: Never revive or create new gateway orders for paid/completed drafts
      if (prevDraft.status === "PAID" || prevDraft.status === "COMPLETED") {
        return NextResponse.json(
          { success: false, message: "This checkout draft has already been paid and completed." },
          { status: 409 }
        );
      }

      const prevCfOrderId = prevDraft.cfOrderId;
      if (!prevCfOrderId || typeof prevCfOrderId !== "string") {
        console.error("FATAL: Previous checkout draft missing cfOrderId identifier.");
        return NextResponse.json(
          { success: false, message: "Corrupted previous checkout draft. Please use a new checkout attempt." },
          { status: 500 }
        );
      }

      // Authoritative Gateway Verification: Query Cashfree directly for the status of the previous attempt.
      // NEVER advance from attempt _a1 to _a2 based only on local draft age.
      // Fail closed if the gateway status is unavailable, ambiguous, or the request fails.
      let existingCfOrder;
      try {
        existingCfOrder = await fetchCashfreeOrder(prevCfOrderId);
      } catch (fetchErr: unknown) {
        console.error("Cashfree order verification failed for previous attempt:", fetchErr);
        const errMsg = fetchErr instanceof Error ? fetchErr.message : "Gateway verification error.";
        return NextResponse.json(
          {
            success: false,
            message: `Unable to verify status of previous checkout attempt with payment gateway: ${errMsg}. Failing closed to prevent duplicate payment.`,
          },
          { status: 502 }
        );
      }

      if (!existingCfOrder || !existingCfOrder.order_status) {
        return NextResponse.json(
          { success: false, message: "Ambiguous or missing status from Cashfree for previous checkout attempt." },
          { status: 502 }
        );
      }

      // 1. If gateway reports PAID: Do not create another order. Return conflict response.
      if (existingCfOrder.order_status === "PAID") {
        return NextResponse.json(
          {
            success: false,
            message: "Previous checkout attempt is already paid at payment gateway. Payment reconciliation in progress.",
          },
          { status: 409 }
        );
      }

      // 2. If gateway reports ACTIVE: Do not create a second payable order.
      // Reuse existing valid session ONLY after verifying amount, currency, and fingerprint.
      if (existingCfOrder.order_status === "ACTIVE") {
        const gatewayPaise = Math.round(Number(existingCfOrder.order_amount) * 100);
        const requestedPaise = Math.round(grandTotal * 100);
        const gatewayCurrency = String(existingCfOrder.order_currency || "").toUpperCase();
        const gatewayFingerprint = existingCfOrder.order_tags?.fingerprint || prevDraft.fingerprint;

        const matchesAmount = gatewayPaise === requestedPaise;
        const matchesCurrency = gatewayCurrency === "INR";
        const matchesFingerprint = gatewayFingerprint === canonicalFingerprint;
        const matchesUser = prevDraft.userId === (userId || null);

        if (!matchesAmount || !matchesCurrency || !matchesFingerprint || !matchesUser) {
          return NextResponse.json(
            {
              success: false,
              message: "Active checkout session exists with mismatched parameters. Cannot create a new order while previous is active.",
            },
            { status: 409 }
          );
        }

        const validSessionId = existingCfOrder.payment_session_id || prevDraft.cfPaymentSessionId;
        if (!validSessionId) {
          return NextResponse.json(
            { success: false, message: "Active Cashfree order missing payment session." },
            { status: 502 }
          );
        }

        return NextResponse.json({
          success: true,
          paymentSessionId: validSessionId,
          orderId: prevDraft.cfOrderId,
          cfOrderId: existingCfOrder.cf_order_id || prevDraft.cfGatewayOrderId || prevDraft.cfOrderId,
          environment: getCashfreeEnvironment().toLowerCase(),
          calculatedTotal: grandTotal,
          reused: true,
        });
      }

      // 3. Advance to a new attempt ONLY when the gateway authoritatively confirms the previous order is EXPIRED
      // or otherwise definitively non-payable, and the response is verified.
      if (existingCfOrder.order_status === "EXPIRED") {
        attemptCount = (Number(prevDraft.attemptCount) || 1) + 1;
      } else {
        // Any unknown or ambiguous status (e.g., TERMINATED, CANCELLED, etc.)
        return NextResponse.json(
          {
            success: false,
            message: `Previous payment order is in non-creatable state '${existingCfOrder.order_status}'. Cannot safely advance attempt.`,
          },
          { status: 409 }
        );
      }
    }

    const cfOrderId = `CF_ORD_${baseHash}_a${attemptCount}`;

    // 9. Create Cashfree Payment Order (Server-to-Server)
    const customerPhone = customerDetails.phone || shippingAddress?.phone || "9999999999";
    const customerName = customerDetails.name || customerDetails.fullName || shippingAddress?.full_name || "Customer";
    const customerEmail = customerDetails.email || email || shippingAddress?.email || "customer@store.com";
    const customerId = userId || `CUS_${baseHash.slice(0, 12)}`;

    const cfOrder = await createCashfreeOrder({
      orderId: cfOrderId,
      orderAmount: grandTotal,
      orderCurrency: "INR",
      customerDetails: {
        customer_id: String(customerId).substring(0, 50),
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
      },
      orderTags: {
        idempotencyKey: rawKey,
        cfOrderId: cfOrderId,
        fingerprint: canonicalFingerprint,
        couponCode: validatedCouponCode || "",
        cityRuleName: cityRuleName || "",
      },
      orderNote: `Online Checkout: ${rawKey.slice(0, 16)}`,
    });

    if (!cfOrder || !cfOrder.payment_session_id) {
      return NextResponse.json(
        { success: false, message: "Cashfree did not return a valid payment session." },
        { status: 502 }
      );
    }

    // 10. Persist Durable Checkout Draft (FAIL-CLOSED)
    const isUuid = userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    const { error: draftInsertErr } = await supabase.from("finance_audit_logs").insert({
      actor_id: isUuid ? userId : null,
      action_type: "CASHFREE_CHECKOUT_DRAFT",
      target_entity: "cashfree_order",
      notes: cfOrderId,
      new_values: {
        cfOrderId,
        cfGatewayOrderId: cfOrder.cf_order_id,
        cfPaymentSessionId: cfOrder.payment_session_id,
        grandTotal,
        recalculatedSubtotal,
        validatedDiscountAmount,
        validatedCouponCode,
        finalShippingCost,
        recalculatedTax,
        appliedWallet,
        items,
        shippingAddress,
        customerDetails,
        idempotencyKey: rawKey,
        fingerprint: canonicalFingerprint,
        attemptCount,
        userId: userId || null,
        email,
        cityRuleName,
        status: "PENDING_PAYMENT",
        createdAt: new Date().toISOString(),
      },
    });

    if (draftInsertErr) {
      console.error("FATAL: Failed to persist checkout draft audit log:", draftInsertErr);
      return NextResponse.json(
        { success: false, message: "Failed to persist secure checkout session. Your payment was not processed." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      paymentSessionId: cfOrder.payment_session_id,
      orderId: cfOrder.order_id,
      cfOrderId: cfOrder.cf_order_id,
      environment: getCashfreeEnvironment().toLowerCase(),
      calculatedTotal: grandTotal,
    });
  } catch (err: unknown) {
    console.error("Cashfree create-order API error:", err);
    const message = err instanceof Error ? err.message : "Failed to create Cashfree payment order.";
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
