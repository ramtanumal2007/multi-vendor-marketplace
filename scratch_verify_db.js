const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, ".env.local");
const envContent = fs.readFileSync(envPath, "utf8");

let supabaseUrl = "";
let serviceRoleKey = "";

envContent.split("\n").forEach((line) => {
  if (line.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) {
    supabaseUrl = line.replace("NEXT_PUBLIC_SUPABASE_URL=", "").trim();
  }
  if (line.startsWith("SUPABASE_SERVICE_ROLE_KEY=")) {
    serviceRoleKey = line.replace("SUPABASE_SERVICE_ROLE_KEY=", "").trim();
  }
});

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function verify() {
  console.log("=== DB DATA VERIFICATION ===");

  // 1. Check Profiles
  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("id, full_name, customer_id_code, role, created_at")
    .limit(10);
  console.log("\n1. Sample Profiles (Customer ID):");
  if (profErr) console.error("Profile Error:", profErr);
  else console.table(profiles);

  // 2. Check Orders
  const { data: orders, error: ordErr } = await supabase
    .from("orders")
    .select("id, order_number, invoice_number, user_id, total, payment_status, internal_status, created_at")
    .limit(10);
  console.log("\n2. Sample Orders (ORD -> INV mapping):");
  if (ordErr) console.error("Order Error:", ordErr);
  else console.table(orders);

  // 3. Check Order Items
  const { data: items, error: itemErr } = await supabase
    .from("order_items")
    .select("id, order_id, order_item_code, title, sku, quantity, unit_price, line_total")
    .limit(10);
  console.log("\n3. Sample Order Items (OI codes & SKU snapshot):");
  if (itemErr) console.error("Item Error:", itemErr);
  else console.table(items);

  // 4. Test RPC get_seller_orders if available
  const { data: sellerOrders, error: rpcErr } = await supabase.rpc("get_seller_orders");
  console.log("\n4. Seller Privacy RPC Test:");
  if (rpcErr) console.log("RPC Error (seller context required):", rpcErr.message);
  else console.log("RPC Result Count:", sellerOrders?.length);
}

verify();
