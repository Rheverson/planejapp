-- Conta se arquiva, não se exclui.
--
-- Em 28/08/2026 o FK `transactions_account_id_fkey` passou de CASCADE
-- para SET NULL, para excluir conta parar de apagar o histórico. Isso
-- resolveu a perda de dados e criou um rombo de balanço adiante:
-- excluir uma conta com 500 lançamentos tira o saldo dela do patrimônio
-- e deixa os 500 no fluxo para sempre. O mês passado deixa de fechar.
--
-- Arquivar resolve os dois lados. O `initial_balance` e os movimentos
-- continuam existindo, então a matemática de qualquer mês anterior
-- continua fechando; a conta só some das listas e dos seletores, que é
-- o que o usuário queria ao "excluir".
--
-- A coluna `is_active` JÁ EXISTIA nesta tabela desde o início, com
-- default true, e nunca foi lida por nenhuma linha do app. É a mesma
-- convenção que `credit_cards` e `budgets` já usam para desativar sem
-- apagar. Não faz sentido criar `archived_at` ao lado dela.
--
-- Esta migration só endurece o que já está lá: sem nulo, com default
-- explícito e com índice para a consulta que passa a ser a mais comum
-- ("as contas ativas deste usuário").

-- Nulo aqui seria ambíguo: nem ativa nem arquivada. Hoje são 0 linhas,
-- mas a coluna aceitava.
update public.accounts set is_active = true where is_active is null;

alter table public.accounts alter column is_active set default true;
alter table public.accounts alter column is_active set not null;

create index if not exists accounts_ativas_por_usuario
  on public.accounts (user_id) where is_active;

comment on column public.accounts.is_active is
  'false = conta arquivada. Some das listas e dos seletores, mas '
  'permanece em todo cálculo de saldo, KPI e fluxo — senão os meses '
  'anteriores deixam de fechar. Excluir de verdade nunca: o histórico '
  'financeiro depende dela.';
