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

async function inspectSchema() {
  console.log("=== 1. COUPONS TABLE SAMPLE ROW & COLUMNS ===");
  const { data: couponData, error: couponErr } = await supabase.from('coupons').select('*').limit(1);
  console.log("Coupons query error:", couponErr);
  console.log("Coupons columns (if any row):", couponData);

  console.log("\n=== 2. PRODUCTS TABLE COLUMNS & SAMPLE ROW ===");
  const { data: prodData, error: prodErr } = await supabase.from('products').select('*').limit(1);
  console.log("Products query error:", prodErr);
  if (prodData && prodData[0]) {
    console.log("Products keys:", Object.keys(prodData[0]));
    console.log("Products sample row:", prodData[0]);
  }

  console.log("\n=== 3. ORDERS TABLE COLUMNS & SAMPLE ROW ===");
  const { data: orderData, error: orderErr } = await supabase.from('orders').select('*').limit(1);
  if (orderData && orderData[0]) {
    console.log("Orders keys:", Object.keys(orderData[0]));
    console.log("Orders sample row:", orderData[0]);
  }

  console.log("\n=== 4. ORDER_ITEMS TABLE COLUMNS & SAMPLE ROW ===");
  const { data: itemData, error: itemErr } = await supabase.from('order_items').select('*').limit(1);
  if (itemData && itemData[0]) {
    console.log("Order_items keys:", Object.keys(itemData[0]));
    console.log("Order_items sample row:", itemData[0]);
  }
}

inspectSchema();
