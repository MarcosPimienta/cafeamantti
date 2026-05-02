
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ztpcfcdevjyevaztsxiu.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0cGNmY2Rldmp5ZXZhenRzeGl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4OTQwNTMsImV4cCI6MjA4OTQ3MDA1M30.jeIeccI74HxNE2-tPzXHOayhRUkl7Hd158abIYwuGfk";

async function listInventory() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data } = await supabase.from('inventory').select('product_code, product_name');
  console.log(JSON.stringify(data, null, 2));
}

listInventory();
