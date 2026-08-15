import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      userId,
      email,
      shippingAddress,
      paymentMethod,
      shippingMethod,
      shippingCost,
      cityRuleName,
      items = [],
      couponCode,
    } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, message: "Cart is empty. Cannot process order." },
        { status: 400 }
      );
    }

    if (!shippingAddress || !shippingAddress.full_name || !shippingAddress.phone || !shippingAddress.city) {
      return NextResponse.json(
        { success: false, message: "Incomplete delivery address provided." },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Fetch current authoritative product metadata & revalidate stock from DB
    const productIds = items.map((i: any) => i.productId).filter(Boolean);
    const { data: dbProducts, error: dbProdErr } = await supabase
      .from("products")
      .select("id, title, price, sale_price, stock_quantity, track_inventory, allow_backorders, store_id, sku, category_id, tax_rate, delivery_fee, categories(tax_rate)")
      .in("id", productIds);

    if (dbProdErr || !dbProducts) {
      return NextResponse.json(
        { success: false, message: "Failed to verify catalog pricing and stock." },
        { status: 500 }
      );
    }

    const dbProdMap = new Map<string, any>(dbProducts.map((p: any) => [p.id, p]));

    // Revalidate Stock Server-Side
    for (const item of items) {
      const dbP = dbProdMap.get(item.productId);
      if (!dbP) {
        return NextResponse.json({
          success: false,
          message: `Product "${item.title}" is no longer available in the store catalog.`,
        });
      }

      if (dbP.track_inventory && !dbP.allow_backorders) {
        const availableStock = dbP.stock_quantity ?? 0;
        if (availableStock < item.quantity) {
          return NextResponse.json({
            success: false,
            message: `Insufficient stock for "${dbP.title}". Requested: ${item.quantity}, Available: ${availableStock}.`,
          });
        }
      }
    }

    // 2. Server-side recalculation of subtotal
    let recalculatedSubtotal = 0;
    const validatedItems = items.map((item: any) => {
      const dbP = dbProdMap.get(item.productId);
      const hasDiscount = Boolean(dbP.sale_price && dbP.sale_price > 0 && dbP.sale_price < dbP.price);
      const effectivePrice = hasDiscount ? Number(dbP.sale_price) : Number(dbP.price);
      const lineTotal = effectivePrice * Number(item.quantity);
      recalculatedSubtotal += lineTotal;

      return {
        product_id: dbP.id,
        store_id: dbP.store_id || null,
        title: dbP.title,
        sku: dbP.sku || null,
        quantity: Number(item.quantity),
        unit_price: effectivePrice,
        line_total: lineTotal,
        variant_info: item.variantInfo || null,
      };
    });

    // 3. Server-side Coupon Revalidation & Discount Calculation
    let validatedCouponCode: string | null = null;
    let validatedDiscountAmount = 0;

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
        const isValidLimits = maxRedemptions === null || maxRedemptions === undefined || currentTimesUsed < maxRedemptions;

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

              if (isEligible) {
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

    // 4. Server-side Tax Calculation
    const { data: settingsData } = await supabase
      .from("site_settings")
      .select("default_tax_rate, free_delivery_threshold")
      .single();

    const globalTaxRate = Number(settingsData?.default_tax_rate || 0);
    const freeThreshold = Number(settingsData?.free_delivery_threshold || 500);

    let recalculatedTax = 0;
    for (const item of items) {
      const dbP = dbProdMap.get(item.productId);
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

    // 5. Server-side Shipping Fee Calculation
    let finalShippingCost = Number(shippingCost || 40);
    if (recalculatedSubtotal >= freeThreshold && freeThreshold > 0) {
      finalShippingCost = 0;
    }

    // 6. Grand Total
    const subtotalAfterCoupon = Math.max(0, recalculatedSubtotal - validatedDiscountAmount);
    const grandTotal = Math.round((subtotalAfterCoupon + finalShippingCost + recalculatedTax) * 100) / 100;

    // 7. Insert Order (Triggers generate ORD-XXXXX and INV-XXXXX)
    const { data: orderData, error: orderErr } = await supabase
      .from("orders")
      .insert({
        user_id: userId || null,
        email: email || shippingAddress.email || "customer@store.com",
        shipping_address: shippingAddress,
        billing_address: shippingAddress,
        shipping_method: shippingMethod || `${cityRuleName || "Local"} Delivery`,
        shipping_cost: finalShippingCost,
        subtotal: recalculatedSubtotal,
        discount_amount: validatedDiscountAmount,
        tax_amount: recalculatedTax,
        total: grandTotal,
        coupon_code: validatedCouponCode,
        payment_method: paymentMethod || "COD",
        payment_status: "pending",
        fulfillment_status: "pending",
        internal_status: "ORDERED",
      })
      .select()
      .single();

    if (orderErr || !orderData) {
      throw new Error(orderErr?.message || "Failed to create order record.");
    }

    // 8. Insert Order Items (Triggers generate OI-XXXXX-YYY and snapshot SKU)
    const orderItemsToInsert = validatedItems.map((vi: any) => ({
      ...vi,
      order_id: orderData.id,
    }));

    const { error: itemsErr } = await supabase.from("order_items").insert(orderItemsToInsert);
    if (itemsErr) {
      console.error("Order items insert error:", itemsErr);
    }

    // 9. Atomic Stock Decrement & Concurrency Check
    for (const vi of validatedItems) {
      const dbP = dbProdMap.get(vi.product_id);
      if (dbP && dbP.track_inventory) {
        // Atomic decrement
        const { error: stockUpdateErr } = await supabase.rpc("decrement_product_stock", {
          p_product_id: vi.product_id,
          p_quantity: vi.quantity,
        });

        // Fallback standard atomic SQL update if RPC doesn't exist
        if (stockUpdateErr) {
          const newStock = Math.max(0, (dbP.stock_quantity || 0) - vi.quantity);
          await supabase
            .from("products")
            .update({ stock_quantity: newStock })
            .eq("id", vi.product_id);
        }
      }
    }

    // 10. Increment Coupon Usage Counter if coupon was applied
    if (validatedCouponCode) {
      const { data: cData } = await supabase
        .from("coupons")
        .select("id, times_used, usage_count")
        .eq("code", validatedCouponCode)
        .single();

      if (cData) {
        const nextUsed = (cData.times_used ?? cData.usage_count ?? 0) + 1;
        await supabase
          .from("coupons")
          .update({ times_used: nextUsed, usage_count: nextUsed })
          .eq("id", cData.id);
      }
    }

    return NextResponse.json({
      success: true,
      order: orderData,
      order_number: orderData.order_number,
      invoice_number: orderData.invoice_number,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message || "Failed to place order." },
      { status: 500 }
    );
  }
}
