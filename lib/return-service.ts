import { SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { evaluateProductReturnPolicy } from "./return-policy";
import { createOrderRecord } from "./order-service";
import { creditCustomerWallet } from "./wallet-service";
import { createCashfreeRefund, fetchCashfreeRefund } from "./cashfree";

export interface RestoreCancelledOrderStockItemError {
  itemId: string;
  productId: string | null;
  error: string;
}

export interface RestoreCancelledOrderStockResult {
  success: boolean;
  message?: string;
  restoredCount: number;
  failedCount: number;
  errors: RestoreCancelledOrderStockItemError[];
}

/**
 * Idempotently restore inventory for a cancelled order. The database RPC records
 * one restoration per order item and increments stock in the same transaction.
 * Historical items without a checkout inventory snapshot are deliberately sent
 * to manual review rather than guessing from the product's current settings.
 *
 * Runs sequentially (for...of with await) to avoid lock contention on shared
 * parent products. Does not abort on single-item failure so subsequent items
 * can still be restored. Collects all item failures and returns structured status.
 */
async function restoreCancelledOrderStock(
  supabaseAdmin: SupabaseClient,
  orderId: string
): Promise<RestoreCancelledOrderStockResult> {
  const { data: items, error: itemsError } = await supabaseAdmin
    .from("order_items")
    .select("id, product_id, quantity, inventory_tracked_at_checkout")
    .eq("order_id", orderId);

  if (itemsError) {
    return {
      success: false,
      message: `Could not load order items for stock restoration: ${itemsError.message}`,
      restoredCount: 0,
      failedCount: 0,
      errors: [],
    };
  }

  const errors: RestoreCancelledOrderStockItemError[] = [];
  let restoredCount = 0;

  for (const item of items || []) {
    if (!item.product_id) continue; // Custom items have no catalog stock.
    const { data, error } = await supabaseAdmin.rpc("restore_cancelled_order_item_stock", {
      p_order_item_id: item.id,
    });

    if (error) {
      errors.push({
        itemId: item.id,
        productId: item.product_id || null,
        error: error.message || "RPC execution failed",
      });
      continue;
    }
    if (!data || data.success !== true) {
      errors.push({
        itemId: item.id,
        productId: item.product_id || null,
        error: data?.code || "UNKNOWN_RESULT",
      });
      continue;
    }

    restoredCount++;
  }

  if (errors.length > 0) {
    const errDetails = errors
      .map((e) => `item ${e.itemId} (${e.error})`)
      .join("; ");
    return {
      success: false,
      message: `Stock restoration partially failed: ${errors.length} of ${(items || []).length} item(s) failed. ${errDetails}`,
      restoredCount,
      failedCount: errors.length,
      errors,
    };
  }

  return {
    success: true,
    message: "All order items processed successfully.",
    restoredCount,
    failedCount: 0,
    errors: [],
  };
}

export type ReturnStatus =
  | "RETURN_REQUESTED"
  | "RETURN_APPROVED"
  | "RETURN_REJECTED"
  | "RETURN_PICKUP_SCHEDULED"
  | "RETURN_PICKUP_ASSIGNED"
  | "RETURN_PICKED_UP"
  | "RETURN_RECEIVED_BY_SELLER"
  | "RETURN_INSPECTION"
  | "REFUND_APPROVED"
  | "REFUND_PROCESSING"
  | "REFUND_COMPLETED"
  | "RETURN_CLOSED"
  | "REPLACEMENT_REQUESTED"
  | "REPLACEMENT_APPROVED"
  | "OLD_PRODUCT_PICKUP_PENDING"
  | "OLD_PRODUCT_PICKED_UP"
  | "OLD_PRODUCT_RECEIVED"
  | "REPLACEMENT_PAYMENT_PENDING"
  | "REPLACEMENT_PAYMENT_COMPLETED"
  | "REPLACEMENT_ORDER_CREATED"
  | "REPLACEMENT_DISPATCHED"
  | "REPLACEMENT_OUT_FOR_DELIVERY"
  | "REPLACEMENT_DELIVERED"
  | "REPLACEMENT_CLOSED";

export interface RefundDetailsInput {
  method: "UPI" | "BANK_ACCOUNT";
  upiId?: string;
  accountHolder?: string;
  accountNumber?: string;
  ifscCode?: string;
  bankName?: string;
  branch?: string;
}

export interface ReplacementItemInput {
  productId: string;
  quantity: number;
}

export interface CreateReturnRequestParams {
  customerId: string;
  orderId: string;
  orderItemId: string;
  requestType: "return" | "replacement";
  quantity: number;
  reasonCode: string;
  reasonText?: string;
  refundMethod?: "UPI" | "BANK_ACCOUNT";
  refundDetails?: RefundDetailsInput;
  replacementProductId?: string;
  replacementQuantity?: number;
  replacementItems?: ReplacementItemInput[];
  replacementPaymentMethod?: "UPI" | "ONLINE" | "COD";
}

export interface FullTenderCalculationInput {
  itemUnitPrice: number;
  purchasedQuantity: number;
  returnedQuantity: number;
  orderSubtotal: number;
  orderDiscountAmount?: number;
  orderTotal?: number;
  walletDebitAmount?: number;
}

export interface FullTenderFinancialResult {
  purchasedQuantity: number;
  returnedQuantity: number;
  itemUnitPrice: number;
  returnedGrossSubtotal: number;
  orderSubtotal: number;
  orderDiscountAmount: number;
  allocatedCouponDiscount: number;
  eligibleOriginalValue: number;
  effectiveUnitPrice: number;
  walletDebitAmount: number;
  codOrGatewayAmount: number;
  totalCustomerPaid: number;
  allocatedWalletTender: number;
  allocatedCodOrGatewayTender: number;
}

export interface ReplacementSettlementInput {
  eligibleOriginalValue: number;
  replacementSubtotal: number;
  alreadyCreditedAmount?: number;
}

export interface ReplacementSettlementResult {
  eligibleOriginalValue: number;
  replacementSubtotal: number;
  calculatedPriceDifference: number;
  totalCreditDue: number;
  customerPayable: number;
  alreadyCreditedAmount: number;
  remainingCreditDue: number;
}

/**
 * Authoritative, shared financial calculation for full-tender eligible value.
 * Correctly accounts for:
 * 1. Both wallet and COD/online payment tenders
 * 2. Proportional coupon discount distribution across multi-item orders
 * 3. Exact unit-level discount allocation on partial-quantity returns
 */
export function calculateFullTenderEligibleValue(input: FullTenderCalculationInput): FullTenderFinancialResult {
  const itemUnitPrice = Number(input.itemUnitPrice || 0);
  const purchasedQuantity = Math.max(1, Number(input.purchasedQuantity || 1));
  const returnedQuantity = Math.min(purchasedQuantity, Math.max(1, Number(input.returnedQuantity || 1)));

  const returnedGrossSubtotal = Number((itemUnitPrice * returnedQuantity).toFixed(2));
  const orderSubtotal = Math.max(returnedGrossSubtotal, Number(input.orderSubtotal || returnedGrossSubtotal));
  const orderDiscount = Math.max(0, Number(input.orderDiscountAmount || 0));

  // Proportional coupon discount allocated to returned units: (returnedGrossSubtotal / orderSubtotal) * orderDiscount
  const allocatedCouponDiscount = orderSubtotal > 0
    ? Number(Math.min(returnedGrossSubtotal, (returnedGrossSubtotal / orderSubtotal) * orderDiscount).toFixed(2))
    : 0;

  const eligibleOriginalValue = Number(Math.max(0, returnedGrossSubtotal - allocatedCouponDiscount).toFixed(2));
  const effectiveUnitPrice = returnedQuantity > 0 ? Number((eligibleOriginalValue / returnedQuantity).toFixed(2)) : 0;

  const walletDebitAmount = Math.max(0, Number(input.walletDebitAmount || 0));
  const codOrGatewayAmount = Math.max(0, Number(input.orderTotal || 0));
  const totalCustomerPaid = Number((walletDebitAmount + codOrGatewayAmount).toFixed(2));

  // Proportional tender breakdown for auditable accounting
  const netOrderPaid = Math.max(0, orderSubtotal - orderDiscount);
  const allocatedWalletTender = netOrderPaid > 0 && walletDebitAmount > 0
    ? Number(Math.min(eligibleOriginalValue, (eligibleOriginalValue / netOrderPaid) * walletDebitAmount).toFixed(2))
    : 0;
  const allocatedCodOrGatewayTender = Number(Math.max(0, eligibleOriginalValue - allocatedWalletTender).toFixed(2));

  return {
    purchasedQuantity,
    returnedQuantity,
    itemUnitPrice,
    returnedGrossSubtotal,
    orderSubtotal,
    orderDiscountAmount: orderDiscount,
    allocatedCouponDiscount,
    eligibleOriginalValue,
    effectiveUnitPrice,
    walletDebitAmount,
    codOrGatewayAmount,
    totalCustomerPaid,
    allocatedWalletTender,
    allocatedCodOrGatewayTender,
  };
}

/**
 * Calculates replacement package settlement, verified credit due, and remaining credit.
 */
export function calculateReplacementSettlement(input: ReplacementSettlementInput): ReplacementSettlementResult {
  const eligibleOriginalValue = Number(Number(input.eligibleOriginalValue || 0).toFixed(2));
  const replacementSubtotal = Number(Number(input.replacementSubtotal || 0).toFixed(2));
  const alreadyCreditedAmount = Number(Number(input.alreadyCreditedAmount || 0).toFixed(2));

  const calculatedPriceDifference = Number((replacementSubtotal - eligibleOriginalValue).toFixed(2));
  const totalCreditDue = calculatedPriceDifference < 0 ? Math.abs(calculatedPriceDifference) : 0;
  const customerPayable = calculatedPriceDifference > 0 ? calculatedPriceDifference : 0;
  const remainingCreditDue = Math.max(0, Number((totalCreditDue - alreadyCreditedAmount).toFixed(2)));

  return {
    eligibleOriginalValue,
    replacementSubtotal,
    calculatedPriceDifference,
    totalCreditDue,
    customerPayable,
    alreadyCreditedAmount,
    remainingCreditDue,
  };
}

/**
 * Queries all WALLET_DEBIT transactions recorded on an order to capture wallet tender,
 * subtracting any checkout reversals or refunds (REFUND_WALLET_CREDIT).
 */
export async function getOrderWalletDebits(
  supabaseAdmin: SupabaseClient,
  orderId: string
): Promise<number> {
  try {
    const { data: debits, error } = await supabaseAdmin
      .from("wallet_transactions")
      .select("amount, type, direction")
      .eq("reference_type", "order")
      .eq("reference_id", orderId)
      .in("type", ["WALLET_DEBIT", "REFUND_WALLET_CREDIT"]);

    if (error || !debits || debits.length === 0) return 0;
    const total = debits.reduce((acc, tx) => {
      if (tx.direction === "debit") return acc + Number(tx.amount || 0);
      if (tx.direction === "credit") return acc - Number(tx.amount || 0);
      return acc;
    }, 0);
    return Math.max(0, Number(total.toFixed(2)));
  } catch {
    return 0;
  }
}

/**
 * Queries all prior REPLACEMENT_PRICE_DIFFERENCE_CREDIT transactions for a return request.
 * Strictly excludes independent ADMIN_ADJUSTMENT or unrelated transactions.
 */
export async function getExistingReplacementCredits(
  supabaseAdmin: SupabaseClient,
  returnRequestId: string
): Promise<{ totalCredited: number; transactionIds: string[] }> {
  try {
    const { data: credits, error } = await supabaseAdmin
      .from("wallet_transactions")
      .select("id, amount")
      .eq("reference_type", "replacement_request")
      .eq("reference_id", returnRequestId)
      .eq("type", "REPLACEMENT_PRICE_DIFFERENCE_CREDIT")
      .eq("direction", "credit");

    if (error || !credits || credits.length === 0) {
      return { totalCredited: 0, transactionIds: [] };
    }
    const total = credits.reduce((acc, tx) => acc + Number(tx.amount || 0), 0);
    return {
      totalCredited: Number(total.toFixed(2)),
      transactionIds: credits.map((c) => c.id),
    };
  } catch {
    return { totalCredited: 0, transactionIds: [] };
  }
}

/**
 * Generates unique return request number: RET-VSM-XXXXXX
 */
export function generateReturnNumber(): string {
  const randomHex = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `RET-VSM-${randomHex}`;
}

/**
 * Masks sensitive refund details for safe view.
 */
export function maskRefundDetails(details?: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!details || typeof details !== "object") return null;

  const result: Record<string, unknown> = { ...details };

  if (typeof result.accountNumber === "string" && result.accountNumber.length > 4) {
    const raw = result.accountNumber.trim();
    const last4 = raw.slice(-4);
    result.accountNumber = `XXXXXX${last4}`;
  }

  if (typeof result.upiId === "string" && result.upiId.includes("@")) {
    const [userPart, domain] = result.upiId.split("@");
    const maskedUser = userPart.length > 2 ? `${userPart.slice(0, 2)}***` : `${userPart}***`;
    result.upiId = `${maskedUser}@${domain}`;
  }

  return result;
}

