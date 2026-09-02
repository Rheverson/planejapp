-- A tabela de assinatura é registro de pagamento: o cliente lê, nunca escreve.
--
-- ACHADO (P0, validação de 02/09/2026). A policy `subscriptions_own` era
-- `FOR ALL` com `USING (user_id = auth.uid())`. Ela isolava bem QUEM,
-- mas autorizava o dono a INSERIR, ALTERAR e APAGAR a própria linha. E
-- os papéis `anon` e `authenticated` tinham GRANT de INSERT, UPDATE,
-- DELETE e TRUNCATE na tabela.
--
-- Resultado, comprovado com JWT de usuário comum e uma requisição:
--
--   PATCH /rest/v1/subscriptions?user_id=eq.<ele mesmo>
--        {"status":"active","current_period_end":"2099-12-31T23:59:59Z"}
--   -> HTTP 200
--
-- `hasActiveAccess` devolve true para `active`: acesso PRO vitalício,
-- sem Stripe, sem cartão, sem pagamento. Não exigia corrida, timing nem
-- conhecimento de Stripe — só uma conta e o DevTools. Todo o trabalho de
-- checkout, webhook e cancelamento era contornável por fora.
--
-- POR QUE ISTO É SEGURO
--
-- Quem escreve nesta tabela são as Edge Functions, todas com
-- service_role (que ignora RLS e GRANT): `create-checkout` (insert e
-- update), `stripe-webhook` (update), `cancel-subscription` (update) e
-- `cancel-stripe-customer` (update).
--
-- No frontend, os três pontos que tocam a tabela — App.jsx, Profile.jsx
-- e PlanPage.jsx — fazem `.select("*")` e nada mais. Zero escritas.
--
-- Nenhuma função SQL escreve aqui: as duas que citam `subscriptions`
-- (`notify_engagement` e `notify_weekly_summary`) apenas leem. Nenhum
-- trigger cria linha de assinatura no cadastro — `handle_new_user` só
-- cria o perfil.
--
-- Ou seja: revogar a escrita do cliente não quebra nenhum caminho
-- legítimo.

-- ── a policy passa a ser só de leitura ──────────────────────────────
drop policy if exists subscriptions_own on public.subscriptions;

create policy subscriptions_leitura_propria
  on public.subscriptions
  for select
  using (user_id = (select auth.uid()));

-- ── e o GRANT deixa de permitir escrita ─────────────────────────────
-- A policy sozinha não bastaria como defesa: é o par policy + GRANT que
-- fecha o caminho. `anon` entra na revogação por profundidade — hoje o
-- RLS já o barra (auth.uid() é nulo), mas o GRANT não tinha por que
-- existir.
revoke insert, update, delete, truncate on public.subscriptions from anon, authenticated;

comment on table public.subscriptions is
  'Estado de assinatura do usuário. SOMENTE LEITURA para o cliente: '
  'escrita apenas via Edge Function com service_role (create-checkout, '
  'stripe-webhook, cancel-subscription, cancel-stripe-customer). '
  'Já foi gravável pelo próprio usuário — ver migration 20260902140000.';
