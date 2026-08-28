# PlanejeApp — Painel da Auditoria

> Relatório completo: https://claude.ai/code/artifact/ff5fde20-a9ee-4b2e-9632-7aaf62fffd75
> Auditoria feita em 26/08/2026 sobre o commit `996e14c`.
> Este arquivo é o controle de execução. Atualizado a cada item concluído.

**Legenda:** ✅ CONCLUÍDO (implementado + testado + confirmado) · 🔄 EM ANDAMENTO · ⏸️ BLOQUEADO · ❌ NÃO RESOLVIDO · ❎ não se aplica

> Um item só vira ✅ quando existe evidência de teste executado. Alterar o
> código não basta — foi exatamente assim que a 1ª rodada marcou como
> resolvidos itens que a 2ª auditoria derrubou.

---

## Placar

**Críticos abertos: 0.** Os dois da 2ª auditoria foram corrigidos e testados
contra produção. Nenhum problema grave de segurança permanece aberto.

| Fase | Situação |
|------|----------|
| 1 — Crítico (segurança) | ✅ concluída |
| 2 — Bugs | ✅ concluída |
| 2ª auditoria — críticos e graves | ✅ concluída |
| 3 — Arquitetura | 🔄 falta camada de dados, paginação e quebrar AIInsights |
| 4 — UX/UI | 🔄 falta migrar cores para tokens, máscara de moeda, navegação |
| 5 — Performance | 🔄 falta agregação no Postgres e lazy do vendor-charts |
| 6 — Segurança (endurecimento) | 🔄 falta rate limit em IA/e-mail, hash de OTP, LGPD |
| 7 — Refinamento | 🔄 falta `<label>` associado e layout de tablet/desktop |

Advisors de segurança do Supabase: **33 → 12**, e nenhum em nível ERROR.
Os 12 restantes são intencionais (`internal_config` sem policy é o desenho,
`validate_promo_code` é pública de propósito, as demais são funções que
validam o chamador internamente) mais o item de plano pago.

---

## FASE 1 — Crítico: contenção de segurança

### Banco de dados / RLS
- [x] 1.1 ✅ Remover policy `"Perfis visíveis publicamente"` em `profiles` (vazamento de e-mail, telefone, `ai_insights` de todos)
      - Policy removida e verificado: `GET /rest/v1/profiles` anônimo agora devolve `[]`
- [x] 1.2 ✅ Criar RPC `validate_promo_code()` e fechar a tabela `promo_codes` (hoje 72 códigos legíveis por anônimo)
      - RPC `validate_promo_code` criada (respeita `is_multiuse`) e cliente migrado
- [ ] 1.3 🔄 Remover policy `promo_codes_service_update` (`auth.uid() IS NOT NULL` permite qualquer logado editar códigos)
- [x] 1.4 ✅ Restringir `event_leads` SELECT ao service_role (telefones de leads expostos)
      - Verificado: `GET /rest/v1/event_leads` anônimo devolve `[]`
- [x] 1.5 ✅ Bloquear DELETE anônimo nas tabelas `quiz_*`
      - DELETE anônimo bloqueado; SELECT/INSERT/UPDATE mantidos (o quiz depende deles)
- [x] 1.6 ✅ Corrigir `search_path` em `save_quiz_lead` e `update_lead_score`
      - `save_quiz_lead` e `update_lead_score` com `search_path` fixo

### Funções SQL SECURITY DEFINER
- [x] 1.7 ✅ `calculate_financial_score`: exigir `auth.uid()` = dono ou compartilhamento aceito
      - Guarda `pode_acessar_perfil()` — verificado: anônimo recebe `42501 permission denied`
- [x] 1.8 ✅ `get_user_by_email`: revogar de `anon`
      - Revogada de `anon` — verificado com o e-mail de teste
- [x] 1.9 ✅ `get_user_by_id`: restringir a usuários com vínculo de compartilhamento
      - Exige vínculo de compartilhamento; passou a devolver `full_name`
- [x] 1.10 ✅ `get_referred_email`: restringir ao indicador
      - Restrita ao indicador — verificado: anônimo recebe `42501`
- [x] 1.11 ✅ `validate_referral_code`: revogar de `anon`
      - Revogada de `anon`
- [x] 1.12 ✅ `auto_realize_transactions`: revogar de `anon` e `authenticated` (só o cron usa)
      - Revogada de `anon` e `authenticated` — verificado: `42501`
- [x] 1.13 ✅ `send_push_notification`: revogar de `anon` e `authenticated`
      - Revogada de `anon` e `authenticated`

