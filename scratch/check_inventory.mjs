import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const content = fs.readFileSync(".env.local", "utf8");
const env = {};
content.split("\n").forEach((line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1].trim()] = match[2].trim().replace(/^["'](.*)["']$/, "$1");
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase
    .from("inventory")
    .select("id, product_code, product_name, category, unit, current_stock, min_stock, notes")
    .order("category")
    .order("product_code");

  if (error) {
    console.error(error);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

main();
