/**
 * Cleanup Script for Test User
 * Usage: SUPABASE_SERVICE_ROLE_KEY=your_key node cleanup_test_user.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const TEST_EMAIL = 'kiseto9601@sixoplus.com';

async function cleanup() {
  console.log(`Searching for user with email: ${TEST_EMAIL}...`);
  
  // 1. Get user by email
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error('Error listing users:', listError.message);
    return;
  }

  const user = users.find(u => u.email === TEST_EMAIL);
  
  if (!user) {
    console.log('User not found in Auth.');
  } else {
    console.log(`User found (ID: ${user.id}). Deleting...`);
    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error('Error deleting user:', deleteError.message);
    } else {
      console.log('User deleted successfully from Auth.');
    }
  }

  // 2. Cleanup profile (if not handled by cascade)
  console.log('Checking for profile leftovers...');
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', TEST_EMAIL) // Assuming profiles has email or we search by ID if found
    .single();

  if (profile) {
    console.log(`Profile found (ID: ${profile.id}). Deleting...`);
    await supabase.from('profiles').delete().eq('id', profile.id);
  } else {
    console.log('No profile leftovers found.');
  }

  console.log('Cleanup complete.');
}

cleanup();