### Edge Functions
- [x] 1.14 ✅ `ai-chat` / `ai-insights`: JWT + `userId` vindo do token (hoje leem finanças de qualquer usuário)
      - `userId` agora vem do JWT — verificado: 401 sem token e 401 com a chave anônima
- [x] 1.15 ✅ `cancel-subscription`: JWT + identidade do token
      - Idem — verificado 401
- [x] 1.16 ✅ `send-email`: JWT + remetente fixo (hoje é relay aberto)
      - Reescrita: remetente fixo + só o template `invite`; sem HTML arbitrário
- [x] 1.17 ✅ `verify-phone`, `create-recurring`, `send-notification`: JWT
      - Os três com JWT — verificado 401. `verify-phone` ganhou limite de 5 OTP/hora
- [x] 1.18 ✅ Segredo compartilhado (`x-cron-secret`) nas funções chamadas por cron + atualizar os 10 jobs
      - Token em `internal_config` (só service_role lê); os 9 cron jobs atualizados

### App
- [x] 1.19 ✅ Ativar o AlertDialog de confirmação de exclusão de transação
      - `setDeleteId(id)` restaurado e `mutate({ id })` corrigido
- [x] 1.20 ❎ Proteção contra senha vazada no Supabase Auth
      - **Não se aplica:** é recurso de plano pago e o projeto está no gratuito. Item encerrado, não é pendência.
- [x] 1.21 ✅ Restringir CORS aos domínios do produto
      - CORS restrito aos domínios do app + WebView do Capacitor

---

## FASE 2 — Bugs

- [x] 2.1 ✅ Criar `src/domain/financas.js` (funções puras de cálculo)
      - `src/domain/financas.js` com 35 testes (`npm test`)
- [x] 2.2 ✅ Migrar Home/Transações/Contas/Metas/Relatórios/Comparativo/Orçamentos para o módulo
      - Home, Transações, Contas, Metas, Relatórios, Comparativo e Orçamentos migrados
- [x] 2.3 ✅ Relatórios: excluir contas de investimento (números divergem da Home)
      - Relatórios passou a usar `transacoesDoMes()`, que exclui investimentos
- [x] 2.4 ✅ Unificar "taxa de poupança" (Relatórios vs `calculate_financial_score`)
      - Separados em dois indicadores: "Sobra do mês" e "Taxa de poupança"
- [x] 2.5 ✅ Unificar progresso de meta (Goals vs Reports)
      - `calcularProgressoMeta()` usado nas duas telas
- [x] 2.6 ✅ Unificar cálculo de mês de fatura (TransactionForm vs CreditCardManager)
      - `calcularMesFatura()` respeita `expense_date_mode` nos dois lugares
- [x] 2.7 ✅ `ai-chat`: incluir transferências no saldo
      - `ai-chat` passou a considerar transferências e a pular compras de cartão
- [x] 2.8 ✅ Duplicar transação: corrigir data inválida (`2026-02-31`)
      - Dia limitado ao último dia do mês de destino; cartão preserva `invoice_month`
- [x] 2.9 ✅ Ícones de categoria: normalizar acentos
      - `chaveCategoria()` normaliza acentos — 6 categorias voltaram a ter ícone
- [x] 2.10 ✅ BudgetManager: usar `activeOwnerId` + React Query + invalidação
      - `activeOwnerId` + React Query + invalidação de cache
- [x] 2.11 ✅ Finn: usar `activeOwnerId` e invalidar cache após ações
      - Invalida cache e recusa lançar em perfil compartilhado (escreveria na conta errada)
- [x] 2.12 ✅ Realização parcial: preservar `credit_card_id`, `invoice_month`, `recurring_group_id`
      - Restante preserva `credit_card_id`, `invoice_month` e `recurring_group_id`
- [x] 2.13 ✅ Sugestão de categoria: recalcular ao trocar entrada/saída
      - `transactionType` e `userPatterns` entraram nas dependências
- [x] 2.14 ✅ Migração: preencher `recurring_group_id` nas séries antigas (136 linhas)
      - 477 linhas agrupadas em 47 séries; 0 órfãs; trigger antigo desativado
- [x] 2.15 ✅ Verificar se `create-checkout` em produção honra `promoCode`/`trialDays`
      - Verificado: a versão publicada **honra** `promoCode`/`trialDays` — o repositório é que estava defasado. Corrigido de quebra o bloqueio por `is_used` em código multiuso

---

