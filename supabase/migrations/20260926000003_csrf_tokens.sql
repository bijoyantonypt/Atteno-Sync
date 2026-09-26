CREATE TABLE IF NOT EXISTS public.csrf_tokens (
    token      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
    used       boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.csrf_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service manages csrf tokens"
  ON public.csrf_tokens FOR ALL
  TO service_role USING (true) WITH CHECK (true);
