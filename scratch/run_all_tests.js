const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envFile = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const [k, v] = line.split('=');
  if (k && v) env[k.trim()] = v.trim();
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function runVerificationTests() {
  console.log("=== VERIFICATION TEST SUITE ===");

  // 1. Coupon Validation API Tests
  console.log("\n--- TEST 5: Apply Valid Coupon WELCOME10 ---");
  const resValid = await fetch('http://localhost:3000/api/coupons/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'WELCOME10', subtotal: 1000, items: [] })
  }).catch(() => null);

  if (resValid) {
    const data = await resValid.json();
    console.log("WELCOME10 Validation Result:", data);
  } else {
    console.log("Dev server not running on port 3000 yet, testing via Supabase direct logic...");
  }

  // Direct Supabase Verification of Seed Test Coupons
  const { data: coupons } = await supabase.from('coupons').select('*');
  console.log("\nDatabase Active Coupons Count:", coupons ? coupons.length : 0);
  coupons?.forEach(c => {
    console.log(`- Code: ${c.code}, Type: ${c.type}, Value: ${c.value}, MinOrder: ${c.min_order_amount}, Active: ${c.is_active}, ValidTo: ${c.valid_to}`);
  });

  // Test 10 & 11: Seller privacy RPC and Order Identifiers
  const { data: orders } = await supabase.from('orders').select('id, order_number, invoice_number, total, created_at').order('created_at', { ascending: false }).limit(3);
  console.log("\n--- TEST 10 & 11: Recent Orders & Identifiers (ORD, INV) ---");
  console.log(orders);

  const { data: orderItems } = await supabase.from('order_items').select('id, order_id, order_item_code, title, sku, quantity').order('id', { ascending: false }).limit(3);
  console.log("\n--- Order Items & Identifiers (OI, SKU) ---");
  console.log(orderItems);
}

runVerificationTests();
