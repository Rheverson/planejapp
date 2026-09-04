-- O funil ganhou a etapa que representa dinheiro.
--
--   viram_paywall -> iniciaram_checkout -> entraram_no_trial -> pagaram
--
-- `concluiram_checkout` virou `entraram_no_trial`, que é o que aquele
-- evento sempre significou no modelo PLG: o cartão entra na porta, a
-- cobrança só 7 dias depois. Chamar aquilo de conversão inflava a
-- métrica em cima de gente que ainda podia desistir sem pagar nada.
--
-- As views mudam de FORMA (coluna renomeada, coluna nova), e
-- `create or replace view` não renomeia coluna. Derruba e recria —
-- nenhuma delas guarda dado, são consultas sobre `eventos_plano`.

drop view if exists public.vw_funil_coorte;
drop view if exists public.vw_conversao_por_recurso;
drop view if exists public.vw_limite_sem_conversao;
drop view if exists public.vw_tempos_funil;

create view public.vw_funil_coorte
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
         count(*) filter (where c.user_id is not null)   as entraram_no_trial,
         count(*) filter (where t.user_id is not null)   as pagaram,
         count(*) filter (where v.user_id is not null)   as viraram_pro,
         -- Duas taxas, e a diferença entre elas é o que importa:
         --   entrada = quantos aceitaram experimentar
         --   paga    = quantos ficaram depois de o cartão ser cobrado
         -- Se a primeira for alta e a segunda baixa, o problema não é o
         -- paywall: é o produto ou o preço.
         round(100.0 * count(*) filter (where c.user_id is not null)
               / nullif(count(*), 0), 1)                 as taxa_entrada_trial_pct,
         round(100.0 * count(*) filter (where t.user_id is not null)
               / nullif(count(*), 0), 1)                 as taxa_conversao_paga_pct,
         round(100.0 * count(*) filter (where t.user_id is not null)
               / nullif(count(*) filter (where c.user_id is not null), 0), 1)
                                                         as trial_para_pago_pct
    from primeiro p
    left join (select distinct user_id from public.vw_eventos_funil
                where evento = 'checkout_iniciado')  i on i.user_id = p.user_id
    left join (select distinct user_id from public.vw_eventos_funil
                where evento = 'checkout_concluido') c on c.user_id = p.user_id
    left join (select distinct user_id from public.vw_eventos_funil
                where evento = 'trial_convertido')   t on t.user_id = p.user_id
    left join (select distinct user_id from public.vw_eventos_funil
                where evento = 'plano_mudou' and plano_novo = 'pro') v on v.user_id = p.user_id
   group by p.coorte
   order by p.coorte desc;

comment on view public.vw_funil_coorte is
  'Funil por coorte de primeiro paywall. entraram_no_trial NAO e receita: o cartao entra na porta e a cobranca vem 7 dias depois. Quem pagou e `pagaram`.';


-- Conversão por recurso, agora até o dinheiro.
--
-- O caminho do recurso até o pagamento é:
--   checkout_iniciado (tem recurso e session_id)
--     -> checkout_concluido (mesma session_id, ganha subscription_id)
--       -> trial_convertido (mesma subscription_id)
-- Nenhum degrau depende de metadata do Stripe.
create view public.vw_conversao_por_recurso
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
  trials as (
    select i.recurso,
           count(*) as trials_iniciados,
           array_agg(c.stripe_subscription_id)
             filter (where c.stripe_subscription_id is not null) as assinaturas
      from public.vw_eventos_funil c
      join public.vw_eventos_funil i
        on i.checkout_session_id = c.checkout_session_id
       and i.evento = 'checkout_iniciado'
     where c.evento = 'checkout_concluido'
       and i.recurso is not null
     group by i.recurso
  ),
  pagos as (
    select t.recurso, count(*) as pagaram
      from trials t
      join public.vw_eventos_funil p
        on p.evento = 'trial_convertido'
       and p.stripe_subscription_id = any(t.assinaturas)
     group by t.recurso
  )
  select coalesce(v.recurso, i.recurso)            as recurso,
         coalesce(v.paywalls_vistos, 0)            as paywalls_vistos,
         coalesce(v.usuarios_unicos, 0)            as usuarios_unicos,
         coalesce(i.checkouts_iniciados, 0)        as checkouts_iniciados,
         coalesce(t.trials_iniciados, 0)           as entraram_no_trial,
         coalesce(pg.pagaram, 0)                   as pagaram,
         round(100.0 * coalesce(pg.pagaram, 0)
               / nullif(v.usuarios_unicos, 0), 1)  as conversao_paga_pct
    from vistos v
    full join iniciados i  on i.recurso  = v.recurso
    left join trials t     on t.recurso  = coalesce(v.recurso, i.recurso)
    left join pagos  pg    on pg.recurso = coalesce(v.recurso, i.recurso)
   order by coalesce(v.usuarios_unicos, 0) desc;

comment on view public.vw_conversao_por_recurso is
  'Conversao por gatilho, ate o pagamento. Ordenar por volume engana: o que mais aparece pode ser o que menos converte (irritacao) e o raro pode ser o que mais converte (necessidade).';


-- "Bateu no limite e não pagou" passa a incluir quem entrou no trial e
-- desistiu antes da cobrança — perfil diferente de quem nunca clicou, e
-- que merece abordagem diferente.
create view public.vw_limite_sem_conversao
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
         exists (select 1 from public.vw_eventos_funil x
                  where x.user_id = e.user_id and x.evento = 'checkout_concluido')
           as chegou_a_entrar_no_trial,
         (select count(*) from public.transactions t
           where t.user_id = e.user_id and t.created_at > e.ultimo)
           as lancamentos_depois
    from encontros e
   where not exists (
     select 1 from public.vw_eventos_funil p
      where p.user_id = e.user_id and p.evento = 'trial_convertido'
   )
   order by e.vezes desc, e.ultimo desc;

comment on view public.vw_limite_sem_conversao is
  'Quem esbarrou no limite e nao pagou. chegou_a_entrar_no_trial separa quem nunca clicou de quem experimentou e desistiu.';


create view public.vw_tempos_funil
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
               and c.checkout_session_id = i.checkout_session_id)   as trial_em,
           (select min(t.ocorrido_em) from public.vw_eventos_funil t
             join public.vw_eventos_funil c2
               on c2.checkout_session_id = i.checkout_session_id
              and c2.evento = 'checkout_concluido'
            where t.evento = 'trial_convertido'
              and t.stripe_subscription_id = c2.stripe_subscription_id) as pago_em
      from public.vw_eventos_funil i
     where i.evento = 'checkout_iniciado'
  )
  select user_id, recurso, checkout_session_id,
         paywall_em, iniciado_em, trial_em, pago_em,
         (iniciado_em - paywall_em) as do_paywall_ao_checkout,
         (trial_em - iniciado_em)   as do_checkout_ao_trial,
         (pago_em - trial_em)       as do_trial_ao_pagamento
    from pares
   order by iniciado_em desc;

revoke all on public.vw_funil_coorte           from anon, authenticated;
revoke all on public.vw_conversao_por_recurso  from anon, authenticated;
revoke all on public.vw_limite_sem_conversao   from anon, authenticated;
revoke all on public.vw_tempos_funil           from anon, authenticated;
