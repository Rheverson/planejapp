-- Excluir conta bancária deixa de apagar o histórico financeiro.
--
-- O problema: `transactions_account_id_fkey` estava com ON DELETE CASCADE.
-- Excluir uma conta apagava todas as transações dela — valor, data,
-- descrição, categoria, recorrência, tudo. Irreversível, e a interface
-- prometia exatamente o contrário: "A conta será removida mas as
-- transações serão mantidas."
--
-- Confirmado por teste antes desta migration: 3 transações viraram 0.
--
-- A escolha por SET NULL não é arbitrária. Ela já é o comportamento do
-- outro lado da mesma tabela: `transfer_account_id` sempre foi SET NULL.
-- E o modelo já convive com conta ausente — havia 56 transações com
-- `account_id` nulo antes desta mudança, e o domínio financeiro trata
-- esse caso de propósito ("despesas sem conta vinculada entram").
--
-- Histórico financeiro não se apaga por efeito colateral de outra ação.

alter table public.transactions
  drop constraint if exists transactions_account_id_fkey;

alter table public.transactions
  add constraint transactions_account_id_fkey
  foreign key (account_id) references public.accounts(id)
  on delete set null;

-- `credit_cards.account_id` continua NO ACTION de propósito: um cartão
-- sem conta de débito não sabe de onde pagar a fatura. Excluir uma conta
-- com cartão vinculado deve falhar e ser explicada ao usuário, não
-- desvincular em silêncio.

comment on constraint transactions_account_id_fkey on public.transactions is
  'SET NULL: excluir a conta preserva a transação, apenas desvincula. '
  'Nunca voltar para CASCADE — apaga histórico financeiro.';
