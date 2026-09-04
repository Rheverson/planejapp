-- Consumo do Finn: uma linha por usuário por mês.
--
-- POR QUE NÃO CONTAR NUMA TABELA DE LOG. `count(*)` numa tabela de
-- mensagens cresce para sempre e é lido a cada pergunta ao Finn — o
-- caminho mais quente do app. Uma linha por usuário/mês com incremento
-- atômico responde em índice único, sem varredura.
--
-- O incremento é `insert ... on conflict do update set mensagens =
-- mensagens + 1`. Isso resolve concorrência sem transação explícita: se
-- duas perguntas chegarem juntas, o Postgres serializa no conflito da
-- chave e nenhuma contagem se perde.
--
-- `mes` é o primeiro dia do mês em horário de Brasília, não em UTC.
-- Entre 21h e meia-noite o dia (e no fim do mês, o MÊS) já virou em
-- UTC — é o mesmo erro que já corrigimos no Finn uma vez.
--
-- ATENÇÃO ao teto real: a Groq entrega ~8.000 tokens/min e o Finn gasta
-- ~1.400 por mensagem, ou seja ~5,7 mensagens por minuto no app
-- inteiro, somando todos os usuários. O limite de plano é o teto de
-- negócio; o de infraestrutura é outro e menor. Quem protege aquele é a
-- cascata de provedores em `_shared/ia.ts`.

create table if not exists public.finn_uso (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  mes        date        not null,
  mensagens  integer     not null default 0 check (mensagens >= 0),
  atualizado timestamptz not null default now(),
  primary key (user_id, mes)
);

comment on table public.finn_uso is
  'Mensagens do Finn por usuário e por mês. Uma linha por par, '
  'incrementada por UPSERT — sem tabela de log e sem count(*) no '
  'caminho quente. `mes` é o primeiro dia do mês em America/Sao_Paulo.';

/**
 * O mês corrente em horário de Brasília.
 * Existe para que o corte do mês seja o mesmo aqui, no app e no Finn.
 */
create or replace function public.mes_corrente_brasilia()
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
$$;

comment on function public.mes_corrente_brasilia() is
  'Primeiro dia do mês corrente em America/Sao_Paulo. Em UTC o mês vira '
  'cedo demais entre 21h e meia-noite.';

-- Somente leitura para o dono; quem incrementa é o `ai-chat`, com
-- service_role. Se o cliente pudesse escrever, zeraria o próprio
-- contador — a mesma lição de `subscriptions`.
alter table public.finn_uso enable row level security;

drop policy if exists finn_uso_leitura_propria on public.finn_uso;
create policy finn_uso_leitura_propria
  on public.finn_uso for select
  using (user_id = (select auth.uid()));

revoke insert, update, delete, truncate on public.finn_uso from anon, authenticated;

/**
 * Registra uma mensagem e devolve quantas o usuário já usou no mês.
 *
 * SECURITY DEFINER e revogada de todo mundo: só service_role chama, de
 * dentro do `ai-chat`. Se ficasse aberta, o usuário chamaria para
 * inflar ou não contar.
 */
create or replace function public.finn_registrar_uso(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total integer;
begin
  insert into public.finn_uso (user_id, mes, mensagens, atualizado)
  values (p_user, public.mes_corrente_brasilia(), 1, now())
  on conflict (user_id, mes) do update
    set mensagens = public.finn_uso.mensagens + 1,
        atualizado = now()
  returning mensagens into v_total;
  return v_total;
end $$;

revoke execute on function public.finn_registrar_uso(uuid) from public, anon, authenticated;

comment on function public.finn_registrar_uso(uuid) is
  'Incrementa e devolve o uso do mês. Só service_role executa — o '
  'cliente não pode mexer no próprio contador.';
