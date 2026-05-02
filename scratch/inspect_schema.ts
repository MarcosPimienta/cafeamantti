
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ztpcfcdevjyevaztsxiu.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0cGNmY2Rldmp5ZXZhenRzeGl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4OTQwNTMsImV4cCI6MjA4OTQ3MDA1M30.jeIeccI74HxNE2-tPzXHOayhRUkl7Hd158abIYwuGfk";

async function inspectSchema() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // Try to insert a dummy record to see the error/columns
  const { error } = await supabase.from('production_batches').insert({}).select();
  console.log("Schema Error Hint:", error?.message);
}

inspectSchema();
