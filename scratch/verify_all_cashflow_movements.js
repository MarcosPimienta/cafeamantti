const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

function loadEnv() {
  const content = fs.readFileSync('.env.local', 'utf8');
  const env = {};
  content.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length === 2) {
      env[parts[0].trim()] = parts[1].trim().replace(/^"|"$/g, '');
    }
  });
  return env;
}

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  // Fetch all cashflow incomes with product linked
  const { data: incomes, error: errI } = await supabase
    .from('cashflow_incomes')
    .select('id, cashflow_id, concept, amount, inventory_id, quantity_sold, created_at')
    .not('inventory_id', 'is', null)
    .gt('quantity_sold', 0);

  if (errI) {
    console.error("Error fetching incomes:", errI);
    return;
  }

  // Fetch all movements linked to an income_id
  const { data: movements, error: errM } = await supabase
    .from('inventory_movements')
    .select('id, income_id, inventory_id, quantity, movement_date, tab_source')
    .not('income_id', 'is', null);

  if (errM) {
    console.error("Error fetching movements:", errM);
    return;
  }

  // Cross reference
  console.log(`Checking ${incomes.length} incomes and ${movements.length} movements...`);
  const missing = [];
  
  for (const inc of incomes) {
    const match = movements.find(m => m.income_id === inc.id);
    if (!match) {
      missing.push(inc);
    }
  }

  if (missing.length === 0) {
    console.log("All manual cashflow incomes with inventory links have their corresponding inventory movements!");
  } else {
    console.log("Found manual cashflow incomes MISSING inventory movements:", missing);
  }
}
check();
