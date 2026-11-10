/**
 * VENDOSMITH CORE RETURN & CANCELLATION POLICY
 *
 * Rules:
 * 1. Product-level policy is authoritative.
 *    Admin independently controls for EACH product:
 *    - Return Allowed (ON/OFF) & Return Window (days)
 *    - Replacement Allowed (ON/OFF) & Replacement Window (days)
 *    - Replacement Selectable (ON/OFF: can this product be selected as a replacement)
 * 2. Original purchased product policy determines whether the customer can request
 *    Return or Replacement NOW.
 * 3. Candidate replacement product eligibility determines whether it can be chosen
 *    as a replacement (Cross-category supported; candidate's window does NOT limit original item).
 * 4. Cancellation is available ONLY until order reaches SHIPPED / IN TRANSIT.
 */

export interface ProductPolicyInput {
  id?: string | null;
  categoryId?: string | null;
  categorySlug?: string | null;
  parentCategorySlug?: string | null;
  categoryName?: string | null;
  sku?: string | null;
  isCustomCake?: boolean;
  tags?: string[] | null;

  // Direct Product Policy Attributes
  return_allowed?: boolean | null;
  returnAllowed?: boolean | null;
  return_window_days?: number | null;
  returnWindowDays?: number | null;
  replacement_allowed?: boolean | null;
  replacementAllowed?: boolean | null;
  replacement_window_days?: number | null;
  replacementWindowDays?: number | null;
  replacement_selectable?: boolean | null;
  replacementSelectable?: boolean | null;
}

export type ProductPolicyMode = "ALL" | "RETURN_ONLY" | "REPLACEMENT_ONLY" | "NONE";

export interface ReturnPolicyEvaluation {
  isReturnEligible: boolean;
  returnWindowDays: number;
  isReplacementEligible: boolean;
  replacementWindowDays: number;
  isReplacementSelectable: boolean;
  mode: ProductPolicyMode;
  badgeTitle: string;
  badgeSubtitle: string;
  ineligibleReason?: string;
  isCakeCategory: boolean;
  isGroceryFoodCategory: boolean;
  source: "product" | "category" | "default";
}

/**
 * Extracts policy configuration from product tags if present.
 * Format in tags:
 *   policy:return=true|false
 *   policy:return_days=N
 *   policy:replace=true|false
 *   policy:replace_days=N
 *   policy:selectable=true|false
 */
export function parseProductPolicyFromTags(tags?: string[] | null): {
  hasTagPolicy: boolean;
  return_allowed?: boolean;
  return_window_days?: number;
  replacement_allowed?: boolean;
  replacement_window_days?: number;
  replacement_selectable?: boolean;
} {
  if (!tags || !Array.isArray(tags)) {
    return { hasTagPolicy: false };
  }

  let hasTagPolicy = false;
  let return_allowed: boolean | undefined;
  let return_window_days: number | undefined;
  let replacement_allowed: boolean | undefined;
  let replacement_window_days: number | undefined;
  let replacement_selectable: boolean | undefined;

  for (const tag of tags) {
    if (tag.startsWith("policy:return=")) {
      return_allowed = tag.replace("policy:return=", "") === "true";
      hasTagPolicy = true;
    } else if (tag.startsWith("policy:return_days=")) {
      const d = parseInt(tag.replace("policy:return_days=", ""), 10);
      if (!isNaN(d)) return_window_days = d;
      hasTagPolicy = true;
    } else if (tag.startsWith("policy:replace=")) {
      replacement_allowed = tag.replace("policy:replace=", "") === "true";
      hasTagPolicy = true;
    } else if (tag.startsWith("policy:replace_days=")) {
      const d = parseInt(tag.replace("policy:replace_days=", ""), 10);
      if (!isNaN(d)) replacement_window_days = d;
      hasTagPolicy = true;
    } else if (tag.startsWith("policy:selectable=")) {
      replacement_selectable = tag.replace("policy:selectable=", "") === "true";
      hasTagPolicy = true;
    }
  }

  return {
    hasTagPolicy,
    return_allowed,
    return_window_days,
    replacement_allowed,
    replacement_window_days,
    replacement_selectable,
  };
}

/**
 * Evaluates product return & replacement policy.
 * Product-level Admin configuration is AUTHORITATIVE.
 * If not explicitly configured at the product level, falls back gracefully.
 */
