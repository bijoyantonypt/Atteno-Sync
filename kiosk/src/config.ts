// Kiosk configuration. The anon/publishable key is public by design; it grants no
// table access (RLS denies anon) and kiosk endpoints require a device signature.
export const SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY';
export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

/** Show Hindi labels under English ones. */
export const SHOW_HINDI = true;

/** Seconds before result/history screens return to the home screen (shared device privacy). */
export const RESULT_SCREEN_SECONDS = 5;
export const HISTORY_SCREEN_SECONDS = 45;
