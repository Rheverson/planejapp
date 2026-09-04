-- O limite mora no banco, não na tela.
--
-- POR QUE TRIGGER, E NÃO RLS
--
-- RLS decide QUAIS linhas alguém enxerga ou grava, nunca QUANTAS.
-- Contar exige olhar a tabela inteira do usuário — trabalho de trigger.
--
-- POR QUE NÃO SÓ NA EDGE FUNCTION
--
-- Porque `accounts`, `credit_cards`, `goals` e `transactions` têm policy
-- de escrita para o dono: um POST direto no PostgREST cria quantos
-- quiser. Validação em função não vale nada se a tabela aceita escrita
-- do cliente — foi a lição do P0 de `subscriptions` e do P1 de
-- `referrals`. A trava tem que estar onde a linha nasce.
--
-- FORMATO DO ERRO
--
-- `LIMITE_PLANO:<recurso>:<atual>/<limite>`, com SQLSTATE P0001. O
-- frontend reconhece o prefixo e abre o paywall em vez de mostrar erro
-- técnico. Nenhum botão some — quem decide isso é a interface, na
-- rodada dela.

/**
 * O guarda comum. Recebe quantos o usuário já tem e decide.
 * Ilimitado (null) libera; zero bloqueia sempre.
 */
create or replace function public.exige_limite(
  p_user uuid, p_recurso text, p_atual integer
) returns void
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_limite integer := public.limite_do_usuario(p_user, p_recurso);
begin
  if v_limite is null then return; end if;          -- ilimitado
  if p_atual < v_limite then return; end if;        -- ainda cabe
  raise exception 'LIMITE_PLANO:%:%/%', p_recurso, p_atual, v_limite
    using errcode = 'P0001';
end $$;

-- ── Contas ──────────────────────────────────────────────────────────
-- Conta arquivada não ocupa vaga: quem encerrou uma conta liberou o
-- espaço, e o histórico dela continua inteiro (migration 20260828131000).
create or replace function public.limite_contas()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_atual integer;
begin
  select count(*) into v_atual
    from public.accounts
   where user_id = new.user_id and is_active;
  perform public.exige_limite(new.user_id, 'contas', v_atual);
  return new;
end $$;

drop trigger if exists contas_respeitam_o_plano on public.accounts;
create trigger contas_respeitam_o_plano
  before insert on public.accounts
  for each row execute function public.limite_contas();

-- ── Cartões ─────────────────────────────────────────────────────────
create or replace function public.limite_cartoes()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_atual integer;
begin
  select count(*) into v_atual
    from public.credit_cards
   where user_id = new.user_id and coalesce(is_active, true);
  perform public.exige_limite(new.user_id, 'cartoes', v_atual);
  return new;
end $$;

drop trigger if exists cartoes_respeitam_o_plano on public.credit_cards;
create trigger cartoes_respeitam_o_plano
  before insert on public.credit_cards
  for each row execute function public.limite_cartoes();

-- ── Metas ───────────────────────────────────────────────────────────
create or replace function public.limite_metas()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_atual integer;
begin
  select count(*) into v_atual from public.goals where user_id = new.user_id;
  perform public.exige_limite(new.user_id, 'metas', v_atual);
  return new;
end $$;

drop trigger if exists metas_respeitam_o_plano on public.goals;
create trigger metas_respeitam_o_plano
  before insert on public.goals
  for each row execute function public.limite_metas();

-- ── Transações: 100 POR MÊS, não 100 no total ───────────────────────
--
-- A contagem é do MÊS DE COMPETÊNCIA da linha que está entrando, não da
-- tabela inteira e não do mês do relógio: quem lança em setembro conta
-- contra setembro, quem lança retroativo em agosto conta contra agosto.
-- É o que a frase "100 lançamentos por mês" significa para quem usa.
--
-- O recorte é por FAIXA de datas (`>= início` e `< início do próximo`),
-- de propósito. Envolver a coluna numa função — `date_trunc(date)` ou
-- `to_char(date,'YYYY-MM')` — impediria o uso do índice e viraria
-- varredura da tabela a cada lançamento. Com a faixa, o
-- `idx_transactions_user_date (user_id, date)`, que já existia, resolve
-- em range scan.
--
-- O pagamento de fatura fica de fora: ele é gerado pelo sistema como
-- consequência de uma ação já permitida (`pagar_fatura`), não é
-- lançamento que o usuário digitou. Bloquear ele por limite deixaria
-- alguém sem conseguir quitar a própria fatura.
create or replace function public.limite_transacoes()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_atual  integer;
  v_inicio date := date_trunc('month', new.date)::date;
begin
  if new.category = 'faturas' then return new; end if;

  select count(*) into v_atual
    from public.transactions
   where user_id = new.user_id
     and date >= v_inicio
     and date <  (v_inicio + interval '1 month')::date;

  perform public.exige_limite(new.user_id, 'transacoes_mes', v_atual);
  return new;
end $$;

drop trigger if exists transacoes_respeitam_o_plano on public.transactions;
create trigger transacoes_respeitam_o_plano
  before insert on public.transactions
  for each row execute function public.limite_transacoes();
