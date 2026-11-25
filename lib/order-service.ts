import { createAdminClient, type SupabaseClient } from "@/lib/supabase";
import { withDbRetry } from "./db-retry";
import { debitCustomerWallet, getOrCreateCustomerWallet, validateMonetaryAmount } from "./wallet-service";
import { notifyOrderConfirmed } from "@/lib/email";

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
  existingItems?: Array<{ product_id: string | null; quantity: number; variant_id?: string | null }>
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

  // 4. Order Contents Validation (Item IDs, Variant IDs & Quantities)
  if (!existingItems || !Array.isArray(existingItems) || existingItems.length === 0) {
    return {
      valid: false,
      reason: "Order contents cannot be verified (persisted order items missing from database)",
    };
  }

  if (!params.items || !Array.isArray(params.items) || params.items.length === 0) {
    return {
      valid: false,
      reason: "Order contents cannot be verified (incoming cart items are empty)",
    };
  }

  const getCompositeKey = (productId: unknown, variantId: unknown) => {
    const p = productId !== null && productId !== undefined ? String(productId).trim() : "";
    const v = variantId !== null && variantId !== undefined ? String(variantId).trim() : "";
    return `${p}::${v}`;
  };

  // Aggregate quantities from persisted order items
  const persistedMap = new Map<string, number>();
  for (const item of existingItems) {
    const key = getCompositeKey(item.product_id, item.variant_id);
    persistedMap.set(key, (persistedMap.get(key) || 0) + Number(item.quantity));
  }

  // Aggregate quantities from incoming requested items
  const requestedMap = new Map<string, number>();
  for (const item of params.items) {
    const key = getCompositeKey(item.productId, item.variantId);
    requestedMap.set(key, (requestedMap.get(key) || 0) + Number(item.quantity));
  }

  if (persistedMap.size !== requestedMap.size) {
    return {
      valid: false,
      reason: `Order contents mismatch: Distinct item count differs (persisted order has ${persistedMap.size}, cart has ${requestedMap.size})`,
    };
  }

  for (const [key, reqQty] of Array.from(requestedMap.entries())) {
    const extQty = persistedMap.get(key);
    if (extQty === undefined) {
      return {
        valid: false,
        reason: `Order contents mismatch: Item "${key}" is not present in existing order`,
      };
    }
    if (extQty !== reqQty) {
      return {
        valid: false,
        reason: `Order contents mismatch: Quantity for item "${key}" differs (requested ${reqQty}, existing ${extQty})`,
      };
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

  // 6. Wallet Amount Applied Validation
  let requestedPaise = 0;
  if (params.walletAmountApplied !== undefined && params.walletAmountApplied !== null) {
    if (
      typeof params.walletAmountApplied !== "number" ||
      !Number.isFinite(params.walletAmountApplied) ||
      params.walletAmountApplied < 0
    ) {
      return {
        valid: false,
        reason: "Invalid wallet amount applied (must be a non-negative finite number)",
      };
    }
    if (params.walletAmountApplied > 0) {
      const v = validateMonetaryAmount(params.walletAmountApplied);
      if (!v.valid) {
        return {
          valid: false,
          reason: `Invalid wallet amount applied: ${v.reason}`,
        };
      }
      requestedPaise = v.paise;
    }
  }
  const existingWalletNum = Number(existingOrder.wallet_amount_applied || 0);
  const existingPaise = Math.round(existingWalletNum * 100);

  // If the existing order already recorded a non-zero wallet debit, it must match requestedPaise exactly.
  // If the existing order has 0 recorded (e.g. order committed before wallet debit/metadata update),
  // we do not reject here if requestedPaise > 0; the caller will verify and reconcile the debit via
  // verifyAndReconcileDuplicateWalletDebit after all other order attributes are verified.
  if (existingPaise > 0 && requestedPaise !== existingPaise) {
    return {
      valid: false,
      reason: `Wallet deduction mismatch (requested ₹${(requestedPaise / 100).toFixed(2)}, existing order has ₹${(existingPaise / 100).toFixed(2)})`,
    };
  }

  return { valid: true };
}

export interface DuplicateWalletVerificationResult {
  valid: boolean;
  reason?: string;
  reconciled?: boolean;
}

export async function verifyAndReconcileDuplicateWalletDebit(
  supabase: SupabaseClient,
  existingOrder: Record<string, unknown>,
  expectedWalletAmount: number,
  callerUserId: string | null | undefined,
  cleanIdempotencyKey: string | null
): Promise<DuplicateWalletVerificationResult> {
  const expectedPaise = Math.round(expectedWalletAmount * 100);
  if (expectedPaise <= 0) {
    return { valid: true };
  }

  // Do not fall back to unverified caller user ID if the existing order has no authenticated owner
  const orderOwnerId = existingOrder.user_id ? String(existingOrder.user_id).trim() : null;
  if (!orderOwnerId) {
    return {
      valid: false,
      reason: "Existing order has no authenticated owner; wallet debit cannot be verified or reconciled.",
    };
  }

  if (callerUserId && callerUserId.trim() !== orderOwnerId) {
    return {
      valid: false,
      reason: "Customer identity mismatch: Caller user ID does not match order owner ID.",
    };
  }

  const orderId = String(existingOrder.id);
  const expectedKey = `WALLET_CHECKOUT_${cleanIdempotencyKey || orderId}`;

  // 1. Query wallet ledger for exact expected idempotency key - fail closed on query error
  const { data: txByKey, error: txKeyErr } = await supabase
    .from("wallet_transactions")
    .select("id, customer_id, reference_type, reference_id, type, direction, amount, idempotency_key")
    .eq("idempotency_key", expectedKey)
    .maybeSingle();

  if (txKeyErr) {
    return {
      valid: false,
      reason: `Database error querying wallet transaction by idempotency key: ${txKeyErr.message}`,
    };
  }

  if (txByKey) {
    // Confirm ledger entry belongs to the same customer, order reference, debit type, and exact amount in paise
    const isSameCustomer = txByKey.customer_id === orderOwnerId;
    const isOrderRef = txByKey.reference_type === "order" && String(txByKey.reference_id) === orderId;
    const isDebit = txByKey.direction === "debit";
    const isDebitType = txByKey.type === "WALLET_DEBIT" || txByKey.type === "WALLET_USED_FOR_REPLACEMENT";
    const txPaise = Math.round(Number(txByKey.amount) * 100);
    const isAmountMatch = txPaise === expectedPaise;

    if (isSameCustomer && isOrderRef && isDebit && isDebitType && isAmountMatch) {
      const currentAppliedPaise = Math.round(Number(existingOrder.wallet_amount_applied || 0) * 100);
      if (currentAppliedPaise !== expectedPaise) {
        const { error: updErr } = await supabase
          .from("orders")
          .update({ wallet_amount_applied: expectedPaise / 100 })
          .eq("id", orderId);

        if (updErr) {
          return {
            valid: false,
            reason: `Wallet debit confirmed in ledger but updating order wallet metadata failed: ${updErr.message}`,
          };
        }
      }
      existingOrder.wallet_amount_applied = expectedPaise / 100;
      return { valid: true, reconciled: currentAppliedPaise !== expectedPaise };
    }

    return {
      valid: false,
      reason: `Wallet ledger mismatch on duplicate check: Transaction ${txByKey.id} with key "${expectedKey}" does not match order owner (${orderOwnerId}), order ID (${orderId}), debit type, or exact expected amount ₹${(expectedPaise / 100).toFixed(2)}.`,
    };
  }

  // 2. Query wallet ledger by reference_id and reference_type - fail closed on query error
  // Do not accept an unrelated debit transaction simply because it has the same order reference
  const { data: txByRef, error: refErr } = await supabase
    .from("wallet_transactions")
    .select("id, customer_id, reference_type, reference_id, type, direction, amount, idempotency_key")
    .eq("reference_type", "order")
    .eq("reference_id", orderId)
    .eq("direction", "debit");

  if (refErr) {
    return {
      valid: false,
      reason: `Database error querying wallet transactions by order reference: ${refErr.message}`,
    };
  }

  if (txByRef && txByRef.length > 0) {
    const matchingTx = txByRef.find((t) => {
      const matchCust = t.customer_id === orderOwnerId;
      const matchType = t.type === "WALLET_DEBIT" || t.type === "WALLET_USED_FOR_REPLACEMENT";
      const matchPaise = Math.round(Number(t.amount) * 100) === expectedPaise;
      const matchKey = !t.idempotency_key || t.idempotency_key === expectedKey || t.idempotency_key.startsWith("WALLET_CHECKOUT_");
      return matchCust && matchType && matchPaise && matchKey;
    });

    if (matchingTx) {
      const currentAppliedPaise = Math.round(Number(existingOrder.wallet_amount_applied || 0) * 100);
      if (currentAppliedPaise !== expectedPaise) {
        const { error: updErr } = await supabase
          .from("orders")
          .update({ wallet_amount_applied: expectedPaise / 100 })
          .eq("id", orderId);

        if (updErr) {
          return {
            valid: false,
            reason: `Wallet debit confirmed in ledger by reference but updating order wallet metadata failed: ${updErr.message}`,
          };
        }
      }
      existingOrder.wallet_amount_applied = expectedPaise / 100;
      return { valid: true, reconciled: currentAppliedPaise !== expectedPaise };
    }

    return {
      valid: false,
      reason: `Existing debit transaction(s) on order ${orderId} do not match the expected customer, checkout debit type, or amount ₹${(expectedPaise / 100).toFixed(2)}.`,
    };
  }

  // 3. No debit found in ledger: Attempt safe retry through idempotent debitCustomerWallet
  const debitRetry = await debitCustomerWallet(supabase, {
    customerId: orderOwnerId,
    amount: expectedPaise / 100,
    referenceType: "order",
    referenceId: orderId,
    description: `Wallet funds applied to Order #${existingOrder.order_number || orderId}`,
    idempotencyKey: expectedKey,
  });

  if (!debitRetry.success) {
    return {
      valid: false,
      reason: `Missing wallet debit for existing order could not be completed: ${debitRetry.message || "Insufficient balance"}.`,
    };
  }

  // Verify resulting ledger transaction before declaring reconciliation successful
  const { data: verifiedTx, error: verifyErr } = await supabase
    .from("wallet_transactions")
    .select("id, customer_id, reference_type, reference_id, type, direction, amount")
    .eq("idempotency_key", expectedKey)
    .maybeSingle();

  if (verifyErr || !verifiedTx) {
    return {
      valid: false,
      reason: `Debit retry returned success but resulting ledger transaction could not be verified: ${verifyErr?.message || "Transaction record not found in ledger"}.`,
    };
  }

  const vPaise = Math.round(Number(verifiedTx.amount) * 100);
  const isPostRetryValid =
    verifiedTx.customer_id === orderOwnerId &&
    verifiedTx.reference_type === "order" &&
    String(verifiedTx.reference_id) === orderId &&
    verifiedTx.direction === "debit" &&
    (verifiedTx.type === "WALLET_DEBIT" || verifiedTx.type === "WALLET_USED_FOR_REPLACEMENT") &&
    vPaise === expectedPaise;

  if (!isPostRetryValid) {
    return {
      valid: false,
      reason: `Post-retry ledger verification failed: Transaction ${verifiedTx.id} parameters do not match expected order debit.`,
    };
  }

  // Check and handle the result/error of order metadata update
  const currentAppliedPaise = Math.round(Number(existingOrder.wallet_amount_applied || 0) * 100);
  if (currentAppliedPaise !== expectedPaise) {
    const { error: updErr } = await supabase
      .from("orders")
      .update({ wallet_amount_applied: expectedPaise / 100 })
      .eq("id", orderId);

    if (updErr) {
      return {
        valid: false,
        reason: `Wallet debit succeeded but updating order wallet metadata failed: ${updErr.message}`,
      };
    }
  }

  existingOrder.wallet_amount_applied = expectedPaise / 100;
  return { valid: true, reconciled: true };
}

interface OrderWalletFailureParams {
  orderId: string;
  orderNumber: string;
  appliedWallet: number;
  paymentMethod?: string;
  paymentRef?: string | null;
  couponCode?: string | null;
  debitErrorMessage: string;
  isFallback?: boolean;
}

async function handleOrderWalletDebitFailure(
  supabase: SupabaseClient,
  params: OrderWalletFailureParams
): Promise<{ success: false; message: string; status: number }> {
  const {
    orderId,
    orderNumber,
    appliedWallet,
    paymentMethod,
    paymentRef,
    couponCode,
    debitErrorMessage,
    isFallback,
  } = params;

  let stockRestorationAttempted = false;
  let compensationError: string | null = null;

  if (paymentRef) {
    // A gateway payment was captured. Keep the order in review and never restore
    // stock or release the coupon until payment reconciliation is completed.
    const note = `[PAYMENT_REVIEW_REQUIRED] Gateway payment was captured (Ref: ${paymentRef}), but wallet debit of ₹${appliedWallet.toFixed(2)} failed (${debitErrorMessage}). Order kept in pending payment review; stock and coupon were not restored.`;

    const { error: updErr } = await supabase
      .from("orders")
      .update({
        payment_status: "pending",
        wallet_amount_applied: 0,
        notes: note,
      })
      .eq("id", orderId);

    if (updErr) {
      compensationError = updErr.message;
      console.error("Critical: Failed updating order review status for gateway wallet debit failure:", updErr.message);
    }
  } else {
    // One database transaction restores stock idempotently, marks the order
    // cancelled, and releases its coupon only after cancellation is persisted.
    stockRestorationAttempted = true;
    const { data: compensationData, error: compensationRpcError } = await supabase.rpc(
      "compensate_order_wallet_debit_failure",
      {
        p_order_id: orderId,
        p_coupon_code: couponCode || null,
        p_failure_note: `Wallet debit of ₹${appliedWallet.toFixed(2)} failed (${debitErrorMessage})${isFallback ? " in fallback flow" : ""}.`,
      }
    );

    if (compensationRpcError || !compensationData || compensationData.success !== true) {
      compensationError =
        compensationRpcError?.message ||
        compensationData?.message ||
        "Compensation RPC returned an unconfirmed result";
      console.error(`Critical: Order compensation failed for ${orderId}:`, compensationError);
    }
  }

  // Preserve an application-level audit record. The SQL RPC also keeps stock
  // ledger and coupon anomaly changes in the same transaction as compensation.
  try {
    const { error: auditErr } = await supabase.from("finance_audit_logs").insert({
      action_type: paymentRef ? "GATEWAY_PAYMENT_WALLET_DESYNC" : "ORDER_WALLET_DEBIT_FAILED",
      target_entity: "orders",
      target_id: orderId,
      notes: `Order #${orderNumber} wallet debit failed: ${debitErrorMessage}`,
      new_values: {
        order_id: orderId,
        order_number: orderNumber,
        applied_wallet: appliedWallet,
        payment_method: paymentMethod,
        payment_ref: paymentRef || null,
        stock_restoration_attempted: stockRestorationAttempted,
        coupon_code: couponCode || null,
        compensation_error: compensationError,
        is_fallback: Boolean(isFallback),
        error: debitErrorMessage,
      },
    });
    if (auditErr) {
      console.error("Notice: finance_audit_logs insert error:", auditErr.message);
    }
  } catch (auditCatch) {
    console.error("Notice: finance_audit_logs insert exception:", auditCatch);
  }

  if (paymentRef) {
    return {
      success: false,
      message: `Gateway payment was captured (${paymentRef}) but wallet debit of ₹${appliedWallet.toFixed(2)} failed (${debitErrorMessage}). Order has been placed in pending payment review for reconciliation.${compensationError ? ` Review status update also failed: ${compensationError}` : ""}`,
      status: 402,
    };
  }

  if (compensationError) {
    return {
      success: false,
      message: `Wallet debit of ₹${appliedWallet.toFixed(2)} failed: ${debitErrorMessage}. Automatic order compensation could not be confirmed (${compensationError}). Manual reconciliation is required.`,
      status: 500,
    };
  }

  return {
    success: false,
    message: `Wallet debit of ₹${appliedWallet.toFixed(2)} failed: ${debitErrorMessage}. Order was cancelled, stock restoration was processed idempotently, and eligible coupon redemption was released.`,
    status: 400,
  };
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
      if (existingOrder.payment_status === "failed") {
        return {
          success: false,
          message: "Previous checkout attempt with this idempotency key failed payment.",
          status: 409,
        };
      }

      // Query existing order items to verify order contents
      const { data: existingItems, error: itemsErr } = await supabase
        .from("order_items")
        .select("product_id, variant_id, quantity")
        .eq("order_id", existingOrder.id);

      if (itemsErr || !existingItems || existingItems.length === 0) {
        return {
          success: false,
          message: `Idempotency verification failed: ${itemsErr?.message || "Persisted order items missing from database"}`,
          status: 409,
        };
      }

      const verification = verifyMatchingOrder(
        existingOrder,
        params,
        params.expectedTotal,
        existingItems
      );

      if (!verification.valid) {
        // Fail closed with HTTP 409 and NEVER expose private order fields or details
        return {
          success: false,
          message: `Idempotency verification failed: ${verification.reason}`,
          status: 409,
        };
      }

      // Verify and reconcile wallet debit state if wallet funds were involved
      let requestedWalletPaise = 0;
      if (params.walletAmountApplied !== undefined && params.walletAmountApplied !== null) {
        if (
          typeof params.walletAmountApplied !== "number" ||
          !Number.isFinite(params.walletAmountApplied) ||
          params.walletAmountApplied < 0
        ) {
          return {
            success: false,
            message: "Invalid wallet amount specified.",
            status: 400,
          };
        }
        if (params.walletAmountApplied > 0) {
          const v = validateMonetaryAmount(params.walletAmountApplied);
          if (!v.valid) {
            return {
              success: false,
              message: `Invalid wallet amount specified: ${v.reason}`,
              status: 400,
            };
          }
          requestedWalletPaise = v.paise;
        }
      }

      const existingWalletPaise = Math.round(Number(existingOrder.wallet_amount_applied || 0) * 100);
      const effectiveWalletPaise = requestedWalletPaise || existingWalletPaise;

      if (effectiveWalletPaise > 0) {
        const walletVerification = await verifyAndReconcileDuplicateWalletDebit(
          supabase,
          existingOrder,
          effectiveWalletPaise / 100,
          userId,
          cleanIdempotencyKey
        );
        if (!walletVerification.valid) {
          return {
            success: false,
            message: `Duplicate order wallet verification failed: ${walletVerification.reason}`,
            status: 409,
          };
        }
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
    .select("id, title, price, sale_price, stock_quantity, track_inventory, allow_backorders, store_id, sku, category_id, tax_rate, delivery_fee, categories:categories!products_category_id_fkey(tax_rate)")
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

    // Inventory tracking must be known at checkout so the order-item snapshot
    // can later drive an exact, idempotent stock compensation.
    if (dbP.track_inventory !== true && dbP.track_inventory !== false) {
      return {
        success: false,
        message: `Inventory tracking configuration is invalid for "${dbP.title}". Please contact support.`,
        status: 500,
      };
    }

    if (dbP.track_inventory === true && !dbP.allow_backorders) {
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
      // Snapshot the authoritative checkout-time setting. The database trigger
      // fills this for the atomic RPC path if the RPC's legacy INSERT omits it.
      inventory_tracked_at_checkout: dbP.track_inventory === true,
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
  let appliedWallet = 0;
  if (params.walletAmountApplied !== undefined && params.walletAmountApplied !== null) {
    if (
      typeof params.walletAmountApplied !== "number" ||
      !Number.isFinite(params.walletAmountApplied) ||
      params.walletAmountApplied < 0
    ) {
      return { success: false, message: "Invalid wallet amount specified.", status: 400 };
    }
    if (params.walletAmountApplied > 0) {
      const validated = validateMonetaryAmount(params.walletAmountApplied);
      if (!validated.valid) {
        return { success: false, message: `Invalid wallet amount specified: ${validated.reason}`, status: 400 };
      }
      appliedWallet = validated.amount;
    }
  }

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
        if (matchedOrder.payment_status === "failed") {
          return {
            success: false,
            message: "Previous checkout attempt with this idempotency key failed payment.",
            status: 409,
          };
        }

        const { data: existingItems, error: itemsErr } = await supabase
          .from("order_items")
          .select("product_id, variant_id, quantity")
          .eq("order_id", matchedOrder.id);

        if (itemsErr || !existingItems || existingItems.length === 0) {
          return {
            success: false,
            message: `Duplicate checkout verification failed: ${itemsErr?.message || "Persisted order items missing from database"}`,
            status: 409,
          };
        }

        const verification = verifyMatchingOrder(
          matchedOrder,
          params,
          grandTotal,
          existingItems
        );

        if (verification.valid) {
          const matchedWalletPaise = Math.round(Number(matchedOrder.wallet_amount_applied || 0) * 100);
          const requestedPaise = Math.round(appliedWallet * 100);
          const effectiveWalletPaise = requestedPaise || matchedWalletPaise;

          if (effectiveWalletPaise > 0) {
            const walletVerification = await verifyAndReconcileDuplicateWalletDebit(
              supabase,
              matchedOrder,
              effectiveWalletPaise / 100,
              userId,
              cleanIdempotencyKey
            );
            if (!walletVerification.valid) {
              return {
                success: false,
                message: `Duplicate order wallet verification failed: ${walletVerification.reason}`,
                status: 409,
              };
            }
          }

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

    if (appliedWallet > 0 && userId) {
      const debitRes = await debitCustomerWallet(supabase, {
        customerId: userId,
        amount: appliedWallet,
        referenceType: "order",
        referenceId: rpcData.order_id,
        description: `Wallet funds applied to Order #${rpcData.order_number}`,
        idempotencyKey: `WALLET_CHECKOUT_${cleanIdempotencyKey || rpcData.order_id}`,
      });

      if (!debitRes.success) {
        return await handleOrderWalletDebitFailure(supabase, {
          orderId: rpcData.order_id,
          orderNumber: rpcData.order_number,
          appliedWallet,
          paymentMethod,
          paymentRef,
          couponCode: validatedCouponCode,
          debitErrorMessage: debitRes.message || "Wallet debit failed",
          isFallback: false,
        });
      }

      extraUpdates.wallet_amount_applied = appliedWallet;
    }

    if (Object.keys(extraUpdates).length > 0 && rpcData.order_id) {
      const { error: updErr } = await supabase.from("orders").update(extraUpdates).eq("id", rpcData.order_id);
      if (updErr) {
        console.error("Critical: Failed to persist order metadata/wallet updates:", updErr.message);
        try {
          await supabase.from("finance_audit_logs").insert({
            action_type: "ORDER_METADATA_UPDATE_FAILED",
            target_entity: "orders",
            target_id: rpcData.order_id,
            notes: `Failed to update order metadata: ${updErr.message}`,
            new_values: { updates: extraUpdates, error: updErr.message },
          });
        } catch (auditErr) {
          console.error("Notice: finance_audit_logs insert exception:", auditErr);
        }
        return {
          success: false,
          message: `Order was created, but failed to record final order details: ${updErr.message}. Please contact support with order #${rpcData.order_number}.`,
          status: 500,
        };
      }
    }

    if (userId && shippingAddress) {
      await autoSaveFirstOrderAddress(supabase, userId, shippingAddress);
    }

    if (!rpcData.is_duplicate) {
      // Non-fatal transactional email dispatch for customer
      (async () => {
        try {
          const customerEmail = email || (shippingAddress as Record<string, unknown>)?.email as string;
          const customerName = (shippingAddress as Record<string, unknown>)?.full_name as string || "Valued Customer";
          const orderNum = rpcData.order_number || String(rpcData.order_id);

          if (customerEmail) {
            const formattedItems = (items || []).map((it) => ({
              title: it.title,
              quantity: Number(it.quantity || 1),
              price: Number(it.price || 0),
              total: Number(it.price || 0) * Number(it.quantity || 1),
            }));

            await notifyOrderConfirmed({
              orderNumber: orderNum,
              customerEmail,
              customerName,
              items: formattedItems,
              subtotal: Number(rpcData.order?.subtotal || 0),
              shippingCost: Number(shippingCost || 0),
              discount: Number(rpcData.order?.discount || 0),
              totalAmount: Number(rpcData.order?.total || 0),
              shippingAddress: {
                fullName: customerName,
                addressLine1: (shippingAddress as Record<string, unknown>)?.address_line1 as string,
                city: (shippingAddress as Record<string, unknown>)?.city as string,
                state: (shippingAddress as Record<string, unknown>)?.state as string,
                postalCode: (shippingAddress as Record<string, unknown>)?.postal_code as string,
                phone: (shippingAddress as Record<string, unknown>)?.phone as string,
              },
              estimatedDeliveryDate: rpcData.order?.estimated_delivery_date || null,
            });
          }
        } catch (emailErr) {
          console.warn("[OrderService] Non-fatal order confirmation email notice:", emailErr);
        }
      })();
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

  // 8. FAIL-CLOSED RPC ERROR & IDEMPOTENCY RECONCILIATION
  // create_order_atomic is the sole authoritative order creation engine.
  // Manual distributed checkout fallback is removed to eliminate variant stock desync and phantom stock deductions.

  // 8a. Insufficient stock (parent or variant): return client-actionable 409
  const isInsufficientStock = Boolean(
    rpcErr?.message &&
    (rpcErr.message.includes("INSUFFICIENT_STOCK") || rpcErr.message.includes("INSUFFICIENT_VARIANT_STOCK"))
  );

  if (isInsufficientStock) {
    const cleanMsg = (rpcErr?.message || "")
      .replace(/^.*INSUFFICIENT_VARIANT_STOCK:\s*/i, "")
      .replace(/^.*INSUFFICIENT_STOCK:\s*/i, "");
    return {
      success: false,
      message: cleanMsg || "One or more items in your cart are no longer available in the requested quantity.",
      status: 409,
    };
  }

  // 8b. Ambiguous outcome / Idempotency conflict reconciliation:
  // If an idempotency key was supplied, check whether create_order_atomic already committed the order
  // before a network drop, timeout, or duplicate concurrent request occurred.
  if (cleanIdempotencyKey) {
    const { data: matchedOrder } = await supabase
      .from("orders")
      .select("*")
      .eq("idempotency_key", cleanIdempotencyKey)
      .maybeSingle();

    if (matchedOrder) {
      if (matchedOrder.payment_status === "failed") {
        return {
          success: false,
          message: "Previous checkout attempt with this idempotency key failed payment.",
          status: 409,
        };
      }

      const { data: existingItems, error: itemsErr } = await supabase
        .from("order_items")
        .select("product_id, variant_id, quantity")
        .eq("order_id", matchedOrder.id);

      if (itemsErr || !existingItems || existingItems.length === 0) {
        return {
          success: false,
          message: `Duplicate checkout verification failed: ${itemsErr?.message || "Persisted order items missing from database"}`,
          status: 409,
        };
      }

      const verification = verifyMatchingOrder(
        matchedOrder,
        params,
        grandTotal,
        existingItems
      );

      if (verification.valid) {
        const matchedWalletPaise = Math.round(Number(matchedOrder.wallet_amount_applied || 0) * 100);
        const requestedPaise = Math.round(appliedWallet * 100);
        const effectiveWalletPaise = requestedPaise || matchedWalletPaise;

        if (effectiveWalletPaise > 0) {
          const walletVerification = await verifyAndReconcileDuplicateWalletDebit(
            supabase,
            matchedOrder,
            effectiveWalletPaise / 100,
            userId,
            cleanIdempotencyKey
          );
          if (!walletVerification.valid) {
            return {
              success: false,
              message: `Duplicate order wallet verification failed: ${walletVerification.reason}`,
              status: 409,
            };
          }
        }

        return {
          success: true,
          order: matchedOrder,
          order_number: matchedOrder.order_number,
          invoice_number: matchedOrder.invoice_number,
          is_duplicate: true,
          status: 200,
        };
      }

      // Idempotency key exists in DB but payload verification failed
      return {
        success: false,
        message: "Concurrent checkout conflict: Order with this idempotency key already exists but could not be safely verified.",
        status: 409,
      };
    }
  }

  // 8c. Unrecoverable RPC failure: fail closed with retryable 503 service error.
  // Never create orders manually and never manually decrement parent/variant stock outside PostgreSQL.
  console.error("Critical: create_order_atomic RPC failed; failing closed without manual fallback:", rpcErr);
  try {
    await supabase.from("finance_audit_logs").insert({
      action_type: "ORDER_CREATION_FAILED",
      target_entity: "orders",
      target_id: null,
      notes: `Atomic order creation RPC failed: ${rpcErr?.message || "Unknown RPC error"}. Failed closed without fallback.`,
      new_values: {
        idempotency_key: cleanIdempotencyKey,
        error: rpcErr?.message || String(rpcErr),
        code: rpcErr?.code,
      },
    });
  } catch (auditErr) {
    console.error("Notice: finance_audit_logs insert exception for RPC failure:", auditErr);
  }

  return {
    success: false,
    message: "Order creation is temporarily unavailable. Please retry in a few moments.",
    status: 503,
  };
}
