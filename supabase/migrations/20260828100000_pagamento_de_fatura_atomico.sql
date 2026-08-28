-- Pagamento de fatura: uma fatura, um pagamento.
--
-- O QA provou que duas abas pagavam a mesma fatura e geravam dois
-- débitos. A verificação no cliente não resolve: entre consultar e
-- gravar existe uma janela, e as duas requisições passam por ela.
--
-- A garantia tem que estar no banco. `credit_card_invoices` já existia
-- para isso — com `month`, `status`, `paid_amount` e
-- `payment_transaction_id` — e nunca foi usada: 0 linhas. Agora ela é a
-- trava. O índice único (cartão, mês) faz a segunda requisição perder,
-- e quem perde recebe "já paga" em vez de criar outro débito.

-- ── a trava ─────────────────────────────────────────────────────────
create unique index if not exists credit_card_invoices_cartao_mes_key
  on public.credit_card_invoices (credit_card_id, month);

-- ── a operação inteira, numa transação só ───────────────────────────
create or replace function public.pagar_fatura(
  p_credit_card_id uuid,
  p_invoice_month  text,
  p_data           date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user      uuid := auth.uid();
  v_cartao    record;
  v_total     numeric;
  v_qtd       int;
  v_pagamento uuid;
  v_data      date := coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date);
begin
  if v_user is null then
    raise exception 'sem sessão' using errcode = '42501';
  end if;

  -- O cartão precisa ser de quem está chamando. Sem esta checagem, uma
  -- função SECURITY DEFINER que recebe o alvo por parâmetro deixaria
  -- qualquer um pagar a fatura de qualquer cartão.
  select * into v_cartao from public.credit_cards
   where id = p_credit_card_id and user_id = v_user;
  if not found then
    raise exception 'cartão não encontrado' using errcode = '42501';
  end if;

  if v_cartao.account_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'sem_conta',
      'mensagem', 'Este cartão não tem conta vinculada para o débito.');
  end if;

  -- Só as compras ainda em aberto entram na conta. Se não houver
  -- nenhuma, a fatura já foi paga — e o débito não deve existir.
  select coalesce(sum(amount), 0), count(*)
    into v_total, v_qtd
    from public.transactions
   where user_id = v_user
     and credit_card_id = p_credit_card_id
     and invoice_month = p_invoice_month
     and is_realized is distinct from true;

  if v_qtd = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'ja_paga',
      'mensagem', 'Esta fatura já constava como paga. Nenhum débito foi lançado.');
  end if;

  -- A trava: quem chegar depois esbarra no índice único e cai no
  -- exception handler abaixo, sem criar débito nenhum.
  begin
    insert into public.credit_card_invoices
      (credit_card_id, user_id, month, closing_date, due_date, total_amount, paid_amount, status)
    values (p_credit_card_id, v_user, p_invoice_month,
            v_data, v_data, v_total, v_total, 'paid');
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'motivo', 'ja_paga',
      'mensagem', 'Esta fatura já foi paga.');
  end;

  insert into public.transactions
    (user_id, description, amount, type, category, account_id, date, is_realized, notes)
  values (v_user,
          'Pagamento fatura ' || v_cartao.name || ' ' || p_invoice_month,
          v_total, 'expense', 'faturas', v_cartao.account_id, v_data, true,
          'Fatura ' || p_invoice_month)
  returning id into v_pagamento;

  update public.credit_card_invoices
     set payment_transaction_id = v_pagamento
   where credit_card_id = p_credit_card_id and month = p_invoice_month;

  update public.transactions
     set is_realized = true
   where user_id = v_user
     and credit_card_id = p_credit_card_id
     and invoice_month = p_invoice_month;

  return jsonb_build_object('ok', true, 'total', v_total, 'compras', v_qtd,
                            'pagamento_id', v_pagamento);
end $$;

revoke execute on function public.pagar_fatura(uuid, text, date) from anon;
grant  execute on function public.pagar_fatura(uuid, text, date) to authenticated;

comment on function public.pagar_fatura(uuid, text, date) is
  'Paga a fatura de um cartão numa única transação. O índice único '
  '(credit_card_id, month) garante um pagamento por fatura mesmo com '
  'requisições simultâneas.';

-- `revoke ... from anon` não basta: o Supabase concede EXECUTE via
-- PUBLIC (ALTER DEFAULT PRIVILEGES) e o papel anon herda dali. O
-- advisor pegou isto logo depois da primeira versão desta migration.
revoke execute on function public.pagar_fatura(uuid, text, date) from public;
