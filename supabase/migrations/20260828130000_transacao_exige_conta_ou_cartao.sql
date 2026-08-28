-- Todo lançamento precisa dizer de onde o dinheiro saiu ou entrou.
--
-- O teste de fechamento mensal encontrou 26 transações com `account_id`
-- nulo e sem cartão, somando R$ 5.550,16 em 4 usuários. Elas entram nas
-- Saídas do mês (`transacoesDoMes` não olha conta) mas não movem
-- patrimônio (`calcularSaldosPorConta` faz `if (!t.account_id) return`).
-- O app passa a dizer que saiu mais dinheiro do que de fato saiu das
-- contas.
--
-- NENHUMA veio de exclusão de conta: o `SET NULL` só entrou em
-- 28/08/2026 e antes disso o FK era CASCADE, que apagava as transações
-- junto com a conta. Todas nasceram com o campo Carteira em branco, que
-- o formulário aceitava. Cinco delas eram recorrentes e viraram 19
-- linhas sozinhas.
--
-- A origem foi fechada nas quatro superfícies que escrevem transação
-- (formulário, Finn simples, Finn recorrente e whatsapp-bot). Esta
-- constraint é a rede embaixo: se algum caminho novo esquecer, o banco
-- recusa em vez de gravar um lançamento que não fecha.
--
-- NOT VALID de propósito: vale para linha nova, não mexe nas 26 que já
-- existem. Elas são histórico real do usuário e a decisão de
-- classificá-las é dele, não nossa. Validar depois, se um dia forem
-- corrigidas:
--   alter table public.transactions validate constraint transactions_precisa_de_origem;

alter table public.transactions
  drop constraint if exists transactions_precisa_de_origem;

alter table public.transactions
  add constraint transactions_precisa_de_origem
  check (account_id is not null or credit_card_id is not null)
  not valid;

comment on constraint transactions_precisa_de_origem on public.transactions is
  'Lançamento sem conta e sem cartão entra no fluxo e não move patrimônio. '
  'NOT VALID: guarda linha nova, preserva as 26 órfãs históricas.';
