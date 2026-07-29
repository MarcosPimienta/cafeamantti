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
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseService = createClient(supabaseUrl, serviceKey);
const supabaseAnon = createClient(supabaseUrl, anonKey);

async function inspect() {
  console.log("=== Inspecting cuentas_cobro using Service Role ===");
  const { data: rows, error } = await supabaseService
    .from('cuentas_cobro')
    .select('id, number, status, issuer_name, signature_type, signed_at, created_at');

  if (error) {
    console.error("Error with service role:", error);
    return;
  }
  console.log(`Total records found: ${rows.length}`);
  console.table(rows);

  if (rows.length > 0) {
    const sample = rows[0];
    console.log("\nSample row details:", sample);

    if (sample.status === 'pendiente') {
      console.log("\n=== Testing ANON update on pending row:", sample.id, "===");
      const { data: anonUpdate, error: anonErr } = await supabaseAnon
        .from('cuentas_cobro')
        .update({
          status: 'firmada',
          signed_at: new Date().toISOString()
        })
        .eq('id', sample.id);

      console.log("Anon update result error:", anonErr);
      console.log("Anon update result data:", anonUpdate);
    }
  }
}

inspect();
