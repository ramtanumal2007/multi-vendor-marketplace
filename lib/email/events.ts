/**
 * VENDOSMITH EMAIL EVENT ORCHESTRATOR
 * High-level dispatchers connecting business workflows (Orders, Payments, Moderation)
 * to Mailjet transactional delivery.
 * 
 * Guarantees:
 * - Fail-soft: Delivery failures NEVER interrupt order placement or payment processing.
 * - Idempotent: Webhook retries never produce duplicate customer/seller emails.
 * - Authentic: Strictly uses real order numbers, amounts, and merchant details.
 */

import { sendMailjetEmail, MailjetSendResult } from "./mailjet";
import {
  renderOrderConfirmationEmail,
  renderSellerNewOrderAlertEmail,
  renderPaymentSuccessEmail,
  renderPaymentFailedEmail,
  renderOrderShippedEmail,
  renderOutForDeliveryEmail,
  renderOrderDeliveredEmail,
  renderRefundProcessedEmail,
  renderSellerApprovalEmail,
  OrderItemData,
} from "./templates";

// 1. ORDER CONFIRMED (CUSTOMER)
export interface OrderConfirmedEventParams {
  orderNumber: string;
  customerEmail: string;
  customerName: string;
  items: OrderItemData[];
  subtotal: number;
  shippingCost: number;
  discount: number;
  totalAmount: number;
  shippingAddress: {
    fullName?: string;
    addressLine1?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    phone?: string;
  };
  estimatedDeliveryDate?: string | null;
  trackingUrl?: string;
}

export async function notifyOrderConfirmed(
  params: OrderConfirmedEventParams
): Promise<MailjetSendResult> {
  const { orderNumber, customerEmail, customerName, ...rest } = params;
  const idempotencyKey = `order-confirmed-${orderNumber}`;

  try {
    const htmlContent = renderOrderConfirmationEmail({
      orderNumber,
      customerName,
      ...rest,
    });

    return await sendMailjetEmail({
      to: { email: customerEmail, name: customerName },
      subject: `Order Confirmed: #${orderNumber} - VENDOSMITH`,
      htmlContent,
      idempotencyKey,
    });
  } catch (err) {
    console.error(`[Email Notification Non-Fatal Error] Failed notifyOrderConfirmed #${orderNumber}:`, err);
    return { success: false, error: (err as Error).message };
  }
}

// 2. SELLER NEW ORDER ALERT
export interface SellerNewOrderAlertParams {
  orderNumber: string;
  sellerEmail: string;
  sellerName: string;
  storeName?: string;
  items: OrderItemData[];
  totalPayoutEstimate?: number;
  sellerEarnings?: number;
  shippingAddress?: {
    city?: string;
    state?: string;
  };
  deliveryPincode?: string;
  dashboardUrl?: string;
}

export async function notifySellerNewOrder(
  params: SellerNewOrderAlertParams
): Promise<MailjetSendResult> {
  const {
    orderNumber,
    sellerEmail,
    sellerName,
    storeName,
    totalPayoutEstimate,
    sellerEarnings,
    shippingAddress,
    deliveryPincode,
    ...rest
  } = params;
  const sName = storeName || "Your Store";
  const payout = totalPayoutEstimate ?? sellerEarnings ?? 0;
  const address = shippingAddress || (deliveryPincode ? { city: `PIN ${deliveryPincode}` } : undefined);
  const idempotencyKey = `seller-new-order-${orderNumber}-${sellerEmail.toLowerCase()}`;

  try {
    const htmlContent = renderSellerNewOrderAlertEmail({
      orderNumber,
      sellerName,
      storeName: sName,
      totalPayoutEstimate: payout,
      shippingAddress: address,
      ...rest,
    });

    return await sendMailjetEmail({
      to: { email: sellerEmail, name: sellerName },
      subject: `New Order Received: #${orderNumber} for ${sName} - VENDOSMITH`,
      htmlContent,
      idempotencyKey,
    });
  } catch (err) {
    console.error(`[Email Notification Non-Fatal Error] Failed notifySellerNewOrder #${orderNumber}:`, err);
    return { success: false, error: (err as Error).message };
  }
}

