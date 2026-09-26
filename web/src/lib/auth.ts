import { createClient, Session } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/** Throws if there is no active session. */
export async function requireSession(): Promise<Session> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error('Unauthorized');
  return data.session;
}

/** Throws unless the current user is an active admin. */
export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  const { data, error } = await supabase
    .from('employees')
    .select('is_admin, is_active')
    .eq('id', session.user.id)
    .single();

  if (error || !data?.is_admin || !data?.is_active) {
    throw new Error('Forbidden');
  }
  return session;
}

/** Sign out and clear local session. */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  window.location.href = '/login';
}
