import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  createCashfreeOrder,
  getCashfreeEnvironment,
} from "@/lib/cashfree";
import { createOrderRecord } from "@/lib/order-service";

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
      userId,
      email,
    } = body;

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

    const supabase = createClient(
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
    let finalShippingCost = Number(shippingCost || 40);
    if (recalculatedSubtotal >= freeThreshold && freeThreshold > 0) {
      finalShippingCost = 0;
    }

    // 6. Authoritative Grand Total
    const subtotalAfterCoupon = Math.max(0, recalculatedSubtotal - validatedDiscountAmount);
    const grandTotal = Math.round((subtotalAfterCoupon + finalShippingCost + recalculatedTax) * 100) / 100;

    if (grandTotal < 1) {
      return NextResponse.json(
        { success: false, message: "Order total is below minimum payable amount." },
        { status: 400 }
      );
    }

    // 7. Generate Unique Cashfree Order Identifier
    const cleanAttemptSuffix = (idempotencyKey || "").replace(/[^a-zA-Z0-9]/g, "").slice(-8);
    const cfOrderId = `CF_${Date.now().toString(36)}_${cleanAttemptSuffix || Math.random().toString(36).substring(2, 7)}`.substring(0, 45);

    // 8. Create Cashfree Payment Order FIRST (Server-to-Server)
    const customerPhone = customerDetails.phone || shippingAddress?.phone || "9999999999";
    const customerName = customerDetails.name || customerDetails.fullName || shippingAddress?.full_name || "Customer";
    const customerEmail = customerDetails.email || email || shippingAddress?.email || "customer@store.com";
    const customerId = customerDetails.customerId || userId || `CUS_${cleanAttemptSuffix || Date.now()}`;

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
        idempotencyKey: idempotencyKey || "",
        cfOrderId: cfOrderId,
      },
      orderNote: `Online Checkout: ${cleanAttemptSuffix || "Payment"}`,
    });

    if (!cfOrder || !cfOrder.payment_session_id) {
      return NextResponse.json(
        { success: false, message: "Cashfree did not return a valid payment session." },
        { status: 502 }
      );
    }

    // 9. ONLY AFTER successful Cashfree order/session creation, create the internal Supabase order
    let internalOrderResult: {
      success: boolean;
      order?: Record<string, unknown>;
      order_number?: string;
      invoice_number?: string;
      message?: string;
    } | null = null;

    if (shippingAddress) {
      internalOrderResult = await createOrderRecord({
        userId: userId || customerDetails.customerId || null,
        email: customerEmail,
        shippingAddress,
        paymentMethod: "ONLINE",
        paymentStatus: "pending",
        shippingMethod: `${cityRuleName || "Local"} Delivery`,
        shippingCost: finalShippingCost,
        cityRuleName: cityRuleName || "Local",
        items,
        couponCode: validatedCouponCode,
        idempotencyKey: idempotencyKey || null,
      });

      if (!internalOrderResult.success) {
        console.error("Internal order reservation failed after Cashfree session creation:", internalOrderResult.message);
        return NextResponse.json(
          {
            success: false,
            message: internalOrderResult.message || "Failed to finalize order reservation.",
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      paymentSessionId: cfOrder.payment_session_id,
      orderId: cfOrder.order_id,
      cfOrderId: cfOrder.cf_order_id,
      internalOrderId: internalOrderResult?.order?.id || null,
      internalOrderNumber: internalOrderResult?.order_number || null,
      invoiceNumber: internalOrderResult?.invoice_number || null,
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
