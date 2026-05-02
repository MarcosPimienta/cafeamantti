
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ztpcfcdevjyevaztsxiu.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0cGNmY2Rldmp5ZXZhenRzeGl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4OTQwNTMsImV4cCI6MjA4OTQ3MDA1M30.jeIeccI74HxNE2-tPzXHOayhRUkl7Hd158abIYwuGfk";

async function debugMovements() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // Search for the 73.50 kg record
  const { data, error } = await supabase
    .from('inventory_movements')
    .select('*')
    .ilike('reason', '%Historial%')
    .limit(5);

  if (error) {
    console.error("Error fetching:", error.message);
    return;
  }

  console.log("Found records:");
  console.log(JSON.stringify(data, null, 2));
}

debugMovements();
