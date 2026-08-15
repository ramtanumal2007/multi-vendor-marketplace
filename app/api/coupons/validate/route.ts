import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { code, subtotal, items = [], userId } = body;

    if (!code || typeof code !== "string" || !code.trim()) {
      return NextResponse.json(
        { valid: false, message: "Please enter a valid coupon code." },
        { status: 400 }
      );
    }

    const cleanCode = code.trim().toUpperCase();
    const cartSubtotal = Number(subtotal || 0);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Fetch coupon record
    const { data: coupon, error } = await supabase
      .from("coupons")
      .select("*")
      .eq("code", cleanCode)
      .single();

    if (error || !coupon) {
      return NextResponse.json({
        valid: false,
        message: `Invalid coupon code "${cleanCode}".`,
      });
    }

    // 2. Active status check
    if (!coupon.is_active) {
      return NextResponse.json({
        valid: false,
        message: "This coupon is currently inactive or disabled.",
      });
    }

    // 3. Start Date / End Date checks
    const now = new Date();
    if (coupon.valid_from && new Date(coupon.valid_from) > now) {
      return NextResponse.json({
        valid: false,
        message: "This coupon promotion has not started yet.",
      });
    }

    if (coupon.valid_to && new Date(coupon.valid_to) < now) {
      return NextResponse.json({
        valid: false,
        message: "This coupon code has expired.",
      });
    }

    // 4. Minimum Order Amount check
    const minOrder = Number(coupon.min_order_amount || 0);
    if (minOrder > 0 && cartSubtotal < minOrder) {
      return NextResponse.json({
        valid: false,
        message: `Minimum order amount of ₹${minOrder.toLocaleString()} is required for code ${cleanCode}.`,
      });
    }

    // 5. Total Usage Limit check
    const maxRedemptions = coupon.max_total_redemptions ?? coupon.usage_limit;
    const currentTimesUsed = coupon.times_used ?? coupon.usage_count ?? 0;
    if (maxRedemptions !== null && maxRedemptions !== undefined && currentTimesUsed >= maxRedemptions) {
      return NextResponse.json({
        valid: false,
        message: "Maximum usage limit for this coupon code has been reached.",
      });
    }

    // 6. First Order Restriction check
    if (coupon.is_first_order_only && userId) {
      const { count, error: orderCountErr } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);

      if (!orderCountErr && count !== null && count > 0) {
        return NextResponse.json({
          valid: false,
          message: "This coupon code is valid for first-time orders only.",
        });
      }
    }

    // 7. Per-Customer Limit check
    if (coupon.per_customer_limit && userId) {
      const { count, error: userUsageErr } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("coupon_code", cleanCode);

      if (!userUsageErr && count !== null && count >= coupon.per_customer_limit) {
        return NextResponse.json({
          valid: false,
          message: `You have reached the limit of ${coupon.per_customer_limit} use(s) for this coupon code.`,
        });
      }
    }

    // 8. Target Scope Eligibility & Eligible Items Calculation
    let eligibleSubtotal = cartSubtotal;

    // Fetch product category and store metadata if targeting specific sellers/categories/products
    if (items.length > 0) {
      const productIds = items.map((i: any) => i.productId).filter(Boolean);
      const { data: prodsData } = await supabase
        .from("products")
        .select("id, category_id, store_id")
        .in("id", productIds);

      const prodMetaMap = new Map<string, { category_id?: string; store_id?: string }>(
        prodsData?.map((p: any) => [p.id, { category_id: p.category_id, store_id: p.store_id }]) || []
      );

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
        let matchedItemCount = 0;

        for (const item of items) {
          const meta = prodMetaMap.get(item.productId);
          let isEligible = false;

          if (targetType === "product" || appProducts.length > 0) {
            if (appProducts.includes(item.productId)) isEligible = true;
          } else if (targetType === "category" || appCategories.length > 0) {
            if (meta?.category_id && appCategories.includes(meta.category_id)) isEligible = true;
          } else if (targetType === "seller" || targetSellers.length > 0) {
            if (meta?.store_id && targetSellers.includes(meta.store_id)) isEligible = true;
          } else {
            isEligible = true;
          }

          if (isEligible) {
            matchingSubtotal += Number(item.price || 0) * Number(item.quantity || 1);
            matchedItemCount++;
          }
        }

        if (matchedItemCount === 0) {
          let reasonMsg = `Coupon "${cleanCode}" is not applicable to the current item(s).`;
          if (targetType === "product" || appProducts.length > 0) {
            reasonMsg = `Coupon "${cleanCode}" is valid only for selected products.`;
          } else if (targetType === "category" || appCategories.length > 0) {
            reasonMsg = `Coupon "${cleanCode}" is valid only for specific product categories.`;
          } else if (targetType === "seller" || targetSellers.length > 0) {
            reasonMsg = `Coupon "${cleanCode}" is valid only for items from selected stores.`;
          }

          return NextResponse.json({
            valid: false,
            message: reasonMsg,
          });
        }

        eligibleSubtotal = matchingSubtotal;
      }
    }

    // 9. Calculate Discount
    let discountAmount = 0;
    const value = Number(coupon.value || 0);

    if (coupon.type === "percentage") {
      discountAmount = (eligibleSubtotal * value) / 100;
    } else if (coupon.type === "fixed") {
      discountAmount = Math.min(eligibleSubtotal, value);
    } else {
      discountAmount = Math.min(eligibleSubtotal, value);
    }

    discountAmount = Math.round(discountAmount * 100) / 100;

    return NextResponse.json({
      valid: true,
      message: `Coupon "${cleanCode}" applied successfully!`,
      coupon: {
        id: coupon.id,
        code: cleanCode,
        type: coupon.type,
        value: coupon.value,
        min_order_amount: coupon.min_order_amount,
      },
      discountAmount,
    });
  } catch (err: any) {
    return NextResponse.json(
      { valid: false, message: err.message || "Failed to validate coupon." },
      { status: 500 }
    );
  }
}
