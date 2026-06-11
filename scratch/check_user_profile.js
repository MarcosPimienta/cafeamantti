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
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', '53a3b322-e541-4423-8b1b-e38061339657')
    .single();

  if (error) {
    console.error("Error profile:", error);
  } else {
    console.log("Profile:", data);
  }
}
check();
