const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = "https://ztpcfcdevjyevaztsxiu.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0cGNmY2Rldmp5ZXZhenRzeGl1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg5NDA1MywiZXhwIjoyMDg5NDcwMDUzfQ.xjulwENzR4DElhuOnDDSe2zAhxzaJ91TXKMzbSQCwBw";
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
  const { data, error } = await supabase
    .from('inventory_movements')
    .select(`
      id, inventory_id, type, quantity, reason, lote,
      movement_date, responsable, entry_type, tab_source, created_at,
      production_batch_id,
      inventory ( product_code, product_name, unit )
    `)
    .eq('tab_source', 'salida')
    .order('movement_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error("Error fetching:", error);
    return;
  }
  console.log("Total movements returned by getMovementsByTab('salida'):", data.length);
  const found = data.find(m => m.id === '5f1f9fc9-b3c2-4760-b05a-7564e645df8c');
  if (found) {
    console.log("FOUND our movement inside the returned list! Details:", found);
    const index = data.indexOf(found);
    console.log("Index of our movement:", index);
  } else {
    console.log("NOT FOUND our movement inside the returned list!");
  }
}
inspect();
