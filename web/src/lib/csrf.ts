import { supabase } from './auth';

/**
 * Requests a short-lived CSRF token from the backend Edge Function and
 * stores it in memory (never localStorage — mitigates XSS token theft).
 */
let memoryToken: string | null = null;

export async function getCsrfToken(): Promise<string> {
  if (memoryToken) return memoryToken;

  const { data, error } = await supabase.functions.invoke('issue-csrf-token', {
    method: 'POST',
  });

  if (error || !data?.token) throw new Error('Failed to obtain CSRF token');
  memoryToken = data.token as string;
  return memoryToken;
}

export function clearCsrfToken(): void {
  memoryToken = null;
}
