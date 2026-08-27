# PlanejeApp — Documentação Técnica Completa

> Documento gerado em 26/08/2026 e revisado em 27/08/2026 pela auditoria (ver `AUDITORIA.md`).
> Mantido por: Rheverson Gois

---

## 1. Visão Geral

**PlanejeApp** é um sistema web de controle financeiro pessoal com IA (o assistente **Finn**).
Permite registrar entradas e saídas, controlar contas, cartões de crédito, transações recorrentes,
metas, orçamentos e receber insights financeiros personalizados.

- **App:** https://app.planejapp.com.br
- **Landing:** https://planejapp.com.br
- **Repositório:** https://github.com/Rheverson/planejapp.git
- **Supabase project:** `pomnecjcvpqegyeklims`
- **Supabase URL:** `https://pomnecjcvpqegyeklims.supabase.co`

---

## 2. Stack Tecnológico

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + Vite |
| Roteamento | React Router v6 |
| Estado/Fetch | TanStack Query (React Query) |
| Animações | Framer Motion |
| UI Components | shadcn/ui + Radix UI |
| Estilização | Híbrido: inline nas páginas + Tailwind no Layout, shadcn/ui e AIInsights |
| Tipografia | Cabinet Grotesk + Outfit (Google Fonts) |
| Backend | Supabase (PostgreSQL + Auth + Realtime + Storage) |
| Edge Functions | Deno (Supabase Functions) |
| Pagamentos | Stripe (assinaturas + webhook) |
| E-mail | Brevo (via Edge Function `send-email`) |
| Notificações | Push Notifications + WhatsApp Bot |
| Deploy App | Vercel (conectado ao GitHub — push automático) |
| Deploy Landing | Vercel (sem Git — deploy via CLI `npx vercel --prod`) |
| IA | Groq — `llama-3.3-70b-versatile` (o assistente se chama Finn) |

---

## 3. Estrutura do Projeto

```
C:\Dev\FAPP\
├── src/
│   ├── components/
│   │   ├── common/           # MonthSelector, EmptyState, etc.
│   │   ├── financial/        # FinancialScore, CashFlowProjection, BudgetManager, MonthComparison
│   │   ├── referral/         # ReferralBanner, ReferralInviteModal
│   │   └── transactions/     # TransactionForm, TransferForm, TransactionItem,
│   │                         # CategorySuggestion, useCategorySuggestion
│   ├── lib/
│   │   ├── supabase.js       # Cliente Supabase
│   │   ├── AuthContext.jsx   # Contexto de autenticação
│   │   ├── MonthContext.jsx  # Contexto do mês selecionado
│   │   ├── PrivacyContext.jsx # Ocultar/mostrar valores
│   │   └── SharedProfileContext.jsx # Perfil compartilhado
│   ├── pages/
│   │   ├── Home.jsx          # Dashboard principal
│   │   ├── Transactions.jsx  # Lista de transações
│   │   ├── Accounts.jsx      # Gestão de contas
│   │   ├── Reports.jsx       # Relatórios e gráficos
│   │   ├── Goals.jsx         # Metas financeiras
│   │   ├── Subscribe.jsx     # Tela de assinatura
│   │   ├── Promo.jsx         # Ativação de código promocional
│   │   └── planejapp-landing/ # Landing page (deploy separado)
│   │       ├── index.html
│   │       ├── quiz-host.html  # Quiz host (TV)
│   │       └── quiz.html       # Quiz player (celular)
│   └── main.jsx
├── supabase/
│   ├── functions/            # Edge Functions (Deno)
│   └── migrations/           # Migrations SQL
└── package.json
```

---

## 4. Deploy

### App (automático via GitHub)
```bash
git add .
git commit -m "descrição"
git push
# Vercel detecta o push e faz deploy automático
```

### Landing (manual via CLI)
```bash
cd C:\Dev\FAPP\src\pages\planejapp-landing
npx vercel --prod
```

### Edge Functions
```bash
cd C:\Dev\FAPP
npx supabase functions deploy <nome-da-funcao>
```

> ⚠️ O deploy de Edge Functions pelo Supabase MCP às vezes falha com erro interno.
> Usar sempre o CLI como fallback.

---

## 5. Banco de Dados — Tabelas

