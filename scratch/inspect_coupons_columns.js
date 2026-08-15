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

async function inspectCouponsColumns() {
  // Let's perform an RPC or query or test dummy insert & rollback or select from coupons via Supabase REST API
  // Or query postgres information_schema via RPC if available, or try selecting columns
  // We can try inserting a dummy coupon and deleting it to get column names!
  const dummyCode = 'TEST_INSPECT_' + Date.now();
  const { data, error } = await supabase.from('coupons').insert({
    code: dummyCode,
    type: 'percentage',
    value: 10
  }).select();

  console.log("Dummy insert result:", data, error);
  if (data && data[0]) {
    console.log("Coupons exact column names:", Object.keys(data[0]));
    console.log("Coupons sample inserted row:", data[0]);
    // Clean up
    await supabase.from('coupons').delete().eq('code', dummyCode);
    console.log("Cleaned up dummy coupon.");
  }
}

inspectCouponsColumns();