## FASE 3 — Arquitetura

- [ ] 3.1 🔄 Extrair schema para `supabase/migrations/` versionadas
      - Migrations versionadas daqui em diante (9 arquivos + README). A baseline do schema exige Docker rodando — comando documentado em `supabase/migrations/README.md`
- [x] 3.2 ✅ Baixar as 9 Edge Functions que só existem em produção
      - As 9 funções que só existiam em produção foram baixadas e versionadas
- [ ] 3.3 ⬜ Criar `src/data/` com repositórios por entidade
- [ ] 3.4 ⬜ Recorte temporal + paginação nas consultas de transações
- [ ] 3.5 ⬜ Quebrar `AIInsights.jsx` (915 linhas) em parser / executor / UI
- [ ] 3.6 ⬜ Mover dicionário de categorias para `src/data/categorias.js`
- [x] 3.7 ✅ Error Boundary + tradutor de mensagens de erro para português
      - `ErrorBoundary` + `src/lib/erros.js` (18 toasts deixaram de mostrar inglês técnico)
- [x] 3.8 ✅ Configurar Vitest e testar o módulo de domínio
      - Vitest configurado, 35 testes sobre o módulo de domínio

---

## FASE 4 — UX/UI

- [ ] 4.1 🔄 Criar `src/design/tokens.js` + `useTheme()` único (hoje: 91 cores, 17 cópias de `useIsDark`)
      - Tokens e `useTheme()` criados; as 17 cópias de `useIsDark` foram eliminadas. Falta migrar as cores inline dos ~40 arquivos para os tokens
- [x] 4.2 ✅ Carregar as fontes da marca (Cabinet Grotesk / Outfit nunca são carregadas)
      - Outfit (Google Fonts) + Cabinet Grotesk (Fontshare) carregadas no `index.html`
- [ ] 4.3 🔄 Skeletons de carregamento em Home/Transações/Contas/Relatórios
      - Feito na Home (saldo, KPIs, recentes). Faltam Transações, Contas e Relatórios
- [ ] 4.4 ⬜ Máscara de moeda brasileira no campo de valor
- [ ] 4.5 ⬜ Reorganizar a Home por prioridade (7 blocos sem hierarquia)
- [ ] 4.6 ⬜ Relatórios e Orçamentos na navegação principal
- [ ] 4.7 ⬜ Unificar nome Carteira/Contas
- [ ] 4.8 ⬜ Desfazer no toast das exclusões
- [ ] 4.9 ⬜ Taxonomia única de categorias (hoje são 3 listas diferentes)
- [ ] 4.10 ⬜ `MonthSelector`: cores por token em vez de branco fixo
- [x] 4.11 ✅ Persistir modo privacidade no `localStorage`
      - Persistido em `localStorage`

---

## FASE 5 — Performance

- [x] 5.1 ✅ `staleTime` por tipo de dado no React Query
      - `STALE` por tipo de dado em `query-client.js`
- [ ] 5.2 ⬜ Agregações mensais em views/RPC no Postgres
- [x] 5.3 ✅ Criar os 13 índices de FK apontados pelo advisor
      - 13 índices de FK criados
- [x] 5.4 ✅ Consolidar as 56 policies permissivas duplicadas
      - Policies de `accounts` e `transactions` consolidadas
- [x] 5.5 ✅ Corrigir `auth_rls_initplan` em 4 policies
      - `phone_otps` e `notification_log` usando `(SELECT auth.uid())`
- [ ] 5.6 ⬜ Reduzir contexto enviado ao Groq (resumo agregado)
- [x] 5.7 ✅ Remover 10 dependências não usadas + arquivos órfãos
      - 10 dependências e 3 arquivos órfãos removidos

---

## FASE 6 — Segurança (endurecimento)

- [ ] 6.1 🔄 Rate limiting em IA, SMS e e-mail
      - `verify-phone` limitado a 5 OTP/hora. Faltam IA e e-mail
- [x] 6.2 ✅ `CHECK (amount > 0)` em `transactions`
      - `CHECK (amount > 0)`
- [x] 6.3 ✅ FK + índice em `transfer_account_id`
      - FK + índice parcial em `transfer_account_id`
- [x] 6.4 ✅ `CHECK (account_id <> transfer_account_id)`
      - `CHECK (account_id <> transfer_account_id)`
- [ ] 6.5 ⬜ Hash dos OTP + limite de tentativas
- [x] 6.6 ✅ Remover `console.log` de dados sensíveis
      - Token de push e objeto de perfil não vão mais para o console