### Financeiro
| Tabela | Descrição |
|--------|-----------|
| `transactions` | Todas as transações (income/expense/transfer) |
| `accounts` | Contas do usuário (bank/digital/wallet/investment) |
| `credit_cards` | Cartões de crédito |
| `credit_card_invoices` | Faturas de cartão |
| `budgets` | Orçamentos por categoria |
| `goals` | Metas financeiras |

### Transações — campos importantes
```sql
transactions (
  id uuid,
  user_id uuid,
  description text,
  amount numeric,
  type text,              -- 'income' | 'expense' | 'transfer'
  account_id uuid,        -- conta de origem
  transfer_account_id uuid, -- conta de destino (só em transfer)
  credit_card_id uuid,    -- se compra no cartão
  invoice_month text,     -- 'YYYY-MM' para cartão
  date date,
  is_realized boolean,    -- true=realizado, false=previsto
  auto_realize boolean,   -- realizar automaticamente na data
  is_recurring boolean,
  recurring_frequency text, -- 'monthly'|'weekly'|'yearly'
  recurring_day int,
  recurring_end_date date,
  category text,
  notes text
)
```

### Usuário
| Tabela | Descrição |
|--------|-----------|
| `profiles` | Perfil do usuário (nome, código de referral, etc.) |
| `categories` | Categorias customizadas + padrão |
| `shared_access` | Compartilhamento de perfil entre usuários |
| `financial_scores` | Histórico de Score financeiro |
| `category_patterns` | Padrões de categoria aprendidos pela IA |

### Assinatura & Monetização
| Tabela | Descrição |
|--------|-----------|
| `subscriptions` | Assinaturas Stripe (status: active/trialing/cancelled/incomplete/past_due) |
| `promo_codes` | Códigos promocionais (campo `is_multiuse` para códigos reutilizáveis) |
| `referrals` | Indicações entre usuários |

### Notificações
| Tabela | Descrição |
|--------|-----------|
| `notifications` | Notificações do usuário |
| `notification_log` | Log de notificações enviadas |
| `push_tokens` | Tokens de push notification |

### WhatsApp
| Tabela | Descrição |
|--------|-----------|
| `whatsapp_pending` | Mensagens aguardando resposta |
| `whatsapp_usage` | Controle de uso do bot |

### Evento/Marketing
| Tabela | Descrição |
|--------|-----------|
| `event_leads` | Leads capturados no evento (quiz) |
| `quiz_sessions` | Sessões do quiz Kahoot |
| `quiz_players` | Jogadores do quiz |
| `quiz_answers` | Respostas do quiz |

---

## 6. Edge Functions

| Função | JWT | Descrição |
|--------|-----|-----------|
| `create-checkout` | ✅ | Cria sessão Stripe com trial e valida promo codes |
| `stripe-webhook` | ❌ | Recebe eventos do Stripe e atualiza subscriptions |
| `cancel-subscription` | ❌ | Cancela assinatura no Stripe |
| `cancel-stripe-customer` | ✅ | Remove customer do Stripe |
| `create-billing-portal` | ✅ | Cria sessão do portal de faturamento Stripe |
| `billing-portal` | ❌ | Portal de faturamento (versão antiga) |
| `ai-chat` | ✅ | Chat com o Finn (IA financeira) via Groq |
| `ai-insights` | ❌ | Gera insights automáticos 2x/semana |
| `send-email` | ❌ | Dispara e-mails via Brevo |
| `send-daily-email` | ❌ | E-mail diário de resumo |
| `send-bill-reminders` | ❌ | Lembretes de vencimento |
| `send-scheduled-notifications` | ❌ | Notificações agendadas |
| `send-notification` | ❌ | Push notifications individuais |
| `send-announcement` | ❌ | Comunicados para todos os usuários |
| `create-recurring` | ❌ | Gera transações recorrentes automaticamente |
| `whatsapp-bot` | ❌ | Bot de controle financeiro via WhatsApp |
| `verify-phone` | ❌ | Verificação de telefone por OTP |
| `update-ollama-url` | ❌ | Config de IA local (Ollama) |

---

## 7. Lógica de Negócio — Regras Importantes

### Cálculo de Saldos

