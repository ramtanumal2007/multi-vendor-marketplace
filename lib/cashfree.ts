import crypto from "crypto";

export interface CashfreeCustomerDetails {
  customer_id: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone: string;
}

export interface CreateCashfreeOrderParams {
  orderId: string;
  orderAmount: number;
  orderCurrency?: string;
  customerDetails: CashfreeCustomerDetails;
  returnUrl?: string;
  notifyUrl?: string;
  orderTags?: Record<string, string>;
  orderNote?: string;
}

export interface CashfreeOrderResponse {
  cf_order_id: string;
  order_id: string;
  entity: string;
  order_currency: string;
  order_amount: number;
  order_status: "ACTIVE" | "PAID" | "EXPIRED";
  payment_session_id: string;
  order_expiry_time?: string;
  order_note?: string;
  order_tags?: Record<string, string>;
}

export interface CashfreePaymentItem {
  cf_payment_id: string | number;
  order_id: string;
  entity: string;
  payment_currency: string;
  payment_amount: number;
  payment_time: string;
  payment_status: "SUCCESS" | "FAILED" | "PENDING" | "USER_DROPPED" | "CANCELLED";
  payment_message?: string;
  payment_method?: Record<string, unknown> | string;
  bank_reference?: string;
}

export function getCashfreeAppId(): string {
  const appId =
    process.env.CASHFREE_APP_ID ||
    process.env.CASHFREE_CLIENT_ID ||
    process.env.NEXT_PUBLIC_CASHFREE_APP_ID ||
    "";
  return appId.trim();
}

export function getCashfreeSecretKey(): string {
  const secretKey =
    process.env.CASHFREE_SECRET_KEY ||
    process.env.CASHFREE_CLIENT_SECRET ||
    "";
  return secretKey.trim();
}

export function getCashfreeEnvironment(): "TEST" | "PRODUCTION" {
  const env = (
    process.env.CASHFREE_ENVIRONMENT ||
    process.env.NEXT_PUBLIC_CASHFREE_ENVIRONMENT ||
    "TEST"
  )
    .trim()
    .toUpperCase();

  return env === "PRODUCTION" || env === "PROD" || env === "LIVE"
    ? "PRODUCTION"
    : "TEST";
}

export function getCashfreeBaseUrl(): string {
  const env = getCashfreeEnvironment();
  return env === "PRODUCTION"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
}

export function getCashfreeApiVersion(): string {
  return "2023-08-01";
}

/**
 * Validates that CASHFREE_APP_ID, CASHFREE_SECRET_KEY, and CASHFREE_ENVIRONMENT are configured
 * and that credential type matches the declared CASHFREE_ENVIRONMENT.
 * CASHFREE_ENVIRONMENT remains the explicit source of truth:
 * - If PRODUCTION is declared with TEST keys, an explicit configuration error is thrown.
 * - If TEST is declared with PRODUCTION keys, an explicit configuration error is thrown.
 * - Secret keys are never exposed or logged.
 */
export function validateCashfreeConfig(): void {
  const appId = getCashfreeAppId();
  const secretKey = getCashfreeSecretKey();
  const env = getCashfreeEnvironment();

  if (!appId || !secretKey) {
    throw new Error("Cashfree credentials (CASHFREE_APP_ID or CASHFREE_SECRET_KEY) are not configured.");
  }

  const isTestAppId = appId.toUpperCase().startsWith("TEST");
  const isTestSecret = secretKey.toLowerCase().startsWith("cfsk_ma_test_");
  const isProdSecret = secretKey.toLowerCase().startsWith("cfsk_ma_prod_");

  if (env === "PRODUCTION") {
    if (isTestAppId || isTestSecret) {
      throw new Error(
        "Configuration Error: CASHFREE_ENVIRONMENT is set to PRODUCTION, but TEST/Sandbox credentials were provided. Update CASHFREE_ENVIRONMENT to TEST in your environment variables or provide production credentials."
      );
    }
  } else {
    // env === "TEST"
    if ((!isTestAppId && appId.length > 0 && !appId.includes("test")) || isProdSecret) {
      throw new Error(
        "Configuration Error: CASHFREE_ENVIRONMENT is set to TEST, but PRODUCTION credentials were provided. Update CASHFREE_ENVIRONMENT to PRODUCTION in your environment variables or provide test credentials."
      );
    }
  }
}

/**
 * Creates a Cashfree payment order server-side and returns payment_session_id
 */