export function evaluateProductReturnPolicy(input: ProductPolicyInput): ReturnPolicyEvaluation {
  const catSlug = (input.categorySlug || "").toLowerCase().trim();
  const catName = (input.categoryName || "").toLowerCase().trim();
  const sku = (input.sku || "").toUpperCase().trim();

  const isCakeCat =
    catSlug.includes("cake") ||
    catSlug.includes("pastr") ||
    catName.includes("cake") ||
    catName.includes("pastr") ||
    sku.startsWith("CAKE-");

  const isGroceryCat =
    catSlug.includes("grocery") ||
    catSlug.includes("food") ||
    catName.includes("grocery") ||
    catName.includes("food");

  // 1. Check if product has explicit product-level policies
  const tagPolicy = parseProductPolicyFromTags(input.tags);

  const hasExplicitProductPolicy =
    input.return_allowed !== undefined ||
    input.returnAllowed !== undefined ||
    input.return_window_days !== undefined ||
    input.returnWindowDays !== undefined ||
    input.replacement_allowed !== undefined ||
    input.replacementAllowed !== undefined ||
    input.replacement_window_days !== undefined ||
    input.replacementWindowDays !== undefined ||
    input.replacement_selectable !== undefined ||
    input.replacementSelectable !== undefined ||
    tagPolicy.hasTagPolicy;

  if (hasExplicitProductPolicy) {
    const rawRetAllowed =
      input.return_allowed ??
      input.returnAllowed ??
      tagPolicy.return_allowed;
    const isReturnEligible = rawRetAllowed !== undefined ? Boolean(rawRetAllowed) : true;

    const rawRetDays =
      input.return_window_days ??
      input.returnWindowDays ??
      tagPolicy.return_window_days;
    const returnWindowDays = isReturnEligible ? (rawRetDays !== undefined ? Number(rawRetDays) : 7) : 0;

    const rawReplAllowed =
      input.replacement_allowed ??
      input.replacementAllowed ??
      tagPolicy.replacement_allowed;
    const isReplacementEligible = rawReplAllowed !== undefined ? Boolean(rawReplAllowed) : true;

    const rawReplDays =
      input.replacement_window_days ??
      input.replacementWindowDays ??
      tagPolicy.replacement_window_days;
    const replacementWindowDays = isReplacementEligible ? (rawReplDays !== undefined ? Number(rawReplDays) : 7) : 0;

    const rawSelectable =
      input.replacement_selectable ??
      input.replacementSelectable ??
      tagPolicy.replacement_selectable;
    const isReplacementSelectable = rawSelectable !== undefined ? Boolean(rawSelectable) : true;

    let mode: ProductPolicyMode = "NONE";
    let badgeTitle = "No Return / Replacement";
    let badgeSubtitle = "This product is not eligible for return or replacement.";
    let ineligibleReason: string | undefined = "Return and replacement are disabled for this product.";

    if (isReturnEligible && isReplacementEligible) {
      mode = "ALL";
      if (returnWindowDays === replacementWindowDays) {
        badgeTitle = `${returnWindowDays} Days Return & Replacement`;
      } else {
        badgeTitle = `${returnWindowDays}D Return / ${replacementWindowDays}D Replacement`;
      }
      badgeSubtitle = "Easy returns & replacements after delivery";
      ineligibleReason = undefined;
    } else if (isReturnEligible && !isReplacementEligible) {
      mode = "RETURN_ONLY";
      badgeTitle = `${returnWindowDays} Days Return`;
      badgeSubtitle = "Return eligible for refund after delivery";
      ineligibleReason = undefined;
    } else if (!isReturnEligible && isReplacementEligible) {
      mode = "REPLACEMENT_ONLY";
      badgeTitle = `${replacementWindowDays} Days Replacement`;
      badgeSubtitle = "Replacement eligible after delivery";
      ineligibleReason = undefined;
    }

    return {
      isReturnEligible,
      returnWindowDays,
      isReplacementEligible,
      replacementWindowDays,
      isReplacementSelectable,
      mode,
      badgeTitle,
      badgeSubtitle,
      ineligibleReason,
      isCakeCategory: isCakeCat,
      isGroceryFoodCategory: isGroceryCat,
      source: "product",
    };
  }

  // 2. Custom Cake fallback (perishable made-to-order)
  if (sku.startsWith("CAKE-CUSTOM-") || Boolean(input.isCustomCake)) {
    return {
      isReturnEligible: false,
      returnWindowDays: 0,
      isReplacementEligible: false,
      replacementWindowDays: 0,
      isReplacementSelectable: false,
      mode: "NONE",
      badgeTitle: "Return / Replacement unavailable",
      badgeSubtitle: "Custom bespoke cakes are prepared fresh to order and are not eligible for returns.",
      ineligibleReason: "Custom cakes are perishable and bespoke; return / replacement is unavailable.",
      isCakeCategory: true,
      isGroceryFoodCategory: false,
      source: "category",
    };
  }

  // 3. Default standard marketplace product policy (7-Day Return & Replacement)
  return {
    isReturnEligible: true,
    returnWindowDays: 7,
    isReplacementEligible: true,
    replacementWindowDays: 7,
    isReplacementSelectable: true,
    mode: "ALL",
    badgeTitle: "7 Days Return & Replacement",
    badgeSubtitle: "Easy returns & replacements after delivery",
    isCakeCategory: isCakeCat,
    isGroceryFoodCategory: isGroceryCat,
    source: "default",
  };
}