```javascript
// Saldo de uma conta = saldo inicial + movimentos realizados
// ATENÇÃO: compras no cartão NÃO afetam saldo da conta
// Apenas o pagamento da fatura afeta

if (t.is_realized === false) return; // pula não realizadas
if (t.credit_card_id && t.type === 'expense') return; // pula compras no cartão

// income → soma na conta
// expense (sem cartão) → subtrai da conta
// transfer → subtrai da origem, soma no destino
```

### KPIs da Home

| KPI | Cálculo |
|-----|---------|
| Entradas | Soma de todas as incomes do mês (realizadas + previstas) |
| Saídas | Soma de todas as expenses do mês (realizadas + previstas) |
| Resultado do Mês | Entradas realizadas − Saídas realizadas |
| Projeção Final | Saldo atual das contas + Entradas previstas − Saídas previstas |

> ⚠️ **Projeção**: usa o saldo REAL atual das contas (acumulado histórico), não apenas o mês corrente.
> Despesas SEM conta vinculada (account_id NULL) são incluídas nas saídas.
> Contas do tipo `investment` são excluídas do cálculo.

### Cartão de Crédito

- Compras no cartão: lançadas com `credit_card_id` + `invoice_month` ('YYYY-MM')
- **Não afetam o saldo da conta** ao serem lançadas
- `invoice_month` determinado por `expense_date_mode`:
  - `purchase_date`: usa o mês da compra
  - `closing_day`: se passou do fechamento, vai para o próximo mês
- O pagamento da fatura SIM afeta o saldo

### Transações Recorrentes

- `is_recurring = true` → gera ocorrências futuras (previsões)
- `recurring_frequency`: monthly / weekly / yearly
- `recurring_day`: dia do mês (para monthly)
- Geradas pela Edge Function `create-recurring`
- Ficam como `is_realized = false` até serem confirmadas

### Códigos Promocionais

- Campo `is_multiuse = true` → código reutilizável por múltiplos usuários (ex: EVENTO2026)
- Campo `is_multiuse = false` → código de uso único (marcado como `is_used = true` após uso)
- Validação: `create-checkout` verifica `is_used` só para códigos não-multiuso
- `trial_days`: quantos dias de trial o código concede

### Assinaturas / Acesso

- Validação de acesso: `subscriptions.status IN ('active', 'trialing')`
- Para liberar acesso gratuito manual:
  ```sql
  UPDATE subscriptions SET status='active', current_period_end='2099-12-31' WHERE user_id='...';
  ```
- Plano: R$ 12,90/mês após trial de 30 dias (padrão) ou conforme promo code

### Score Financeiro

- Escala 0–100, composto de:
  - **Poupança** (0–40 pts): taxa de poupança vs meta de 10%
  - **Controle** (0–30 pts): % de transações categorizadas
  - **Planejamento** (0–30 pts): % de transações planejadas vs realizadas
- Calculado mensalmente

### Compartilhamento de Perfil

- Tabela `shared_access`: `owner_id`, `shared_with_email`, permissões
- Permissões: `add_transactions`, `edit_transactions`, `delete_transactions`, `view_accounts`, `manage_accounts`
- Contexto: `SharedProfileContext` — `activeOwnerId` determina qual usuário está sendo visualizado

---

## 8. Autenticação

- Supabase Auth (email/senha)
- Contexto: `AuthContext` → `user`, `session`
- Proteção de rotas: verificar `user` antes de renderizar
- RLS ativo em todas as tabelas — filtros por `user_id`

---

## 9. Env Variables necessárias

### Vercel (app)
```
VITE_SUPABASE_URL=https://pomnecjcvpqegyeklims.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Supabase Edge Functions
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
APP_URL=https://app.planejapp.com.br
SUPABASE_URL=https://pomnecjcvpqegyeklims.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
BREVO_API_KEY=xkeysib-...
GROQ_API_KEY=gsk_...
WHATSAPP_TOKEN=...
```

---

## 10. Padrões de Código

### Componentes
- Functional components com hooks
- `useIsDark()` — detecta modo escuro via localStorage + MutationObserver
- Estilização: objetos de estilo inline (sem classes CSS globais)
- Cores via variáveis CSS ou objetos de paleta dentro do componente

### Queries
- TanStack Query para todos os fetches
- QueryKey padrão: `["entidade", userId]`
- Invalidação após mutations: `queryClient.invalidateQueries`

