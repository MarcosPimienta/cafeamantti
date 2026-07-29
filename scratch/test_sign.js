const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

function loadEnv() {
  const content = fs.readFileSync('.env.local', 'utf8');
  const env = {};
  content.split('\n').forEach(line => {
    const idx = line.indexOf('=');
    if (idx !== -1) {
      const key = line.substring(0, idx).trim();
      const val = line.substring(idx + 1).trim().replace(/^"|"$/g, '');
      env[key] = val;
    }
  });
  return env;
}

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabaseAnon = createClient(supabaseUrl, anonKey);

async function testAnonSign() {
  // Try to find a pending row
  const { data: rows, error: selErr } = await supabaseAnon
    .from('cuentas_cobro')
    .select('*')
    .eq('status', 'pendiente')
    .limit(1);

  if (selErr || !rows || rows.length === 0) {
    console.error("No pending rows found or select error:", selErr);
    return;
  }

  const row = rows[0];
  console.log("Found pending row to test sign:", row.id, row.number);

  const { data, error } = await supabaseAnon
    .from('cuentas_cobro')
    .update({
      status: 'firmada',
      signature_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      signature_type: 'scribble',
      signed_at: new Date().toISOString(),
      bank_name: 'Bancolombia',
      bank_account_type: 'Ahorros',
      bank_account_number: '123456789',
      issuer_name: row.issuer_name,
      issuer_document: row.issuer_document,
      issuer_email: row.issuer_email,
      issuer_phone: row.issuer_phone
    })
    .eq('id', row.id)
    .select();

  console.log("Update Error:", error);
  console.log("Update Result Data:", data);
}

testAnonSign();