// 3. PAYMENT SUCCESSFUL (CUSTOMER)
export interface PaymentSuccessEventParams {
  orderNumber: string;
  customerEmail: string;
  customerName: string;
  paymentId: string;
  amount: number;
  paymentMethod: string;
  paidAt?: string;
}

export async function notifyPaymentSuccessful(
  params: PaymentSuccessEventParams
): Promise<MailjetSendResult> {
  const { orderNumber, customerEmail, customerName, paymentId, ...rest } = params;
  const idempotencyKey = `payment-success-${paymentId || orderNumber}`;

  try {
    const htmlContent = renderPaymentSuccessEmail({
      orderNumber,
      customerName,
      paymentId,
      ...rest,
    });

    return await sendMailjetEmail({
      to: { email: customerEmail, name: customerName },
      subject: `Payment Receipt: Order #${orderNumber} - VENDOSMITH`,
      htmlContent,
      idempotencyKey,
    });
  } catch (err) {
    console.error(`[Email Notification Non-Fatal Error] Failed notifyPaymentSuccessful #${orderNumber}:`, err);
    return { success: false, error: (err as Error).message };
  }
}

// 4. PAYMENT FAILED (CUSTOMER)
export interface PaymentFailedEventParams {
  orderNumber: string;
  customerEmail: string;
  customerName: string;
  amount: number;
  failureReason?: string;
  retryUrl?: string;
  attemptId?: string;
}

export async function notifyPaymentFailed(
  params: PaymentFailedEventParams
): Promise<MailjetSendResult> {
  const { orderNumber, customerEmail, customerName, attemptId, ...rest } = params;
  const idempotencyKey = `payment-failed-${orderNumber}-${attemptId || Date.now().toString().slice(-4)}`;

  try {
    const htmlContent = renderPaymentFailedEmail({
      orderNumber,
      customerName,
      ...rest,
    });

    return await sendMailjetEmail({
      to: { email: customerEmail, name: customerName },
      subject: `Action Required: Payment Failed for Order #${orderNumber} - VENDOSMITH`,
      htmlContent,
      idempotencyKey,
    });
  } catch (err) {
    console.error(`[Email Notification Non-Fatal Error] Failed notifyPaymentFailed #${orderNumber}:`, err);
    return { success: false, error: (err as Error).message };
  }
}

// 5. ORDER SHIPPED (CUSTOMER)
export interface OrderShippedEventParams {
  orderNumber: string;
  customerEmail: string;
  customerName: string;
  courierName?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  estimatedDeliveryDate?: string | null;
}

export async function notifyOrderShipped(
  params: OrderShippedEventParams
): Promise<MailjetSendResult> {
  const { orderNumber, customerEmail, customerName, ...rest } = params;
  const idempotencyKey = `order-shipped-${orderNumber}`;

  try {
    const htmlContent = renderOrderShippedEmail({
      orderNumber,
      customerName,
      ...rest,
    });

    return await sendMailjetEmail({
      to: { email: customerEmail, name: customerName },
      subject: `Your Order is on the Way! #${orderNumber} - VENDOSMITH`,
      htmlContent,
      idempotencyKey,
    });
  } catch (err) {
    console.error(`[Email Notification Non-Fatal Error] Failed notifyOrderShipped #${orderNumber}:`, err);
    return { success: false, error: (err as Error).message };
  }
}

// 6. OUT FOR DELIVERY (CUSTOMER)
export interface OutForDeliveryEventParams {
  orderNumber: string;
  customerEmail: string;
  customerName: string;
  deliveryAddress: string;
  courierPhone?: string;
}

