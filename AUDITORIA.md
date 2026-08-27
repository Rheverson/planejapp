# PlanejeApp — Painel da Auditoria

> Relatório completo: https://claude.ai/code/artifact/ff5fde20-a9ee-4b2e-9632-7aaf62fffd75
> Auditoria feita em 26/08/2026 sobre o commit `996e14c`.
> Este arquivo é o controle de execução. Atualizado a cada item concluído.

**Legenda:** ✅ resolvido · 🔄 em andamento · ⬜ pendente · ⏸️ bloqueado/precisa decisão · ❎ não se aplica

---

## Placar

| Fase | Itens | Concluídos |
|------|-------|-----------|
| 1 — Crítico (segurança) | 18 | 0 |
| 2 — Bugs | 12 | 0 |
| 3 — Arquitetura | 8 | 0 |
| 4 — UX/UI | 9 | 0 |
| 5 — Performance | 6 | 0 |
| 6 — Segurança (endurecimento) | 7 | 0 |
| 7 — Refinamento | 8 | 0 |
| **Total** | **68** | **0** |

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
- [ ] 1.20 ⬜ Ativar proteção contra senha vazada no Supabase Auth
- [x] 1.21 ✅ Restringir CORS aos domínios do produto
      - CORS restrito aos domínios do app + WebView do Capacitor

---

## FASE 2 — Bugs

- [ ] 2.1 ⬜ Criar `src/domain/financas.js` (funções puras de cálculo)
- [ ] 2.2 ⬜ Migrar Home/Transações/Contas/Metas/Relatórios/Comparativo/Orçamentos para o módulo
- [ ] 2.3 ⬜ Relatórios: excluir contas de investimento (números divergem da Home)
- [ ] 2.4 ⬜ Unificar "taxa de poupança" (Relatórios vs `calculate_financial_score`)
- [ ] 2.5 ⬜ Unificar progresso de meta (Goals vs Reports)
- [ ] 2.6 ⬜ Unificar cálculo de mês de fatura (TransactionForm vs CreditCardManager)
- [x] 2.7 ✅ `ai-chat`: incluir transferências no saldo
      - `ai-chat` passou a considerar transferências e a pular compras de cartão
- [x] 2.8 ✅ Duplicar transação: corrigir data inválida (`2026-02-31`)
      - Dia limitado ao último dia do mês de destino; cartão preserva `invoice_month`
- [x] 2.9 ✅ Ícones de categoria: normalizar acentos
      - `chaveCategoria()` normaliza acentos — 6 categorias voltaram a ter ícone
- [ ] 2.10 ⬜ BudgetManager: usar `activeOwnerId` + React Query + invalidação
- [ ] 2.11 ⬜ Finn: usar `activeOwnerId` e invalidar cache após ações
- [ ] 2.12 ⬜ Realização parcial: preservar `credit_card_id`, `invoice_month`, `recurring_group_id`
- [ ] 2.13 ⬜ Sugestão de categoria: recalcular ao trocar entrada/saída
- [ ] 2.14 ⬜ Migração: preencher `recurring_group_id` nas séries antigas (136 linhas)
- [ ] 2.15 ⬜ Verificar se `create-checkout` em produção honra `promoCode`/`trialDays`

---

## FASE 3 — Arquitetura

- [ ] 3.1 🔄 Extrair schema para `supabase/migrations/` versionadas
- [x] 3.2 ✅ Baixar as 9 Edge Functions que só existem em produção
      - As 9 funções que só existiam em produção foram baixadas e versionadas
- [ ] 3.3 ⬜ Criar `src/data/` com repositórios por entidade
- [ ] 3.4 ⬜ Recorte temporal + paginação nas consultas de transações
- [ ] 3.5 ⬜ Quebrar `AIInsights.jsx` (915 linhas) em parser / executor / UI
- [ ] 3.6 ⬜ Mover dicionário de categorias para `src/data/categorias.js`
- [ ] 3.7 ⬜ Error Boundary + tradutor de mensagens de erro para português
- [ ] 3.8 ⬜ Configurar Vitest e testar o módulo de domínio

