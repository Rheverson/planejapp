-- Segredo compartilhado entre os cron jobs e as Edge Functions.
-- Fica só no banco: não passa por variável de ambiente nem pelo Git.
CREATE TABLE IF NOT EXISTS public.internal_config (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.internal_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.internal_config FROM PUBLIC, anon, authenticated;

INSERT INTO public.internal_config (key, value)
VALUES ('cron_auth_token', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;
