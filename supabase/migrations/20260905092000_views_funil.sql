-- ============================================================
-- As consultas do funil.
--
-- Nesta fase não há tela de analytics: primeiro dado confiável. São
-- views para ler no SQL editor ou por ferramenta de BI com credencial
-- de serviço — por isso NENHUMA delas é exposta ao cliente.
--
-- DUAS EXCLUSÕES VALEM PARA TODAS, e ficam numa view-base para não
-- dependerem de alguém lembrar delas em cada consulta:
--
--   1. FUNDADORES. Os 36 que já usavam o app são PRO por isenção
--      (`usuarios_fundadores`), nunca passam pelo Stripe e nunca
--      convertem. Deixá-los dentro afunda toda taxa contra um
--      denominador que não tem como converter.
--   2. is_test. Evento nascido do Stripe TEST não entra em conversão
--      LIVE.
-- ============================================================

create or replace view public.vw_eventos_funil
with (security_invoker = true) as
  select e.*
    from public.eventos_plano e
   where e.is_test = false
     and not exists (
       select 1 from public.usuarios_fundadores f where f.user_id = e.user_id
     );

comment on view public.vw_eventos_funil is
  'Base das métricas: eventos LIVE, sem fundadores. Toda view do funil sai daqui para que as duas exclusões não dependam de memória.';


-- ── A) Coorte mensal ─────────────────────────────────────────
--
-- A coorte é o mês do PRIMEIRO paywall do usuário: o momento em que ele
-- encostou num limite pela primeira vez. Não dá para usar "mês em que
-- virou Free" porque `subscriptions` nunca guardou isso — este
-- histórico começa agora.
create or replace view public.vw_funil_coorte
with (security_invoker = true) as
  with primeiro as (
    select user_id, date_trunc('month', min(ocorrido_em))::date as coorte
      from public.vw_eventos_funil
     where evento = 'paywall_visto'
     group by user_id
  )
  select p.coorte,
         count(*)                                       as viram_paywall,
         count(*) filter (where i.user_id is not null)   as iniciaram_checkout,
         count(*) filter (where c.user_id is not null)   as concluiram_checkout,
         count(*) filter (where v.user_id is not null)   as viraram_pro,
         round(100.0 * count(*) filter (where c.user_id is not null)
               / nullif(count(*), 0), 1)                 as conversao_pct
    from primeiro p
    left join (select distinct user_id from public.vw_eventos_funil
                where evento = 'checkout_iniciado')  i on i.user_id = p.user_id
    left join (select distinct user_id from public.vw_eventos_funil
                where evento = 'checkout_concluido') c on c.user_id = p.user_id
    left join (select distinct user_id from public.vw_eventos_funil
                where evento = 'plano_mudou' and plano_novo = 'pro') v on v.user_id = p.user_id
   group by p.coorte
   order by p.coorte desc;


-- ── B) Conversão por recurso ─────────────────────────────────
--
-- O checkout concluído volta ao recurso pelo `checkout_session_id`, e
-- não pela metadata do Stripe: a sessão foi criada pelo nosso backend,
-- então essa amarra não depende de confiar em nada que o cliente mande.
create or replace view public.vw_conversao_por_recurso
with (security_invoker = true) as
  with vistos as (
    select recurso,
           count(*)                as paywalls_vistos,
           count(distinct user_id) as usuarios_unicos
      from public.vw_eventos_funil
     where evento = 'paywall_visto'
     group by recurso
  ),
  iniciados as (
    select recurso, count(*) as checkouts_iniciados
      from public.vw_eventos_funil
     where evento = 'checkout_iniciado' and recurso is not null
     group by recurso
  ),
  concluidos as (
    select i.recurso, count(*) as checkouts_concluidos
      from public.vw_eventos_funil c
      join public.vw_eventos_funil i
        on i.checkout_session_id = c.checkout_session_id
       and i.evento = 'checkout_iniciado'
     where c.evento = 'checkout_concluido'
       and i.recurso is not null
     group by i.recurso
  )
  select coalesce(v.recurso, i.recurso)            as recurso,
         coalesce(v.paywalls_vistos, 0)            as paywalls_vistos,
         coalesce(v.usuarios_unicos, 0)            as usuarios_unicos,
         coalesce(i.checkouts_iniciados, 0)        as checkouts_iniciados,
         coalesce(c.checkouts_concluidos, 0)       as checkouts_concluidos,
         round(100.0 * coalesce(c.checkouts_concluidos, 0)
               / nullif(v.usuarios_unicos, 0), 1)  as conversao_pct
    from vistos v
    full join iniciados  i on i.recurso = v.recurso
    left join concluidos c on c.recurso = coalesce(v.recurso, i.recurso)
   order by coalesce(v.usuarios_unicos, 0) desc;

