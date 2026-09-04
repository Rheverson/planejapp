-- ============================================================
-- Histórico append-only do funil de monetização.
--
-- Por que uma tabela nova, e não colunas em `subscriptions`:
-- `subscriptions` é tabela de ESTADO, mutada no lugar pelo webhook.
-- Ela responde "qual o plano hoje" e não consegue responder "quando
-- este usuário virou Free", que é a pergunta de onde sai toda coorte.
-- Sem histórico não há taxa de conversão, só um número solto.
--
-- REGRA DE OURO DESTA TABELA: o cliente nunca escreve aqui.
-- Um evento de conversão gravável pelo navegador não mede nada — mede
-- o que o navegador quis dizer. As três origens de escrita são:
--
--   paywall_visto      -> RPC `registrar_paywall_visto` (SECURITY
--                         DEFINER, identidade do JWT, evento fixo)
--   checkout_iniciado  -> Edge Function create-checkout (service_role)
--   checkout_concluido -> stripe-webhook (service_role)
--   plano_mudou        -> stripe-webhook (service_role)
--
-- O cliente só enxerga os próprios eventos, e só para leitura.
-- ============================================================

create table if not exists public.eventos_plano (
  id                     bigint generated always as identity primary key,
  user_id                uuid not null references auth.users(id) on delete cascade,

  evento                 text not null,
  -- Qual limite/recurso originou. Só faz sentido em paywall_visto e no
  -- checkout que veio de um.
  recurso                text,

  -- Só em plano_mudou.
  plano_anterior         text,
  plano_novo             text,
  motivo                 text,

  -- Amarra paywall -> checkout -> assinatura sem depender de metadata.
  checkout_session_id    text,
  stripe_subscription_id text,

  -- Evento nascido do Stripe TEST não pode contaminar conversão LIVE.
  -- Ação de usuário no app real é sempre false.
  is_test                boolean not null default false,

  ocorrido_em            timestamptz not null default now(),

  constraint eventos_plano_evento_valido check (
    evento in ('paywall_visto','checkout_iniciado','checkout_concluido','plano_mudou')
  ),
  constraint eventos_plano_plano_valido check (
    (plano_anterior is null or plano_anterior in ('free','pro')) and
    (plano_novo     is null or plano_novo     in ('free','pro'))
  ),
  -- Motivos: só os que correspondem a transição real do sistema. Nada
  -- inventado — cada um é derivado de um evento do Stripe.
  constraint eventos_plano_motivo_valido check (
    motivo is null or motivo in
      ('trial_expirou','pagamento_falhou','assinou','cancelamento','reativacao')
  ),

  -- Coerência por tipo. Sem isto a tabela aceita linha sem sentido, e
  -- linha sem sentido em tabela de BI vira número errado em relatório.
  constraint eventos_plano_coerente check (
    case evento
      when 'paywall_visto'      then recurso is not null
      when 'checkout_iniciado'  then checkout_session_id is not null
      when 'checkout_concluido' then checkout_session_id is not null
      when 'plano_mudou'        then plano_anterior is not null
                                 and plano_novo is not null
                                 and plano_anterior <> plano_novo
                                 and motivo is not null
      else false
    end
  )
);

comment on table public.eventos_plano is
  'Histórico append-only do funil de monetização. O cliente só lê os '
  'próprios eventos; escrita só por service_role ou pela RPC '
  'registrar_paywall_visto.';

-- ── Idempotência ─────────────────────────────────────────────
--
-- O Stripe reentrega por design, e este projeto tem TRÊS endpoints LIVE
-- apontando para a mesma função. O `event.id` é o mesmo em todas as
-- entregas, então `stripe_eventos_processados` já barra a repetição
-- antes de qualquer escrita. Este índice é a segunda trava, na tabela:
-- uma sessão de checkout só pode ter um início e um fim.
create unique index if not exists eventos_plano_sessao_unica
  on public.eventos_plano (evento, checkout_session_id)
  where checkout_session_id is not null;

-- ── Índices das consultas previstas ──────────────────────────
--
-- Só estes: as views varrem por usuário+tempo (coorte, "bateu e não
-- converteu") e por recurso (conversão por gatilho).
create index if not exists eventos_plano_usuario_tempo
  on public.eventos_plano (user_id, ocorrido_em);

create index if not exists eventos_plano_tipo_tempo
  on public.eventos_plano (evento, ocorrido_em);

create index if not exists eventos_plano_recurso
  on public.eventos_plano (recurso, evento)
  where recurso is not null;

-- ── RLS: leitura do próprio, escrita por ninguém ─────────────
alter table public.eventos_plano enable row level security;

drop policy if exists eventos_plano_le_os_proprios on public.eventos_plano;
create policy eventos_plano_le_os_proprios
  on public.eventos_plano
  for select
  to authenticated
  using (user_id = auth.uid());

-- NENHUMA policy de insert/update/delete, de propósito. Sem policy, RLS
-- nega. E o REVOKE abaixo é a segunda camada: foi exatamente a dupla
-- "policy FOR ALL + GRANT de escrita" que criou o P0 em `subscriptions`,
-- onde qualquer usuário se promovia a PRO com uma requisição.
revoke all on public.eventos_plano from anon, authenticated;
grant select on public.eventos_plano to authenticated;