export interface ItemDeliveryEligibilityInput {
  orderInternalStatus?: string | null;
  orderFulfillmentStatus?: string | null;
  deliveredAt?: string | Date | null;
  orderUpdatedAt?: string | Date | null;
  policy: ReturnPolicyEvaluation;
  hasActiveReturnOrReplacement?: boolean;
}

export interface ItemDeliveryEligibilityResult {
  canRequest: boolean;
  canReturn: boolean;
  canReplace: boolean;
  isDelivered: boolean;
  isReturnable: boolean;
  isReplaceable: boolean;
  status: "NOT_DELIVERED" | "ELIGIBLE" | "EXPIRED" | "INELIGIBLE_CATEGORY" | "ALREADY_REQUESTED";
  displayText: string;
  daysRemaining?: number;
  returnDaysRemaining?: number;
  replacementDaysRemaining?: number;
  deliveryDate?: Date;
  returnDeadlineDate?: Date;
  replacementDeadlineDate?: Date;
  deadlineDate?: Date;
}

/**
 * Server and Client helper to check whether an order item can currently be returned or replaced.
 * Supports both object input and (order, item, hasActiveReturn) signature.
 */
export function checkItemReturnEligibility(
  orderOrInput:
    | ItemDeliveryEligibilityInput
    | {
        internal_status?: string | null;
        fulfillment_status?: string | null;
        delivered_at?: string | Date | null;
        updated_at?: string | Date | null;
      },
  item?: {
    sku?: string;
    category_id?: string;
    category?: { slug?: string; name?: string };
    products?: {
      category_id?: string;
      categories?: { slug?: string; name?: string } | null;
      tags?: string[] | null;
      return_allowed?: boolean | null;
      return_window_days?: number | null;
      replacement_allowed?: boolean | null;
      replacement_window_days?: number | null;
      replacement_selectable?: boolean | null;
    } | null;
  },
  hasActiveReturn?: boolean
): ItemDeliveryEligibilityResult {
  let input: ItemDeliveryEligibilityInput;

  if (item !== undefined) {
    const order = orderOrInput as {
      internal_status?: string | null;
      fulfillment_status?: string | null;
      delivered_at?: string | Date | null;
      updated_at?: string | Date | null;
    };
    const catObj = item.products?.categories || item.category;
    const prod = item.products;
    const policy = evaluateProductReturnPolicy({
      categoryId: prod?.category_id || item.category_id,
      categorySlug: catObj?.slug,
      categoryName: catObj?.name,
      sku: item.sku,
      tags: prod?.tags,
      return_allowed: prod?.return_allowed,
      return_window_days: prod?.return_window_days,
      replacement_allowed: prod?.replacement_allowed,
      replacement_window_days: prod?.replacement_window_days,
      replacement_selectable: prod?.replacement_selectable,
    });

    input = {
      orderInternalStatus: order.internal_status,
      orderFulfillmentStatus: order.fulfillment_status,
      deliveredAt: order.delivered_at,
      orderUpdatedAt: order.updated_at,
      policy,
      hasActiveReturnOrReplacement: hasActiveReturn,
    };
  } else {
    input = orderOrInput as ItemDeliveryEligibilityInput;
  }

  const policy = input.policy;
  const isPolicyEligible = policy.isReturnEligible || policy.isReplacementEligible;
  const iStatus = (input.orderInternalStatus || "").toUpperCase().trim();
  const fStatus = (input.orderFulfillmentStatus || "").toLowerCase().trim();
  const isDelivered = iStatus === "DELIVERED" || fStatus === "delivered";

  // 1. Ineligible policy check
  if (!isPolicyEligible) {
    return {
      canRequest: false,
      canReturn: false,
      canReplace: false,
      isDelivered,
      isReturnable: false,
      isReplaceable: false,
      status: "INELIGIBLE_CATEGORY",
      displayText: policy.badgeTitle || "Return / Replacement unavailable",
    };
  }

  // 2. Already requested check
  if (input.hasActiveReturnOrReplacement) {
    return {
      canRequest: false,
      canReturn: false,
      canReplace: false,
      isDelivered,
      isReturnable: policy.isReturnEligible,
      isReplaceable: policy.isReplacementEligible,
      status: "ALREADY_REQUESTED",
      displayText: "Return / Replacement in progress",
    };
  }

  // 3. Delivered status check
  if (!isDelivered) {
    return {
      canRequest: false,
      canReturn: false,
      canReplace: false,
      isDelivered: false,
      isReturnable: policy.isReturnEligible,
      isReplaceable: policy.isReplacementEligible,
      status: "NOT_DELIVERED",
      displayText: "Available after delivery",
    };
  }

  // 4. Exact Window Calculation using authoritative delivery timestamp
  const rawDate = input.deliveredAt || input.orderUpdatedAt;
  const deliveryDate = rawDate ? new Date(rawDate) : new Date();
  const now = new Date();

  // Return Window in ms
  const returnWindowMs = policy.isReturnEligible ? policy.returnWindowDays * 24 * 60 * 60 * 1000 : 0;
  const returnDeadlineDate = new Date(deliveryDate.getTime() + returnWindowMs);
  const returnDiffMs = returnDeadlineDate.getTime() - now.getTime();
  const isReturnWithinWindow = policy.isReturnEligible && returnDiffMs > 0;

  // Replacement Window in ms
  const replacementWindowMs = policy.isReplacementEligible ? policy.replacementWindowDays * 24 * 60 * 60 * 1000 : 0;
  const replacementDeadlineDate = new Date(deliveryDate.getTime() + replacementWindowMs);
  const replacementDiffMs = replacementDeadlineDate.getTime() - now.getTime();
  const isReplacementWithinWindow = policy.isReplacementEligible && replacementDiffMs > 0;

  const canReturn = isReturnWithinWindow;
  const canReplace = isReplacementWithinWindow;
  const canRequest = canReturn || canReplace;

  // Max deadline for display
  const maxDeadline =
    returnDeadlineDate.getTime() > replacementDeadlineDate.getTime()
      ? returnDeadlineDate
      : replacementDeadlineDate;
  const maxDiffMs = maxDeadline.getTime() - now.getTime();
  const daysRemaining = Math.max(1, Math.ceil(maxDiffMs / (24 * 60 * 60 * 1000)));

  if (!canRequest) {
    return {
      canRequest: false,
      canReturn: false,
      canReplace: false,
      isDelivered: true,
      isReturnable: policy.isReturnEligible,
      isReplaceable: policy.isReplacementEligible,
      status: "EXPIRED",
      displayText: "Return window expired",
      deliveryDate,
      returnDeadlineDate,
      replacementDeadlineDate,
      deadlineDate: maxDeadline,
    };
  }

  let displayText = "Return / Replacement";
  if (canReturn && !canReplace) displayText = "Return";
  else if (!canReturn && canReplace) displayText = "Replacement";

  return {
    canRequest: true,
    canReturn,
    canReplace,
    isDelivered: true,
    isReturnable: policy.isReturnEligible,
    isReplaceable: policy.isReplacementEligible,
    status: "ELIGIBLE",
    displayText,
    daysRemaining,
    returnDaysRemaining: isReturnWithinWindow ? Math.max(1, Math.ceil(returnDiffMs / (24 * 60 * 60 * 1000))) : 0,
    replacementDaysRemaining: isReplacementWithinWindow ? Math.max(1, Math.ceil(replacementDiffMs / (24 * 60 * 60 * 1000))) : 0,
    deliveryDate,
    returnDeadlineDate,
    replacementDeadlineDate,
    deadlineDate: maxDeadline,
  };
}

