import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

let csrfToken = '';

export async function getCsrfToken() {
  if (!csrfToken) {
    const { data, error } = await supabase
      .from('csrf_tokens')
      .insert({})
      .select('token')
      .single();

    if (error) throw error;
    csrfToken = data.token;
  }
  return csrfToken;
}

export async function verifyCsrfToken(token: string) {
  const { data, error } = await supabase
    .from('csrf_tokens')
    .select('*')
    .eq('token', token)
    .single();

  if (error || !data) {
    throw new Error('Invalid CSRF token');
  }

  // Delete the token after use to prevent replay attacks
  await supabase
    .from('csrf_tokens')
    .delete()
    .eq('token', token);

  return true;
}
