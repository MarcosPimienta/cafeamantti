import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ztpcfcdevjyevaztsxiu.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0cGNmY2Rldmp5ZXZhenRzeGl1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg5NDA1MywiZXhwIjoyMDg5NDcwMDUzfQ.xjulwENzR4DElhuOnDDSe2zAhxzaJ91TXKMzbSQCwBw";

async function listInventory() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase.from('inventory').select('*');
  if (error) {
    console.error("Error fetching inventory:", error);
    return;
  }
  console.log("Total items:", data?.length);
  if (data && data.length > 0) {
    console.log("First 30 items:\n", JSON.stringify(data.map(d => ({ id: d.id, code: d.product_code, name: d.product_name, stock: d.current_stock, category: d.category })), null, 2));
  }
}

listInventory();
