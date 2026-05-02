
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ztpcfcdevjyevaztsxiu.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0cGNmY2Rldmp5ZXZhenRzeGl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4OTQwNTMsImV4cCI6MjA4OTQ3MDA1M30.jeIeccI74HxNE2-tPzXHOayhRUkl7Hd158abIYwuGfk";

async function checkMovements() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // Get inventory ID for CAFT-001
  const { data: inv } = await supabase
    .from('inventory')
    .select('id, product_name, current_stock')
    .eq('product_code', 'CAFT-001')
    .single();

  if (!inv) {
    console.log("Product CAFT-001 not found");
    return;
  }

  console.log(`Product: ${inv.product_name} | Stock Actual: ${inv.current_stock}`);

  // Get movements
  const { data: movs } = await supabase
    .from('inventory_movements')
    .select('type, quantity, reason, tab_source, created_at')
    .eq('inventory_id', inv.id)
    .order('created_at', { ascending: false });

  console.log("Movements:");
  console.log(JSON.stringify(movs, null, 2));
}

checkMovements();
