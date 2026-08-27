-- Índice legível por usuário (#1, #2, #3…).
--
-- O Finn identificava cada registro por um prefixo do UUID ("#f18267f0"),
-- que vazava para a tela e não significa nada para quem lê. Aqui cada
-- transação, conta e meta ganha um número sequencial DENTRO do usuário,
-- estável para sempre, que pode ser exibido na interface.
--
-- Não substitui o id: continua sendo o UUID que identifica a linha nas
-- queries e nas policies. O `ref` é só o rótulo humano.

-- ── coluna ──────────────────────────────────────────────────────────
alter table public.transactions add column if not exists ref integer;
alter table public.accounts     add column if not exists ref integer;
alter table public.goals        add column if not exists ref integer;

-- ── numeração dos registros que já existem ──────────────────────────
-- Ordem de criação, para que o número acompanhe a linha do tempo.
update public.transactions t set ref = n.linha
from (select id, row_number() over (partition by user_id order by created_at, id) as linha
      from public.transactions) n
where n.id = t.id and t.ref is null;

update public.accounts a set ref = n.linha
from (select id, row_number() over (partition by user_id order by created_at, id) as linha
      from public.accounts) n
where n.id = a.id and a.ref is null;

update public.goals g set ref = n.linha
from (select id, row_number() over (partition by user_id order by created_at, id) as linha
      from public.goals) n
where n.id = g.id and g.ref is null;

-- ── um número não pode se repetir dentro do mesmo usuário ───────────
create unique index if not exists transactions_user_ref_key on public.transactions (user_id, ref);
create unique index if not exists accounts_user_ref_key     on public.accounts     (user_id, ref);
create unique index if not exists goals_user_ref_key        on public.goals        (user_id, ref);

-- ── próximo número, para os registros novos ─────────────────────────
create or replace function public.atribuir_ref()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- O `ref` é sempre calculado aqui: se viesse do cliente, dois
  -- usuários poderiam disputar o mesmo número, ou alguém poderia
  -- escolher um valor para se passar por outro registro.
  if new.user_id is null then
    return new;
  end if;

  -- Serializa por usuário. Sem isso dois inserts simultâneos leriam o
  -- mesmo max() e o segundo esbarraria no índice único.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));

  execute format(
    'select coalesce(max(ref), 0) + 1 from public.%I where user_id = $1',
    tg_table_name
  ) into new.ref using new.user_id;

  return new;
end $$;

revoke execute on function public.atribuir_ref() from public, anon, authenticated;

drop trigger if exists transactions_ref on public.transactions;
create trigger transactions_ref before insert on public.transactions
  for each row execute function public.atribuir_ref();

drop trigger if exists accounts_ref on public.accounts;
create trigger accounts_ref before insert on public.accounts
  for each row execute function public.atribuir_ref();

drop trigger if exists goals_ref on public.goals;
create trigger goals_ref before insert on public.goals
  for each row execute function public.atribuir_ref();

-- ── o número é atribuído pelo banco, nunca reescrito pelo cliente ───
-- REVOKE por coluna não adianta aqui: quem tem UPDATE na tabela inteira
-- continua podendo escrever a coluna. E tirar o UPDATE da tabela para
-- devolver coluna a coluna quebraria as telas. O trigger resolve sem
-- tocar em grant nenhum: o valor antigo sempre volta.
create or replace function public.congelar_ref()
returns trigger
language plpgsql
as $$
begin
  new.ref := old.ref;
  return new;
end $$;

drop trigger if exists transactions_ref_congelado on public.transactions;
create trigger transactions_ref_congelado before update on public.transactions
  for each row when (new.ref is distinct from old.ref)
  execute function public.congelar_ref();

drop trigger if exists accounts_ref_congelado on public.accounts;
create trigger accounts_ref_congelado before update on public.accounts
  for each row when (new.ref is distinct from old.ref)
  execute function public.congelar_ref();

drop trigger if exists goals_ref_congelado on public.goals;
create trigger goals_ref_congelado before update on public.goals
  for each row when (new.ref is distinct from old.ref)
  execute function public.congelar_ref();
