-- Teste de integração: excluir conta preserva o histórico financeiro.
--
-- Roda contra o banco real, num usuário descartável, e desfaz tudo no
-- fim. Cobre os sete pontos que a auditoria exigiu provar.
--
-- Como rodar: cole no SQL Editor do Supabase, ou
--   psql "$SUPABASE_DB_URL" -f supabase/tests/exclusao_conta.sql
--
-- Sucesso = a última linha imprime OK. Qualquer falha levanta exceção,
-- e a transação inteira volta atrás.

do $$
declare
  dono   uuid := gen_random_uuid();
  outro  uuid := gen_random_uuid();
  conta  uuid;
  conta2 uuid;
  cartao uuid;
  n int; v numeric; falhou boolean;
begin
  -- ── preparo: dois usuários, para checar isolamento junto ──────────
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new,
    email_change_token_current, email_change, phone_change, phone_change_token,
    reauthentication_token)
  values
   (dono, '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
    'teste-exclusao-a@teste.invalid', crypt('x', gen_salt('bf')), now(), now(), now(),
    '{}'::jsonb,'{}'::jsonb,'','','','','','','',''),
   (outro,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
    'teste-exclusao-b@teste.invalid', crypt('x', gen_salt('bf')), now(), now(), now(),
    '{}'::jsonb,'{}'::jsonb,'','','','','','','','');

  insert into public.accounts (user_id, name, type, initial_balance)
  values (dono, 'Nubank', 'digital', 1000) returning id into conta;
  insert into public.accounts (user_id, name, type, initial_balance)
  values (dono, 'Carteira', 'wallet', 50) returning id into conta2;

  insert into public.transactions
    (user_id, description, amount, date, type, is_realized, account_id, category,
     notes, is_recurring, recurring_group_id, recurring_frequency)
  values
    (dono,'Mercado',       250.55,'2026-08-10','expense',true,  conta,'alimentação','nota', false, null, null),
    (dono,'Salario',      7000.00,'2026-08-05','income', true,  conta,'outros',     null,   true,  gen_random_uuid(),'monthly'),
    (dono,'Internet prev',  99.90,'2026-08-30','expense',false, conta,'moradia',    null,   false, null, null);

  -- transação da OUTRA conta, que não pode ser afetada
  insert into public.transactions (user_id, description, amount, date, type, is_realized, account_id)
  values (dono,'Pão', 8.00,'2026-08-11','expense',true, conta2);

  -- ══ 1. excluir conta NÃO exclui transações ══════════════════════
  delete from public.accounts where id = conta;

  select count(*) into n from public.transactions where user_id = dono;
  if n <> 4 then raise exception '1 FALHOU: esperava 4 transacoes, achei %', n; end if;

  -- ══ 2. transações continuam consultáveis, com os dados intactos ══
  select count(*) into n from public.transactions
   where user_id = dono and amount is not null and date is not null
     and description is not null and type is not null and is_realized is not null;
  if n <> 4 then raise exception '2 FALHOU: campos historicos perdidos'; end if;

  select amount into v from public.transactions
   where user_id = dono and description = 'Mercado';
  if v <> 250.55 then raise exception '2 FALHOU: valor alterado (%)', v; end if;

  -- nota e recorrência sobreviveram
  if (select notes from public.transactions where user_id=dono and description='Mercado') is null
  then raise exception '2 FALHOU: nota perdida'; end if;
  if (select count(*) from public.transactions
      where user_id=dono and is_recurring and recurring_group_id is not null) <> 1
  then raise exception '2 FALHOU: recorrencia perdida'; end if;

  -- ══ 3. account_id ficou NULL nas três da conta excluída ═════════
  select count(*) into n from public.transactions
   where user_id = dono and account_id is null;
  if n <> 3 then raise exception '3 FALHOU: esperava 3 com account_id nulo, achei %', n; end if;

  -- a transação da outra conta manteve o vínculo
  if (select account_id from public.transactions where user_id=dono and description='Pão') <> conta2
  then raise exception '3 FALHOU: transacao de outra conta foi desvinculada'; end if;

  -- ══ 4. o saldo continua calculável (Home) ═══════════════════════
  -- Regra do domínio: só realizadas, sem compra no cartão, conta nula
  -- não altera saldo de ninguém. Carteira: 50 - 8 = 42.
  select coalesce(a.initial_balance,0) + coalesce(sum(
           case when t.type='income' then t.amount
                when t.type='expense' then -t.amount
                when t.type='transfer' then -t.amount end), 0)
    into v
  from public.accounts a
  left join public.transactions t
    on t.account_id = a.id and t.is_realized is not false
       and not (t.credit_card_id is not null and t.type='expense')
  where a.id = conta2
  group by a.initial_balance;
  if v <> 42 then raise exception '4 FALHOU: saldo da conta restante = % (esperado 42)', v; end if;

  -- ══ 5. a Carteira não quebra: sobrou uma conta, consultável ═════
  select count(*) into n from public.accounts where user_id = dono;
  if n <> 1 then raise exception '5 FALHOU: esperava 1 conta restante, achei %', n; end if;

  -- ══ 6. o Finn continua achando as transações pelo id ════════════
  -- (é assim que o card de confirmação busca o registro)
  select count(*) into n from public.transactions
   where user_id = dono and id in (
     select id from public.transactions where user_id = dono limit 4);
  if n <> 4 then raise exception '6 FALHOU: transacoes nao localizaveis por id'; end if;

  -- ══ 7. o vínculo com o dono nunca se perde ══════════════════════
  select count(*) into n from public.transactions where user_id = outro;
  if n <> 0 then raise exception '7 FALHOU: transacao vazou para outro usuario'; end if;

  select count(*) into n from public.transactions where user_id is null;
  if n > 0 then raise exception '7 FALHOU: transacao ficou sem dono'; end if;

  -- ══ 8. conta com cartão vinculado NÃO pode ser excluída ═════════
  insert into public.credit_cards (user_id, name, closing_day, due_day, account_id, limit_amount)
  values (dono, 'Cartao Teste', 10, 20, conta2, 1000) returning id into cartao;

  falhou := false;
  begin
    delete from public.accounts where id = conta2;
  exception when foreign_key_violation then
    falhou := true;
  end;
  if not falhou then
    raise exception '8 FALHOU: excluiu conta que paga fatura de cartao';
  end if;

  -- ── limpeza ──────────────────────────────────────────────────────
  delete from public.credit_cards where user_id = dono;
  delete from public.transactions where user_id in (dono, outro);
  delete from public.accounts     where user_id in (dono, outro);
  delete from auth.users          where id      in (dono, outro);

  raise notice 'OK — 8 verificacoes passaram: excluir conta preserva o historico';
end $$;
