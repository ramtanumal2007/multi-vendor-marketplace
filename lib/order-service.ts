import { createClient, type SupabaseClient } from "@supabase/supabase-js";

async function restoreStock(supabaseClient: SupabaseClient, productId: string, quantity: number) {
  try {
    const { error } = await supabaseClient.rpc("restore_product_stock_atomic", {
      p_product_id: productId,
      p_quantity: quantity,
    });
    if (error) {
      const { data: lp } = await supabaseClient
        .from("products")
        .select("stock_quantity")
        .eq("id", productId)
        .single();
      if (lp) {
        const prod = lp as { stock_quantity?: number | null };
        await supabaseClient
          .from("products")
          .update({ stock_quantity: (prod.stock_quantity || 0) + quantity })
          .eq("id", productId);
      }
    }
  } catch (err) {
    console.error(`Failed to restore stock for product ${productId}:`, err);
  }
}

export interface CreateOrderParams {
  userId?: string | null;
  email?: string;
  shippingAddress: {
    full_name?: string;
    phone?: string;
    city?: string;
    email?: string;
    [key: string]: unknown;
  };
  paymentMethod?: string;
  shippingMethod?: string;
  shippingCost?: number;
  cityRuleName?: string;
  items: Array<{
    productId: string;
    title: string;
    quantity: number;
    variantInfo?: unknown;
    [key: string]: unknown;
  }>;
  couponCode?: string | null;
  idempotencyKey?: string | null;
  paymentStatus?: string;
  paymentReferenceId?: string | null;
  cashfreePaymentId?: string | null;
}

export interface CreateOrderResult {
  success: boolean;
  message?: string;
  order?: Record<string, unknown>;
  order_number?: string;
  invoice_number?: string;
  is_duplicate?: boolean;
  status?: number;
}

