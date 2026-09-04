-- Correção cirúrgica das 7 linhas que perderam `current_period_end`.
--
-- CONTEXTO. O webhook lia `subscription.current_period_end`, campo que a
-- versão de API desta conta removeu do objeto (foi para
-- `items.data[].current_period_end`). Resultado: NULL gravado por meses.
-- Corrigido no código em b62f06c; isto conserta o que ficou para trás.
--
-- Valores CHUMBADOS, lidos do Stripe LIVE um a um em consulta somente
-- leitura. Nada é calculado aqui: se o Stripe mudar amanhã, este script
-- continua escrevendo exatamente o que foi conferido hoje.
--
-- TRAVA: cada UPDATE exige `current_period_end IS NULL`. Rodar duas
-- vezes não sobrescreve valor que o webhook tenha trazido no intervalo,
-- e não encosta em linha nenhuma que já esteja correta.
--
-- FORA DE ESCOPO, de propósito:
--
--  • As outras 7 linhas (`incomplete`, sem `stripe_subscription_id`)
--    não têm o que recuperar: o checkout nunca foi concluído. Não são
--    tocadas.
--  • `0d6718a4` e `7ac4cf96` estão `trialing` aqui e `active` no
--    Stripe. Os dois estados concedem acesso, então não há urgência —
--    e agora que `customer.subscription.updated` é entregue (P1-B), o
--    próximo evento sincroniza sozinho. Só a data é corrigida.
--  • `f85a5d00` tem `cancel_at_period_end = true` no Stripe, mas a
--    linha já está `cancelled` com período vencido: a flag não mudaria
--    nada.

begin;

-- ── os dois que ainda têm assinatura viva ───────────────────────────
-- São estes que corriam risco real: se cancelassem hoje, perderiam o
-- acesso na hora em vez de ficar até o fim do período pago.

update public.subscriptions set current_period_end = '2026-09-05T15:43:59Z'
 where user_id = '0d6718a4-282c-4267-9905-0584bbb20a43' and current_period_end is null;

update public.subscriptions set current_period_end = '2026-09-05T01:29:58Z'
 where user_id = '7ac4cf96-7594-43ee-8494-c73d101e86cd' and current_period_end is null;

-- ── os cinco já cancelados, com o período vencido ───────────────────
-- Não mudam o acesso de ninguém hoje. Entram para o histórico ficar
-- verdadeiro e para relatórios futuros não mentirem.

update public.subscriptions set current_period_end = '2026-05-05T15:13:35Z'
 where user_id = 'dc46f32c-752e-4b0f-b2d5-5ee682e04b2b' and current_period_end is null;

update public.subscriptions set current_period_end = '2026-06-06T22:47:32Z'
 where user_id = '7fb92e4d-ba68-4377-b1ca-c7704606d0a3' and current_period_end is null;

update public.subscriptions set current_period_end = '2026-06-07T13:41:39Z'
 where user_id = '723a51a1-16d2-4fee-8ad1-5bb2b27878c9' and current_period_end is null;

update public.subscriptions set current_period_end = '2026-07-07T17:45:05Z'
 where user_id = 'a2d50022-00a0-4f1a-bede-f3b7145f1c5b' and current_period_end is null;

update public.subscriptions set current_period_end = '2026-07-07T11:31:02Z'
 where user_id = 'f85a5d00-4c0b-4921-ab88-fce2cf1a30e5' and current_period_end is null;

commit;
