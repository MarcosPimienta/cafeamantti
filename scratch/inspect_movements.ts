import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ztpcfcdevjyevaztsxiu.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0cGNmY2Rldmp5ZXZhenRzeGl1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg5NDA1MywiZXhwIjoyMDg5NDcwMDUzfQ.xjulwENzR4DElhuOnDDSe2zAhxzaJ91TXKMzbSQCwBw";

async function inspect() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // Get cashflow incomes that have inventory_id
  const { data: incomes, error: incErr } = await supabase
    .from('cashflow_incomes')
    .select('id, concept, category, amount, inventory_id, quantity_sold');
  console.log("Incomes with inventory_id:\n", JSON.stringify(incomes?.filter(i => i.inventory_id), null, 2));

  // Get inventory movements that have tab_source = 'salida' or income_id
  const { data: movements, error: movErr } = await supabase
    .from('inventory_movements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log("\nLast 10 inventory movements:\n", JSON.stringify(movements, null, 2));
}

inspect();