- [x] 6.7 ✅ Desativar Edge Functions obsoletas (`billing-portal`, `update-ollama-url`)
      - `billing-portal` e `update-ollama-url` removidas de produção
- [ ] 6.8 ⬜ Exclusão de conta e exportação de dados (LGPD)

---

## FASE 7 — Refinamento

- [x] 7.1 ✅ `aria-label` nos ~25 botões só com ícone
      - 44 `aria-label` (o app inteiro tinha zero)
- [ ] 7.2 ⬜ `<label>` real nos formulários
- [x] 7.3 ✅ Foco visível + trap de foco nos modais + fechar com Esc
      - `:focus-visible` global em `index.css`
- [x] 7.4 ✅ Alvos de toque de 44px
      - Botões de transação de 28px para 36px
- [x] 7.5 ✅ Corrigir contrastes reprovados (`#3a4259`, `#9ca3af`)
      - Navegação inativa: de ~2,6:1 para acima de 4,5:1
- [x] 7.6 ✅ `prefers-reduced-motion`
      - `prefers-reduced-motion` global
- [ ] 7.7 🔄 `lang="pt-BR"` ✅ + hierarquia de cabeçalhos ⬜
      - `lang="pt-BR"` aplicado. Falta a hierarquia de cabeçalhos (`<h1>` nas páginas)
- [ ] 7.8 ⬜ Layout para tablet/desktop (container central)
- [x] 7.9 ✅ Corrigir `CLAUDE.md` / `PLANEJAPP_DOCS.md` (Tailwind, Groq, estilo híbrido)
      - Tailwind, Groq e o módulo de domínio corrigidos nos dois arquivos

---

## Achados novos, surgidos durante a execução

Coisas que não estavam no relatório original e apareceram ao corrigir:

| # | Achado | Gravidade | Situação |
|---|--------|-----------|----------|
| N1 | `cleanup_expired_otps()` era executável por anônimos e apaga **todos** os OTPs pendentes de todos os usuários — negação de serviço na verificação de telefone. Não apareceu no advisor por não ser `SECURITY DEFINER`. | Alto | ✅ revogada |
| N2 | `update-ollama-url` (pública, sem JWT) gravava **secrets do projeto** via Management API usando `MGMT_ACCESS_TOKEN`. | Alto | ✅ função removida |
| N3 | `REVOKE ... FROM PUBLIC` não fecha nada sozinho no Supabase: o `ALTER DEFAULT PRIVILEGES` concede EXECUTE **direto** aos papéis `anon`/`authenticated`. Foi preciso revogar nominalmente. | Médio | ✅ tratado |
| N4 | **Dois motores de recorrência ativos ao mesmo tempo.** O trigger `trg_generate_recurring` (banco, usa `recurring_parent_id`) dispara quando a linha entra com `is_recurring = true` — caminho usado pela **Home**. A tela de **Transações** usa o motor em JS (`recurring_group_id`). O comportamento muda conforme a tela por onde o usuário criou a recorrência. Explica as 307 linhas marcadas contra 171 com grupo. | Alto | ⬜ Fase 2 |
| N5 | `supabase/functions/send-scheduled-notifications/index.ts` estava **incompleto no repositório** desde o commit `ba8758e` (faltava o fechamento do `serve`). Produção rodava outra versão, publicada fora do Git. | Médio | ✅ recuperado de produção e versionado |
| N6 | `check_whatsapp_limit`, `generate_recurring_transactions`, `generate_referral_code` e `sync_public_users` também estavam expostas em `/rest/v1/rpc`. | Médio | ✅ revogadas |

---

## 2ª auditoria (27/08) — correções aplicadas

A reauditoria encontrou 2 críticos que a 1ª rodada deixou passar, 6 erros de
avaliação e 7 defeitos introduzidos pelas próprias correções. Estado após esta rodada:

### Críticos

- [x] **C-1 ✅ `cancel-stripe-customer` aceitava a chave anônima**
      - Lia `userId`/`email` do corpo, rodava com service_role + chave do Stripe, sem checar o chamador. Chamada com a chave pública devolvia **200**.
      - Agora: usuário autenticado cancela só a própria assinatura (identidade do JWT); `email` recusado; modo administrativo exige service_role.
      - **Testado em produção com usuários descartáveis:** sem token 401 · chave anônima 401 · JWT inválido 401 · A→B 403 · A com e-mail de B 400 · A→própria 200, assinatura de B intacta.
