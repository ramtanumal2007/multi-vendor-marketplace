import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { subtotal = 0, items = [] } = body;
    const cartSubtotal = Number(subtotal || 0);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const now = new Date().toISOString();

    // 1. Fetch active coupons
    const { data: coupons, error } = await supabase
      .from("coupons")
      .select("*")
      .eq("is_active", true)
      .or(`valid_to.is.null,valid_to.gte.${now}`)
      .order("created_at", { ascending: false });

    if (error || !coupons) {
      return NextResponse.json({ applicableCoupons: [], otherCoupons: [] });
    }

    // Prepare product metadata mapping for target scope checking
    let prodMetaMap = new Map<string, { category_id?: string; store_id?: string }>();
    if (items.length > 0) {
      const productIds = items.map((i: any) => i.productId).filter(Boolean);
      if (productIds.length > 0) {
        const { data: prodsData } = await supabase
          .from("products")
          .select("id, category_id, store_id")
          .in("id", productIds);

        prodMetaMap = new Map(
          prodsData?.map((p: any) => [p.id, { category_id: p.category_id, store_id: p.store_id }]) || []
        );
      }
    }

    const applicableCoupons: any[] = [];
    const otherCoupons: any[] = [];

    for (const coupon of coupons) {
      const minOrder = Number(coupon.min_order_amount || 0);
      const targetType = coupon.target_type || "all";
      const targetSellers = coupon.target_sellers || [];
      const appCategories = coupon.applicable_categories || [];
      const appProducts = coupon.applicable_products || [];

      let matchingSubtotal = cartSubtotal;
      let isItemMatched = true;

      if (
        targetType === "category" ||
        targetType === "product" ||
        targetType === "seller" ||
        appCategories.length > 0 ||
        appProducts.length > 0 ||
        targetSellers.length > 0
      ) {
        matchingSubtotal = 0;
        let matchedCount = 0;

        for (const item of items) {
          const meta = prodMetaMap.get(item.productId);
          let match = false;

          if (targetType === "product" || appProducts.length > 0) {
            if (appProducts.includes(item.productId)) match = true;
          } else if (targetType === "category" || appCategories.length > 0) {
            if (meta?.category_id && appCategories.includes(meta.category_id)) match = true;
          } else if (targetType === "seller" || targetSellers.length > 0) {
            if (meta?.store_id && targetSellers.includes(meta.store_id)) match = true;
          } else {
            match = true;
          }

          if (match) {
            matchingSubtotal += Number(item.price || 0) * Number(item.quantity || 1);
            matchedCount++;
          }
        }

        isItemMatched = matchedCount > 0;
      }

      // Calculate discount amount if applicable
      const value = Number(coupon.value || 0);
      let estimatedDiscount = 0;
      if (coupon.type === "percentage") {
        estimatedDiscount = (matchingSubtotal * value) / 100;
      } else {
        estimatedDiscount = Math.min(matchingSubtotal, value);
      }
      estimatedDiscount = Math.round(estimatedDiscount * 100) / 100;

      const isMinOrderMet = minOrder === 0 || cartSubtotal >= minOrder;
      const isApplicable = isItemMatched && isMinOrderMet && estimatedDiscount > 0;

      let reason = "";
      if (!isItemMatched) {
        reason = "Valid only for specific products/categories";
      } else if (!isMinOrderMet) {
        reason = `Min order of ₹${minOrder.toLocaleString()} required`;
      } else if (coupon.is_first_order_only) {
        reason = "Valid for 1st-time orders only";
      }

      const card = {
        id: coupon.id,
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        min_order_amount: minOrder,
        estimatedDiscount,
        isApplicable,
        reason,
        is_first_order_only: coupon.is_first_order_only,
        displayBadge: coupon.type === "percentage" ? `${coupon.value}% OFF` : `₹${coupon.value} OFF`,
      };

      if (isApplicable) {
        applicableCoupons.push(card);
      } else {
        otherCoupons.push(card);
      }
    }

    return NextResponse.json({
      applicableCoupons,
      otherCoupons,
    });
  } catch (err: any) {
    return NextResponse.json({ applicableCoupons: [], otherCoupons: [] }, { status: 500 });
  }
}
