
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

function loadEnv() {
  const content = fs.readFileSync('.env.local', 'utf8');
  const env = {};
  content.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length === 2) {
      env[parts[0].trim()] = parts[1].trim().replace(/^"|"$/g, '');
    }
  });
  return env;
}

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkProfiles() {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, first_name, role');
  
  if (error) {
    console.error("Error fetching profiles:", error);
    return;
  }

  console.log("Current Profiles in DB:");
  console.table(profiles);
}

checkProfiles();