comment on view public.vw_conversao_por_recurso is
  'Conversão por gatilho. Ordenar por volume engana: o recurso que mais aparece pode ser o que menos converte (irritação) e o raro pode ser o que mais converte (necessidade). Ler conversao_pct junto.';


-- ── C) Bateu no limite e NÃO converteu ───────────────────────
--
-- A métrica que diz se um limite vende ou só expulsa. `dias_desde` e
-- `lancamentos_depois` mostram o que a pessoa fez DEPOIS de esbarrar:
-- quem parou de lançar não foi convencido, foi embora.
create or replace view public.vw_limite_sem_conversao
with (security_invoker = true) as
  with encontros as (
    select user_id, recurso,
           count(*)         as vezes,
           min(ocorrido_em) as primeiro,
           max(ocorrido_em) as ultimo
      from public.vw_eventos_funil
     where evento = 'paywall_visto'
     group by user_id, recurso
  )
  select e.user_id, e.recurso, e.vezes, e.primeiro, e.ultimo,
         (current_date - e.ultimo::date) as dias_desde_o_ultimo,
         (select count(*) from public.transactions t
           where t.user_id = e.user_id and t.created_at > e.ultimo)
           as lancamentos_depois
    from encontros e
   where not exists (
     select 1 from public.vw_eventos_funil c
      where c.user_id = e.user_id and c.evento = 'checkout_concluido'
   )
   order by e.vezes desc, e.ultimo desc;

comment on view public.vw_limite_sem_conversao is
  'Quem esbarrou no limite e não comprou. lancamentos_depois separa atrito que converte de atrito que dá churn: quem parou de lançar foi embora.';


-- ── D) Tempo entre as etapas ─────────────────────────────────
create or replace view public.vw_tempos_funil
with (security_invoker = true) as
  with pares as (
    select i.user_id,
           i.recurso,
           i.checkout_session_id,
           (select max(p.ocorrido_em) from public.vw_eventos_funil p
             where p.user_id = i.user_id and p.evento = 'paywall_visto'
               and p.ocorrido_em <= i.ocorrido_em)                  as paywall_em,
           i.ocorrido_em                                            as iniciado_em,
           (select min(c.ocorrido_em) from public.vw_eventos_funil c
             where c.evento = 'checkout_concluido'
               and c.checkout_session_id = i.checkout_session_id)   as concluido_em
      from public.vw_eventos_funil i
     where i.evento = 'checkout_iniciado'
  )
  select user_id, recurso, checkout_session_id,
         paywall_em, iniciado_em, concluido_em,
         (iniciado_em  - paywall_em)  as do_paywall_ao_checkout,
         (concluido_em - iniciado_em) as do_checkout_ao_pagamento
    from pares
   order by iniciado_em desc;


-- Nenhuma view do funil é do cliente: todas cruzam usuários.
revoke all on public.vw_eventos_funil          from anon, authenticated;
revoke all on public.vw_funil_coorte           from anon, authenticated;
revoke all on public.vw_conversao_por_recurso  from anon, authenticated;
revoke all on public.vw_limite_sem_conversao   from anon, authenticated;
revoke all on public.vw_tempos_funil           from anon, authenticated;