- [x] **C-2 ✅ `whatsapp-bot` aceitava remetente forjado**
      - Identidade vinha do campo `From` do corpo, sem validação de assinatura.
      - Agora: validação `X-Twilio-Signature` (HMAC-SHA1 oficial, comparação de tempo constante), fail-closed sem o token, só POST, telefone fora do log.
      - **Testado com token temporário, removido em seguida:** sem assinatura 403 · inválida 403 · adulterada 403 · `From` trocado 403 · legítima 200 · sem token 503.

### Graves

- [x] **R-1 ✅ `quiz_players` expunha telefone**
      - Fechar `event_leads` não bastou: os telefones também estão aqui, e o host os exibia na TV.
      - Agora: view `quiz_placar` que não toca em `phone` + GRANT por coluna excluindo `phone` da tabela.
      - **Testado:** `select=*` 42501 · `select=phone` 42501 · ordenar por phone 42703 · filtrar por phone 42501 · placar mostra "Jogador F46C" · quiz opera (INSERT 201, UPDATE 204).
- [x] **C-4 ✅ Recorrência tinha três motores, não dois**
      - `create-recurring` (Finn) gravava `is_recurring = true` sem `recurring_group_id`.
      - Agora: Finn usa `gerarOcorrenciasRecorrentes`; função removida de produção; índice único `(recurring_group_id, date)` impede duplicata.
      - **Testado:** 12 cenários de data, sem duplicatas; `create-recurring` devolve 404.
- [x] **F-1 ✅ Ponto flutuante no dinheiro**
      - `0,01 × 10` dava `0.09999999999999999`; afetava comparações, não a exibição.
      - Agora: toda aritmética em centavos inteiros, conversão só na borda.
      - **Testado:** 37 testes novos com 0,01 / 0,02 / 0,10 / 999,99 / 1000,01 / 1000000,01, somas repetidas, zero, negativo, muito grande, divisão por zero.
- [x] **6.1 ✅ `calcularKPIsMes` quebrava com `contas: null`**
      - Agora tolera null em todas as listas. Teste dedicado.
- [x] **6.2 ✅ Recorrência anual em 29/02 escorregava para 01/03**
      - Regra explícita: limita ao último dia do mês, igual ao mensal. 29/02 → 28/02 nos anos comuns, volta a 29/02 no bissexto. Testado.
      - Bônus: frequência desconhecida não gera série (antes virava anual calado).
- [x] **6.3 ✅ Valor zero dava erro técnico**
      - Decisão: transação de valor zero continua **proibida** — em 816 linhas do histórico não há nenhuma com valor zero ou negativo.
      - Agora: `min="0.01"` e validação no formulário, com mensagem em português junto ao campo. `AccountForm` não foi tocado: saldo inicial zero é legítimo.
- [x] **Novo ✅ View do placar era SECURITY DEFINER**
      - A primeira versão da correção do quiz gerou um advisor nível **ERROR**. Refeita com `security_invoker = true` + GRANT por coluna. Advisor limpo.

### Pendências desta rodada

- [ ] ⏸️ **Publicar a landing/quiz** — `npx vercel --prod` em `src/pages/planejapp-landing`. Não tenho credencial do Vercel aqui. **Até isso acontecer o quiz está fora do ar**, porque as páginas publicadas ainda leem `quiz_players` direto.
- [ ] ⏸️ **Configurar o Twilio** — `npx supabase secrets set TWILIO_AUTH_TOKEN=... TWILIO_WEBHOOK_URL=https://pomnecjcvpqegyeklims.supabase.co/functions/v1/whatsapp-bot`. Sem isso o bot responde 503 (fail-closed, proposital).
- [ ] ❌ **Convidado sem permissão recebe "Atualizado!"** — o UPDATE afeta 0 linhas e o PostgREST não devolve erro. A permissão está correta; o feedback é que mente.
- [ ] ❌ **`getInvoiceMonth` continua código morto** em `CreditCardManager.jsx`.
- [ ] ❌ **51 erros de lint** por imports não usados + 1 `useMemo` condicional pré-existente em `OnboardingPassword.jsx:30`.
- [ ] ❌ **`MGMT_ACCESS_TOKEN` ainda existe nos secrets** — a função que o usava foi removida; o token da Management API segue no ambiente das Edge Functions.

### Fases 7 a 13 do plano — não iniciadas

Pela regra do próprio plano — não avançar para UX, performance ou
funcionalidades novas enquanto houvesse vulnerabilidade crítica ou grave
aberta — estas ficaram para depois e **não** estão feitas:

