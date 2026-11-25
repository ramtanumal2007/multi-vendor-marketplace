/**
 * VENDOSMITH EMAIL SERVICE AUTOMATED TEST SUITE
 * Verifies:
 * 1. All 9 responsive HTML email templates
 * 2. Mailjet REST API client (simulation mode, idempotency, validation)
 * 3. Event orchestrators (all 9 event dispatchers, non-fatal handling)
 * 4. Currency and entity formatting
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Ensure compiled modules are available
const compiledDir = path.resolve(__dirname, "../.test-cache/email");
if (!fs.existsSync(path.join(compiledDir, "index.js"))) {
  fs.mkdirSync(compiledDir, { recursive: true });
  console.log("Transpiling TypeScript email modules for testing...");
  execSync(
    `npx tsc --outDir "${compiledDir}" --module commonjs --target es2020 lib/email/mailjet.ts lib/email/templates.ts lib/email/events.ts lib/email/index.ts`,
    { stdio: "inherit" }
  );
}

// Load compiled modules
const emailService = require(path.join(compiledDir, "index.js"));
const {
  renderOrderConfirmationEmail,
  renderSellerNewOrderAlertEmail,
  renderPaymentSuccessEmail,
  renderPaymentFailedEmail,
  renderOrderShippedEmail,
  renderOutForDeliveryEmail,
  renderOrderDeliveredEmail,
  renderRefundProcessedEmail,
  renderSellerApprovalEmail,
  formatINR,
  sendMailjetEmail,
  notifyOrderConfirmed,
  notifySellerNewOrder,
  notifyPaymentSuccessful,
  notifyPaymentFailed,
  notifyOrderShipped,
  notifyOutForDelivery,
  notifyOrderDelivered,
  notifyRefundProcessed,
  notifySellerApproved,
} = emailService;

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function main() {
  console.log("=================================================");
  console.log("VENDOSMITH EMAIL SERVICE AUTOMATED TEST SUITE");
  console.log("=================================================\n");

  // --------------------------------------------------------------------------
  // TEST GROUP 1: Currency Formatting
  // --------------------------------------------------------------------------
  console.log("--- Group 1: Currency Formatting (formatINR) ---");
  runTest("formatINR formats numbers with ₹ and 2 decimals", () => {
    assert.strictEqual(typeof formatINR, "function");
    assert.ok(formatINR(1250).includes("1,250.00"));
    assert.ok(formatINR(0).includes("0.00"));
    assert.ok(formatINR("499.5").includes("499.50"));
    assert.ok(formatINR(100000).includes("1,00,000.00"));
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 2: HTML Email Templates Rendering
  // --------------------------------------------------------------------------
  console.log("\n--- Group 2: HTML Email Templates Rendering ---");

  const sampleItems = [
    { title: "Artisan Chocolate Truffle Cake (1kg)", quantity: 1, price: 850, total: 850 },
    { title: "Handcrafted Scented Candle", quantity: 2, price: 299, total: 598 },
  ];

  const sampleAddress = {
    fullName: "Priya Sharma",
    addressLine1: "Flat 402, Lotus Residency, MG Road",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560001",
    phone: "+91 98765 43210",
  };

  runTest("Template 1: renderOrderConfirmationEmail renders order and items", () => {
    const html = renderOrderConfirmationEmail({
      orderNumber: "ORD-2026-9812",
      customerName: "Priya Sharma",
      items: sampleItems,
      subtotal: 1448,
      shippingCost: 50,
      discount: 100,
      totalAmount: 1398,
      shippingAddress: sampleAddress,
      estimatedDeliveryDate: "28 Nov 2026",
    });

    assert.ok(html.includes("<!DOCTYPE html>"), "Missing DOCTYPE");
    assert.ok(html.includes("ORD-2026-9812"), "Missing order number");
    assert.ok(html.includes("Priya Sharma"), "Missing customer name");
    assert.ok(html.includes("Artisan Chocolate Truffle Cake"), "Missing item name");
    assert.ok(html.includes("1,398.00"), "Missing total amount");
    assert.ok(html.includes("Lotus Residency"), "Missing address line");
    assert.ok(html.includes("VENDOSMITH"), "Missing brand header");
  });

  runTest("Template 2: renderSellerNewOrderAlertEmail renders seller alert", () => {
    const html = renderSellerNewOrderAlertEmail({
      sellerName: "Baker's Delight Studio",
      storeName: "Delight Studio",
      orderNumber: "ORD-2026-9812",
      items: [sampleItems[0]],
      totalPayoutEstimate: 765,
      shippingAddress: { city: "Bengaluru", state: "Karnataka" },
    });

    assert.ok(html.includes("New Order Received!"), "Missing heading");
    assert.ok(html.includes("Baker"), "Missing seller name");
    assert.ok(html.includes("765.00"), "Missing seller earnings");
    assert.ok(html.includes("Bengaluru"), "Missing city");
  });

  runTest("Template 3: renderPaymentSuccessEmail renders receipt", () => {
    const html = renderPaymentSuccessEmail({
      customerName: "Priya Sharma",
      orderNumber: "ORD-2026-9812",
      paymentId: "cf_pay_9988221100",
      paymentMethod: "UPI",
      amount: 1398,
      paidAt: "26 Nov 2026, 00:30 IST",
    });

    assert.ok(html.includes("Payment Successful"), "Missing heading");
    assert.ok(html.includes("cf_pay_9988221100"), "Missing payment ID");
    assert.ok(html.includes("UPI"), "Missing payment method");
    assert.ok(html.includes("1,398.00"), "Missing amount");
  });

  runTest("Template 4: renderPaymentFailedEmail renders failure notice and retry", () => {
    const html = renderPaymentFailedEmail({
      customerName: "Priya Sharma",
      orderNumber: "ORD-2026-9812",
      amount: 1398,
      failureReason: "Card declined by issuing bank",
      retryUrl: "https://vendosmith.com/checkout?retry=ORD-2026-9812",
    });

    assert.ok(html.includes("Payment Unsuccessful"), "Missing heading");
    assert.ok(html.includes("Card declined by issuing bank"), "Missing reason");
    assert.ok(html.includes("Retry Payment"), "Missing retry button");
  });

  runTest("Template 5: renderOrderShippedEmail renders tracking details", () => {
    const html = renderOrderShippedEmail({
      customerName: "Priya Sharma",
      orderNumber: "ORD-2026-9812",
      courierName: "Delhivery Express",
      trackingNumber: "DLV123456789",
      trackingUrl: "https://www.delhivery.com/track/package/DLV123456789",
      estimatedDeliveryDate: "28 Nov 2026",
    });

    assert.ok(html.includes("Your Order is on the Way!"), "Missing heading");
    assert.ok(html.includes("Delhivery Express"), "Missing courier name");
    assert.ok(html.includes("DLV123456789"), "Missing tracking number");
    assert.ok(html.includes("Track Shipment"), "Missing tracking button");
  });

  runTest("Template 6: renderOutForDeliveryEmail renders out-for-delivery alert", () => {
    const html = renderOutForDeliveryEmail({
      customerName: "Priya Sharma",
      orderNumber: "ORD-2026-9812",
      deliveryAddress: "Flat 402, Lotus Residency, MG Road, Bengaluru 560001",
      courierPhone: "+91 98765 00000",
    });

    assert.ok(html.includes("Out for Delivery Today!"), "Missing heading");
    assert.ok(html.includes("+91 98765 00000"), "Missing courier phone");
    assert.ok(html.includes("Lotus Residency"), "Missing delivery address");
  });

  runTest("Template 7: renderOrderDeliveredEmail renders delivery confirmation", () => {
    const html = renderOrderDeliveredEmail({
      customerName: "Priya Sharma",
      orderNumber: "ORD-2026-9812",
      deliveredAt: "26 Nov 2026, 14:30 IST",
      reviewUrl: "https://vendosmith.com/account/orders/ORD-2026-9812/review",
    });

    assert.ok(html.includes("Delivered! We hope you love it."), "Missing heading");
    assert.ok(html.includes("ORD-2026-9812"), "Missing order number");
    assert.ok(html.includes("Rate &amp; Review Products") || html.includes("Rate & Review"), "Missing review button");
  });

  runTest("Template 8: renderRefundProcessedEmail renders refund breakdown", () => {
    const html = renderRefundProcessedEmail({
      customerName: "Priya Sharma",
      orderNumber: "ORD-2026-9812",
      refundAmount: 850,
      refundId: "cf_ref_5544332211",
      bankReference: "UTR987654321",
    });

    assert.ok(html.includes("Refund Processed Successfully"), "Missing heading");
    assert.ok(html.includes("850.00"), "Missing refund amount");
    assert.ok(html.includes("cf_ref_5544332211"), "Missing refund ID");
    assert.ok(html.includes("UTR987654321"), "Missing bank reference");
  });

  runTest("Template 9: renderSellerApprovalEmail renders merchant onboarding confirmation", () => {
    const html = renderSellerApprovalEmail({
      sellerName: "Aarav Gupta",
      businessName: "Artisan Woodworks",
      dashboardUrl: "https://vendosmith.com/seller",
    });

    assert.ok(html.includes("Welcome to VENDOSMITH!"), "Missing heading");
    assert.ok(html.includes("Artisan Woodworks"), "Missing store name");
    assert.ok(html.includes("Launch Seller Dashboard"), "Missing dashboard CTA");
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 3: Mailjet REST API Client (Simulation, Idempotency & Validation)
  // --------------------------------------------------------------------------
  console.log("\n--- Group 3: Mailjet REST API Client & Idempotency ---");

  await runAsyncTest("Simulation Mode: sendMailjetEmail returns simulated result when keys absent", async () => {
    delete process.env.MAILJET_API_KEY;
    delete process.env.MAILJET_SECRET_KEY;

    const result = await sendMailjetEmail({
      to: [{ email: "customer@example.com", name: "Test Customer" }],
      subject: "Test Order Confirmation",
      htmlContent: "<h1>Test</h1>",
      idempotencyKey: "test-unique-sim-1",
    });

    assert.strictEqual(result.success, true, "Simulation should return success: true");
    assert.strictEqual(result.simulated, true, "Should indicate simulated mode");
    assert.ok(result.messageId && result.messageId.startsWith("simulated-"), "Should generate simulation ID");
  });

  await runAsyncTest("Idempotency: duplicate dispatch returns cached result with same messageId", async () => {
    const key = `test-idempotent-${Date.now()}`;

    const first = await sendMailjetEmail({
      to: [{ email: "customer@example.com" }],
      subject: "Idempotency Test 1",
      htmlContent: "<p>Call 1</p>",
      idempotencyKey: key,
    });

    const second = await sendMailjetEmail({
      to: [{ email: "customer@example.com" }],
      subject: "Idempotency Test 2",
      htmlContent: "<p>Call 2</p>",
      idempotencyKey: key,
    });

    assert.strictEqual(first.success, true);
    assert.strictEqual(second.success, true);
    assert.strictEqual(first.messageId, second.messageId, "Message IDs must match on duplicate dispatch");
  });

  await runAsyncTest("Validation: rejects empty recipient list", async () => {
    const result = await sendMailjetEmail({
      to: [],
      subject: "No recipient",
      htmlContent: "<p>Hello</p>",
    });

    assert.strictEqual(result.success, false, "Should fail validation for empty to");
    assert.ok(result.error && result.error.includes("recipient"), "Error should explain missing recipient");
  });

  await runAsyncTest("Validation: rejects empty subject", async () => {
    const result = await sendMailjetEmail({
      to: [{ email: "customer@example.com" }],
      subject: "   ",
      htmlContent: "<p>Hello</p>",
    });

    assert.strictEqual(result.success, false, "Should fail validation for empty subject");
    assert.ok(result.error && result.error.includes("Subject"), "Error should explain missing subject");
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 4: Event Orchestrators (All 9 Events)
  // --------------------------------------------------------------------------
  console.log("\n--- Group 4: High-Level Event Orchestrators ---");

  await runAsyncTest("Event 1: notifyOrderConfirmed", async () => {
    const res = await notifyOrderConfirmed({
      orderNumber: "ORD-TEST-001",
      customerEmail: "priya@example.com",
      customerName: "Priya",
      items: sampleItems,
      subtotal: 1448,
      shippingCost: 50,
      discount: 0,
      totalAmount: 1498,
      shippingAddress: sampleAddress,
    });
    assert.strictEqual(res.success, true);
  });

  await runAsyncTest("Event 2: notifySellerNewOrder", async () => {
    const res = await notifySellerNewOrder({
      sellerEmail: "seller@example.com",
      sellerName: "Cake Master",
      orderNumber: "ORD-TEST-001",
      items: [sampleItems[0]],
      sellerEarnings: 800,
      deliveryPincode: "560001",
    });
    assert.strictEqual(res.success, true);
  });

  await runAsyncTest("Event 3: notifyPaymentSuccessful", async () => {
    const res = await notifyPaymentSuccessful({
      customerEmail: "priya@example.com",
      customerName: "Priya",
      orderNumber: "ORD-TEST-001",
      paymentId: "cf_pay_123456",
      amount: 1498,
      paymentMethod: "UPI",
    });
    assert.strictEqual(res.success, true);
  });

  await runAsyncTest("Event 4: notifyPaymentFailed", async () => {
    const res = await notifyPaymentFailed({
      customerEmail: "priya@example.com",
      customerName: "Priya",
      orderNumber: "ORD-TEST-001",
      attemptedAmount: 1498,
      failureReason: "Insufficient funds in bank account",
    });
    assert.strictEqual(res.success, true);
  });

  await runAsyncTest("Event 5: notifyOrderShipped", async () => {
    const res = await notifyOrderShipped({
      customerEmail: "priya@example.com",
      customerName: "Priya",
      orderNumber: "ORD-TEST-001",
      courierName: "Delhivery",
      trackingNumber: "DLV998877",
    });
    assert.strictEqual(res.success, true);
  });

  await runAsyncTest("Event 6: notifyOutForDelivery", async () => {
    const res = await notifyOutForDelivery({
      customerEmail: "priya@example.com",
      customerName: "Priya",
      orderNumber: "ORD-TEST-001",
      deliveryAddress: "Lotus Residency, Bengaluru",
    });
    assert.strictEqual(res.success, true);
  });

  await runAsyncTest("Event 7: notifyOrderDelivered", async () => {
    const res = await notifyOrderDelivered({
      customerEmail: "priya@example.com",
      customerName: "Priya",
      orderNumber: "ORD-TEST-001",
    });
    assert.strictEqual(res.success, true);
  });

  await runAsyncTest("Event 8: notifyRefundProcessed", async () => {
    const res = await notifyRefundProcessed({
      customerEmail: "priya@example.com",
      customerName: "Priya",
      orderNumber: "ORD-TEST-001",
      refundAmount: 850,
      refundId: "cf_ref_998877",
    });
    assert.strictEqual(res.success, true);
  });

  await runAsyncTest("Event 9: notifySellerApproved", async () => {
    const res = await notifySellerApproved({
      sellerEmail: "new-seller@example.com",
      sellerName: "Aarav",
      businessName: "Aarav Bakery",
    });
    assert.strictEqual(res.success, true);
  });

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log("\n=================================================");
  console.log(`TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unhandled test runner exception:", err);
  process.exit(1);
});
