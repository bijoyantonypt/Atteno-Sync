// Supabase Edge Function: issues a short-lived CSRF token for the caller.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Identify caller from the JWT
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '');
    const { data: userData, error: userErr } =
      await supabase.auth.getUser(jwt);

    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }),
        { status: 401, headers: corsHeaders });
    }

    const { data, error } = await supabase
      .from('csrf_tokens')
      .insert({ user_id: userData.user.id })
      .select('token')
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ token: data.token }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