### Mutations
- `useMutation` + `onSuccess` para feedback via `toast.success()`
- `onError` para `toast.error()`

### Nomenclatura
- Páginas: PascalCase (`Home.jsx`, `Transactions.jsx`)
- Componentes: PascalCase
- Hooks customizados: camelCase com `use` prefix
- Funções utilitárias: camelCase

---

## 11. Funcionalidades Implementadas

- [x] Cadastro e login
- [x] Lançamento de entradas/saídas/transferências
- [x] Cartão de crédito com controle de fatura por `invoice_month`
- [x] Transações recorrentes (mensal/semanal/anual)
- [x] Auto-realização de transações na data
- [x] Múltiplas contas (bank/digital/wallet/investment)
- [x] Orçamentos por categoria com barra de progresso
- [x] Metas financeiras com acompanhamento
- [x] Score financeiro (0–100)
- [x] Projeção de fluxo de caixa (30 dias)
- [x] Comparativo mensal
- [x] IA Finn — chat financeiro (Claude API)
- [x] Insights automáticos 2x/semana
- [x] Sugestão automática de categoria por ML
- [x] Compartilhamento de perfil (shared access)
- [x] Modo privacidade (ocultar valores)
- [x] Modo claro/escuro
- [x] Notificações push
- [x] Bot WhatsApp
- [x] Assinatura Stripe com trial
- [x] Códigos promocionais (single-use e multi-use)
- [x] Sistema de referral (indicação)
- [x] E-mail marketing via Brevo
- [x] Quiz Kahoot (evento)
- [x] Captura de leads (event_leads)

---

## 12. Regras para o Claude Code

### ✅ Sempre fazer
- Verificar o `user_id` em queries SQL para não misturar dados de usuários
- Usar `is_realized` para separar realizados de previstos
- Usar `invoice_month` para filtrar despesas de cartão por mês
- Invalidar queries após mutations (`queryClient.invalidateQueries`)
- Manter o padrão de estilo inline com os tokens de cor (`dark ? "#..." : "#..."`)
- Testar com a conta de teste: `rheverson.gois@americanled.com.br`

### ❌ Nunca fazer
- Remover o filtro de `user_id` em queries (segurança)
- Usar `is_realized = true` para filtrar saldo sem considerar cartão
- Fazer deploy da landing via GitHub (ela não tem conexão Git — apenas CLI)
- Alterar `stripe-webhook` sem testar cuidadosamente (quebra assinaturas)
- Usar Tailwind (não está configurado no app)
- Criar arquivos `.css` separados (o projeto usa estilo inline)

### 🔧 Workflow de desenvolvimento
1. Testar mudanças localmente
2. Copiar arquivo para o projeto
3. `git add . && git commit -m "..." && git push` → deploy automático no Vercel
4. Para landing: `npx vercel --prod` na pasta `planejapp-landing`
5. Para Edge Functions: `npx supabase functions deploy <nome>`

### 📁 Arquivos mais editados
- `src/pages/Home.jsx` — dashboard, KPIs, botões de ação
- `src/components/transactions/TransactionForm.jsx` — formulário de lançamento
- `src/components/transactions/TransferForm.jsx` — formulário de transferência
- `src/components/financial/FinancialScore.jsx` — score financeiro
- `src/components/financial/CashFlowProjection.jsx` — projeção 30 dias
- `supabase/functions/create-checkout/index.ts` — checkout Stripe
- `supabase/functions/ai-chat/index.ts` — chat com Finn

---

## 13. IDs Importantes

| Recurso | ID |
|---------|-----|
| Supabase Project | `pomnecjcvpqegyeklims` |
| Usuário Rheverson (produção) | `c84fdf03-2102-46af-a7f7-6d556465a1da` |
| Conta de teste | `rheverson.gois@americanled.com.br` |
| User ID teste | `2ac63c33-685a-4140-b29a-afa28da228fd` |

---

## 14. Números do App (ago/2026)

- Usuários cadastrados: 31
- Assinaturas ativas (active + trialing): 9
- Canceladas: 6
- Preço: R$ 12,90/mês
- Trial padrão: 30 dias
- Código evento: `EVENTO2026` (60 dias, multiuso, válido até nov/2026)
