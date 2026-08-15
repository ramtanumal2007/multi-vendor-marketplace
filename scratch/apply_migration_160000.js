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

async function applyMigration() {
  console.log("Seeding test coupons...");
  const { data: c1, error: e1 } = await supabase.from('coupons').upsert([
    { code: 'WELCOME10', type: 'percentage', value: 10, min_order_amount: 0, is_active: true, target_type: 'all' },
    { code: 'FLAT50', type: 'fixed', value: 50, min_order_amount: 200, is_active: true, target_type: 'all' },
    { code: 'EXPIRED100', type: 'percentage', value: 100, min_order_amount: 0, is_active: true, target_type: 'all', valid_to: new Date(Date.now() - 864000000).toISOString() }
  ], { onConflict: 'code' }).select();

  console.log("Upserted coupons:", c1, "Error:", e1);
}

applyMigration();
