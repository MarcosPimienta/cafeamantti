const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = "https://ztpcfcdevjyevaztsxiu.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0cGNmY2Rldmp5ZXZhenRzeGl1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg5NDA1MywiZXhwIjoyMDg5NDcwMDUzfQ.xjulwENzR4DElhuOnDDSe2zAhxzaJ91TXKMzbSQCwBw";
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: dailyCashflows, error: errC } = await supabase
    .from('daily_cashflows')
    .select('id, date')
    .order('date', { ascending: false })
    .limit(50);
  
  if (errC) {
    console.error("Error daily_cashflows:", errC);
    return;
  }
  
  // Incomes
  const { data: incomes, error: errI } = await supabase
    .from('cashflow_incomes')
    .select('id, cashflow_id, concept, amount, inventory_id, quantity_sold, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  if (errI) {
    console.error("Error incomes:", errI);
    return;
  }
  console.log("Recent cashflow incomes:");
  incomes.forEach((i, idx) => {
    const cashflowDate = dailyCashflows.find(c => c.id === i.cashflow_id)?.date;
    console.log(`[${idx}] id: ${i.id}, date: ${cashflowDate}, concept: ${i.concept}, inventory_id: ${i.inventory_id}, quantity_sold: ${i.quantity_sold}, created_at: ${i.created_at}`);
  });
}
check();
