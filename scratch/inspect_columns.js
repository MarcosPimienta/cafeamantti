const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1].trim()] = match[2].trim();
  }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: row, error: rowErr } = await supabase.from('daily_cashflows').select('*').limit(1);
  if (rowErr) {
    console.error('Row error:', rowErr);
  } else {
    console.log('Row keys:', row && row.length > 0 ? Object.keys(row[0] || {}) : 'empty table');
  }
}
main();
