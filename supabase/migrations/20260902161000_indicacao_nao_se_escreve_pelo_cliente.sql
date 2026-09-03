-- Indicação é registro de crédito: o cliente lê, nunca escreve.
--
-- ACHADO (P1, varredura de 02/09/2026). A policy `referrals_own` era
-- `FOR ALL USING (referrer_id = auth.uid() OR referred_id = auth.uid())`,
-- e `authenticated` tinha GRANT de escrita. Como `WITH CHECK` era nulo,
-- ele herdava o USING: bastava se colocar como `referrer_id` para a
-- linha nova passar.
--
-- Comprovado com JWT real:
--
--   POST /rest/v1/referrals
--        {"referrer_id":"<ele mesmo>","referred_id":"<id real>",
--         "referral_code":"FAKEQA02","status":"active"}
--   -> HTTP 201
--
-- `recalcularDescontoIndicador` (stripe-webhook) conta exatamente
-- `status = 'active'` por `referrer_id` e aplica cupom no Stripe:
-- 1 indicação 25%, 2 50%, 3 75%, **4 ou mais 100% — grátis para sempre**.
-- Quatro linhas forjadas e um ciclo de fatura davam assinatura vitalícia
-- de graça. Perda de receita direta.
--
-- A guarda que existia (`referrer.id !== userId`, em create-checkout) só
-- protegia o caminho oficial; escrevendo direto na tabela ela nem era
-- consultada. Validação em função não vale nada se a tabela aceita
-- escrita do cliente — a mesma lição do P0 em `subscriptions`.
--
-- A FK de `referred_id` limitava a graça a ids de usuário reais. Limitava,
-- não impedia.
--
-- POR QUE ISTO É SEGURO
--
-- No frontend existe UMA consulta a esta tabela, em Profile.jsx:103 —
-- `select("*").eq("referrer_id", user.id)`. Nenhuma escrita.
-- Quem escreve são `create-checkout` (insert da indicação pendente) e
-- `stripe-webhook` (update para `active` e para `cancelled`), ambos com
-- service_role, que ignora RLS e GRANT.
--
-- Nenhuma função SQL escreve aqui: `get_referred_email` só lê.
--
-- A leitura continua dos dois lados (indicador e indicado): é o que
-- alimenta a tela de indicações, e não concede nada por si.

drop policy if exists referrals_own on public.referrals;

create policy referrals_leitura_das_proprias
  on public.referrals
  for select
  using (
    referrer_id = (select auth.uid())
    or referred_id = (select auth.uid())
  );

revoke insert, update, delete, truncate on public.referrals from anon, authenticated;

comment on table public.referrals is
  'Indicações. SOMENTE LEITURA para o cliente: quem cria e ativa é o '
  'backend (create-checkout e stripe-webhook, com service_role). O campo '
  '`status` alimenta o cálculo de desconto — já foi forjável pelo próprio '
  'usuário, ver migration 20260902161000.';
