import { createAdminClient, type SupabaseClient } from "@/lib/supabase";
import { withDbRetry } from "./db-retry";
import { debitCustomerWallet, getOrCreateCustomerWallet } from "./wallet-service";

export interface RestoreStockResult {
  success: boolean;
  productId: string;
  quantity: number;
  error?: string;
}

export async function restoreStock(
  supabaseClient: SupabaseClient,
  productId: string,
  quantity: number,
  throwOnError = false
): Promise<RestoreStockResult> {
  if (quantity <= 0) {
    return { success: true, productId, quantity };
  }

  try {
    return await withDbRetry(async () => {
      const { error } = await supabaseClient.rpc("restore_product_stock_atomic", {
        p_product_id: productId,
        p_quantity: quantity,
      });

      if (!error) {
        return { success: true, productId, quantity };
      }

      // Fallback: fetch current stock and track_inventory
      const { data: lp, error: selectErr } = await supabaseClient
        .from("products")
        .select("stock_quantity, track_inventory")
        .eq("id", productId)
        .single();

      if (selectErr || !lp) {
        throw new Error(
          `Failed to find product ${productId} during stock restoration: ${selectErr?.message || "Product not found"}`
        );
      }

      const prod = lp as { stock_quantity?: number | null; track_inventory?: boolean };
      if (prod.track_inventory === false) {
        // Product inventory is not tracked; restoration is a no-op success
        return { success: true, productId, quantity };
      }

      const currentStock = prod.stock_quantity ?? 0;
      const { error: updErr } = await supabaseClient
        .from("products")
        .update({ stock_quantity: currentStock + quantity })
        .eq("id", productId);

      if (updErr) {
        throw new Error(`Failed to update stock quantity for product ${productId}: ${updErr.message}`);
      }

      return { success: true, productId, quantity };
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to restore stock for product ${productId}:`, errorMsg);
    if (throwOnError) {
      throw err;
    }
    return {
      success: false,
      productId,
      quantity,
      error: errorMsg,
    };
  }
}

async function autoSaveFirstOrderAddress(
  supabaseClient: SupabaseClient,
  userId: string,
  shippingAddress: Record<string, unknown>
) {
  try {
    const { count, error: countErr } = await supabaseClient
      .from("addresses")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    if (countErr || (count !== null && count > 0)) {
      return; // Customer already has saved address(es)
    }

    const fullName = String(
      shippingAddress.full_name ||
        `${shippingAddress.first_name || ""} ${shippingAddress.last_name || ""}`.trim() ||
        "Customer"
    ).trim();
    const phone = String(shippingAddress.phone || "").trim();
    const line1 = String(shippingAddress.address_line1 || shippingAddress.address1 || "").trim();
    const line2 = String(shippingAddress.address_line2 || shippingAddress.address2 || "").trim() || null;
    const city = String(shippingAddress.city || "").trim();
    const state = String(shippingAddress.state || "WEST BENGAL").trim();
    const zip = String(shippingAddress.postal_code || shippingAddress.zip || "").trim();
    const landmark = typeof shippingAddress.landmark === "string" ? shippingAddress.landmark.trim() || null : null;
    const mapsUrl = typeof shippingAddress.google_maps_url === "string" ? shippingAddress.google_maps_url.trim() || null : null;

    if (!fullName || !line1 || !city || !zip) {
      return; // Incomplete address details
    }

    await supabaseClient.from("addresses").insert({
      user_id: userId,
      full_name: fullName,
      phone: phone || "N/A",
      address_line1: line1,
      address_line2: line2,
      city: city,
      state: state,
      zip: zip,
      country: "IN",
      is_default: true,
      landmark: landmark,
      google_maps_url: mapsUrl,
    });
  } catch (err) {
    console.warn("Notice: autoSaveFirstOrderAddress non-fatal notice:", err);
  }
}

export interface CreateOrderParams {
  userId?: string | null;
  email?: string;
  shippingAddress: {
    full_name?: string;
    phone?: string;
    city?: string;
    state?: string;
    email?: string;
    [key: string]: unknown;
  };
  paymentMethod?: string;
  shippingMethod?: string;
  shippingCost?: number;
  cityRuleName?: string;
  items: Array<{
    productId: string;
    variantId?: string;
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
  estimatedDeliveryDate?: string | null;
  scheduledDeliveryDate?: string | null;
  isReplacement?: boolean;
  originalOrderId?: string | null;
  originalOrderNumber?: string | null;
  replacementRequestId?: string | null;
  replacementDifference?: number;
  replacementOriginalValue?: number;
  walletAmountApplied?: number;
  expectedTotal?: number;
}

export interface OrderVerificationResult {
  valid: boolean;
  reason?: string;
}

export function verifyMatchingOrder(
  existingOrder: Record<string, unknown>,
  params: CreateOrderParams,
  expectedGrandTotal?: number,
  existingItems?: Array<{ product_id: string; quantity: number }>
): OrderVerificationResult {
  const { userId, email, shippingAddress } = params;

  // 1. Customer Identity Validation
  const existingUserId = existingOrder.user_id ? String(existingOrder.user_id).trim() : null;
  const callerUserId = userId && typeof userId === "string" && userId.trim() ? userId.trim() : null;

  // If either side is authenticated, both must match the exact authenticated customer identity
  if (callerUserId || existingUserId) {
    if (callerUserId && !existingUserId) {
      return {
        valid: false,
        reason: "Customer identity mismatch (authenticated customer cannot claim guest order)",
      };
    }
    if (!callerUserId && existingUserId) {
      return {
        valid: false,
        reason: "Customer identity mismatch (order belongs to authenticated user)",
      };
    }
    if (callerUserId !== existingUserId) {
      return {
        valid: false,
        reason: "Customer identity mismatch (authenticated customer IDs do not match)",
      };
    }
  } else {
    // Both sides are guest checkout: DO NOT treat missing identity fields as proof that two customers match!
    const callerEmail = String(email || shippingAddress?.email || "").trim().toLowerCase();
    const existingEmail = String(
      existingOrder.email || (existingOrder.shipping_address as Record<string, unknown>)?.email || ""
    ).trim().toLowerCase();

    const callerPhone = String(shippingAddress?.phone || "").replace(/\D/g, "");
    const existingPhone = String(
      (existingOrder.shipping_address as Record<string, unknown>)?.phone ||
        (existingOrder.billing_address as Record<string, unknown>)?.phone ||
        ""
    ).replace(/\D/g, "");

    const isRealEmail = (e: string) => Boolean(e && e.includes("@") && e !== "customer@store.com");
    const callerHasEmail = isRealEmail(callerEmail);
    const existingHasEmail = isRealEmail(existingEmail);

    const isRealPhone = (p: string) => p.length >= 7;
    const callerHasPhone = isRealPhone(callerPhone);
    const existingHasPhone = isRealPhone(existingPhone);

    // If neither side has safely verifiable identity markers, reject
    if ((!callerHasEmail && !callerHasPhone) || (!existingHasEmail && !existingHasPhone)) {
      return {
        valid: false,
        reason: "Customer identity cannot be established safely (missing email and phone on guest checkout)",
      };
    }

    // If both have email, they must match
    if (callerHasEmail && existingHasEmail && callerEmail !== existingEmail) {
      return {
        valid: false,
        reason: "Customer identity mismatch (guest email does not match)",
      };
    }

    // If both have phone, last 10 digits must match
    if (callerHasPhone && existingHasPhone) {
      const callerP10 = callerPhone.slice(-10);
      const existingP10 = existingPhone.slice(-10);
      if (callerP10 !== existingP10) {
        return {
          valid: false,
          reason: "Customer identity mismatch (guest phone does not match)",
        };
      }
    }

    // If one has ONLY email and the other has ONLY phone, identity cannot be proven
    if (
      (callerHasEmail && !callerHasPhone && !existingHasEmail && existingHasPhone) ||
      (!callerHasEmail && callerHasPhone && existingHasEmail && !existingHasPhone)
    ) {
      return {
        valid: false,
        reason: "Customer identity cannot be verified (no matching identity fields between guest checkout and existing order)",
      };
    }
  }

  // 2. Currency Validation
  if (existingOrder.currency) {
    const orderCurrency = String(existingOrder.currency).trim().toUpperCase();
    if (orderCurrency !== "INR") {
      return {
        valid: false,
        reason: `Currency mismatch (expected INR, order has ${orderCurrency})`,
      };
    }
  }

  // 3. Checkout / Payment Attempt Validation
  const callerPaymentRef = params.paymentReferenceId || params.cashfreePaymentId || null;
  const existingPaymentRef =
    (existingOrder.razorpay_payment_id as string) ||
    (existingOrder.payment_reference_id as string) ||
    null;

  if (callerPaymentRef && existingPaymentRef && callerPaymentRef !== existingPaymentRef) {
    return {
      valid: false,
      reason: "Checkout payment reference mismatch",
    };
  }

  if (params.paymentMethod && existingOrder.payment_method && params.paymentMethod !== existingOrder.payment_method) {
    return {
      valid: false,
      reason: "Payment method mismatch",
    };
  }

  // 4. Order Contents Validation (Item IDs & Quantities)
  if (existingItems && Array.isArray(existingItems) && existingItems.length > 0 && Array.isArray(params.items)) {
    if (existingItems.length !== params.items.length) {
      return {
        valid: false,
        reason: `Order contents mismatch: Item count differs (cart has ${params.items.length}, existing order has ${existingItems.length})`,
      };
    }

    const existingMap = new Map<string, number>(
      existingItems.map((i) => [String(i.product_id), Number(i.quantity)])
    );

    for (const item of params.items) {
      const pId = String(item.productId);
      const extQty = existingMap.get(pId);
      if (extQty === undefined) {
        return {
          valid: false,
          reason: `Order contents mismatch: Product "${pId}" is not present in existing order`,
        };
      }
      if (extQty !== Number(item.quantity)) {
        return {
          valid: false,
          reason: `Order contents mismatch: Quantity for product "${pId}" differs (requested ${item.quantity}, existing ${extQty})`,
        };
      }
    }
  }

  // 5. Order Total Validation
  const expectedTotal = expectedGrandTotal !== undefined ? expectedGrandTotal : params.expectedTotal;
  if (expectedTotal !== undefined && existingOrder.total !== undefined && existingOrder.total !== null) {
    const existingTotalNum = Number(existingOrder.total);
    if (isNaN(existingTotalNum) || Math.abs(existingTotalNum - expectedTotal) > 0.01) {
      return {
        valid: false,
        reason: `Order total mismatch (expected ₹${expectedTotal.toFixed(2)}, existing ₹${existingTotalNum.toFixed(2)})`,
      };
    }
  }

  return { valid: true };
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

  const supabase = createAdminClient(
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
      // Query existing order items to verify order contents
      const { data: existingItems } = await supabase
        .from("order_items")
        .select("product_id, quantity")
        .eq("order_id", existingOrder.id);

      const verification = verifyMatchingOrder(
        existingOrder,
        params,
        params.expectedTotal,
        existingItems || undefined
      );

      if (!verification.valid) {
        // Fail closed with HTTP 409 and NEVER expose private order fields or details
        return {
          success: false,
          message: `Idempotency verification failed: ${verification.reason}`,
          status: 409,
        };
      }

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

  interface DbVariantRow {
    id: string;
    product_id: string;
    price?: number | null;
    stock_quantity?: number | null;
    sku?: string | null;
  }

  const variantIds = items
    .map((i: { variantId?: string }) => i.variantId)
    .filter(Boolean) as string[];

  let dbVariantMap = new Map<string, DbVariantRow>();
  if (variantIds.length > 0) {
    const { data: dbVariants } = await supabase
      .from("product_variants")
      .select("id, product_id, price, stock_quantity, sku")
      .in("id", variantIds);

    if (dbVariants) {
      dbVariantMap = new Map((dbVariants as DbVariantRow[]).map((v) => [v.id, v]));
    }
  }

  // Revalidate Stock & Variants Server-Side
  for (const item of items) {
    const dbP = dbProdMap.get(item.productId);
    if (!dbP) {
      return {
        success: false,
        message: `Product "${item.title}" is no longer available in the store catalog.`,
        status: 400,
      };
    }

    const vId = (item as { variantId?: string }).variantId;
    if (vId) {
      const dbV = dbVariantMap.get(vId);
      if (!dbV || dbV.product_id !== dbP.id) {
        return {
          success: false,
          message: `Selected variant for "${dbP.title}" is invalid or does not belong to this product.`,
          status: 400,
        };
      }
      if (dbV.stock_quantity !== null && dbV.stock_quantity !== undefined && dbV.stock_quantity < item.quantity) {
        return {
          success: false,
          message: `Insufficient stock for selected variant of "${dbP.title}". Requested: ${item.quantity}, Available: ${dbV.stock_quantity}.`,
          status: 409,
        };
      }
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
  const validatedItems = items.map((item: { productId: string; variantId?: string; title: string; quantity: number; variantInfo?: unknown }) => {
    const dbP = dbProdMap.get(item.productId)!;
    const dbV = item.variantId ? dbVariantMap.get(item.variantId) : null;
    const hasDiscount = Boolean(dbP.sale_price && dbP.sale_price > 0 && dbP.sale_price < dbP.price);
    const baseEffective = hasDiscount ? Number(dbP.sale_price) : Number(dbP.price);
    const effectivePrice = dbV?.price && Number(dbV.price) > 0 ? Number(dbV.price) : baseEffective;
    const lineTotal = effectivePrice * Number(item.quantity);
    recalculatedSubtotal += lineTotal;

    return {
      product_id: dbP.id,
      variant_id: dbV?.id || null,
      store_id: dbP.store_id || null,
      title: dbP.title,
      sku: dbV?.sku || dbP.sku || null,
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
  if (params.isReplacement || (recalculatedSubtotal >= freeThreshold && freeThreshold > 0)) {
    finalShippingCost = 0;
  }

  // 6. Grand Total & Replacement Financial Accounting
  let effectiveDiscount = validatedDiscountAmount;
  let effectiveTax = recalculatedTax;

  if (params.isReplacement) {
    effectiveTax = 0;
    const originalValue = params.replacementOriginalValue !== undefined ? Number(params.replacementOriginalValue) : 0;
    effectiveDiscount = Math.min(originalValue, recalculatedSubtotal);
  }

  const subtotalAfterDiscount = Math.max(0, recalculatedSubtotal - effectiveDiscount);
  let grandTotal = Math.round((subtotalAfterDiscount + finalShippingCost + effectiveTax) * 100) / 100;

  // Apply wallet deduction if customer opted to use wallet balance
  const appliedWallet = params.walletAmountApplied && Number(params.walletAmountApplied) > 0 ? Number(params.walletAmountApplied) : 0;
  if (appliedWallet > 0) {
    if (!userId) {
      return { success: false, message: "User must be authenticated to use wallet balance.", status: 401 };
    }
    const customerWallet = await getOrCreateCustomerWallet(supabase, userId);
    if (!customerWallet || Number(customerWallet.balance || 0) < appliedWallet) {
      return {
        success: false,
        message: `Insufficient wallet balance. Available: ₹${Number(customerWallet?.balance || 0).toFixed(2)}, Applied: ₹${appliedWallet.toFixed(2)}`,
        status: 400,
      };
    }
    grandTotal = Math.max(0, Math.round((grandTotal - appliedWallet) * 100) / 100);
  }

  // Common order payload
  const orderDataPayload: Record<string, unknown> = {
    user_id: userId || null,
    email: email || shippingAddress.email || "customer@store.com",
    shipping_address: shippingAddress,
    billing_address: shippingAddress,
    shipping_method: params.isReplacement ? "Replacement Delivery" : (shippingMethod || `${cityRuleName || "Local"} Delivery`),
    shipping_cost: finalShippingCost,
    subtotal: recalculatedSubtotal,
    discount_amount: effectiveDiscount,
    tax_amount: effectiveTax,
    total: grandTotal,
    coupon_code: validatedCouponCode,
    payment_method: paymentMethod || (params.isReplacement ? (grandTotal === 0 ? "REPLACEMENT_EXCHANGE" : "COD") : "COD"),
    payment_status: params.isReplacement || grandTotal === 0
      ? "paid"
      : paymentMethod === "ONLINE"
      ? (paymentRef ? (paymentStatus || "paid") : "pending")
      : (paymentStatus || "pending"),
    fulfillment_status: "pending",
    internal_status: "ORDERED",
    notes: params.isReplacement
      ? `Replacement order for original order #${params.originalOrderNumber || params.originalOrderId || ""} (ID: ${params.originalOrderId || ""}, Request #${params.replacementRequestId || ""})`
      : undefined,
  };

  // 7. ATOMIC STOCK RESERVATION & ORDER CREATION (POSTGRESQL TRANSACTION RPC)
  const { data: rpcData, error: rpcErr } = await supabase.rpc("create_order_atomic", {
    p_idempotency_key: cleanIdempotencyKey,
    p_order_data: orderDataPayload,
    p_order_items: validatedItems,
  });

  // If atomic RPC executed successfully, return committed order
  if (!rpcErr && rpcData && rpcData.success) {
    if (rpcData.is_duplicate) {
      const { data: matchedOrder } = await supabase
        .from("orders")
        .select("*")
        .eq("idempotency_key", cleanIdempotencyKey)
        .maybeSingle();

      if (matchedOrder) {
        const verification = verifyMatchingOrder(
          matchedOrder,
          params,
          grandTotal,
          validatedItems.map((vi) => ({ product_id: vi.product_id, quantity: vi.quantity }))
        );

        if (verification.valid) {
          return {
            success: true,
            order: matchedOrder,
            order_number: matchedOrder.order_number,
            invoice_number: matchedOrder.invoice_number,
            is_duplicate: true,
            status: 200,
          };
        }
      }

      return {
        success: false,
        message: "Concurrent checkout conflict: Order with this idempotency key already exists but could not be safely verified.",
        status: 409,
      };
    }

    if (paymentRef && rpcData.order_id) {
      await supabase
        .from("orders")
        .update({ razorpay_payment_id: paymentRef })
        .eq("id", rpcData.order_id);
    }

    // Persist replacement attribution and wallet metadata safely
    if (params.isReplacement && rpcData.order_id) {
      const parentNum = params.originalOrderNumber || params.originalOrderId || "";
      const replNote = `Replacement order for original order #${parentNum} (ID: ${params.originalOrderId || ""}, Request #${params.replacementRequestId || ""})`;
      try {
        await supabase.from("orders").update({ notes: replNote }).eq("id", rpcData.order_id);
      } catch (noteErr) {
        console.warn("Notice: order note update notice:", noteErr);
      }
    }

    const extraUpdates: Record<string, unknown> = {};
    if (params.isReplacement) {
      extraUpdates.is_replacement = true;
      if (params.originalOrderId) extraUpdates.original_order_id = params.originalOrderId;
      if (params.replacementRequestId) extraUpdates.replacement_request_id = params.replacementRequestId;
      if (params.replacementDifference !== undefined) extraUpdates.replacement_difference = params.replacementDifference;
      if (params.replacementOriginalValue !== undefined) extraUpdates.replacement_original_value = params.replacementOriginalValue;
    }
    if (appliedWallet > 0) {
      extraUpdates.wallet_amount_applied = appliedWallet;
    }
    if (Object.keys(extraUpdates).length > 0 && rpcData.order_id) {
      try {
        const { error: updErr } = await supabase.from("orders").update(extraUpdates).eq("id", rpcData.order_id);
        if (updErr) {
          console.warn("Notice: optional extra order columns update notice:", updErr.message);
        }
      } catch (errCatch) {
        console.warn("Notice: optional extra order columns update exception:", errCatch);
      }
    }

    if (appliedWallet > 0 && userId) {
      await debitCustomerWallet(supabase, {
        customerId: userId,
        amount: appliedWallet,
        referenceType: "order",
        referenceId: rpcData.order_id,
        description: `Wallet funds applied to Order #${rpcData.order_number}`,
        idempotencyKey: `WALLET_CHECKOUT_${cleanIdempotencyKey || rpcData.order_id}`,
      });
    }

    if (userId && shippingAddress) {
      await autoSaveFirstOrderAddress(supabase, userId, shippingAddress);
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

  // Handle unique constraint / duplicate idempotency_key conflict from concurrent RPC calls
  const isRpcDuplicateConflict = Boolean(
    rpcErr &&
    cleanIdempotencyKey &&
    (rpcErr.code === "23505" ||
      rpcErr.message?.includes("idx_orders_idempotency_key") ||
      rpcErr.message?.includes("idempotency_key") ||
      rpcErr.message?.includes("unique constraint"))
  );

  if (isRpcDuplicateConflict) {
    const { data: matchedOrder } = await supabase
      .from("orders")
      .select("*")
      .eq("idempotency_key", cleanIdempotencyKey)
      .maybeSingle();

    if (matchedOrder) {
      const verification = verifyMatchingOrder(
        matchedOrder,
        params,
        grandTotal,
        validatedItems.map((vi) => ({ product_id: vi.product_id, quantity: vi.quantity }))
      );

      if (verification.valid) {
        return {
          success: true,
          order: matchedOrder,
          order_number: matchedOrder.order_number,
          invoice_number: matchedOrder.invoice_number,
          is_duplicate: true,
          status: 200,
        };
      }
    }

    // Fail closed: Do NOT proceed to fallback, do NOT create a second order
    return {
      success: false,
      message: "Concurrent checkout conflict: Order with this idempotency key already exists but could not be safely verified.",
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
          const restorationResults: RestoreStockResult[] = [];
          for (const dec of decrementedItems) {
            restorationResults.push(await restoreStock(supabase, dec.productId, dec.quantity));
          }
          const failedRestorations = restorationResults.filter((r) => !r.success);
          if (failedRestorations.length > 0) {
            try {
              await supabase.from("finance_audit_logs").insert({
                action_type: "STOCK_RESTORATION_FAILED",
                target_entity: "inventory",
                target_id: null,
                notes: `Stock restoration failed during insufficient stock rollback for "${vi.title}". Manual reconciliation required.`,
                new_values: {
                  failure_count: failedRestorations.length,
                  failed_items: failedRestorations.map((f) => ({
                    product_id: f.productId,
                    quantity: f.quantity,
                    error: f.error || "Unknown error",
                  })),
                },
              });
            } catch (auditErr) {
              console.error("Notice: finance_audit_logs insert exception for stock restoration failure:", auditErr);
            }
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

    // Check for unique constraint violation on idempotency_key or duplicate order
    if (orderErr && (orderErr.code === "23505" || orderErr.message?.includes("unique") || orderErr.message?.includes("idempotency"))) {
      // 1. Transactional compensation: restore all reserved stock immediately
      const restorationResults: RestoreStockResult[] = [];
      for (const dec of decrementedItems) {
        const res = await restoreStock(supabase, dec.productId, dec.quantity);
        restorationResults.push(res);
      }

      const failedRestorations = restorationResults.filter((r) => !r.success);
      if (failedRestorations.length > 0) {
        console.error("Stock restoration failures during duplicate conflict compensation:", failedRestorations);
        try {
          await supabase.from("finance_audit_logs").insert({
            action_type: "STOCK_RESTORATION_FAILED",
            target_entity: "inventory",
            target_id: null,
            notes: `Failed to restore stock for ${failedRestorations.length} product(s) during duplicate idempotency conflict resolution. Reconciliation required.`,
            new_values: {
              idempotency_key: cleanIdempotencyKey,
              failure_count: failedRestorations.length,
              failed_items: failedRestorations.map((f) => ({
                product_id: f.productId,
                quantity: f.quantity,
                error: f.error || "Unknown restoration failure",
              })),
            },
          });
        } catch (auditErr) {
          console.error("Notice: finance_audit_logs insert exception for stock restoration failure:", auditErr);
        }

        return {
          success: false,
          message: "Concurrent checkout conflict occurred and automatic stock restoration failed for reserved items. Support reconciliation required.",
          status: 500,
        };
      }

      // 2. Safely retrieve the existing matching order by idempotency key
      if (cleanIdempotencyKey) {
        const { data: duplicateOrder } = await supabase
          .from("orders")
          .select("*")
          .eq("idempotency_key", cleanIdempotencyKey)
          .maybeSingle();

        if (duplicateOrder) {
          const verification = verifyMatchingOrder(
            duplicateOrder,
            params,
            grandTotal,
            validatedItems.map((vi) => ({ product_id: vi.product_id, quantity: vi.quantity }))
          );

          if (verification.valid) {
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
      }

      // 3. FAIL CLOSED: Never strip idempotency_key and never retry inserting a second order!
      return {
        success: false,
        message: "Order with this idempotency key already exists but could not be safely verified.",
        status: 409,
      };
    }

    if (orderErr || !orderData) {
      const restorationResults: RestoreStockResult[] = [];
      for (const dec of decrementedItems) {
        restorationResults.push(await restoreStock(supabase, dec.productId, dec.quantity));
      }
      const failedRestorations = restorationResults.filter((r) => !r.success);
      if (failedRestorations.length > 0) {
        try {
          await supabase.from("finance_audit_logs").insert({
            action_type: "STOCK_RESTORATION_FAILED",
            target_entity: "inventory",
            target_id: null,
            notes: `Stock restoration failed during order creation error compensation: ${orderErr?.message}`,
            new_values: {
              failure_count: failedRestorations.length,
              failed_items: failedRestorations.map((f) => ({
                product_id: f.productId,
                quantity: f.quantity,
                error: f.error || "Unknown error",
              })),
            },
          });
        } catch (auditErr) {
          console.error("Notice: finance_audit_logs insert exception for stock restoration failure:", auditErr);
        }
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
      const restorationResults: RestoreStockResult[] = [];
      for (const dec of decrementedItems) {
        restorationResults.push(await restoreStock(supabase, dec.productId, dec.quantity));
      }
      const failedRestorations = restorationResults.filter((r) => !r.success);
      if (failedRestorations.length > 0) {
        try {
          await supabase.from("finance_audit_logs").insert({
            action_type: "STOCK_RESTORATION_FAILED",
            target_entity: "inventory",
            target_id: null,
            notes: `Stock restoration failed after order items insertion error: ${itemsErr.message}`,
            new_values: {
              order_id: orderData.id,
              failure_count: failedRestorations.length,
              failed_items: failedRestorations.map((f) => ({
                product_id: f.productId,
                quantity: f.quantity,
                error: f.error || "Unknown error",
              })),
            },
          });
        } catch (auditErr) {
          console.error("Notice: finance_audit_logs insert exception for stock restoration failure:", auditErr);
        }
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

    // Persist replacement attribution and wallet metadata safely in fallback
    const extraFallbackUpdates: Record<string, unknown> = {};
    if (params.isReplacement) {
      extraFallbackUpdates.is_replacement = true;
      if (params.originalOrderId) extraFallbackUpdates.original_order_id = params.originalOrderId;
      if (params.replacementRequestId) extraFallbackUpdates.replacement_request_id = params.replacementRequestId;
      if (params.replacementDifference !== undefined) extraFallbackUpdates.replacement_difference = params.replacementDifference;
      if (params.replacementOriginalValue !== undefined) extraFallbackUpdates.replacement_original_value = params.replacementOriginalValue;
    }
    if (appliedWallet > 0) {
      extraFallbackUpdates.wallet_amount_applied = appliedWallet;
    }
    if (Object.keys(extraFallbackUpdates).length > 0 && orderData.id) {
      try {
        const { error: updErr } = await supabase.from("orders").update(extraFallbackUpdates).eq("id", orderData.id);
        if (updErr) {
          console.warn("Notice: optional extra order columns fallback update notice:", updErr.message);
        }
      } catch (errCatch) {
        console.warn("Notice: optional extra order columns fallback update exception:", errCatch);
      }
    }

    if (appliedWallet > 0 && userId) {
      await debitCustomerWallet(supabase, {
        customerId: userId,
        amount: appliedWallet,
        referenceType: "order",
        referenceId: orderData.id,
        description: `Wallet funds applied to Order #${orderData.order_number}`,
        idempotencyKey: `WALLET_CHECKOUT_${cleanIdempotencyKey || orderData.id}`,
      });
    }

    if (userId && shippingAddress) {
      await autoSaveFirstOrderAddress(supabase, userId, shippingAddress);
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
    const restorationResults: RestoreStockResult[] = [];
    for (const dec of decrementedItems) {
      restorationResults.push(await restoreStock(supabase, dec.productId, dec.quantity));
    }
    const failedRestorations = restorationResults.filter((r) => !r.success);
    if (failedRestorations.length > 0) {
      try {
        await supabase.from("finance_audit_logs").insert({
          action_type: "STOCK_RESTORATION_FAILED",
          target_entity: "inventory",
          target_id: null,
          notes: `Stock restoration failed during fallback flow exception: ${flowErr instanceof Error ? flowErr.message : String(flowErr)}`,
          new_values: {
            failure_count: failedRestorations.length,
            failed_items: failedRestorations.map((f) => ({
              product_id: f.productId,
              quantity: f.quantity,
              error: f.error || "Unknown error",
            })),
          },
        });
      } catch (auditErr) {
        console.error("Notice: finance_audit_logs insert exception:", auditErr);
      }
    }
    throw flowErr;
  }
}