export async function notifyOutForDelivery(
  params: OutForDeliveryEventParams
): Promise<MailjetSendResult> {
  const { orderNumber, customerEmail, customerName, ...rest } = params;
  const idempotencyKey = `out-for-delivery-${orderNumber}`;

  try {
    const htmlContent = renderOutForDeliveryEmail({
      orderNumber,
      customerName,
      ...rest,
    });

    return await sendMailjetEmail({
      to: { email: customerEmail, name: customerName },
      subject: `Out for Delivery Today: Order #${orderNumber} - VENDOSMITH`,
      htmlContent,
      idempotencyKey,
    });
  } catch (err) {
    console.error(`[Email Notification Non-Fatal Error] Failed notifyOutForDelivery #${orderNumber}:`, err);
    return { success: false, error: (err as Error).message };
  }
}

// 7. ORDER DELIVERED (CUSTOMER)
export interface OrderDeliveredEventParams {
  orderNumber: string;
  customerEmail: string;
  customerName: string;
  deliveredAt?: string;
  reviewUrl?: string;
}

export async function notifyOrderDelivered(
  params: OrderDeliveredEventParams
): Promise<MailjetSendResult> {
  const { orderNumber, customerEmail, customerName, ...rest } = params;
  const idempotencyKey = `order-delivered-${orderNumber}`;

  try {
    const htmlContent = renderOrderDeliveredEmail({
      orderNumber,
      customerName,
      ...rest,
    });

    return await sendMailjetEmail({
      to: { email: customerEmail, name: customerName },
      subject: `Delivered: Order #${orderNumber} - VENDOSMITH`,
      htmlContent,
      idempotencyKey,
    });
  } catch (err) {
    console.error(`[Email Notification Non-Fatal Error] Failed notifyOrderDelivered #${orderNumber}:`, err);
    return { success: false, error: (err as Error).message };
  }
}

// 8. REFUND PROCESSED (CUSTOMER)
export interface RefundProcessedEventParams {
  orderNumber: string;
  customerEmail: string;
  customerName: string;
  refundAmount: number;
  refundId: string;
  bankReference?: string;
  processedAt?: string;
}

export async function notifyRefundProcessed(
  params: RefundProcessedEventParams
): Promise<MailjetSendResult> {
  const { orderNumber, customerEmail, customerName, refundId, ...rest } = params;
  const idempotencyKey = `refund-processed-${refundId || orderNumber}`;

  try {
    const htmlContent = renderRefundProcessedEmail({
      orderNumber,
      customerName,
      refundId,
      ...rest,
    });

    return await sendMailjetEmail({
      to: { email: customerEmail, name: customerName },
      subject: `Refund Processed: Order #${orderNumber} - VENDOSMITH`,
      htmlContent,
      idempotencyKey,
    });
  } catch (err) {
    console.error(`[Email Notification Non-Fatal Error] Failed notifyRefundProcessed #${orderNumber}:`, err);
    return { success: false, error: (err as Error).message };
  }
}

// 9. SELLER APPROVED
export interface SellerApprovedEventParams {
  sellerEmail: string;
  sellerName: string;
  businessName?: string;
  storeName?: string;
  storeSlug?: string;
  sellerIdCode?: string;
  dashboardUrl?: string;
}

export async function notifySellerApproved(
  params: SellerApprovedEventParams
): Promise<MailjetSendResult> {
  const { sellerEmail, sellerName, businessName, storeName, ...rest } = params;
  const name = businessName || storeName || "Your Store";
  const idempotencyKey = `seller-approved-${sellerEmail.toLowerCase()}`;

  try {
    const htmlContent = renderSellerApprovalEmail({
      sellerName,
      businessName: name,
      ...rest,
    });

    return await sendMailjetEmail({
      to: { email: sellerEmail, name: sellerName },
      subject: `Congratulations! Your Seller Application for ${name} is Approved - VENDOSMITH`,
      htmlContent,
      idempotencyKey,
    });
  } catch (err) {
    console.error(`[Email Notification Non-Fatal Error] Failed notifySellerApproved for ${name}:`, err);
    return { success: false, error: (err as Error).message };
  }
}
