-- Blindagem do webhook: ordem, repetição e o cancelamento programado.
--
-- Três colunas e uma tabela, para fechar P1-C, P2-B e P2-C.
--
-- ── P1-C: evento fora de ordem ──────────────────────────────────────
--
-- O Stripe NÃO garante ordem de entrega. O handler gravava
-- `status: obj.status` incondicionalmente, então um evento antigo
-- entregue depois de um novo desfazia o novo. Reproduzido na bateria:
-- `created` → `deleted` → `created` atrasado deixou a linha em `active`
-- depois de cancelada.
--
-- `ultimo_evento_em` guarda o `created` do evento que escreveu por
-- último. Toda escrita passa a exigir que o evento novo seja mais
-- recente. Comparar o horário do EVENTO, e não o do banco, é o que
-- importa: dois eventos podem chegar no mesmo segundo em ordem trocada.
--
-- ── P2-B: entrega repetida ──────────────────────────────────────────
--
-- A idempotência de hoje é acidental: funciona porque os UPDATEs são
-- idempotentes por natureza. Basta alguém acrescentar um INSERT, um
-- incremento ou um envio de e-mail para deixar de funcionar — e o
-- Stripe reentrega por design (retry até 3 dias).
--
-- `stripe_eventos_processados` registra o `event.id`. Quem chega duas
-- vezes esbarra na chave primária e sai antes de tocar em qualquer
-- coisa. Idempotência por desenho, não por sorte.
--
-- ── P2-C: cancelamento programado ───────────────────────────────────
--
-- `cancel_at_period_end` não existia. Quando o usuário cancela, o
-- Stripe mantém `status = 'active'` até o período virar e sinaliza a
-- intenção nessa flag. Sem ela, `cancel-subscription` gravava
-- `status = 'cancelled'` por conta própria — e assim que o
-- `customer.subscription.updated` passar a ser entregue (P1-B), o
-- webhook devolveria para `active` e o cancelamento sumiria da tela.
--
-- Com a coluna, o banco reflete o Stripe e a interface tem o que
-- precisa para dizer "cancelada, ativa até tal dia".

alter table public.subscriptions
  add column if not exists ultimo_evento_em timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false;

comment on column public.subscriptions.ultimo_evento_em is
  'Horário do evento Stripe que escreveu esta linha por último. Um '
  'evento mais antigo que este é ignorado — o Stripe não garante ordem '
  'de entrega. Ver migration 20260903120000.';

comment on column public.subscriptions.cancel_at_period_end is
  'true = o usuário pediu cancelamento e o acesso vale até '
  '`current_period_end`. O Stripe mantém o status em `active` nesse '
  'período; é esta flag que diz que já foi pedido.';

-- ── Registro de eventos já processados ──────────────────────────────
create table if not exists public.stripe_eventos_processados (
  id           text primary key,
  tipo         text        not null,
  modo         text        not null,
  recebido_em  timestamptz not null default now()
);

comment on table public.stripe_eventos_processados is
  'Um `event.id` do Stripe por linha. O webhook insere antes de agir; '
  'quem chega repetido esbarra na PK e sai sem efeito. É o que torna a '
  'idempotência garantida por desenho e não por acaso.';

-- Ninguém além do backend precisa disso. RLS ligado e sem policy:
-- service_role passa por cima, todo o resto não enxerga nada.
alter table public.stripe_eventos_processados enable row level security;
revoke all on public.stripe_eventos_processados from anon, authenticated;

-- O Stripe reentrega por até 3 dias; guardar muito além disso é lixo.
create index if not exists stripe_eventos_recebido_em
  on public.stripe_eventos_processados (recebido_em);
