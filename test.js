import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
  const email = 'test' + Date.now() + '@example.com';
  console.log('Signing up:', email);
  const { data, error } = await supabase.auth.signUp({
    email, password: 'password123',
    options: {
      data: {
        onboarding_school_name: 'Test School',
        onboarding_school_code: 'TS' + Date.now(),
        onboarding_admin_full_name: 'Admin User'
      }
    }
  });
  console.log('Signup Result:', { hasSession: !!data.session, error: error?.message });
  
  if (data.session) {
    const { error: rpcError } = await supabase.rpc('register_school');
    console.log('RPC Result:', rpcError?.message || 'Success');
  } else {
    console.log('No session, cannot run RPC');
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password: 'password123' });
    console.log('Login Result:', loginError?.message || 'Success');
  }
}
run().catch(console.error);
