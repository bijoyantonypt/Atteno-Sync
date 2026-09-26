import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function checkAuth() {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Unauthorized');
  }

  // Check if user has admin role
  const { data: userData, error } = await supabase
    .from('employees')
    .select('is_admin')
    .eq('id', session.user.id)
    .single();

  if (error || !userData?.is_admin) {
    throw new Error('Forbidden');
  }

  return session;
}