export async function createOrderRecord(params: CreateOrderParams): Promise<CreateOrderResult> {
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
    idempotencyKey,
    paymentStatus,
    paymentReferenceId,
    cashfreePaymentId,
  } = params;

  const paymentRef = paymentReferenceId || cashfreePaymentId || null;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return { success: false, message: "Cart is empty. Cannot process order.", status: 400 };
  }

  if (!shippingAddress || !shippingAddress.full_name || !shippingAddress.phone || !shippingAddress.city) {
    return { success: false, message: "Incomplete delivery address provided.", status: 400 };
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const cleanIdempotencyKey =
    idempotencyKey && typeof idempotencyKey === "string" && idempotencyKey.trim()
      ? idempotencyKey.trim()
      : null;

  // 0. Server-side Idempotency Check: Return existing order if attempt ID already completed
  if (cleanIdempotencyKey) {
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("*")
      .eq("idempotency_key", cleanIdempotencyKey)
      .maybeSingle();

    if (existingOrder) {
      return {
        success: true,
        order: existingOrder,
        order_number: existingOrder.order_number,
        invoice_number: existingOrder.invoice_number,
        is_duplicate: true,
        status: 200,
      };
    }
  }

  // 1. Fetch current authoritative product metadata & revalidate stock from DB
  const productIds = items.map((i: { productId?: string }) => i.productId).filter(Boolean);
  const { data: dbProducts, error: dbProdErr } = await supabase
    .from("products")
    .select("id, title, price, sale_price, stock_quantity, track_inventory, allow_backorders, store_id, sku, category_id, tax_rate, delivery_fee, categories(tax_rate)")
    .in("id", productIds);

  if (dbProdErr || !dbProducts) {
    return { success: false, message: "Failed to verify catalog pricing and stock.", status: 500 };
  }

  interface DbProductRow {
    id: string;
    title: string;
    price: number;
    sale_price?: number | null;
    stock_quantity?: number | null;
    track_inventory?: boolean;
    allow_backorders?: boolean;
    store_id?: string;
    sku?: string;
    category_id?: string;
    tax_rate?: number | null;
    delivery_fee?: number | null;
    categories?: { tax_rate?: number | null } | Array<{ tax_rate?: number | null }> | null;
  }

  const dbProdMap = new Map<string, DbProductRow>((dbProducts as DbProductRow[]).map((p) => [p.id, p]));

  // Revalidate Stock Server-Side
  for (const item of items) {
    const dbP = dbProdMap.get(item.productId);
    if (!dbP) {
      return {
        success: false,
        message: `Product "${item.title}" is no longer available in the store catalog.`,
        status: 400,
      };
    }

    if (dbP.track_inventory && !dbP.allow_backorders) {
      const availableStock = dbP.stock_quantity ?? 0;
      if (availableStock < item.quantity) {
        return {
          success: false,
          message: `Insufficient stock for "${dbP.title}". Requested: ${item.quantity}, Available: ${availableStock}.`,
          status: 409,
        };
      }
    }
  }

  // 2. Server-side recalculation of subtotal
  let recalculatedSubtotal = 0;
  const validatedItems = items.map((item: { productId: string; title: string; quantity: number; variantInfo?: unknown }) => {
    const dbP = dbProdMap.get(item.productId)!;
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

  // 5. Server-side Shipping Fee Calculation
  let finalShippingCost = shippingCost !== undefined && shippingCost !== null ? Number(shippingCost) : 40;
  if (recalculatedSubtotal >= freeThreshold && freeThreshold > 0) {
    finalShippingCost = 0;
  }

  // 6. Grand Total
  const subtotalAfterCoupon = Math.max(0, recalculatedSubtotal - validatedDiscountAmount);
  const grandTotal = Math.round((subtotalAfterCoupon + finalShippingCost + recalculatedTax) * 100) / 100;

  // Common order payload
  const orderDataPayload = {
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
    payment_status: paymentStatus || "pending",
    fulfillment_status: "pending",
    internal_status: "ORDERED",
  };

  // 7. ATOMIC STOCK RESERVATION & ORDER CREATION (POSTGRESQL TRANSACTION RPC)
  const { data: rpcData, error: rpcErr } = await supabase.rpc("create_order_atomic", {
    p_idempotency_key: cleanIdempotencyKey,
    p_order_data: orderDataPayload,
    p_order_items: validatedItems,
  });

  // If atomic RPC executed successfully, return committed order
  if (!rpcErr && rpcData && rpcData.success) {
    if (paymentRef && rpcData.order_id) {
      await supabase
        .from("orders")
        .update({ razorpay_payment_id: paymentRef })
        .eq("id", rpcData.order_id);
    }
    return {
      success: true,
      order: rpcData.order,
      order_number: rpcData.order_number,
      invoice_number: rpcData.invoice_number,
      is_duplicate: rpcData.is_duplicate || false,
      status: 200,
    };
  }

  // If RPC threw an explicit insufficient stock exception, abort checkout with 409
  if (rpcErr && rpcErr.message && rpcErr.message.includes("INSUFFICIENT_STOCK")) {
    return {
      success: false,
      message: rpcErr.message.replace("INSUFFICIENT_STOCK: ", ""),
      status: 409,
    };
  }

  // 8. APPLICATION-LEVEL ATOMIC FALLBACK WITH TRANSACTIONAL COMPENSATION
  // Used if create_order_atomic RPC is not yet registered in schema cache.
  const sortedItems = [...validatedItems].sort((a, b) => a.product_id.localeCompare(b.product_id));
  const decrementedItems: { productId: string; quantity: number }[] = [];

  try {
    // Step A: Conditionally reserve stock for each item
    for (const vi of sortedItems) {
      const dbP = dbProdMap.get(vi.product_id);
      if (dbP && dbP.track_inventory && !dbP.allow_backorders) {
        const { data: decOk, error: decRpcErr } = await supabase.rpc("decrement_product_stock_atomic", {
          p_product_id: vi.product_id,
          p_quantity: vi.quantity,
        });

        let isSuccess = decOk === true;
        if (decRpcErr) {
          const { data: liveP } = await supabase
            .from("products")
            .select("stock_quantity")
            .eq("id", vi.product_id)
            .single();

          const currentStock = liveP?.stock_quantity ?? 0;
          if (currentStock >= vi.quantity) {
            const { error: updErr } = await supabase
              .from("products")
              .update({ stock_quantity: currentStock - vi.quantity })
              .eq("id", vi.product_id)
              .gte("stock_quantity", vi.quantity);
            isSuccess = !updErr;
          } else {
            isSuccess = false;
          }
        }

        if (!isSuccess) {
          for (const dec of decrementedItems) {
            await restoreStock(supabase, dec.productId, dec.quantity);
          }

          return {
            success: false,
            message: `Insufficient stock for "${vi.title}". It may have just sold out.`,
            status: 409,
          };
        }

        decrementedItems.push({ productId: vi.product_id, quantity: vi.quantity });
      }
    }

    // Step B: Insert Order (Triggers generate ORD-XXXXX and INV-XXXXX)
    const orderInsertPayload: Record<string, unknown> = {
      ...orderDataPayload,
    };
    if (cleanIdempotencyKey) {
      orderInsertPayload.idempotency_key = cleanIdempotencyKey;
    }
    if (paymentRef) {
      orderInsertPayload.razorpay_payment_id = paymentRef;
    }

    let { data: orderData, error: orderErr } = await supabase
      .from("orders")
      .insert(orderInsertPayload)
      .select()
      .single();

    if (orderErr && cleanIdempotencyKey && orderErr.message?.includes("idempotency_key")) {
      delete orderInsertPayload.idempotency_key;
      const retry = await supabase.from("orders").insert(orderInsertPayload).select().single();
      orderData = retry.data;
      orderErr = retry.error;
    }

    if (orderErr && (orderErr.code === "23505" || orderErr.message?.includes("unique") || orderErr.message?.includes("idempotency"))) {
      for (const dec of decrementedItems) {
        await restoreStock(supabase, dec.productId, dec.quantity);
      }

      const { data: duplicateOrder } = await supabase
        .from("orders")
        .select("*")
        .eq("idempotency_key", cleanIdempotencyKey)
        .maybeSingle();

      if (duplicateOrder) {
        return {
          success: true,
          order: duplicateOrder,
          order_number: duplicateOrder.order_number,
          invoice_number: duplicateOrder.invoice_number,
          is_duplicate: true,
          status: 200,
        };
      }
    }

    if (orderErr || !orderData) {
      for (const dec of decrementedItems) {
        await restoreStock(supabase, dec.productId, dec.quantity);
      }
      throw new Error(orderErr?.message || "Failed to create order record.");
    }

    // Step C: Insert Order Items (Triggers generate OI-XXXXX-YYY and snapshot SKU)
    const orderItemsToInsert = validatedItems.map((vi: Record<string, unknown>) => ({
      ...vi,
      order_id: orderData.id,
    }));

    const { error: itemsErr } = await supabase.from("order_items").insert(orderItemsToInsert);
    if (itemsErr) {
      await supabase.from("orders").delete().eq("id", orderData.id);
      for (const dec of decrementedItems) {
        await restoreStock(supabase, dec.productId, dec.quantity);
      }
      throw new Error(itemsErr.message || "Failed to create order items.");
    }

    // Step D: Increment Coupon Usage Counter if coupon was applied
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

    return {
      success: true,
      order: orderData,
      order_number: orderData.order_number,
      invoice_number: orderData.invoice_number,
      is_duplicate: false,
      status: 200,
    };
  } catch (flowErr: unknown) {
    for (const dec of decrementedItems) {
      await restoreStock(supabase, dec.productId, dec.quantity);
    }
    throw flowErr;
  }
}
