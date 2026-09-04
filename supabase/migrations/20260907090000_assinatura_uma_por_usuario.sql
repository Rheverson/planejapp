-- Uma linha de assinatura por usuario, por modo.
--
-- POR QUE (user_id, is_test) E NAO SO user_id, NEM "so as ativas":
--
-- O codigo ja assume uma linha por usuario. `App.jsx`, `usePlano`,
-- `PlanPage` e `create-billing-portal` fazem
-- `.eq("user_id", x).single()` / `.maybeSingle()` — com duas linhas
-- isso ESTOURA, e a tela cai. Uma unicidade parcial "so entre
-- active/trialing" deixaria varias linhas canceladas conviverem e o app
-- quebraria do mesmo jeito. A restricao precisa ser tao forte quanto o
-- que o codigo ja pressupoe.
--
-- O `is_test` entra porque a arquitetura de isolamento permite ao mesmo
-- usuario ter uma linha de producao e uma de teste (foi assim que a
-- bateria do Stripe rodou sem encostar em dado real). Unicidade so por
-- `user_id` proibiria isso e quebraria o QA.
--
-- Conferido antes de aplicar: 24 linhas, 24 usuarios distintos, zero
-- duplicatas em qualquer um dos tres recortes.
--
-- O que isto fecha: dois cliques ou duas abas criando checkout em
-- paralelo. Os dois passavam pela verificacao "ja tem assinatura?"
-- antes de qualquer um inserir, e os dois inseriam.

create unique index if not exists subscriptions_um_por_usuario
  on public.subscriptions (user_id, is_test);

comment on index public.subscriptions_um_por_usuario is
  'Uma assinatura por usuario em cada modo (producao/teste). O app le a assinatura com .single(): duas linhas derrubariam a tela.';
