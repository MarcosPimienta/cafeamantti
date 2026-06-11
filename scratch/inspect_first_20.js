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
      income_id,
      inventory ( product_code, product_name, unit )
    `)
    .eq('tab_source', 'salida')
    .order('movement_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error fetching:", error);
    return;
  }
  console.log("Total movements returned:", data.length);
  console.log("First 20 movements:");
  data.slice(0, 20).forEach((m, idx) => {
    console.log(`[${idx}] date: ${m.movement_date}, created_at: ${m.created_at}, reason: ${m.reason}, income_id: ${m.income_id}`);
  });
}
inspect();
