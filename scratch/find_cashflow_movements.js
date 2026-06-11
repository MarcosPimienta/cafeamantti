const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = "https://ztpcfcdevjyevaztsxiu.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0cGNmY2Rldmp5ZXZhenRzeGl1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg5NDA1MywiZXhwIjoyMDg5NDcwMDUzfQ.xjulwENzR4DElhuOnDDSe2zAhxzaJ91TXKMzbSQCwBw";
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
  const { data: movements, error: errMov } = await supabase
    .from('inventory_movements')
    .select('*')
    .not('income_id', 'is', null);

  if (errMov) {
    console.error("Error fetching movements:", errMov);
    return;
  }
  console.log("All inventory movements with income_id:", movements);

  const { data: incomes, error: errInc } = await supabase
    .from('cashflow_incomes')
    .select('*')
    .not('inventory_id', 'is', null);

  if (errInc) {
    console.error("Error fetching incomes:", errInc);
    return;
  }
  console.log("All cashflow incomes with inventory_id:", incomes);
}
inspect();