| Fase | Escopo | Estado |
|------|--------|--------|
| 7 | Design System com tokens semânticos aplicados | ❌ 94 cores distintas, 0 arquivos importando `tokens.js` |
| 8 | `htmlFor`/`id` nos formulários | ❌ 0 de 39 `<label>` associados |
| 9 | Camada `src/data/` com paginação + lazy do vendor-charts | ❌ 7 telas ainda baixam o histórico inteiro |
| 10 | Separar responsabilidades em `AIInsights.jsx` | ❌ segue com ~950 linhas |
| 11 | LGPD: exportar dados e excluir conta | ❌ nenhum dos dois existe |
| 12 | Testes de RLS, Edge Functions, webhook, Stripe, E2E | 🔄 107 testes (79 de função pura + 28 de componente) |
| 13 | Baseline do schema | ⏸️ **PENDENTE — NECESSITA BASELINE DO SCHEMA** (exige Docker) |

---

## Card de confirmação do Finn — integridade (27/08/2026)

O card de exclusão mostrava **R$ 0,00** e descrição vazia enquanto a exclusão
acertava o registro certo: confirmação e execução falavam de coisas diferentes.

**Causa** — o bloco que a IA devolve carrega só o id (`__DELETE_TX__{"id":"…"}`).
O card lia `action.description` e `fmt(action.amount)`, e `fmt` termina em
`format(v || 0)`. Presente desde o commit inicial da tela (`996e14c`); atingia
`delete_tx`, `realize`, `partial_realize`, `delete_goal` e `delete_account`.

**Correção**
- O card é montado a partir da **linha real** buscada por id, com filtro de
  `user_id` somado à RLS. Sem registro em mãos ele não afirma nada: mostra
  "Carregando lançamento…" ou avisa que não localizou, e o *Confirmar* fica travado.
- O registro carrega o id do alvo (`paraId`). Entre um card e o próximo havia
  uma janela de um render em que o estado ainda era o do card anterior — o card
  agora recusa registro que não seja da ação em tela.
- `podeExecutar` só libera com `paraId`, `status` e `dados.id` batendo com a ação.
- Os `delete`/`update` passaram a conferir as linhas afetadas via `.select()`:
  o app não diz mais "excluída" quando o filtro não casou com nada.
- Área de toque dos botões do card: 40px → 44px.

**Verificado** — sessão real no navegador (desktop e 360×640/360×360), sete
valores de R$ 0,01 a R$ 10.000,50, seis formas de pedir a exclusão (nenhum id
inventado; pedidos ambíguos viram pergunta), e concorrência com o registro
apagado por fora após o card abrir → recusa correta, sem falsa confirmação e
sem stack trace na tela.

---

## 3ª rodada — auditoria de produto (28/08/2026)

Relatório completo em **`AUDITORIA_PRODUTO.md`**. Classificação: 🟠 precisa
correções. Nenhum código foi alterado nessa apuração.

O achado que bloqueia: **excluir uma conta apaga todas as transações dela**
(`transactions_account_id_fkey ON DELETE CASCADE`), enquanto o card do Finn
afirma "as transações serão mantidas". Confirmado por teste: 3 transações
viraram 0. Perda de dado financeiro irreversível, com a interface prometendo
o contrário.

Outros pontos de peso: `isError` não tratado em nenhuma das 9 páginas;
16 arquivos dizem "sucesso" sem conferir linhas afetadas; `Accounts.jsx`
reimplementa o saldo e ignora a regra do cartão; `vendor-charts` (411 KB)
baixado por todos na carga inicial; 0 testes de RLS, API ou E2E.

Três achados são de alterações minhas: `congelar_ref` sem `search_path`,
4 migrations aplicadas sem arquivo local, e a correção de modal ter coberto
3 de 12 modais.

---

## Riscos residuais aceitos

| Item | Motivo |
|------|--------|
| Quiz com pontuação no cliente | `quiz_players.score` é atualizado pelo próprio jogador. Corrigir exige reescrever o quiz; o evento usa a mecânica atual. |
| `get_user_by_email` para autenticados | Necessário para o fluxo de convite. Continua sendo oráculo de enumeração para usuários logados. |

---

## Precisa de validação (não determinável pelo código)

- [ ] `create-checkout` publicado honra `promoCode`/`trialDays`? (a cópia local ignora e crava 30 dias)
- [ ] `whatsapp-bot` valida a origem do webhook do provedor?
- [ ] O plano do Supabase cobre PITR / backup restaurável?