/**
 * Evaluates whether an order can be cancelled by the customer.
 * Cancellation is available only before SHIPPED / IN TRANSIT stage.
 */
export function checkOrderCancellationEligibility(order: {
  internal_status?: string | null;
  fulfillment_status?: string | null;
}): { canCancel: boolean; reason: string; isShippedOrPast: boolean } {
  const internal = (order.internal_status || "").toUpperCase().trim();
  const fulfillment = (order.fulfillment_status || "").toLowerCase().trim();

  if (internal === "CANCELLED" || fulfillment === "cancelled") {
    return { canCancel: false, reason: "Order is already cancelled.", isShippedOrPast: false };
  }

  if (internal === "DELIVERED" || fulfillment === "delivered") {
    return { canCancel: false, reason: "Order has already been delivered.", isShippedOrPast: true };
  }

  // Once shipped, in transit, or out for delivery: cancellation is disabled
  if (
    internal === "SHIPPED" ||
    internal === "IN TRANSIT" ||
    internal === "OUT FOR DELIVERY" ||
    fulfillment === "shipped"
  ) {
    return {
      canCancel: false,
      reason: "Cancellation unavailable. Your order has already been shipped and is in transit.",
      isShippedOrPast: true,
    };
  }

  // Permitted stages: ORDERED, CONFIRMED, READY TO DISPATCH
  return {
    canCancel: true,
    reason: "Order is eligible for instant cancellation.",
    isShippedOrPast: false,
  };
}