---

## FASE 4 — UX/UI

- [ ] 4.1 ⬜ Criar `src/design/tokens.js` + `useTheme()` único (hoje: 91 cores, 17 cópias de `useIsDark`)
- [x] 4.2 ✅ Carregar as fontes da marca (Cabinet Grotesk / Outfit nunca são carregadas)
      - Outfit (Google Fonts) + Cabinet Grotesk (Fontshare) carregadas no `index.html`
- [ ] 4.3 ⬜ Skeletons de carregamento em Home/Transações/Contas/Relatórios
- [ ] 4.4 ⬜ Máscara de moeda brasileira no campo de valor
- [ ] 4.5 ⬜ Reorganizar a Home por prioridade (7 blocos sem hierarquia)
- [ ] 4.6 ⬜ Relatórios e Orçamentos na navegação principal
- [ ] 4.7 ⬜ Unificar nome Carteira/Contas
- [ ] 4.8 ⬜ Desfazer no toast das exclusões
- [ ] 4.9 ⬜ Taxonomia única de categorias (hoje são 3 listas diferentes)
- [ ] 4.10 ⬜ `MonthSelector`: cores por token em vez de branco fixo
- [ ] 4.11 ⬜ Persistir modo privacidade no `localStorage`

---

## FASE 5 — Performance

- [ ] 5.1 ⬜ `staleTime` por tipo de dado no React Query
- [ ] 5.2 ⬜ Agregações mensais em views/RPC no Postgres
- [ ] 5.3 ⬜ Criar os 13 índices de FK apontados pelo advisor
- [ ] 5.4 ⬜ Consolidar as 56 policies permissivas duplicadas
- [ ] 5.5 ⬜ Corrigir `auth_rls_initplan` em 4 policies
- [ ] 5.6 ⬜ Reduzir contexto enviado ao Groq (resumo agregado)
- [ ] 5.7 ⬜ Remover 10 dependências não usadas + arquivos órfãos

---

## FASE 6 — Segurança (endurecimento)

- [ ] 6.1 ⬜ Rate limiting em IA, SMS e e-mail
- [ ] 6.2 ⬜ `CHECK (amount > 0)` em `transactions`
- [ ] 6.3 ⬜ FK + índice em `transfer_account_id`
- [ ] 6.4 ⬜ `CHECK (account_id <> transfer_account_id)`
- [ ] 6.5 ⬜ Hash dos OTP + limite de tentativas
- [ ] 6.6 ⬜ Remover `console.log` de dados sensíveis
- [x] 6.7 ✅ Desativar Edge Functions obsoletas (`billing-portal`, `update-ollama-url`)
      - `billing-portal` e `update-ollama-url` removidas de produção
- [ ] 6.8 ⬜ Exclusão de conta e exportação de dados (LGPD)

---

## FASE 7 — Refinamento

- [ ] 7.1 ⬜ `aria-label` nos ~25 botões só com ícone
- [ ] 7.2 ⬜ `<label>` real nos formulários
- [ ] 7.3 ⬜ Foco visível + trap de foco nos modais + fechar com Esc
- [ ] 7.4 ⬜ Alvos de toque de 44px
- [ ] 7.5 ⬜ Corrigir contrastes reprovados (`#3a4259`, `#9ca3af`)
- [ ] 7.6 ⬜ `prefers-reduced-motion`
- [ ] 7.7 🔄 `lang="pt-BR"` ✅ + hierarquia de cabeçalhos ⬜
- [ ] 7.8 ⬜ Layout para tablet/desktop (container central)
- [ ] 7.9 ⬜ Corrigir `CLAUDE.md` / `PLANEJAPP_DOCS.md` (Tailwind, Groq, estilo híbrido)

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