/**
 * Inserts an immutable audit record for return request state change.
 */
export async function insertReturnAuditLog(
  supabaseAdmin: SupabaseClient,
  params: {
    returnRequestId: string;
    actorType: "customer" | "seller" | "admin" | "system";
    actorId?: string | null;
    action: string;
    previousStatus?: string | null;
    newStatus?: string | null;
    notes?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  try {
    await supabaseAdmin.from("return_audit_logs").insert({
      return_request_id: params.returnRequestId,
      actor_type: params.actorType,
      actor_id: params.actorId || null,
      action: params.action,
      previous_status: params.previousStatus || null,
      new_status: params.newStatus || null,
      notes: params.notes || null,
      metadata: params.metadata || {},
    });
  } catch (err) {
    console.warn("Notice: return_audit_logs non-fatal insert error:", err);
  }
}

/**
 * Server-side creation of a Return or Replacement request with complete verification.
 * Supports multi-product replacements, exact window calculation, and product-level policy authority.
 */
export async function createReturnRequestServer(
  supabaseAdmin: SupabaseClient,
  params: CreateReturnRequestParams
) {
  const {
    customerId,
    orderId,
    orderItemId,
    requestType,
    quantity,
    reasonCode,
    reasonText,
    refundMethod,
    refundDetails,
    replacementPaymentMethod,
  } = params;

  // 1. Authoritative Order Verification
  const { data: order, error: orderErr } = await supabaseAdmin
    .from("orders")
    .select("id, user_id, internal_status, fulfillment_status, delivered_at, updated_at, created_at, order_number, subtotal, total, discount_amount, shipping_cost, tax_amount, coupon_code")
    .eq("id", orderId)
    .single();

  if (orderErr || !order) {
    return { success: false, message: "Order not found.", status: 404 };
  }

  if (order.user_id !== customerId) {
    return { success: false, message: "Unauthorized. Order does not belong to you.", status: 403 };
  }

  const isDelivered =
    (order.internal_status || "").toUpperCase() === "DELIVERED" ||
    (order.fulfillment_status || "").toLowerCase() === "delivered";

  if (!isDelivered) {
    return {
      success: false,
      message: "Returns and replacements are available only after the order has been delivered.",
      status: 400,
    };
  }

  // 2. Authoritative Order Item Verification
  const { data: item, error: itemErr } = await supabaseAdmin
    .from("order_items")
    .select("id, order_id, product_id, store_id, title, quantity, unit_price, line_total, sku, products(*, categories(*))")
    .eq("id", orderItemId)
    .eq("order_id", orderId)
    .single();

  if (itemErr || !item) {
    return { success: false, message: "Order item not found in this order.", status: 404 };
  }

  if (quantity <= 0 || quantity > Number(item.quantity)) {
    return {
      success: false,
      message: `Invalid quantity. You can return between 1 and ${item.quantity} unit(s).`,
      status: 400,
    };
  }

  // 3. Duplicate Check: Ensure item is not already under active return/replacement
  const { data: existingActive } = await supabaseAdmin
    .from("return_requests")
    .select("id, return_number, status")
    .eq("order_item_id", orderItemId)
    .not("status", "in", '("RETURN_REJECTED","RETURN_CLOSED")')
    .maybeSingle();

  if (existingActive) {
    return {
      success: false,
      message: `An active request (${existingActive.return_number}) is already in progress for this product.`,
      status: 409,
    };
  }

  // 4. Evaluate Original Product Policy (Determines if customer can request return/replacement NOW)
  const prodRaw = item.products as unknown;
  const prod = (Array.isArray(prodRaw) ? prodRaw[0] : prodRaw) as Record<string, unknown> | null;
  const catRaw = prod?.categories as unknown;
  const cat = (Array.isArray(catRaw) ? catRaw[0] : catRaw) as Record<string, unknown> | null;

  const policy = evaluateProductReturnPolicy({
    categoryId: (prod?.category_id as string) || ((item as Record<string, unknown>).category_id as string) || null,
    categorySlug: (cat?.slug as string) || null,
    categoryName: (cat?.name as string) || null,
    sku: item.sku || (prod?.sku as string) || null,
    tags: (prod?.tags as string[]) || null,
    return_allowed: prod?.return_allowed as boolean | undefined,
    return_window_days: prod?.return_window_days as number | undefined,
    replacement_allowed: prod?.replacement_allowed as boolean | undefined,
    replacement_window_days: prod?.replacement_window_days as number | undefined,
    replacement_selectable: prod?.replacement_selectable as boolean | undefined,
  });

  const deliveryTimestamp = order.delivered_at || order.updated_at || order.created_at;
  const deliveryDate = new Date(deliveryTimestamp);
  const now = new Date();

  if (requestType === "return") {
    if (!policy.isReturnEligible) {
      return {
        success: false,
        message: policy.ineligibleReason || "Return is not allowed for this product.",
        status: 400,
      };
    }
    const returnWindowMs = policy.returnWindowDays * 24 * 60 * 60 * 1000;
    if (now.getTime() - deliveryDate.getTime() > returnWindowMs) {
      return {
        success: false,
        message: `The ${policy.returnWindowDays}-day return eligibility window for this delivery has expired.`,
        status: 400,
      };
    }
  } else if (requestType === "replacement") {
    if (!policy.isReplacementEligible) {
      return {
        success: false,
        message: policy.ineligibleReason || "Replacement is not allowed for this product.",
        status: 400,
      };
    }
    const replacementWindowMs = policy.replacementWindowDays * 24 * 60 * 60 * 1000;
    if (now.getTime() - deliveryDate.getTime() > replacementWindowMs) {
      return {
        success: false,
        message: `The ${policy.replacementWindowDays}-day replacement eligibility window for this delivery has expired.`,
        status: 400,
      };
    }
  }

  // 5. Fetch Original Seller ID
  let sellerId = "";
  if (item.store_id) {
    const { data: storeData } = await supabaseAdmin
      .from("stores")
      .select("seller_id")
      .eq("id", item.store_id)
      .single();
    if (storeData) sellerId = storeData.seller_id;
  }

  if (!sellerId && prod?.store_id) {
    const { data: storeData } = await supabaseAdmin
      .from("stores")
      .select("seller_id")
      .eq("id", prod.store_id)
      .single();
    if (storeData) sellerId = storeData.seller_id;
  }

  // Authoritative Full-Tender Calculation of Refund / Replacement
  // Factor in proportional coupon discounts and both wallet & COD/gateway payment tenders
  const walletDebitAmount = await getOrderWalletDebits(supabaseAdmin, orderId);
  const financialCalc = calculateFullTenderEligibleValue({
    itemUnitPrice: Number(item.unit_price || 0),
    purchasedQuantity: Number(item.quantity || 1),
    returnedQuantity: quantity,
    orderSubtotal: Number(order.subtotal || item.line_total || 0),
    orderDiscountAmount: Number(order.discount_amount || 0),
    orderTotal: Number(order.total || 0),
    walletDebitAmount,
  });

  const eligibleItemTotal = financialCalc.eligibleOriginalValue;
  const originalUnitPrice = financialCalc.effectiveUnitPrice;

  const calculatedRefundAmount = eligibleItemTotal;
  let calculatedPriceDifference = 0;
  let finalStatus: ReturnStatus = "RETURN_REQUESTED";

  let replacementProductId: string | null = null;
  let replacementSellerId: string | null = null;
  let safeReplQty = quantity;
  let replacementTotal = 0;
  const validatedReplacementItems: Array<{
    productId: string;
    productTitle: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    storeId?: string;
    sellerId?: string;
  }> = [];

  if (requestType === "replacement") {
    finalStatus = "REPLACEMENT_REQUESTED";

    // Support both multi-product replacementItems array and single replacementProductId
    const replItems: ReplacementItemInput[] =
      params.replacementItems && params.replacementItems.length > 0
        ? params.replacementItems
        : params.replacementProductId
        ? [{ productId: params.replacementProductId, quantity: params.replacementQuantity || quantity }]
        : [];

    if (replItems.length === 0) {
      return {
        success: false,
        message: "Please select at least one replacement product.",
        status: 400,
      };
    }

    const totalReplQuantity = replItems.reduce((acc, it) => acc + Number(it.quantity || 0), 0);
    if (totalReplQuantity <= 0) {
      return {
        success: false,
        message: "Please select at least 1 replacement unit.",
        status: 400,
      };
    }

    // Fetch candidate replacement products from database
    const candidateProductIds = Array.from(new Set(replItems.map((it) => it.productId)));
    const { data: dbCandidateProducts, error: candErr } = await supabaseAdmin
      .from("products")
      .select("*, categories (id, name, slug)")
      .in("id", candidateProductIds)
      .eq("status", "active");

    if (candErr || !dbCandidateProducts || dbCandidateProducts.length < candidateProductIds.length) {
      console.warn("Replacement candidate products fetch error or count mismatch:", {
        candErr: candErr?.message || candErr,
        foundCount: dbCandidateProducts?.length ?? 0,
        requestedCount: candidateProductIds.length,
      });
      return {
        success: false,
        message: "One or more selected replacement products are not available.",
        status: 404,
      };
    }

    const candMap = new Map(dbCandidateProducts.map((p) => [p.id, p]));
    replacementTotal = 0;

    for (const it of replItems) {
      const dbProd = candMap.get(it.productId);
      if (!dbProd) {
        return { success: false, message: "Replacement product not found.", status: 404 };
      }
      if (dbProd.id === item.product_id) {
        return { success: false, message: "Cannot select the original product as its own replacement.", status: 400 };
      }
      if (!Number.isInteger(it.quantity) || it.quantity <= 0) {
        return {
          success: false,
          message: "Requested replacement quantity must be a positive integer.",
          status: 400,
        };
      }
      const availStock = dbProd.stock_quantity ?? 0;
      if (dbProd.track_inventory && !dbProd.allow_backorders && availStock < it.quantity) {
        return {
          success: false,
          message: `Only ${availStock} units are currently available for ${dbProd.title}.`,
          status: 400,
        };
      }

      // Candidate replacement product eligibility check:
      // Must be replacement-selectable. Note: Candidate product's own replacement_window_days
      // does NOT restrict selection (it applies only if originally purchased).
      const candCat = dbProd.categories as { slug?: string; name?: string } | null;
      const candPolicy = evaluateProductReturnPolicy({
        categoryId: dbProd.category_id,
        categorySlug: candCat?.slug,
        categoryName: candCat?.name,
        sku: dbProd.sku,
        tags: dbProd.tags,
        return_allowed: dbProd.return_allowed,
        return_window_days: dbProd.return_window_days,
        replacement_allowed: dbProd.replacement_allowed,
        replacement_window_days: dbProd.replacement_window_days,
        replacement_selectable: dbProd.replacement_selectable,
      });

      if (!candPolicy.isReplacementSelectable) {
        return {
          success: false,
          message: `Product is not eligible to be chosen as a replacement: ${dbProd.title}.`,
          status: 400,
        };
      }

      const effPrice =
        dbProd.sale_price && dbProd.sale_price > 0 && dbProd.sale_price < dbProd.price
          ? Number(dbProd.sale_price)
          : Number(dbProd.price);

      const lineTotal = effPrice * Number(it.quantity);
      replacementTotal += lineTotal;

      let resolvedStoreId = dbProd.store_id;
      if (!resolvedStoreId && Array.isArray(dbProd.tags)) {
        const storeTag = dbProd.tags.find((t: string) => typeof t === "string" && t.startsWith("store:"));
        if (storeTag) {
          resolvedStoreId = storeTag.replace("store:", "");
        }
      }

      let candSellerId: string | undefined;
      if (resolvedStoreId) {
        const { data: st } = await supabaseAdmin
          .from("stores")
          .select("seller_id")
          .eq("id", resolvedStoreId)
          .single();
        if (st) candSellerId = st.seller_id;
      }

      validatedReplacementItems.push({
        productId: dbProd.id,
        productTitle: dbProd.title,
        quantity: Number(it.quantity),
        unitPrice: effPrice,
        lineTotal,
        storeId: resolvedStoreId,
        sellerId: candSellerId,
      });
    }

    replacementTotal = Number(replacementTotal.toFixed(2));
    calculatedPriceDifference = Number((replacementTotal - eligibleItemTotal).toFixed(2));

    const primaryItem = validatedReplacementItems[0];
    replacementProductId = primaryItem.productId;
    replacementSellerId = primaryItem.sellerId || null;
    safeReplQty = totalReplQuantity;
  } else {
    // Return Request Validation
    if (!refundMethod || !["UPI", "BANK_ACCOUNT"].includes(refundMethod)) {
      return { success: false, message: "Please select a valid refund method (UPI or Bank Account).", status: 400 };
    }

    if (refundMethod === "UPI") {
      if (!refundDetails?.upiId || !refundDetails.upiId.includes("@") || refundDetails.upiId.length < 5) {
        return { success: false, message: "Please provide a valid UPI ID (e.g., name@okbank).", status: 400 };
      }
    } else if (refundMethod === "BANK_ACCOUNT") {
      if (
        !refundDetails?.accountHolder?.trim() ||
        !refundDetails?.accountNumber?.trim() ||
        !refundDetails?.ifscCode?.trim() ||
        refundDetails.accountNumber.trim().length < 6 ||
        refundDetails.ifscCode.trim().length < 8
      ) {
        return { success: false, message: "Please provide complete bank account details (Holder name, Account number, IFSC).", status: 400 };
      }
    }
  }

  const returnNumber = generateReturnNumber();

  // Create Return / Replacement Request
  const requestPayload: Record<string, unknown> = {
    return_number: returnNumber,
    request_type: requestType,
    order_id: orderId,
    order_item_id: orderItemId,
    customer_id: customerId,
    seller_id: sellerId || null,
    product_id: item.product_id,
    quantity,
    reason_code: reasonCode,
    reason_text: reasonText?.trim() || null,
    refund_method: requestType === "return" ? refundMethod : "NONE",
    refund_details:
      requestType === "return"
        ? {
            ...(refundDetails || {}),
            originalEligibleValue: eligibleItemTotal,
            itemUnitPrice: Number(item.unit_price || 0),
            purchasedQuantity: Number(item.quantity || 1),
            returnedQuantity: quantity,
            returnedGrossSubtotal: financialCalc.returnedGrossSubtotal,
            orderSubtotal: financialCalc.orderSubtotal,
            orderDiscountAmount: financialCalc.orderDiscountAmount,
            allocatedCouponDiscount: financialCalc.allocatedCouponDiscount,
            tenderBreakdown: {
              walletDebitTender: financialCalc.walletDebitAmount,
              codOrGatewayTender: financialCalc.codOrGatewayAmount,
              totalCustomerPaid: financialCalc.totalCustomerPaid,
              allocatedWalletTender: financialCalc.allocatedWalletTender,
              allocatedCodOrGatewayTender: financialCalc.allocatedCodOrGatewayTender,
            },
          }
        : {
            method: "REPLACEMENT",
            replacementItems: validatedReplacementItems,
            itemUnitPrice: Number(item.unit_price || 0),
            purchasedQuantity: Number(item.quantity || 1),
            returnedQuantity: quantity,
            returnedGrossSubtotal: financialCalc.returnedGrossSubtotal,
            orderSubtotal: financialCalc.orderSubtotal,
            orderDiscountAmount: financialCalc.orderDiscountAmount,
            allocatedCouponDiscount: financialCalc.allocatedCouponDiscount,
            originalEligibleValue: eligibleItemTotal,
            tenderBreakdown: {
              walletDebitTender: financialCalc.walletDebitAmount,
              codOrGatewayTender: financialCalc.codOrGatewayAmount,
              totalCustomerPaid: financialCalc.totalCustomerPaid,
              allocatedWalletTender: financialCalc.allocatedWalletTender,
              allocatedCodOrGatewayTender: financialCalc.allocatedCodOrGatewayTender,
            },
            replacementSubtotal: replacementTotal,
            calculatedPriceDifference,
            totalCreditDue: calculatedPriceDifference < 0 ? Math.abs(calculatedPriceDifference) : 0,
            customerPayable: calculatedPriceDifference > 0 ? calculatedPriceDifference : 0,
            alreadyCreditedAmount: 0,
            remainingCreditDue: calculatedPriceDifference < 0 ? Math.abs(calculatedPriceDifference) : 0,
            walletCreditAmount: calculatedPriceDifference < 0 ? Math.abs(calculatedPriceDifference) : 0,
            walletCreditStatus: calculatedPriceDifference < 0 ? "PENDING_VERIFICATION" : "NOT_APPLICABLE",
          },
    refund_amount: requestType === "return" ? calculatedRefundAmount : 0,
    replacement_product_id: requestType === "replacement" ? replacementProductId : null,
    replacement_quantity: requestType === "replacement" ? safeReplQty : null,
    replacement_seller_id: replacementSellerId,
    replacement_price_difference: calculatedPriceDifference,
    replacement_payment_method:
      requestType === "replacement"
        ? calculatedPriceDifference > 0
          ? replacementPaymentMethod || "UPI"
          : "NONE"
        : "NONE",
    replacement_payment_status:
      requestType === "replacement"
        ? calculatedPriceDifference > 0
          ? "pending"
          : "not_applicable"
        : "not_applicable",
    status: finalStatus,
    pickup_status: "PICKUP_PENDING",
  };

  const { data: createdReturn, error: insertErr } = await supabaseAdmin
    .from("return_requests")
    .insert(requestPayload)
    .select()
    .single();

  if (insertErr || !createdReturn) {
    console.error("Failed to insert return request:", insertErr);
    return { success: false, message: insertErr?.message || "Failed to record return request.", status: 500 };
  }

  // Attempt inserting into return_request_replacement_items if table exists (forward-compatible)
  if (requestType === "replacement" && validatedReplacementItems.length > 0) {
    try {
      const itemsPayload = validatedReplacementItems.map((v) => ({
        return_request_id: createdReturn.id,
        replacement_product_id: v.productId,
        quantity: v.quantity,
        unit_price: v.unitPrice,
        line_total: v.lineTotal,
        store_id: v.storeId || null,
        seller_id: v.sellerId || null,
      }));
      await supabaseAdmin.from("return_request_replacement_items").insert(itemsPayload);
    } catch {
      // Gracefully ignore if table has not been migrated yet
    }
  }

  // If replacement price is LOWER than original: Record applicable wallet credit
  // (Credited at the verified pickup/approval lifecycle step to prevent premature balance changes)
  let walletCreditPending = false;
  let walletCreditAmount = 0;
  if (requestType === "replacement" && calculatedPriceDifference < 0) {
    walletCreditPending = true;
    walletCreditAmount = Math.abs(calculatedPriceDifference);
  }

  // Audit Log
  await insertReturnAuditLog(supabaseAdmin, {
    returnRequestId: createdReturn.id,
    actorType: "customer",
    actorId: customerId,
    action: requestType === "return" ? "RETURN_REQUESTED" : "REPLACEMENT_REQUESTED",
    previousStatus: null,
    newStatus: finalStatus,
    notes: reasonText || `Customer requested ${requestType}`,
    metadata: {
      returnNumber,
      orderNumber: order.order_number,
      productTitle: item.title,
      quantity,
      refundAmount: calculatedRefundAmount,
      priceDifference: calculatedPriceDifference,
      walletCreditPending,
      walletCreditAmount,
      replacementItems: validatedReplacementItems,
    },
  });

  return {
    success: true,
    returnRequest: createdReturn,
    returnNumber,
    requestType,
    refundAmount: calculatedRefundAmount,
    priceDifference: calculatedPriceDifference,
    walletCreditPending,
    walletCreditAmount,
    itemsCount: validatedReplacementItems.length,
    status: 200,
  };
}

/**
 * Seller physical receipt confirmation: only permitted action for seller.
 */
export async function confirmProductReceivedBySeller(
  supabaseAdmin: SupabaseClient,
  returnId: string,
  sellerId: string
) {
  const { data: reqData, error: reqErr } = await supabaseAdmin
    .from("return_requests")
    .select("*")
    .eq("id", returnId)
    .single();

  if (reqErr || !reqData) {
    return { success: false, message: "Return request not found.", status: 404 };
  }

  // Check seller ownership
  if (reqData.seller_id !== sellerId) {
    return { success: false, message: "Unauthorized. You are not the selling merchant for this return.", status: 403 };
  }

  const prevStatus = reqData.status;
  const newStatus = reqData.request_type === "replacement" ? "OLD_PRODUCT_RECEIVED" : "RETURN_RECEIVED_BY_SELLER";

  const { error: updErr } = await supabaseAdmin
    .from("return_requests")
    .update({
      status: newStatus,
      seller_received_at: new Date().toISOString(),
      seller_received_confirmed_by: sellerId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", returnId);

  if (updErr) {
    return { success: false, message: "Failed to confirm product receipt.", status: 500 };
  }

  await insertReturnAuditLog(supabaseAdmin, {
    returnRequestId: returnId,
    actorType: "seller",
    actorId: sellerId,
    action: "SELLER_CONFIRMED_PRODUCT_RECEIVED",
    previousStatus: prevStatus,
    newStatus,
    notes: "Seller acknowledged physical arrival of returned product at merchant facility.",
  });

  return { success: true, message: "Product receipt confirmed successfully.", newStatus };
}

/**
 * A deterministic refund reference shared by cancellation persistence and Cashfree.
 * Keep this identical across retries so a webhook can be linked before/after the
 * gateway response is received.
 */
function getCustomerCancellationRefundId(orderId: string): string {
  return `ref_canc_${orderId.replace(/[^a-zA-Z0-9_-]/g, "_")}`.slice(0, 50);
}

/**
 * Persist the order-level cancellation row before submitting a gateway refund.
 * The table intentionally permits multiple rows per order for item-level returns;
 * therefore this helper targets the latest order-level row (order_item_id IS NULL).
 * After submission, the atomic webhook RPC owns gateway status metadata updates.
 *
 * This is retry-safe for sequential retries. Concurrent cancellation requests
 * still require database-side serialization/uniqueness and are not claimed atomic.
 */
async function ensureCustomerCancellationRecord(
  supabaseAdmin: SupabaseClient,
  params: {
    orderId: string;
    customerId: string;
    reasonCode: string;
    reasonText?: string;
    cancelledAt: string;
    metadata: Record<string, unknown>;
  }
): Promise<{ id: string; metadata: Record<string, unknown> }> {
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("order_cancellations")
    .select("id, metadata")
    .eq("order_id", params.orderId)
    .is("order_item_id", null)
    .order("cancelled_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Could not inspect existing cancellation record: ${lookupError.message}`);
  }

  const previousMetadata =
    existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
      ? existing.metadata as Record<string, unknown>
      : {};
  const nextMetadata = { ...previousMetadata, ...params.metadata };

  // A retry must never downgrade webhook-confirmed SUCCESS/FAILED metadata back
  // to the initial PENDING marker or replace a richer gateway response with only
  // the deterministic refund_id placeholder.
  if (existing?.id && previousMetadata.gateway_refund_status) {
    nextMetadata.gateway_refund_status = previousMetadata.gateway_refund_status;
  }
  if (
    existing?.id &&
    previousMetadata.gateway_refund_response &&
    typeof previousMetadata.gateway_refund_response === "object"
  ) {
    nextMetadata.gateway_refund_response = previousMetadata.gateway_refund_response;
  }

  if (existing?.id) {
    const { data, error } = await supabaseAdmin
      .from("order_cancellations")
      .update({
        reason_code: params.reasonCode,
        reason_text: params.reasonText?.trim() || null,
        metadata: nextMetadata,
      })
      .eq("id", existing.id)
      .select("id, metadata")
      .single();

    if (error || !data) {
      throw new Error(`Could not update cancellation record: ${error?.message || "No row returned"}`);
    }
    return { id: data.id, metadata: data.metadata || nextMetadata };
  }

  const { data, error } = await supabaseAdmin
    .from("order_cancellations")
    .insert({
      order_id: params.orderId,
      customer_id: params.customerId,
      reason_code: params.reasonCode,
      reason_text: params.reasonText?.trim() || null,
      metadata: nextMetadata,
      cancelled_at: params.cancelledAt,
    })
    .select("id, metadata")
    .single();

  if (error || !data) {
    throw new Error(`Could not create cancellation record: ${error?.message || "No row returned"}`);
  }
  return { id: data.id, metadata: data.metadata || nextMetadata };
}

/**
 * Resolve a customer-cancellation refund using one stable refund ID per order.
 * A read-before-create prevents a retry after a lost HTTP response from issuing
 * another refund. Cashfree's idempotency header is also stable for this refund.
 * Unknown lookup outcomes fail closed: never POST a new refund when status is unknown.
 */
async function ensureCustomerCancellationCashfreeRefund(params: {
  orderId: string;
  orderNumber: string | number;
  amount: number;
}) {
  const refundId = getCustomerCancellationRefundId(params.orderId);
  const existing = await fetchCashfreeRefund({ orderId: params.orderId, refundId });
  if (existing) return existing;

  return createCashfreeRefund({
    orderId: params.orderId,
    refundAmount: params.amount,
    refundId,
    refundNote: `Cancellation refund for order #${params.orderNumber}`,
  });
}

/**
 * Customer cancellation flow:
 * Enforces cancellation window (before SHIPPED/IN TRANSIT), restores product stock atomically,
 * and records cancellation audit entry.
 */
export async function cancelCustomerOrderServer(
  supabaseAdmin: SupabaseClient,
  params: {
    orderId: string;
    customerId: string;
    reasonCode: string;
    reasonText?: string;
  }
) {
  const { orderId, customerId, reasonCode, reasonText } = params;

  // 1. Fetch Order with financial, payment and wallet tender details
  const { data: order, error: orderErr } = await supabaseAdmin
    .from("orders")
    .select("id, user_id, internal_status, fulfillment_status, order_number, payment_status, payment_method, total, wallet_amount_applied, razorpay_payment_id")
    .eq("id", orderId)
    .single();

  if (orderErr || !order) {
    return { success: false, message: "Order not found.", status: 404 };
  }

  if (order.user_id !== customerId) {
    return { success: false, message: "Unauthorized. Order does not belong to you.", status: 403 };
  }

  const internal = (order.internal_status || "").toUpperCase();
  const fulfillment = (order.fulfillment_status || "").toLowerCase();

  if (internal === "CANCELLED" || fulfillment === "cancelled") {
    // Retry stock restoration first; its per-item ledger makes this safe.
    const stockRetry = await restoreCancelledOrderStock(supabaseAdmin, orderId);
    if (!stockRetry.success) {
      return {
        success: false,
        message: `Order is already cancelled, but stock restoration needs attention: ${stockRetry.message}`,
        status: 500,
      };
    }

    // Ensure seller settlements and balances are adjusted atomically and idempotently
    try {
      await supabaseAdmin.rpc("adjust_seller_settlement_for_cancellation_atomic", {
        p_order_id: orderId,
        p_reason: reasonText?.trim() || `Customer cancellation retry (${reasonCode})`,
      });
    } catch (settleRetryErr) {
      console.warn("Notice: Seller settlement cancellation adjustment retry:", settleRetryErr);
    }

    const alreadyPaidOnline =
      ((order.payment_method || "").toUpperCase() === "ONLINE" ||
       (order.payment_method || "").toLowerCase() === "cashfree") &&
      ["paid", "refunded"].includes((order.payment_status || "").toLowerCase());
    const retryGatewayAmount = alreadyPaidOnline
      ? Math.max(0, Number((Number(order.total || 0) - Number(order.wallet_amount_applied || 0)).toFixed(2)))
      : 0;

    if (alreadyPaidOnline && retryGatewayAmount > 0 && order.payment_status !== "refunded") {
      const retryRefundId = getCustomerCancellationRefundId(order.id);
      let retryCancellationRecord: { id: string; metadata: Record<string, unknown> };
      try {
        retryCancellationRecord = await ensureCustomerCancellationRecord(supabaseAdmin, {
          orderId: order.id,
          customerId,
          reasonCode,
          reasonText,
          cancelledAt: new Date().toISOString(),
          metadata: {
            gateway_refund_amount: retryGatewayAmount,
            gateway_refund_status: "PENDING",
            gateway_refund_response: { refund_id: retryRefundId },
          },
        });
      } catch (recordError: any) {
        return {
          success: false,
          message: `Order is cancelled and stock is restored, but its durable refund record could not be verified. Retry later. ${recordError?.message || ""}`.trim(),
          status: 503,
        };
      }

      try {
        const refund = await ensureCustomerCancellationCashfreeRefund({
          orderId: order.id,
          orderNumber: order.order_number,
          amount: retryGatewayAmount,
        });
        if (refund.status === "SUCCESS") {
          const { error: statusError } = await supabaseAdmin
            .from("orders")
            .update({ payment_status: "refunded", updated_at: new Date().toISOString() })
            .eq("id", orderId)
            .eq("payment_status", "paid");
          if (statusError) {
            return { success: false, message: `Cashfree refund succeeded, but order status reconciliation needs attention: ${statusError.message}`, status: 500 };
          }
        } else if (refund.status === "FAILED" || refund.status === "CANCELLED") {
          return {
            success: false,
            message: `Order is cancelled and stock is restored, but Cashfree reports refund status ${refund.status}. Manual refund review is required; no new refund was created.`,
            status: 409,
          };
        }
        return {
          success: true,
          message: refund.status === "SUCCESS"
            ? "Order is cancelled, stock is restored, and Cashfree refund is confirmed."
            : "Order is cancelled and stock is restored. Cashfree refund is still pending.",
          orderNumber: order.order_number,
          gatewayRefundAmount: retryGatewayAmount,
          paymentStatus: refund.status === "SUCCESS" ? "refunded" : order.payment_status,
        };
      } catch (refundRetryError: any) {
        return {
          success: false,
          message: `Order is cancelled and stock is restored, but Cashfree refund status could not be verified. Retry later; no second refund was submitted. ${refundRetryError?.message || ""}`.trim(),
          status: 503,
        };
      }
    }

    return { success: false, message: "Order is already cancelled. Stock restoration is verified.", status: 400 };
  }

  if (
    internal === "SHIPPED" ||
    internal === "IN TRANSIT" ||
    internal === "OUT FOR DELIVERY" ||
    internal === "DELIVERED" ||
    fulfillment === "shipped" ||
    fulfillment === "delivered"
  ) {
    return {
      success: false,
      message: "Cancellation unavailable. Your order has already been shipped and cannot be cancelled.",
      status: 400,
    };
  }

  // 3. Process Wallet Refund (idempotent atomic wallet credit)
  const walletAmountApplied = Math.max(0, Number(order.wallet_amount_applied || 0));
  let walletRefundResult: { success: boolean; newBalance?: number; transactionId?: string; isDuplicate?: boolean; message?: string } | null = null;
  if (walletAmountApplied > 0) {
    walletRefundResult = await creditCustomerWallet(supabaseAdmin, {
      customerId: order.user_id,
      amount: walletAmountApplied,
      type: "REFUND_WALLET_CREDIT",
      referenceType: "order",
      referenceId: order.id,
      description: `Refund for cancelled order #${order.order_number}`,
      idempotencyKey: `cancel_refund_wallet_${order.id}`,
    });

    if (!walletRefundResult.success && !walletRefundResult.isDuplicate) {
      console.error(`Failed to credit wallet on cancellation for order ${order.id}:`, walletRefundResult.message);
      return {
        success: false,
        message: `Order cancellation could not be completed because wallet refund failed: ${walletRefundResult.message}`,
        status: 500,
      };
    }
  }

  // 4. Process Online Gateway Refund (Cashfree) if order was paid online
  const isPaidOnline =
    ((order.payment_method || "").toUpperCase() === "ONLINE" ||
     (order.payment_method || "").toLowerCase() === "cashfree") &&
    (order.payment_status || "").toLowerCase() === "paid";

  // Gateway refund amount is total minus wallet amount (to prevent double refund!)
  const gatewayRefundAmount = isPaidOnline
    ? Math.max(0, Number((Number(order.total || 0) - walletAmountApplied).toFixed(2)))
    : 0;

  let cashfreeRefundResult: any = null;
  let targetPaymentStatus = order.payment_status;
  const cancellationRefundId = isPaidOnline && gatewayRefundAmount > 0
    ? getCustomerCancellationRefundId(order.id)
    : null;

  // The durable cancellation/refund reference must exist before Cashfree can
  // emit a webhook. If persistence fails, do not submit a gateway refund.
  let cancellationRecord: { id: string; metadata: Record<string, unknown> };
  try {
    cancellationRecord = await ensureCustomerCancellationRecord(supabaseAdmin, {
      orderId,
      customerId,
      reasonCode,
      reasonText,
      cancelledAt: new Date().toISOString(),
      metadata: {
        wallet_amount_applied: walletAmountApplied,
        wallet_refund_status: walletAmountApplied > 0
          ? (walletRefundResult?.success ? "COMPLETED" : "FAILED")
          : "NOT_APPLICABLE",
        wallet_transaction_id: walletRefundResult?.transactionId || null,
        gateway_refund_amount: gatewayRefundAmount,
        gateway_refund_status: cancellationRefundId ? "PENDING" : "NOT_APPLICABLE",
        ...(cancellationRefundId
          ? { gateway_refund_response: { refund_id: cancellationRefundId } }
          : {}),
      },
    });
  } catch (recordError: any) {
    console.error(`Could not persist cancellation record before refund for order ${orderId}:`, recordError);
    return {
      success: false,
      message: `Cancellation could not safely continue because its durable record could not be saved. Retry later. ${recordError?.message || ""}`.trim(),
      status: 503,
    };
  }

  if (isPaidOnline && gatewayRefundAmount > 0) {
    // Durable refund-pending status until gateway confirms
    targetPaymentStatus = "refund_pending";
    try {
      cashfreeRefundResult = await ensureCustomerCancellationCashfreeRefund({
        orderId: order.id,
        orderNumber: order.order_number,
        amount: gatewayRefundAmount,
      });
      if (cashfreeRefundResult?.status === "SUCCESS") {
        targetPaymentStatus = "refunded";
      } else {
        targetPaymentStatus = "paid";
      }
      // The webhook's atomic reconciliation owns gateway status metadata after
      // submission. Do not overwrite it here: a fast webhook may already have
      // committed SUCCESS while this request is still returning from Cashfree.
    } catch (cfErr: any) {
      console.warn("Cashfree refund initiation warning:", cfErr?.message || cfErr);
      cashfreeRefundResult = {
        refund_id: cancellationRefundId,
        success: false,
        error: cfErr?.message || "Gateway refund initiation/status lookup error",
      };
      targetPaymentStatus = "paid";
      // Keep the pre-submission PENDING marker and deterministic refund_id. A
      // retry performs a Cashfree status lookup before it can submit anything.
    }
  } else if (walletAmountApplied > 0 && !isPaidOnline) {
    targetPaymentStatus = "refunded";
  } else if (!isPaidOnline) {
    targetPaymentStatus = "pending";
  }

  // 5. Atomically update Order status to CANCELLED and update payment_status
  const nowIso = new Date().toISOString();
  const { error: updErr } = await supabaseAdmin
    .from("orders")
    .update({
      internal_status: "CANCELLED",
      fulfillment_status: "cancelled",
      payment_status: targetPaymentStatus,
      cancelled_at: nowIso,
      cancel_reason_code: reasonCode,
      cancel_reason_text: reasonText?.trim() || null,
      updated_at: nowIso,
    })
    .eq("id", orderId);

  if (updErr) {
    return { success: false, message: "Failed to update order status.", status: 500 };
  }

  // 6. Restore stock through an idempotent per-order-item database ledger.
  // If restoration fails, keep the order cancelled and return an explicit error;
  // a retry enters the already-cancelled branch above without repeating refunds.
  const stockRestore = await restoreCancelledOrderStock(supabaseAdmin, orderId);
  if (!stockRestore.success) {
    console.error(`Stock restoration requires attention for order ${orderId}:`, stockRestore.message);
    return {
      success: false,
      message: `Order was cancelled, but stock restoration requires attention: ${stockRestore.message}`,
      status: 500,
    };
  }

  // 6b. Adjust seller settlements atomically (e.g. reverse released earnings or cancel pending/on-hold settlements)
  try {
    await supabaseAdmin.rpc("adjust_seller_settlement_for_cancellation_atomic", {
      p_order_id: orderId,
      p_reason: reasonText?.trim() || `Customer cancellation (${reasonCode})`,
    });
  } catch (settleCancelErr) {
    console.warn("Seller settlement cancellation adjustment notice:", settleCancelErr);
  }

  // 7. Add order_timeline event
  try {
    const refundNoteParts = [];
    if (walletAmountApplied > 0) {
      refundNoteParts.push(`Wallet refund of ₹${walletAmountApplied.toFixed(2)} processed.`);
    }
    if (isPaidOnline && gatewayRefundAmount > 0) {
      refundNoteParts.push(`Gateway refund of ₹${gatewayRefundAmount.toFixed(2)} (${targetPaymentStatus}).`);
    }
    await supabaseAdmin.from("order_timeline").insert({
      order_id: orderId,
      status: "CANCELLED",
      note: `Customer cancelled order. Reason: ${reasonCode}. ${reasonText || ""}. ${refundNoteParts.join(" ")}`.trim(),
      created_by: customerId,
    });
  } catch (tlErr) {
    console.warn("Timeline insert warning:", tlErr);
  }

  // 8. order_cancellations was persisted before any gateway refund request and
  // its gateway metadata was updated after the gateway response was resolved.

  return {
    success: true,
    message: "Your order has been cancelled successfully.",
    orderNumber: order.order_number,
    walletRefundAmount: walletAmountApplied,
    gatewayRefundAmount,
    paymentStatus: targetPaymentStatus,
  };
}

/**
 * Authoritatively converts an approved/active replacement request into a genuine, persistent new order
 * using the normal order management pipeline.
 *
 * Guarantees:
 * - A genuine new unique Order ID (ORD-XXXXX) differs from the original order ID.
 * - Multi-vendor routing: Each replacement product is attributed to its database store_id.
 * - Atomic stock decrement using createOrderRecord.
 * - Accurate financial accounting: replacement credit applied, net difference charged or credit deferred.
 * - Durable bidirectional database linking: return_requests.replacement_order_id <-> orders.replacement_request_id.
 * - Strict idempotency: Never creates duplicate replacement orders on retries or double clicks.
 */
export async function createReplacementOrderForReturnRequest(
  supabaseAdmin: SupabaseClient,
  returnRequestId: string
): Promise<{
  success: boolean;
  message?: string;
  order?: Record<string, unknown>;
  order_number?: string;
  invoice_number?: string;
  is_duplicate?: boolean;
  status?: number;
}> {
  // 1. Fetch Return Request with resilient identifier lookup and explicit relationship disambiguation
  const cleanedLookup = (returnRequestId || "").trim();
  if (!cleanedLookup) {
    return { success: false, message: "Return/replacement request ID is required.", status: 400 };
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanedLookup);
  let reqQuery = supabaseAdmin
    .from("return_requests")
    .select("*, orders:orders!return_requests_order_id_fkey(*), order_items(*)");

  if (isUuid) {
    reqQuery = reqQuery.eq("id", cleanedLookup);
  } else {
    reqQuery = reqQuery.eq("return_number", cleanedLookup);
  }

  const { data: retReq, error: retErr } = await reqQuery.maybeSingle();

  if (retErr || !retReq) {
    console.error("Return request lookup error:", retErr?.message || "Not found");
    return { success: false, message: "Return/replacement request not found.", status: 404 };
  }

  if (retReq.request_type !== "replacement") {
    return {
      success: false,
      message: `Request #${retReq.return_number} is of type "${retReq.request_type}". Only replacement requests can be converted to new orders.`,
      status: 400,
    };
  }

  const canonicalReqId = String(retReq.id);
  const cleanIdempKey = `REPL_ORDER_${canonicalReqId}`;

  // 2. Strict Idempotency Check: Return existing order if already created
  if (retReq.replacement_order_id) {
    const { data: existingOrd } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", retReq.replacement_order_id)
      .maybeSingle();

    if (existingOrd) {
      return {
        success: true,
        order: existingOrd,
        order_number: existingOrd.order_number,
        invoice_number: existingOrd.invoice_number,
        is_duplicate: true,
        status: 200,
      };
    }
  }

  // Also check if an order with this idempotency key already exists
  const { data: existingByIdemp } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("idempotency_key", cleanIdempKey)
    .maybeSingle();

  if (existingByIdemp) {
    // Re-bind to return_requests if missing
    if (retReq.replacement_order_id !== existingByIdemp.id) {
      await supabaseAdmin
        .from("return_requests")
        .update({
          replacement_order_id: existingByIdemp.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", canonicalReqId);
    }
    return {
      success: true,
      order: existingByIdemp,
      order_number: existingByIdemp.order_number,
      invoice_number: existingByIdemp.invoice_number,
      is_duplicate: true,
      status: 200,
    };
  }

  // Lifecycle Gate: Do not create new orders for closed or terminal requests
  const terminalStatuses = ["REPLACEMENT_CLOSED", "RETURN_CLOSED", "REFUND_COMPLETED", "REJECTED", "CANCELLED"];
  if (terminalStatuses.includes(retReq.status)) {
    return {
      success: false,
      message: `Cannot create replacement order: request #${retReq.return_number} is already in completed/terminal status "${retReq.status}".`,
      status: 400,
    };
  }

  // 3. Extract Original Order & Item Context (with resilient fallback queries)
  let originalOrder = retReq.orders as Record<string, unknown> | null;
  if (!originalOrder && retReq.order_id) {
    const { data: ordDirect } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", retReq.order_id)
      .maybeSingle();
    originalOrder = ordDirect || null;
  }

  let originalItem = retReq.order_items as Record<string, unknown> | null;
  if (!originalItem && retReq.order_item_id) {
    const { data: itemDirect } = await supabaseAdmin
      .from("order_items")
      .select("*")
      .eq("id", retReq.order_item_id)
      .maybeSingle();
    originalItem = itemDirect || null;
  }

  if (!originalOrder) {
    return { success: false, message: "Original parent order record not found.", status: 404 };
  }

  if (!originalItem) {
    return { success: false, message: "Original purchased order item record not found.", status: 404 };
  }

  const originalReturnedQty = Number(retReq.quantity || 1);

  // Compute full-tender eligible value using the shared authoritative calculation
  const walletDebitAmount = await getOrderWalletDebits(supabaseAdmin, originalOrder.id as string);
  const financialCalc = calculateFullTenderEligibleValue({
    itemUnitPrice: Number(originalItem.unit_price || 0),
    purchasedQuantity: Number(originalItem.quantity || originalReturnedQty),
    returnedQuantity: originalReturnedQty,
    orderSubtotal: Number(originalOrder.subtotal || originalItem.line_total || 0),
    orderDiscountAmount: Number(originalOrder.discount_amount || 0),
    orderTotal: Number(originalOrder.total || 0),
    walletDebitAmount,
  });

  const originalEligibleValue = financialCalc.eligibleOriginalValue;

  // 4. Resolve Selected Replacement Products
  interface ReplCandidateItem {
    productId: string;
    quantity: number;
    title?: string;
    unitPrice?: number;
    storeId?: string;
  }

  let replItemsToProcess: ReplCandidateItem[] = [];

  // Source A: return_request_replacement_items table (authoritative multi-item table)
  try {
    const { data: dbItems } = await supabaseAdmin
      .from("return_request_replacement_items")
      .select("replacement_product_id, quantity, unit_price, store_id")
      .eq("return_request_id", returnRequestId);

    if (dbItems && dbItems.length > 0) {
      replItemsToProcess = dbItems.map((d) => ({
        productId: d.replacement_product_id,
        quantity: Number(d.quantity),
        unitPrice: Number(d.unit_price),
        storeId: d.store_id || undefined,
      }));
    }
  } catch {
    // Table may not exist yet, fallback to refund_details
  }

  // Source B: refund_details JSONB replacementItems
  if (replItemsToProcess.length === 0) {
    const refundDetailsObj = (retReq.refund_details || {}) as Record<string, unknown>;
    const rawItems = (refundDetailsObj.replacementItems || []) as Array<{
      productId?: string;
      quantity?: number;
      unitPrice?: number;
      price?: number;
      title?: string;
      storeId?: string;
    }>;

    if (Array.isArray(rawItems) && rawItems.length > 0) {
      replItemsToProcess = rawItems
        .filter((it) => it.productId && Number(it.quantity) > 0)
        .map((it) => ({
          productId: it.productId!,
          quantity: Number(it.quantity || 1),
          unitPrice: Number(it.unitPrice ?? it.price ?? 0),
          title: it.title,
          storeId: it.storeId,
        }));
    }
  }

  // Source C: Single replacement_product_id
  if (replItemsToProcess.length === 0 && retReq.replacement_product_id) {
    replItemsToProcess = [
      {
        productId: retReq.replacement_product_id,
        quantity: Number(retReq.replacement_quantity || originalReturnedQty || 1),
      },
    ];
  }

  if (replItemsToProcess.length === 0) {
    return {
      success: false,
      message: "No replacement products found for this request. Please specify replacement items.",
      status: 400,
    };
  }

  // 5. Authoritatively Re-fetch Current Products from Database
  const productIds = Array.from(new Set(replItemsToProcess.map((it) => it.productId)));
  const { data: dbProducts, error: prodErr } = await supabaseAdmin
    .from("products")
    .select("id, title, price, sale_price, stock_quantity, track_inventory, allow_backorders, store_id, sku, category_id, tax_rate")
    .in("id", productIds);

  if (prodErr || !dbProducts || dbProducts.length === 0) {
    return {
      success: false,
      message: "Failed to verify catalog pricing and availability for replacement items.",
      status: 500,
    };
  }

  const prodMap = new Map(dbProducts.map((p) => [p.id, p]));

  // Verify stock & calculate authoritative replacement total
  let replacementSubtotal = 0;
  const itemsForOrderCreation: Array<{
    productId: string;
    title: string;
    quantity: number;
    sku?: string;
  }> = [];

  for (const it of replItemsToProcess) {
    const dbP = prodMap.get(it.productId);
    if (!dbP) {
      return {
        success: false,
        message: `Replacement product is no longer in store catalog (ID: ${it.productId}).`,
        status: 400,
      };
    }

    if (dbP.track_inventory && !dbP.allow_backorders) {
      const avail = dbP.stock_quantity ?? 0;
      if (avail < it.quantity) {
        return {
          success: false,
          message: `Insufficient inventory for replacement item "${dbP.title}". Requested: ${it.quantity}, Available: ${avail}.`,
          status: 409,
        };
      }
    }

    const hasDiscount = Boolean(dbP.sale_price && dbP.sale_price > 0 && dbP.sale_price < dbP.price);
    const effPrice = hasDiscount ? Number(dbP.sale_price) : Number(dbP.price);
    const lineTotal = effPrice * it.quantity;
    replacementSubtotal += lineTotal;

    itemsForOrderCreation.push({
      productId: dbP.id,
      title: dbP.title,
      quantity: it.quantity,
      sku: dbP.sku || undefined,
    });
  }

  replacementSubtotal = Number(replacementSubtotal.toFixed(2));
  const priceDifference = Number((replacementSubtotal - originalEligibleValue).toFixed(2));

  // 6. Determine Payment Method & Status for Replacement Order
  const isAdditionalPayable = priceDifference > 0;
  const orderPaymentMethod = isAdditionalPayable
    ? (retReq.replacement_payment_method || "COD")
    : "REPLACEMENT_EXCHANGE";
  const orderPaymentStatus = isAdditionalPayable
    ? (retReq.replacement_payment_status === "paid" ? "paid" : "pending")
    : "paid";

  // 7. Shipping Address extraction from original order
  const rawShippingAddr = originalOrder.shipping_address as Record<string, unknown> | null;
  const shippingAddress = {
    full_name: String(rawShippingAddr?.full_name || "Customer"),
    phone: String(rawShippingAddr?.phone || "N/A"),
    city: String(rawShippingAddr?.city || "Tarkeswar"),
    state: String(rawShippingAddr?.state || "WEST BENGAL"),
    address_line1: String(rawShippingAddr?.address_line1 || rawShippingAddr?.address1 || "Local Delivery"),
    address_line2: String(rawShippingAddr?.address_line2 || rawShippingAddr?.address2 || ""),
    postal_code: String(rawShippingAddr?.postal_code || rawShippingAddr?.zip || "712410"),
    country: "IN",
    email: String(originalOrder.email || "customer@store.com"),
  };

  // 8. Invoke Existing Normal Order Creation Pipeline
  const orderResult = await createOrderRecord({
    userId: retReq.customer_id,
    email: String(originalOrder.email || "customer@store.com"),
    shippingAddress,
    paymentMethod: orderPaymentMethod,
    paymentStatus: orderPaymentStatus,
    shippingMethod: "Replacement Exchange Delivery",
    shippingCost: 0,
    items: itemsForOrderCreation,
    idempotencyKey: cleanIdempKey,
    isReplacement: true,
    originalOrderId: originalOrder.id as string,
    originalOrderNumber: (originalOrder.order_number as string) || undefined,
    replacementRequestId: canonicalReqId,
    replacementDifference: priceDifference,
    replacementOriginalValue: originalEligibleValue,
  });

  if (!orderResult.success || !orderResult.order) {
    return {
      success: false,
      message: orderResult.message || "Failed to create replacement order record.",
      status: orderResult.status || 500,
    };
  }

  const createdOrder = orderResult.order as Record<string, unknown>;
  const newOrderId = String(createdOrder.id || "");
  const newOrderNumber = String(orderResult.order_number || createdOrder.order_number || "");

  // 9. Durably Link Parent Return Request with the New Order
  const updatedRefundDetails = {
    ...((retReq.refund_details as Record<string, unknown>) || {}),
    replacementOrderId: newOrderId,
    replacementOrderNumber: newOrderNumber,
    itemUnitPrice: financialCalc.itemUnitPrice,
    purchasedQuantity: financialCalc.purchasedQuantity,
    returnedQuantity: financialCalc.returnedQuantity,
    returnedGrossSubtotal: financialCalc.returnedGrossSubtotal,
    orderSubtotal: financialCalc.orderSubtotal,
    orderDiscountAmount: financialCalc.orderDiscountAmount,
    allocatedCouponDiscount: financialCalc.allocatedCouponDiscount,
    originalEligibleValue,
    tenderBreakdown: {
      walletDebitTender: financialCalc.walletDebitAmount,
      codOrGatewayTender: financialCalc.codOrGatewayAmount,
      totalCustomerPaid: financialCalc.totalCustomerPaid,
      allocatedWalletTender: financialCalc.allocatedWalletTender,
      allocatedCodOrGatewayTender: financialCalc.allocatedCodOrGatewayTender,
    },
    replacementSubtotal,
    calculatedPriceDifference: priceDifference,
    totalCreditDue: priceDifference < 0 ? Math.abs(priceDifference) : 0,
    customerPayable: priceDifference > 0 ? priceDifference : 0,
    alreadyCreditedAmount: Number(((retReq.refund_details as Record<string, unknown>)?.alreadyCreditedAmount ?? 0)),
    remainingCreditDue: priceDifference < 0
      ? Math.max(0, Number((Math.abs(priceDifference) - Number(((retReq.refund_details as Record<string, unknown>)?.alreadyCreditedAmount ?? 0))).toFixed(2)))
      : 0,
    walletCreditAmount: priceDifference < 0 ? Math.abs(priceDifference) : 0,
    walletCreditStatus: priceDifference < 0
      ? ((retReq.refund_details as Record<string, unknown>)?.walletCreditStatus === "CREDITED" && priceDifference === Number((retReq.refund_details as Record<string, unknown>)?.calculatedPriceDifference)
          ? "CREDITED"
          : "PENDING_VERIFICATION")
      : "NOT_APPLICABLE",
  };

  await supabaseAdmin
    .from("return_requests")
    .update({
      replacement_order_id: newOrderId,
      replacement_price_difference: priceDifference,
      refund_details: updatedRefundDetails,
      status: retReq.status === "REPLACEMENT_REQUESTED" ? "REPLACEMENT_ORDER_CREATED" : retReq.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", canonicalReqId);

  // 10. Record Timeline Events & Audit Trail
  try {
    await supabaseAdmin.from("order_timeline").insert({
      order_id: newOrderId,
      status: "REPLACEMENT_ORDER_CREATED",
      note: `Replacement order created for exchange of item from Order #${originalOrder.order_number} (Return Request #${retReq.return_number}).`,
      created_by: retReq.customer_id,
    });
  } catch (tlErr) {
    console.warn("Notice: Order timeline insert notice:", tlErr);
  }

  await insertReturnAuditLog(supabaseAdmin, {
    returnRequestId: canonicalReqId,
    actorType: "system",
    action: "REPLACEMENT_ORDER_CREATED",
    previousStatus: retReq.status,
    newStatus: retReq.status === "REPLACEMENT_REQUESTED" ? "REPLACEMENT_ORDER_CREATED" : retReq.status,
    notes: `Created persistent replacement order #${newOrderNumber} (ID: ${newOrderId}) via order pipeline.`,
    metadata: {
      newOrderId,
      newOrderNumber,
      originalOrderId: originalOrder.id,
      originalOrderNumber: originalOrder.order_number,
      replacementSubtotal,
      originalEligibleValue,
      priceDifference,
      paymentMethod: orderPaymentMethod,
      paymentStatus: orderPaymentStatus,
      itemsCount: itemsForOrderCreation.length,
    },
  });

  return {
    success: true,
    order: createdOrder,
    order_number: newOrderNumber,
    invoice_number: orderResult.invoice_number,
    is_duplicate: false,
    status: 200,
  };
}

export interface ProcessAdminRefundParams {
  returnRequestId: string;
  adminUserId: string;
  paymentReference: string;
  refundAmount?: number;
  processedAt?: string;
  notes?: string;
}

export async function processAdminReturnRefund(
  supabaseAdmin: SupabaseClient,
  params: ProcessAdminRefundParams
): Promise<{
  success: boolean;
  message: string;
  status?: number;
  refundAmount?: number;
  paymentReference?: string;
}> {
  const { returnRequestId, adminUserId, paymentReference, refundAmount, processedAt, notes } = params;

  if (!paymentReference || typeof paymentReference !== "string" || paymentReference.trim().length < 4) {
    return {
      success: false,
      message: "A valid banking payment reference ID (UTR / UPI Ref / Transaction ID / WALLET) of at least 4 characters is required.",
      status: 400,
    };
  }

  // 1. Fetch existing return request
  const { data: existing, error: existErr } = await supabaseAdmin
    .from("return_requests")
    .select("*")
    .eq("id", returnRequestId)
    .single();

  if (existErr || !existing) {
    return { success: false, message: "Return request not found.", status: 404 };
  }

  if (existing.status === "REFUND_COMPLETED") {
    return { success: false, message: "Refund has already been completed for this return request.", status: 409 };
  }

  if (existing.status !== "REFUND_PROCESSING" && existing.status !== "REFUND_APPROVED") {
    return {
      success: false,
      message: `Cannot disburse refund for return currently in ${existing.status.replace(/_/g, " ")}. The return request must be in REFUND_PROCESSING status.`,
      status: 400,
    };
  }

  const parsedDate = processedAt ? new Date(processedAt) : new Date();
  const nowIso = !isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : new Date().toISOString();
  const finalRefundAmount = refundAmount ? Number(refundAmount) : Number(existing.refund_amount || 0);

  // 2. Update return request status to REFUND_COMPLETED
  const { error: updErr } = await supabaseAdmin
    .from("return_requests")
    .update({
      status: "REFUND_COMPLETED",
      refund_amount: finalRefundAmount,
      refund_payment_reference: paymentReference.trim(),
      refund_processed_at: nowIso,
      refund_processed_by: adminUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", returnRequestId);

  if (updErr) {
    return { success: false, message: updErr.message, status: 500 };
  }

  // 3. Process Customer Wallet Refund if refund_method is WALLET or reference is WALLET
  if (
    (existing.refund_method || "").toUpperCase() === "WALLET" ||
    paymentReference.trim().toUpperCase() === "WALLET"
  ) {
    try {
      await creditCustomerWallet(supabaseAdmin, {
        customerId: existing.customer_id,
        amount: finalRefundAmount,
        type: "REFUND_WALLET_CREDIT",
        referenceType: "return_request",
        referenceId: existing.id,
        description: `Refund for return #${existing.return_number || existing.id.slice(0, 8)}`,
        idempotencyKey: `return_wallet_refund_${existing.id}`,
      });
    } catch (wErr) {
      console.error("Failed to credit customer wallet for return refund:", wErr);
    }
  }

  // 4. Financial Settlement & Ledger Sync: Order-Item-to-Settlement Adjustment
  try {
    const { data: settlement } = await supabaseAdmin
      .from("seller_settlements")
      .select("*")
      .eq("order_item_id", existing.order_item_id)
      .maybeSingle();

    const { data: orderItem } = await supabaseAdmin
      .from("order_items")
      .select("id, quantity, price, line_total, store_id")
      .eq("id", existing.order_item_id)
      .maybeSingle();

    if (settlement) {
      const totalPurchasedQty = Math.max(1, Number(orderItem?.quantity || settlement.quantity || 1));
      const returnedQty = Math.min(totalPurchasedQty, Math.max(1, Number(existing.quantity || 1)));
      const returnRatio = totalPurchasedQty > 0 ? returnedQty / totalPurchasedQty : 1;

      // Proportional seller deduction based on net payable (accounting for commission/discounts)
      const sellerDeductionPaise = Math.round(Number(settlement.net_seller_payable_paise || 0) * returnRatio);

      // Atomically debit seller balance (if released) or adjust held settlement with row locking & idempotency
      const { error: rpcErr } = await supabaseAdmin.rpc("debit_seller_balance_for_refund_atomic", {
        p_return_request_id: existing.id,
        p_order_id: existing.order_id,
        p_order_item_id: existing.order_item_id,
        p_seller_id: settlement.seller_id,
        p_deduction_paise: sellerDeductionPaise,
        p_customer_refund_paise: Math.round(finalRefundAmount * 100),
        p_admin_id: adminUserId,
        p_returned_qty: returnedQty,
        p_total_qty: totalPurchasedQty,
        p_idempotency_key: `REFUND_DEDUCTION_${existing.id}`,
      });

      if (rpcErr) {
        console.error("Seller settlement refund deduction RPC failed:", rpcErr);
      }
    }
  } catch (settleErr) {
    console.error("Seller settlement refund adjustment error:", settleErr);
  }

  // 5. Record return audit log
  await insertReturnAuditLog(supabaseAdmin, {
    returnRequestId,
    actorType: "admin",
    actorId: adminUserId,
    action: "ADMIN_REFUND_COMPLETED",
    previousStatus: existing.status,
    newStatus: "REFUND_COMPLETED",
    notes: notes || `Admin processed refund of ₹${finalRefundAmount} via ref ${paymentReference.trim()}`,
    metadata: {
      paymentReference: paymentReference.trim(),
      refundAmount: finalRefundAmount,
      refundMethod: existing.refund_method,
    },
  });

  return {
    success: true,
    message: "Refund marked as completed successfully.",
    status: 200,
    refundAmount: finalRefundAmount,
    paymentReference: paymentReference.trim(),
  };
}

