-- Assinatura de teste e assinatura de verdade não se misturam.
--
-- ACHADO (03/09/2026), antes de rodar a bateria do Stripe TEST MODE.
--
-- O webhook grava no MESMO banco de produção e casa a linha apenas por
-- `stripe_customer_id`:
--
--   .from("subscriptions").update({...}).eq("stripe_customer_id", obj.customer)
--
-- Não havia nada distinguindo um evento de teste de um de produção. Com
-- o suporte a dois segredos (migration anterior, `20260902…`/webhook),
-- isso virou um caminho concreto: quem assina com o segredo de TESTE
-- pode nomear o `stripe_customer_id` de um cliente REAL e alterar a
-- assinatura dele.
--
-- Comprovado com linha descartável fazendo o papel de produção:
--
--   antes:  status=active,   sub_FINGE_SER_REAL, período até 23/09
--   evento: assinado com o segredo de TESTE, mirando cus_FINGE_SER_REAL
--   depois: status=canceled, sub_ISO,            período 21/09
--
-- Num usuário real seria perda de acesso.
--
-- A COLUNA
--
-- `is_test` marca de qual mundo a linha veio. Default false: tudo que já
-- existe é produção, e o `create-checkout` — que só fala com a chave
-- live — continua criando linha de produção sem precisar mudar.
--
-- O webhook passa a filtrar por ela: evento de teste só alcança linha de
-- teste, evento de produção só alcança linha de produção. Não é uma
-- convenção que alguém precisa lembrar de seguir; é filtro no WHERE.
--
-- Também serve para a exigência prática do QA: tudo que a bateria criar
-- é `is_test = true`, então dá para listar e remover com uma condição só,
-- sem chance de encostar em dado real.

alter table public.subscriptions
  add column if not exists is_test boolean not null default false;

-- A consulta que o webhook passa a fazer é (customer, is_test).
create index if not exists subscriptions_customer_modo
  on public.subscriptions (stripe_customer_id, is_test);

comment on column public.subscriptions.is_test is
  'true = linha criada pelo Stripe em modo teste. O webhook só altera '
  'linhas do mesmo modo do evento, para que um evento de teste nunca '
  'alcance a assinatura de um cliente real. Ver migration 20260903090000.';
