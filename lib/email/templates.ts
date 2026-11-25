/**
 * VENDOSMITH EMAIL TEMPLATES
 * Responsive, brand-styled HTML email templates for transactional e-commerce events.
 * Compatible with Gmail, Apple Mail, Outlook, and mobile clients.
 */

interface BaseTemplateOptions {
  title: string;
  preheader: string;
  bodyContent: string;
  ctaText?: string;
  ctaUrl?: string;
}

/**
 * Universal responsive email shell.
 */
export function renderBaseTemplate(opts: BaseTemplateOptions): string {
  const { title, preheader, bodyContent, ctaText, ctaUrl } = opts;
  const storeUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vendosmith.com";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAFC; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
    .container { max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border-radius: 12px; overflow: hidden; border: 1px solid #E2E8F0; margin-top: 24px; margin-bottom: 24px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background: linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%); padding: 32px 24px; text-align: center; color: #FFFFFF; }
    .logo { font-size: 24px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; margin: 0; color: #FFFFFF; text-decoration: none; }
    .badge { display: inline-block; background-color: rgba(255, 255, 255, 0.2); padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: 600; text-transform: uppercase; margin-top: 8px; letter-spacing: 1px; }
    .content { padding: 32px 28px; color: #1E293B; line-height: 1.6; }
    .content h2 { margin-top: 0; font-size: 20px; font-weight: 700; color: #0F172A; }
    .content p { font-size: 14px; color: #475569; margin: 0 0 16px 0; }
    .info-card { background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .info-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
    .btn { display: inline-block; background-color: #2563EB; color: #FFFFFF !important; font-weight: 700; font-size: 14px; text-decoration: none; padding: 12px 28px; border-radius: 8px; text-align: center; margin: 20px 0 10px 0; }
    .footer { background-color: #F8FAFC; padding: 24px; text-align: center; font-size: 12px; color: #94A3B8; border-top: 1px solid #E2E8F0; }
    .footer a { color: #64748B; text-decoration: underline; }
  </style>
</head>
<body>
  <div style="display:none;font-size:1px;color:#F8FAFC;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${escapeHtml(preheader)}
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F8FAFC;padding:16px;">
    <tr>
      <td align="center">
        <div class="container">
          <div class="header">
            <a href="${storeUrl}" class="logo">VENDOSMITH</a>
            <div class="badge">Marketplace</div>
          </div>
          <div class="content">
            ${bodyContent}
            ${ctaText && ctaUrl ? `
              <div style="text-align: center; margin-top: 24px;">
                <a href="${ctaUrl}" class="btn">${escapeHtml(ctaText)}</a>
              </div>
            ` : ""}
          </div>
          <div class="footer">
            <p style="margin: 0 0 8px 0;">Need help with your order? Contact <a href="mailto:support@vendosmith.com">support@vendosmith.com</a></p>
            <p style="margin: 0;">&copy; ${new Date().getFullYear()} VENDOSMITH Marketplace. All rights reserved.</p>
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function formatINR(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(isNaN(num) ? 0 : num);
}

// 1. ORDER CONFIRMATION (CUSTOMER)
export interface OrderItemData {
  title: string;
  quantity: number;
  price: number;
  total: number;
}

export function renderOrderConfirmationEmail(params: {
  orderNumber: string;
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
}): string {
  const { orderNumber, customerName, items, subtotal, shippingCost, discount, totalAmount, shippingAddress, estimatedDeliveryDate, trackingUrl } = params;

  const itemsHtml = items
    .map(
      (item) => `
    <tr>
      <td style="padding: 10px 0; border-bottom: 1px solid #E2E8F0; font-size: 13px; color: #1E293B;">
        <strong>${escapeHtml(item.title)}</strong> × ${item.quantity}
      </td>
      <td style="padding: 10px 0; border-bottom: 1px solid #E2E8F0; font-size: 13px; text-align: right; color: #0F172A; font-weight: 600;">
        ${formatINR(item.total)}
      </td>
    </tr>
  `
    )
    .join("");

  const bodyContent = `
    <h2>Order Confirmed! 🎉</h2>
    <p>Hi <strong>${escapeHtml(customerName)}</strong>, thank you for your purchase. We have received your order <strong>#${escapeHtml(orderNumber)}</strong> and are preparing it with our verified merchants.</p>
    
    ${estimatedDeliveryDate ? `
      <div style="background-color: #EFF6FF; border-left: 4px solid #2563EB; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
        <span style="font-size: 13px; color: #1E40AF; font-weight: 600;">Estimated Delivery: ${escapeHtml(estimatedDeliveryDate)}</span>
      </div>
    ` : ""}

    <div class="info-card">
      <h3 style="margin: 0 0 12px 0; font-size: 14px; text-transform: uppercase; color: #64748B; letter-spacing: 0.5px;">Order Summary</h3>
      <table width="100%" cellspacing="0" cellpadding="0">
        ${itemsHtml}
        <tr>
          <td style="padding: 8px 0 4px 0; font-size: 13px; color: #64748B;">Subtotal</td>
          <td style="padding: 8px 0 4px 0; font-size: 13px; text-align: right; color: #334155;">${formatINR(subtotal)}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; font-size: 13px; color: #64748B;">Delivery Fee</td>
          <td style="padding: 4px 0; font-size: 13px; text-align: right; color: #334155;">${shippingCost > 0 ? formatINR(shippingCost) : "FREE"}</td>
        </tr>
        ${discount > 0 ? `
        <tr>
          <td style="padding: 4px 0; font-size: 13px; color: #16A34A;">Discount Applied</td>
          <td style="padding: 4px 0; font-size: 13px; text-align: right; color: #16A34A;">-${formatINR(discount)}</td>
        </tr>
        ` : ""}
        <tr>
          <td style="padding: 12px 0 0 0; border-top: 2px solid #CBD5E1; font-size: 15px; font-weight: 700; color: #0F172A;">Total Paid</td>
          <td style="padding: 12px 0 0 0; border-top: 2px solid #CBD5E1; font-size: 15px; font-weight: 700; text-align: right; color: #2563EB;">${formatINR(totalAmount)}</td>
        </tr>
      </table>
    </div>

    <div class="info-card">
      <h3 style="margin: 0 0 8px 0; font-size: 14px; text-transform: uppercase; color: #64748B; letter-spacing: 0.5px;">Delivery Address</h3>
      <p style="margin: 0; font-size: 13px; color: #334155;">
        ${escapeHtml(shippingAddress.fullName || customerName)}<br>
        ${escapeHtml(shippingAddress.addressLine1 || "")}<br>
        ${escapeHtml(shippingAddress.city || "")}, ${escapeHtml(shippingAddress.state || "")} - ${escapeHtml(shippingAddress.postalCode || "")}<br>
        Phone: ${escapeHtml(shippingAddress.phone || "N/A")}
      </p>
    </div>
  `;

  return renderBaseTemplate({
    title: `Order Confirmed: #${orderNumber}`,
    preheader: `Thank you for your order #${orderNumber}. Total: ${formatINR(totalAmount)}.`,
    bodyContent,
    ctaText: trackingUrl ? "Track Order Status" : "View Order Details",
    ctaUrl: trackingUrl || `${process.env.NEXT_PUBLIC_APP_URL || "https://vendosmith.com"}/account/orders`,
  });
}

// 2. SELLER NEW ORDER ALERT
export function renderSellerNewOrderAlertEmail(params: {
  orderNumber: string;
  sellerName: string;
  storeName: string;
  items: OrderItemData[];
  totalPayoutEstimate: number;
  shippingAddress?: {
    city?: string;
    state?: string;
  };
  dashboardUrl?: string;
}): string {
  const { orderNumber, sellerName, storeName, items, totalPayoutEstimate, shippingAddress, dashboardUrl } = params;

  const itemsHtml = items
    .map(
      (item) => `
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0; font-size: 13px; color: #1E293B;">
        ${escapeHtml(item.title)}
      </td>
      <td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0; font-size: 13px; text-align: center; color: #0F172A; font-weight: 600;">
        × ${item.quantity}
      </td>
      <td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0; font-size: 13px; text-align: right; color: #0F172A; font-weight: 600;">
        ${formatINR(item.total)}
      </td>
    </tr>
  `
    )
    .join("");

  const bodyContent = `
    <h2>New Order Received! 📦</h2>
    <p>Hi <strong>${escapeHtml(sellerName)}</strong>, congratulations! A new customer order has been placed for <strong>${escapeHtml(storeName)}</strong>.</p>
    
    <div class="info-card">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
        <span style="font-size:13px;color:#64748B;">Order Reference:</span>
        <span style="font-size:13px;font-weight:700;color:#0F172A;">#${escapeHtml(orderNumber)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
        <span style="font-size:13px;color:#64748B;">Destination:</span>
        <span style="font-size:13px;font-weight:600;color:#0F172A;">${escapeHtml(shippingAddress?.city || "India")}${shippingAddress?.state ? `, ${escapeHtml(shippingAddress.state)}` : ""}</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="font-size:13px;color:#64748B;">Gross Value:</span>
        <span style="font-size:14px;font-weight:700;color:#16A34A;">${formatINR(totalPayoutEstimate)}</span>
      </div>
    </div>

    <div class="info-card">
      <h3 style="margin: 0 0 10px 0; font-size: 13px; text-transform: uppercase; color: #64748B;">Items to Prepare</h3>
      <table width="100%" cellspacing="0" cellpadding="0">
        ${itemsHtml}
      </table>
    </div>

    <p style="font-size: 13px; color: #64748B;">Please pack and dispatch these items within your store's processing window to ensure prompt fulfillment.</p>
  `;

  return renderBaseTemplate({
    title: `New Order Alert: #${orderNumber}`,
    preheader: `You have a new order #${orderNumber} for ${storeName}.`,
    bodyContent,
    ctaText: "Open Seller Dashboard",
    ctaUrl: dashboardUrl || `${process.env.NEXT_PUBLIC_APP_URL || "https://vendosmith.com"}/seller/orders`,
  });
}

// 3. PAYMENT SUCCESSFUL (CUSTOMER)
export function renderPaymentSuccessEmail(params: {
  orderNumber: string;
  customerName: string;
  paymentId: string;
  amount: number;
  paymentMethod: string;
  paidAt?: string;
}): string {
  const { orderNumber, customerName, paymentId, amount, paymentMethod, paidAt } = params;

  const bodyContent = `
    <h2>Payment Successful ✅</h2>
    <p>Hi <strong>${escapeHtml(customerName)}</strong>, your payment of <strong>${formatINR(amount)}</strong> for order <strong>#${escapeHtml(orderNumber)}</strong> has been verified successfully.</p>
    
    <div class="info-card">
      <table width="100%" cellspacing="0" cellpadding="6">
        <tr>
          <td style="font-size:13px;color:#64748B;">Transaction ID</td>
          <td style="font-size:13px;text-align:right;font-weight:600;color:#0F172A;font-family:monospace;">${escapeHtml(paymentId)}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#64748B;">Payment Mode</td>
          <td style="font-size:13px;text-align:right;font-weight:600;color:#0F172A;">${escapeHtml(paymentMethod.toUpperCase())}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#64748B;">Amount Paid</td>
          <td style="font-size:14px;text-align:right;font-weight:700;color:#16A34A;">${formatINR(amount)}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#64748B;">Timestamp</td>
          <td style="font-size:13px;text-align:right;color:#64748B;">${escapeHtml(paidAt || new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))}</td>
        </tr>
      </table>
    </div>

    <p style="font-size: 13px; color: #475569;">No further payment action is needed. Your merchants have been notified to begin preparing your shipment.</p>
  `;

  return renderBaseTemplate({
    title: `Payment Receipt: #${orderNumber}`,
    preheader: `Payment of ${formatINR(amount)} received for order #${orderNumber}.`,
    bodyContent,
    ctaText: "View Invoice & Order",
    ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://vendosmith.com"}/account/orders`,
  });
}

// 4. PAYMENT FAILED (CUSTOMER)
export function renderPaymentFailedEmail(params: {
  orderNumber: string;
  customerName: string;
  amount: number;
  failureReason?: string;
  retryUrl?: string;
}): string {
  const { orderNumber, customerName, amount, failureReason, retryUrl } = params;

  const bodyContent = `
    <h2>Payment Unsuccessful ⚠️</h2>
    <p>Hi <strong>${escapeHtml(customerName)}</strong>, we could not process the payment of <strong>${formatINR(amount)}</strong> for order <strong>#${escapeHtml(orderNumber)}</strong>.</p>
    
    <div style="background-color: #FEF2F2; border-left: 4px solid #EF4444; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
      <span style="font-size: 13px; color: #991B1B; font-weight: 600;">
        Reason: ${escapeHtml(failureReason || "Transaction declined by banking network or session expired.")}
      </span>
    </div>

    <p style="font-size: 14px; color: #475569;">Don't worry, your cart items are reserved for a short period. You can retry the payment securely using UPI, Cards, or Net Banking.</p>
  `;

  return renderBaseTemplate({
    title: `Action Required: Payment Failed for #${orderNumber}`,
    preheader: `We were unable to complete payment for order #${orderNumber}. Retry now.`,
    bodyContent,
    ctaText: "Retry Payment Now",
    ctaUrl: retryUrl || `${process.env.NEXT_PUBLIC_APP_URL || "https://vendosmith.com"}/checkout`,
  });
}

// 5. ORDER SHIPPED (CUSTOMER)
export function renderOrderShippedEmail(params: {
  orderNumber: string;
  customerName: string;
  courierName?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  estimatedDeliveryDate?: string | null;
}): string {
  const { orderNumber, customerName, courierName, trackingNumber, trackingUrl, estimatedDeliveryDate } = params;

  const bodyContent = `
    <h2>Your Order is on the Way! 🚀</h2>
    <p>Hi <strong>${escapeHtml(customerName)}</strong>, great news! Your order <strong>#${escapeHtml(orderNumber)}</strong> has been packaged and handed over to the courier partner.</p>
    
    <div class="info-card">
      <table width="100%" cellspacing="0" cellpadding="6">
        <tr>
          <td style="font-size:13px;color:#64748B;">Courier Partner</td>
          <td style="font-size:13px;text-align:right;font-weight:600;color:#0F172A;">${escapeHtml(courierName || "Standard Express Logistics")}</td>
        </tr>
        ${trackingNumber ? `
        <tr>
          <td style="font-size:13px;color:#64748B;">Tracking Number</td>
          <td style="font-size:13px;text-align:right;font-weight:600;color:#2563EB;font-family:monospace;">${escapeHtml(trackingNumber)}</td>
        </tr>
        ` : ""}
        ${estimatedDeliveryDate ? `
        <tr>
          <td style="font-size:13px;color:#64748B;">Expected Arrival</td>
          <td style="font-size:13px;text-align:right;font-weight:600;color:#16A34A;">${escapeHtml(estimatedDeliveryDate)}</td>
        </tr>
        ` : ""}
      </table>
    </div>

    <p style="font-size: 13px; color: #475569;">You can track live milestones and transit updates using the button below.</p>
  `;

  return renderBaseTemplate({
    title: `Order Shipped: #${orderNumber}`,
    preheader: `Order #${orderNumber} has shipped with ${courierName || "Express Courier"}.`,
    bodyContent,
    ctaText: trackingUrl ? "Track Shipment" : "View Order Status",
    ctaUrl: trackingUrl || `${process.env.NEXT_PUBLIC_APP_URL || "https://vendosmith.com"}/account/orders`,
  });
}

// 6. OUT FOR DELIVERY (CUSTOMER)
export function renderOutForDeliveryEmail(params: {
  orderNumber: string;
  customerName: string;
  deliveryAddress: string;
  courierPhone?: string;
}): string {
  const { orderNumber, customerName, deliveryAddress, courierPhone } = params;

  const bodyContent = `
    <h2>Out for Delivery Today! 🚚</h2>
    <p>Hi <strong>${escapeHtml(customerName)}</strong>, your package for order <strong>#${escapeHtml(orderNumber)}</strong> is out with our delivery agent and will arrive today.</p>
    
    <div class="info-card">
      <h3 style="margin:0 0 8px 0;font-size:13px;color:#64748B;text-transform:uppercase;">Delivery Destination</h3>
      <p style="margin:0;font-size:13px;color:#1E293B;">${escapeHtml(deliveryAddress)}</p>
      ${courierPhone ? `
        <div style="margin-top:8px;font-size:13px;color:#475569;">
          Agent Contact: <strong>${escapeHtml(courierPhone)}</strong>
        </div>
      ` : ""}
    </div>

    <p style="font-size:13px;color:#475569;">Please ensure someone is available at the address to receive the package.</p>
  `;

  return renderBaseTemplate({
    title: `Out for Delivery: #${orderNumber}`,
    preheader: `Your order #${orderNumber} is arriving today.`,
    bodyContent,
    ctaText: "Track Live Location",
    ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://vendosmith.com"}/account/orders`,
  });
}

// 7. ORDER DELIVERED (CUSTOMER)
export function renderOrderDeliveredEmail(params: {
  orderNumber: string;
  customerName: string;
  deliveredAt?: string;
  reviewUrl?: string;
}): string {
  const { orderNumber, customerName, deliveredAt, reviewUrl } = params;

  const bodyContent = `
    <h2>Delivered! We hope you love it. 🎁</h2>
    <p>Hi <strong>${escapeHtml(customerName)}</strong>, your order <strong>#${escapeHtml(orderNumber)}</strong> was delivered successfully on ${escapeHtml(deliveredAt || "today")}.</p>
    
    <div style="background-color:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:16px;margin:20px 0;text-align:center;">
      <span style="font-size:24px;">⭐ ⭐ ⭐ ⭐ ⭐</span>
      <p style="font-size:14px;color:#166534;margin:8px 0 0 0;font-weight:600;">How was your experience?</p>
      <p style="font-size:12px;color:#15803D;margin:4px 0 0 0;">Your feedback helps local artisans and fellow shoppers.</p>
    </div>

    <p style="font-size:13px;color:#64748B;">Eligible items may be returned or replaced within our standard 7-day policy window from delivery.</p>
  `;

  return renderBaseTemplate({
    title: `Delivered: #${orderNumber}`,
    preheader: `Your order #${orderNumber} has been delivered. Leave a review!`,
    bodyContent,
    ctaText: "Rate & Review Products",
    ctaUrl: reviewUrl || `${process.env.NEXT_PUBLIC_APP_URL || "https://vendosmith.com"}/account/orders`,
  });
}

// 8. REFUND PROCESSED (CUSTOMER)
export function renderRefundProcessedEmail(params: {
  orderNumber: string;
  customerName: string;
  refundAmount: number;
  refundId: string;
  bankReference?: string;
  processedAt?: string;
}): string {
  const { orderNumber, customerName, refundAmount, refundId, bankReference, processedAt } = params;

  const bodyContent = `
    <h2>Refund Processed Successfully 💰</h2>
    <p>Hi <strong>${escapeHtml(customerName)}</strong>, a refund of <strong>${formatINR(refundAmount)}</strong> has been initiated for return order <strong>#${escapeHtml(orderNumber)}</strong>.</p>
    
    <div class="info-card">
      <table width="100%" cellspacing="0" cellpadding="6">
        <tr>
          <td style="font-size:13px;color:#64748B;">Refund Amount</td>
          <td style="font-size:15px;text-align:right;font-weight:700;color:#16A34A;">${formatINR(refundAmount)}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#64748B;">Refund Identifier</td>
          <td style="font-size:13px;text-align:right;font-family:monospace;color:#0F172A;">${escapeHtml(refundId)}</td>
        </tr>
        ${bankReference ? `
        <tr>
          <td style="font-size:13px;color:#64748B;">Bank Reference (UTR / UPI)</td>
          <td style="font-size:13px;text-align:right;font-family:monospace;color:#2563EB;">${escapeHtml(bankReference)}</td>
        </tr>
        ` : ""}
        <tr>
          <td style="font-size:13px;color:#64748B;">Initiated On</td>
          <td style="font-size:13px;text-align:right;color:#64748B;">${escapeHtml(processedAt || new Date().toLocaleDateString("en-IN"))}</td>
        </tr>
      </table>
    </div>

    <p style="font-size:13px;color:#475569;">Depending on your issuing bank, the funds will reflect in your original payment account or wallet within 3 to 5 business days.</p>
  `;

  return renderBaseTemplate({
    title: `Refund Processed: #${orderNumber}`,
    preheader: `Refund of ${formatINR(refundAmount)} processed for order #${orderNumber}.`,
    bodyContent,
    ctaText: "Check Order & Wallet",
    ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://vendosmith.com"}/account/wallet`,
  });
}

// 9. SELLER APPLICATION APPROVED
export function renderSellerApprovalEmail(params: {
  sellerName: string;
  businessName: string;
  storeSlug?: string;
  sellerIdCode?: string;
  dashboardUrl?: string;
}): string {
  const { sellerName, businessName, storeSlug, sellerIdCode, dashboardUrl } = params;

  const bodyContent = `
    <h2>Welcome to VENDOSMITH! 🎉</h2>
    <p>Hi <strong>${escapeHtml(sellerName)}</strong>, we are thrilled to inform you that your seller application for <strong>${escapeHtml(businessName)}</strong> has been reviewed and <strong>APPROVED</strong>!</p>
    
    <div class="info-card">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
        <span style="font-size:13px;color:#64748B;">Merchant ID:</span>
        <span style="font-size:13px;font-weight:700;color:#0F172A;font-family:monospace;">${escapeHtml(sellerIdCode || "SLR-VERIFIED")}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
        <span style="font-size:13px;color:#64748B;">Tier Level:</span>
        <span style="font-size:13px;font-weight:600;color:#2563EB;">Verified Seller (BASIC Plan)</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="font-size:13px;color:#64748B;">Product Allowance:</span>
        <span style="font-size:13px;font-weight:600;color:#16A34A;">Up to 10 Active Listings</span>
      </div>
    </div>

    <h3 style="font-size:15px;color:#0F172A;margin:20px 0 8px 0;">Next Steps to Start Selling:</h3>
    <ol style="font-size:13px;color:#475569;padding-left:20px;line-height:1.7;">
      <li>Log into your Seller Dashboard using your verified email address.</li>
      <li>Customize your storefront banner, logo, and tagline.</li>
      <li>Upload your first products with photos, pricing, and stock.</li>
    </ol>
  `;

  return renderBaseTemplate({
    title: `Application Approved: Welcome to VENDOSMITH`,
    preheader: `Congratulations! ${businessName} has been approved on VENDOSMITH.`,
    bodyContent,
    ctaText: "Launch Seller Dashboard",
    ctaUrl: dashboardUrl || `${process.env.NEXT_PUBLIC_APP_URL || "https://vendosmith.com"}/seller`,
  });
}
