const crypto = require("crypto");

// 1. Test Webhook Signature Verification logic
function verifyCashfreeWebhookSignature(rawBody, signature, timestamp, secretKey) {
  try {
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
    console.error("Signature verification error:", err);
    return false;
  }
}

console.log("=========================================");
console.log("CASHFREE PAYMENT GATEWAY INTEGRATION TESTS");
console.log("=========================================\n");

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`❌ FAIL: ${message}`);
  }
}

// Test 1: Valid Webhook Signature Verification
const testSecret = "cf_test_secret_key_1234567890abcdef";
const testTimestamp = Math.floor(Date.now() / 1000).toString();
const testPayload = JSON.stringify({
  type: "PAYMENT_SUCCESS_WEBHOOK",
  data: {
    order: { order_id: "ORD_TEST_123", order_amount: 1499.00 },
    payment: { cf_payment_id: 987654321, payment_status: "SUCCESS" }
  },
  event_time: new Date().toISOString()
});

const validSignature = crypto
  .createHmac("sha256", testSecret)
  .update(`${testTimestamp}${testPayload}`)
  .digest("base64");

assert(
  verifyCashfreeWebhookSignature(testPayload, validSignature, testTimestamp, testSecret) === true,
  "Valid Cashfree webhook signature is accepted"
);

// Test 2: Tampered Body Rejection
const tamperedPayload = testPayload.replace("1499", "1");
assert(
  verifyCashfreeWebhookSignature(tamperedPayload, validSignature, testTimestamp, testSecret) === false,
  "Tampered webhook payload is rejected"
);

// Test 3: Invalid Secret Key Rejection
assert(
  verifyCashfreeWebhookSignature(testPayload, validSignature, testTimestamp, "wrong_secret") === false,
  "Webhook with incorrect secret key is rejected"
);

// Test 4: Tampered Timestamp Rejection
assert(
  verifyCashfreeWebhookSignature(testPayload, validSignature, "1000000000", testSecret) === false,
  "Webhook with modified timestamp is rejected"
);

// Test 5: Empty or Missing Headers
assert(
  verifyCashfreeWebhookSignature(testPayload, "", testTimestamp, testSecret) === false,
  "Missing signature is safely rejected"
);

// Test 6: Environment Resolution Check
function getCashfreeEnvironment(envVar) {
  const env = (envVar || "TEST").trim().toUpperCase();
  return env === "PRODUCTION" || env === "PROD" || env === "LIVE" ? "PRODUCTION" : "TEST";
}

assert(getCashfreeEnvironment("TEST") === "TEST", "Environment TEST resolves to TEST");
assert(getCashfreeEnvironment("sandbox") === "TEST", "Environment sandbox resolves to TEST");
assert(getCashfreeEnvironment("PRODUCTION") === "PRODUCTION", "Environment PRODUCTION resolves to PRODUCTION");
assert(getCashfreeEnvironment("prod") === "PRODUCTION", "Environment prod resolves to PRODUCTION");

// Test 7: Cashfree Base URL resolution
function getCashfreeBaseUrl(env) {
  return env === "PRODUCTION"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
}

assert(getCashfreeBaseUrl("TEST") === "https://sandbox.cashfree.com/pg", "Sandbox uses sandbox.cashfree.com/pg");
assert(getCashfreeBaseUrl("PRODUCTION") === "https://api.cashfree.com/pg", "Production uses api.cashfree.com/pg");

// Test 8: Order Idempotency Safety Invariant
console.log("\nTesting Idempotency & Stock Invariants...");
const simulatedDbOrders = new Map();
let simulatedStock = 10;

function createOrderSimulated({ idempotencyKey, items, isPaid }) {
  if (simulatedDbOrders.has(idempotencyKey)) {
    return { success: true, order: simulatedDbOrders.get(idempotencyKey), is_duplicate: true };
  }

  const requestedQty = items.reduce((acc, i) => acc + i.quantity, 0);
  if (simulatedStock < requestedQty) {
    return { success: false, message: "INSUFFICIENT_STOCK" };
  }

  // Atomic deduction
  simulatedStock -= requestedQty;
  const order = {
    id: `ord_${Date.now()}_${Math.random()}`,
    order_number: `ORD-${Date.now()}`,
    idempotency_key: idempotencyKey,
    payment_status: isPaid ? "paid" : "pending",
    items
  };
  simulatedDbOrders.set(idempotencyKey, order);
  return { success: true, order, is_duplicate: false };
}

// Initial order
const res1 = createOrderSimulated({ idempotencyKey: "chk_attempt_1", items: [{ id: "p1", quantity: 2 }], isPaid: false });
assert(res1.success === true && res1.is_duplicate === false, "Initial order created and stock decremented");
assert(simulatedStock === 8, "Stock correctly reduced from 10 to 8");

// Duplicate attempt (retry)
const res2 = createOrderSimulated({ idempotencyKey: "chk_attempt_1", items: [{ id: "p1", quantity: 2 }], isPaid: false });
assert(res2.success === true && res2.is_duplicate === true, "Duplicate attempt identified as duplicate");
assert(simulatedStock === 8, "Stock was NOT decremented again on duplicate attempt (remains 8)");
assert(res1.order.id === res2.order.id, "Returned identical order object for idempotent key");

// Test 9: Webhook Safety - Never mark paid order as failed
console.log("\nTesting Webhook Status Transition Safety...");
let orderStatus = "paid";
function handleWebhookStatus(incomingStatus) {
  if (incomingStatus === "FAILED" && orderStatus === "paid") {
    // Safety guard: Do not overwrite confirmed paid order
    return orderStatus;
  }
  if (incomingStatus === "SUCCESS") {
    orderStatus = "paid";
  } else if (incomingStatus === "FAILED") {
    orderStatus = "failed";
  }
  return orderStatus;
}

assert(handleWebhookStatus("FAILED") === "paid", "Webhook FAILED event does not overwrite already 'paid' status");

console.log(`\n=========================================`);
console.log(`TEST SUMMARY: ${passedTests}/${totalTests} tests passed (${Math.round((passedTests/totalTests)*100)}%)`);
console.log(`=========================================\n`);