export async function createCashfreeOrder(
  params: CreateCashfreeOrderParams
): Promise<CashfreeOrderResponse> {
  validateCashfreeConfig();

  const appId = getCashfreeAppId();
  const secretKey = getCashfreeSecretKey();
  const baseUrl = getCashfreeBaseUrl();

  // Format customer phone: extract 10 digits
  const cleanPhone = (params.customerDetails.customer_phone || "").replace(/\D/g, "").slice(-10);
  const safePhone = cleanPhone.length === 10 ? cleanPhone : "9999999999";

  // Sanitize customer ID (max 50 chars, alphanumeric + underscore/hyphen)
  const safeCustomerId = (params.customerDetails.customer_id || `cust_${Date.now()}`)
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .substring(0, 50);

  // Sanitize order ID (max 50 chars, alphanumeric + underscore/hyphen)
  const safeOrderId = params.orderId
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .substring(0, 50);

  const payload: Record<string, unknown> = {
    order_id: safeOrderId,
    order_amount: Math.round(params.orderAmount * 100) / 100,
    order_currency: params.orderCurrency || "INR",
    customer_details: {
      customer_id: safeCustomerId,
      customer_phone: safePhone,
      customer_name: (params.customerDetails.customer_name || "Customer").substring(0, 100),
      customer_email: params.customerDetails.customer_email || "customer@store.com",
    },
  };

  if (params.returnUrl) {
    const orderMeta: { return_url: string; notify_url?: string } = {
      return_url: params.returnUrl,
    };
    if (params.notifyUrl) {
      orderMeta.notify_url = params.notifyUrl;
    }
    payload.order_meta = orderMeta;
  }

  if (params.orderTags) {
    payload.order_tags = params.orderTags;
  }

  if (params.orderNote) {
    payload.order_note = params.orderNote.substring(0, 200);
  }

  const response = await fetch(`${baseUrl}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-version": getCashfreeApiVersion(),
      "x-client-id": appId,
      "x-client-secret": secretKey,
      "x-idempotency-key": safeOrderId,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    // If order already exists at Cashfree (HTTP 409 or conflict), safely reconcile via fetchCashfreeOrder
    if (
      response.status === 409 ||
      data.code === "order_already_exists" ||
      (typeof data.message === "string" && data.message.toLowerCase().includes("already exists"))
    ) {
      try {
        const reconciledOrder = await fetchCashfreeOrder(safeOrderId);
        if (reconciledOrder && reconciledOrder.payment_session_id) {
          // 1. Status Guard: Must be ACTIVE
          if (reconciledOrder.order_status !== "ACTIVE") {
            throw new Error(`Reconciled Cashfree order is in status '${reconciledOrder.order_status}'. Expected 'ACTIVE'.`);
          }

          // 2. Amount Guard: Exact integer paise match
          const reconciledPaise = Math.round(Number(reconciledOrder.order_amount) * 100);
          const requestedPaise = Math.round(Number(params.orderAmount) * 100);
          if (reconciledPaise !== requestedPaise) {
            throw new Error(`Reconciled Cashfree order amount (${reconciledPaise} paise) does not match requested amount (${requestedPaise} paise).`);
          }

          // 3. Currency Guard: Must match requested currency
          const reconciledCurrency = String(reconciledOrder.order_currency || "").toUpperCase();
          const requestedCurrency = String(params.orderCurrency || "INR").toUpperCase();
          if (reconciledCurrency !== requestedCurrency) {
            throw new Error(`Reconciled Cashfree order currency '${reconciledCurrency}' does not match requested '${requestedCurrency}'.`);
          }

          // 4. Fingerprint Guard: Fail-closed if requested fingerprint is missing or does not match exactly
          const existingFingerprint = reconciledOrder.order_tags?.fingerprint;
          const requestedFingerprint = params.orderTags?.fingerprint;
          if (requestedFingerprint) {
            if (!existingFingerprint || existingFingerprint !== requestedFingerprint) {
              throw new Error("Reconciled Cashfree order missing required fingerprint or fingerprint mismatch.");
            }
          }

          return reconciledOrder;
        }
      } catch (reconcileErr) {
        console.warn("Failed to reconcile existing Cashfree order on 409:", reconcileErr);
        throw reconcileErr;
      }
    }

    const errorMsg = data.message || data.error || `Cashfree order creation failed with status ${response.status}`;
    console.error("Cashfree order creation failed:", data);
    throw new Error(errorMsg);
  }

  return data as CashfreeOrderResponse;
}

/**
 * Fetches order details directly from Cashfree server
 */
export async function fetchCashfreeOrder(orderId: string): Promise<CashfreeOrderResponse> {
  validateCashfreeConfig();

  const appId = getCashfreeAppId();
  const secretKey = getCashfreeSecretKey();
  const baseUrl = getCashfreeBaseUrl();

  const safeOrderId = orderId.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 50);

  const response = await fetch(`${baseUrl}/orders/${safeOrderId}`, {
    method: "GET",
    headers: {
      "x-api-version": getCashfreeApiVersion(),
      "x-client-id": appId,
      "x-client-secret": secretKey,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || `Cashfree fetch order failed with status ${response.status}`);
  }

  return data as CashfreeOrderResponse;
}

/**
 * Fetches payment attempts for a given Cashfree order
 */
export async function fetchCashfreeOrderPayments(
  orderId: string
): Promise<CashfreePaymentItem[]> {
  validateCashfreeConfig();

  const appId = getCashfreeAppId();
  const secretKey = getCashfreeSecretKey();
  const baseUrl = getCashfreeBaseUrl();

  const safeOrderId = orderId.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 50);

  const response = await fetch(`${baseUrl}/orders/${safeOrderId}/payments`, {
    method: "GET",
    headers: {
      "x-api-version": getCashfreeApiVersion(),
      "x-client-id": appId,
      "x-client-secret": secretKey,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || `Cashfree fetch payments failed with status ${response.status}`);
  }

  return Array.isArray(data) ? data : [];
}

/**
 * Verifies Cashfree webhook signature using HMAC SHA-256 with timing-safe comparison.
 * In Cashfree API 2023-08-01:
 * Concatenates timestamp + rawBody, hashes with secretKey via HMAC SHA-256, and encodes as base64.
 */
export function verifyCashfreeWebhookSignature(
  rawBody: string,
  signature: string,
  timestamp: string
): boolean {
  try {
    const secretKey = getCashfreeSecretKey();
    if (!secretKey || !rawBody || !signature || !timestamp) {
      return false;
    }

    const signatureData = `${timestamp}${rawBody}`;
    const expectedSignature = crypto
      .createHmac("sha256", secretKey)
      .update(signatureData)
      .digest("base64");

    const expectedBuffer = Buffer.from(expectedSignature, "utf8");
    const providedBuffer = Buffer.from(signature, "utf8");

    if (expectedBuffer.length !== providedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
  } catch (err) {
    console.error("Cashfree webhook signature verification error:", err);
    return false;
  }
}

export interface CreateCashfreeRefundParams {
  orderId: string;
  refundAmount: number;
  refundId: string;
  refundNote?: string;
  refundSpeed?: "STANDARD" | "INSTANT";
}

export interface CashfreeRefundResponse {
  cf_refund_id: string | number;
  refund_id: string;
  order_id: string;
  refund_amount: number;
  refund_currency: string;
  refund_note?: string;
  status: "SUCCESS" | "PENDING" | "CANCELLED" | "FAILED";
}

/**
 * Initiates an authoritative Cashfree refund for a paid order.
 * In Cashfree API 2023-08-01:
 * POST /orders/{order_id}/refunds
 */
export async function createCashfreeRefund(
  params: CreateCashfreeRefundParams
): Promise<CashfreeRefundResponse> {
  validateCashfreeConfig();

  const appId = getCashfreeAppId();
  const secretKey = getCashfreeSecretKey();
  const baseUrl = getCashfreeBaseUrl();

  const safeOrderId = params.orderId.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 50);
  const safeRefundId = params.refundId.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 50);

  const payload = {
    refund_amount: Math.round(params.refundAmount * 100) / 100,
    refund_id: safeRefundId,
    refund_note: (params.refundNote || "Order cancellation refund").substring(0, 150),
    refund_speed: params.refundSpeed || "STANDARD",
  };

  const response = await fetch(`${baseUrl}/orders/${safeOrderId}/refunds`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-version": getCashfreeApiVersion(),
      "x-client-id": appId,
      "x-client-secret": secretKey,
      // Cashfree expects an idempotency UUID. Derive it deterministically so
      // retries of the same logical refund reuse the exact same key.
      "x-idempotency-key": (() => {
        const hex = crypto.createHash("sha256").update(`cashfree-refund:${safeRefundId}`).digest("hex");
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
      })(),
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || `Cashfree refund failed with status ${response.status}`);
  }

  return data as CashfreeRefundResponse;
}

/**
 * Fetch an existing Cashfree refund before retrying its creation.
 * Returns null only when Cashfree confirms that this refund ID does not exist.
 * Any other API/network error is thrown so callers never create a second refund
 * when the previous request's outcome is unknown.
 */
export async function fetchCashfreeRefund(params: {
  orderId: string;
  refundId: string;
}): Promise<CashfreeRefundResponse | null> {
  validateCashfreeConfig();

  const appId = getCashfreeAppId();
  const secretKey = getCashfreeSecretKey();
  const baseUrl = getCashfreeBaseUrl();
  const safeOrderId = params.orderId.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 50);
  const safeRefundId = params.refundId.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 50);

  const response = await fetch(
    `${baseUrl}/orders/${safeOrderId}/refunds/${safeRefundId}`,
    {
      method: "GET",
      headers: {
        "x-api-version": getCashfreeApiVersion(),
        "x-client-id": appId,
        "x-client-secret": secretKey,
      },
    }
  );

  if (response.status === 404) return null;

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || `Cashfree refund lookup failed with status ${response.status}`);
  }

  const status = String(data.refund_status || data.status || "PENDING").toUpperCase();
  if (!["SUCCESS", "PENDING", "CANCELLED", "FAILED"].includes(status)) {
    throw new Error(`Cashfree returned an unsupported refund status: ${status}`);
  }

  return {
    ...data,
    status,
    refund_id: String(data.refund_id || safeRefundId),
    cf_refund_id: data.cf_refund_id ?? "",
    order_id: String(data.order_id || safeOrderId),
    refund_amount: Number(data.refund_amount || 0),
    refund_currency: String(data.refund_currency || "INR"),
  } as CashfreeRefundResponse;
}
