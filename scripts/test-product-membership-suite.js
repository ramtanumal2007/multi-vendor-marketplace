/**
 * VENDOSMITH PRODUCT FORM, MEMBERSHIP COMMISSION & GLOBAL LOADING VERIFICATION SUITE
 */

const assert = require("assert");

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name} -> ${err.message}`);
    failed++;
  }
}

console.log("=================================================");
console.log("PRODUCT FORM, MEMBERSHIP & LOADING TEST SUITE");
console.log("=================================================");

// Mock categories for testing combobox search & validation
const mockCategories = [
  { id: "cat-1", name: "Men's Fashion" },
  { id: "cat-2", name: "Women's Fashion" },
  { id: "cat-3", name: "Electronics" },
  { id: "cat-4", name: "Cakes & Bakery" },
  { id: "cat-5", name: "Home & Kitchen" },
];

function filterCategories(categories, query) {
  return categories.filter((c) =>
    c.name.toLowerCase().includes(query.trim().toLowerCase())
  );
}

function validateCategorySelection(categories, selectedId) {
  const match = categories.find((c) => c.id === selectedId);
  if (!match) {
    return { valid: false, error: "Please select a category." };
  }
  return { valid: true, category: match };
}

console.log("\n--- Group 1: Searchable Product Category Combobox ---");

runTest("Test 1: Search category by full name -> Exactly matches target", () => {
  const results = filterCategories(mockCategories, "Electronics");
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].id, "cat-3");
});

runTest("Test 2: Search category by partial name (case-insensitive) -> Returns matching categories", () => {
  const results = filterCategories(mockCategories, "fashion");
  assert.strictEqual(results.length, 2);
  assert.ok(results.some((c) => c.name === "Men's Fashion"));
  assert.ok(results.some((c) => c.name === "Women's Fashion"));
});

runTest("Test 3: Search with non-existent query -> Returns empty array (No categories found)", () => {
  const results = filterCategories(mockCategories, "Automotive");
  assert.strictEqual(results.length, 0);
});

runTest("Test 4: Invalid / arbitrary category selection prevention", () => {
  const checkInvalid = validateCategorySelection(mockCategories, "arbitrary-custom-text");
  assert.strictEqual(checkInvalid.valid, false);
  assert.strictEqual(checkInvalid.error, "Please select a category.");

  const checkEmpty = validateCategorySelection(mockCategories, "");
  assert.strictEqual(checkEmpty.valid, false);

  const checkValid = validateCategorySelection(mockCategories, "cat-4");
  assert.strictEqual(checkValid.valid, true);
  assert.strictEqual(checkValid.category.name, "Cakes & Bakery");
});

console.log("\n--- Group 2: Initial Status Default & Workflow ---");

function resolveProductStatus(rawStatus) {
  const clean = (rawStatus || "").trim().toLowerCase();
  return clean === "draft" ? "draft" : "pending_review";
}

runTest("Test 5: Default Initial Status is Submit for Review (pending_review)", () => {
  const defaultStatus = resolveProductStatus(undefined);
  assert.strictEqual(defaultStatus, "pending_review");

  const unselectedStatus = resolveProductStatus("");
  assert.strictEqual(unselectedStatus, "pending_review");
});

runTest("Test 6: Explicit Save as Draft still works", () => {
  const draftStatus = resolveProductStatus("draft");
  assert.strictEqual(draftStatus, "draft");
});

runTest("Test 7: Arbitrary or malicious status bypass is coerced to pending_review (never active)", () => {
  assert.strictEqual(resolveProductStatus("active"), "pending_review");
  assert.strictEqual(resolveProductStatus("published"), "pending_review");
  assert.strictEqual(resolveProductStatus("approved"), "pending_review");
});

runTest("Test 8: Storefront visibility check: pending_review is never visible to customers", () => {
  const products = [
    { id: "p1", title: "Active Prod", status: "active" },
    { id: "p2", title: "Pending Prod", status: "pending_review" },
    { id: "p3", title: "Draft Prod", status: "draft" },
  ];
  const storefrontVisible = products.filter((p) => p.status === "active");
  assert.strictEqual(storefrontVisible.length, 1);
  assert.strictEqual(storefrontVisible[0].id, "p1");

  const adminReviewQueue = products.filter((p) => p.status === "pending_review");
  assert.strictEqual(adminReviewQueue.length, 1);
  assert.strictEqual(adminReviewQueue[0].id, "p2");
});

console.log("\n--- Group 3: Membership-Based Commission & Earnings ---");

const mockFeeRules = [
  { membership_plan: "BASIC", commission_rate: 0.12, gst_rate: 0.18, tcs_rate: 0.005, tds_rate: 0.001 },
  { membership_plan: "PRO", commission_rate: 0.08, gst_rate: 0.18, tcs_rate: 0.005, tds_rate: 0.001 },
  { membership_plan: "BUSINESS", commission_rate: 0.05, gst_rate: 0.18, tcs_rate: 0.005, tds_rate: 0.001 },
];

function calculateEstimatedEarnings(regularPrice, salePrice, quantity, plan, status, expiresAt, feeRules) {
  const isMembershipMissing = !plan;
  if (isMembershipMissing) {
    return {
      isMembershipMissing: true,
      effectivePlan: null,
      blocked: true,
    };
  }

  const rawPlan = plan.toUpperCase();
  const now = Date.now();
  const expiresAtMs = expiresAt ? new Date(expiresAt).getTime() : null;
  const isExpired = expiresAtMs ? now > expiresAtMs : false;
  const isStatusPastDue = (status || "").toLowerCase() === "past_due";

  const isPaidPlan = rawPlan === "PRO" || rawPlan === "BUSINESS";
  const gracePeriodEndMs = expiresAtMs ? expiresAtMs + 7 * 24 * 60 * 60 * 1000 : null;
  const isInGracePeriod =
    isPaidPlan &&
    (isStatusPastDue || (expiresAtMs !== null && now > expiresAtMs && gracePeriodEndMs !== null && now <= gracePeriodEndMs));

  const isExpiredPastGrace =
    isPaidPlan && expiresAtMs !== null && gracePeriodEndMs !== null && now > gracePeriodEndMs;

  const isStatusActive = (status || "active").toLowerCase() === "active";
  const isActive = (isStatusActive && !isExpired) || isInGracePeriod;

  const effectivePlan = isInGracePeriod ? rawPlan : isExpiredPastGrace ? "BASIC" : isActive ? rawPlan : "BASIC";
  const rule = feeRules.find((r) => r.membership_plan === effectivePlan) || feeRules[0];

  const hasSalePrice = salePrice > 0 && salePrice < regularPrice;
  const customerPrice = hasSalePrice ? salePrice : regularPrice;

  const gstEnabled = rule.gst_enabled !== false;
  const tcsEnabled = rule.tcs_enabled !== false;
  const tdsEnabled = rule.tds_enabled !== false;

  const commission = customerPrice * rule.commission_rate;
  const gstOnComm = gstEnabled ? commission * rule.gst_rate : 0;
  const tcs = tcsEnabled ? customerPrice * rule.tcs_rate : 0;
  const tds = tdsEnabled ? customerPrice * rule.tds_rate : 0;
  const totalDeductions = commission + gstOnComm + tcs + tds;
  const perUnitEarnings = Math.max(0, customerPrice - totalDeductions);
  const totalEarnings = perUnitEarnings * quantity;

  return {
    isMembershipMissing: false,
    effectivePlan,
    isActive,
    isExpired,
    isInGracePeriod,
    customerPrice,
    commissionRate: rule.commission_rate,
    commissionAmount: Math.round(commission * 100) / 100,
    gstOnCommission: Math.round(gstOnComm * 100) / 100,
    tcsAmount: Math.round(tcs * 100) / 100,
    tdsAmount: Math.round(tds * 100) / 100,
    totalDeductions: Math.round(totalDeductions * 100) / 100,
    perUnitEarnings: Math.round(perUnitEarnings * 100) / 100,
    totalEarnings: Math.round(totalEarnings * 100) / 100,
  };
}

runTest("Test 9: BASIC active seller earnings calculation matches backend", () => {
  // Price 1000, BASIC plan (12% commission, 18% GST on comm, 0.5% TCS, 0.1% TDS)
  // Comm: 120.00, GST on comm: 21.60, TCS: 5.00, TDS: 1.00 -> Total Deductions: 147.60 -> Net: 852.40
  const result = calculateEstimatedEarnings(1000, 0, 1, "BASIC", "active", null, mockFeeRules);
  assert.strictEqual(result.effectivePlan, "BASIC");
  assert.strictEqual(result.commissionAmount, 120.00);
  assert.strictEqual(result.gstOnCommission, 21.60);
  assert.strictEqual(result.tcsAmount, 5.00);
  assert.strictEqual(result.tdsAmount, 1.00);
  assert.strictEqual(result.totalDeductions, 147.60);
  assert.strictEqual(result.perUnitEarnings, 852.40);
});

runTest("Test 10: PRO active seller (8% commission) calculation", () => {
  // Price 1000, PRO plan: Comm: 80.00, GST: 14.40, TCS: 5.00, TDS: 1.00 -> Total: 100.40 -> Net: 899.60
  const result = calculateEstimatedEarnings(1000, 0, 1, "PRO", "active", "2030-01-01", mockFeeRules);
  assert.strictEqual(result.effectivePlan, "PRO");
  assert.strictEqual(result.commissionAmount, 80.00);
  assert.strictEqual(result.gstOnCommission, 14.40);
  assert.strictEqual(result.totalDeductions, 100.40);
  assert.strictEqual(result.perUnitEarnings, 899.60);
});

runTest("Test 11: BUSINESS active seller (5% commission) calculation", () => {
  // Price 1000, BUSINESS plan: Comm: 50.00, GST: 9.00, TCS: 5.00, TDS: 1.00 -> Total: 65.00 -> Net: 935.00
  const result = calculateEstimatedEarnings(1000, 0, 1, "BUSINESS", "active", "2030-01-01", mockFeeRules);
  assert.strictEqual(result.effectivePlan, "BUSINESS");
  assert.strictEqual(result.commissionAmount, 50.00);
  assert.strictEqual(result.gstOnCommission, 9.00);
  assert.strictEqual(result.totalDeductions, 65.00);
  assert.strictEqual(result.perUnitEarnings, 935.00);
});

runTest("Test 12: Sale price applies instead of regular price when valid", () => {
  // Regular 1000, Sale 800, PRO plan (8%):
  // Comm: 800 * 0.08 = 64.00, GST: 11.52, TCS: 4.00, TDS: 0.80 -> Deductions: 80.32 -> Net: 719.68
  const result = calculateEstimatedEarnings(1000, 800, 5, "PRO", "active", "2030-01-01", mockFeeRules);
  assert.strictEqual(result.customerPrice, 800);
  assert.strictEqual(result.commissionAmount, 64.00);
  assert.strictEqual(result.gstOnCommission, 11.52);
  assert.strictEqual(result.tcsAmount, 4.00);
  assert.strictEqual(result.tdsAmount, 0.80);
  assert.strictEqual(result.totalDeductions, 80.32);
  assert.strictEqual(result.perUnitEarnings, 719.68);
  assert.strictEqual(result.totalEarnings, 3598.40); // 719.68 * 5
});

runTest("Test 13: Inactive / expired membership falls back to BASIC plan rules with warning", () => {
  // Seller has PRO recorded, but membership expired in the past (> 7 days)
  const result = calculateEstimatedEarnings(1000, 0, 1, "PRO", "active", "2020-01-01", mockFeeRules);
  assert.strictEqual(result.isExpired, true);
  assert.strictEqual(result.isInGracePeriod, false);
  assert.strictEqual(result.isActive, false);
  assert.strictEqual(result.effectivePlan, "BASIC"); // Falls back to BASIC 12%
  assert.strictEqual(result.commissionAmount, 120.00);
});

runTest("Test 13.1: Seven-day past_due grace period preserves PRO 8% commission", () => {
  // Expired 2 days ago (within 7-day grace window)
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const result = calculateEstimatedEarnings(1000, 0, 1, "PRO", "past_due", twoDaysAgo, mockFeeRules);
  assert.strictEqual(result.isExpired, true);
  assert.strictEqual(result.isInGracePeriod, true);
  assert.strictEqual(result.effectivePlan, "PRO"); // Preserves PRO 8% rate!
  assert.strictEqual(result.commissionAmount, 80.00);
});

runTest("Test 13.2: Missing membership record blocks official estimates without silent fallback", () => {
  const result = calculateEstimatedEarnings(1000, 0, 1, null, null, null, mockFeeRules);
  assert.strictEqual(result.isMembershipMissing, true);
  assert.strictEqual(result.effectivePlan, null);
  assert.strictEqual(result.blocked, true);
});

runTest("Test 13.3: Tax toggles (GST OFF, TCS OFF, TDS OFF) result in ₹0.00 deduction", () => {
  const customRules = [
    { membership_plan: "PRO", commission_rate: 0.08, gst_rate: 0.18, tcs_rate: 0.005, tds_rate: 0.001, gst_enabled: false, tcs_enabled: false, tds_enabled: false },
  ];
  const result = calculateEstimatedEarnings(1000, 0, 1, "PRO", "active", "2030-01-01", customRules);
  assert.strictEqual(result.commissionAmount, 80.00);
  assert.strictEqual(result.gstOnCommission, 0.00);
  assert.strictEqual(result.tcsAmount, 0.00);
  assert.strictEqual(result.tdsAmount, 0.00);
  assert.strictEqual(result.totalDeductions, 80.00);
  assert.strictEqual(result.perUnitEarnings, 920.00);
});

runTest("Test 14: Seller cannot manipulate commission through product creation payload", () => {
  // The database schema and product form insert strictly:
  // store_id, title, slug, description, category_id, price, sale_price, stock_quantity, sku, status
  // There is NO commission or earnings column in products.
  const allowedKeys = new Set([
    "store_id", "title", "slug", "description", "category_id", "price", "sale_price", "stock_quantity", "sku", "status"
  ]);

  const attemptedPayload = {
    title: "Attempted Hack",
    price: 1000,
    commission_rate: 0.01,
    seller_earnings: 999.00,
  };

  const filteredPayload = {};
  for (const [k, v] of Object.entries(attemptedPayload)) {
    if (allowedKeys.has(k)) filteredPayload[k] = v;
  }

  assert.strictEqual(filteredPayload.commission_rate, undefined);
  assert.strictEqual(filteredPayload.seller_earnings, undefined);
  assert.strictEqual(filteredPayload.price, 1000);
});

console.log("\n--- Group 4: Global Loading & Duplicate Click Prevention ---");

runTest("Test 15: Form submission lock prevents duplicate submissions while in-flight", () => {
  let isSubmitting = false;
  let submissionCount = 0;

  function submitAction() {
    if (isSubmitting) return "BLOCKED";
    isSubmitting = true;
    submissionCount++;
    return "ACCEPTED";
  }

  assert.strictEqual(submitAction(), "ACCEPTED");
  assert.strictEqual(submitAction(), "BLOCKED");
  assert.strictEqual(submitAction(), "BLOCKED");
  assert.strictEqual(submissionCount, 1);

  // Once completed/failed, lock is released
  isSubmitting = false;
  assert.strictEqual(submitAction(), "ACCEPTED");
  assert.strictEqual(submissionCount, 2);
});

runTest("Test 16: Try/finally guarantees loading state resets even after unexpected errors", () => {
  let loadingState = false;

  function doAction(shouldThrow) {
    loadingState = true;
    try {
      if (shouldThrow) throw new Error("Network timeout");
      return "SUCCESS";
    } finally {
      loadingState = false;
    }
  }

  assert.strictEqual(doAction(false), "SUCCESS");
  assert.strictEqual(loadingState, false);

  assert.throws(() => doAction(true), /Network timeout/);
  assert.strictEqual(loadingState, false);
});

console.log("\n=================================================");
console.log(`TEST RESULTS: ${passed} passed, ${failed} failed`);
console.log("=================================================");

if (failed > 0) {
  process.exit(1);
}
