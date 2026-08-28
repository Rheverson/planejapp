-- Espelho das migrations aplicadas via MCP sem arquivo local.
--
-- Contexto: quatro migrations foram aplicadas direto no banco em 27/08 e
-- os arquivos nunca foram salvos. O banco tem o efeito delas; o
-- repositório, não. Quem clonasse o projeto e rodasse as migrations
-- ficaria com um schema diferente do de produção.
--
-- Este arquivo NÃO altera nada em produção: tudo aqui é idempotente e
-- reproduz o estado que já foi conferido no banco. Serve para que o
-- schema volte a ser reproduzível a partir do repositório.
--
-- Espelha:
--   20260827030359  cron_jobs_autenticados
--   20260827032300  migra_recorrencias_legadas
--   20260827032328  desativa_trigger_recorrencia_antigo
--   20260827120108  quiz_placar_sem_definer
--
-- Estado verificado no banco em 28/08/2026, antes de escrever:
--   trg_generate_recurring ......... desativado
--   jobs http usando o token ....... 9 de 9
--   funções quiz SECURITY DEFINER .. só save_quiz_lead
--   transações com recurring_group_id  477

-- ── desativa_trigger_recorrencia_antigo ─────────────────────────────
-- Conviviam dois motores de recorrência: este trigger (liga as
-- ocorrências por recurring_parent_id) e o gerador em JS
-- (recurring_group_id). Só o segundo permite "editar os seguintes", e
-- os dois juntos duplicavam lançamento. O trigger fica DESATIVADO em
-- vez de removido para não perder o histórico da função caso seja
-- preciso investigar algo antigo.
do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'trg_generate_recurring') then
    alter table public.transactions disable trigger trg_generate_recurring;
  end if;
end $$;

-- ── migra_recorrencias_legadas ──────────────────────────────────────
-- Migração de DADOS, não de schema: cada família antiga ligada por
-- recurring_parent_id recebeu um recurring_group_id comum. Idempotente
-- porque só toca em linha que ainda não tem grupo.
update public.transactions filho
set recurring_group_id = coalesce(
      (select pai.recurring_group_id from public.transactions pai
       where pai.id = filho.recurring_parent_id),
      filho.recurring_parent_id)
where filho.recurring_parent_id is not null
  and filho.recurring_group_id is null;

update public.transactions
set recurring_group_id = id
where is_recurring = true
  and recurring_group_id is null
  and recurring_parent_id is null;

-- ── quiz_placar_sem_definer ─────────────────────────────────────────
-- O placar do quiz era atualizado por função SECURITY DEFINER que
-- recebia o alvo por parâmetro — o jogador podia escrever a pontuação
-- de qualquer outro. Hoje só `save_quiz_lead` permanece DEFINER.
revoke execute on function public.save_quiz_lead() from anon, authenticated;

-- ── cron_jobs_autenticados ──────────────────────────────────────────
-- Os cron jobs chamam Edge Functions por HTTP e antes iam sem
-- credencial: qualquer um que descobrisse a URL disparava o envio de
-- notificação. Passaram a mandar o token guardado em internal_config.
--
-- O comando de cada job já está gravado em cron.job com o token; não é
-- reescrito aqui para não vazar segredo em arquivo versionado nem
-- sobrescrever o agendamento que está funcionando.
--
-- Verificação (deve devolver 9):
--   select count(*) from cron.job
--   where command like '%internal_config%' or command like '%cron_token%';
--
-- Se um dia devolver menos que isso, algum job voltou a ser anônimo.
do $$
declare autenticados int;
begin
  select count(*) into autenticados from cron.job
   where command like '%internal_config%' or command like '%cron_token%';
  if autenticados < 9 then
    raise warning 'Apenas % de 9 cron jobs autenticados — verificar cron.job', autenticados;
  end if;
end $$;
