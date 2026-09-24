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
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
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
