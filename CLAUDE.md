# PlanejeApp — Instruções para o Claude Code

Você é o assistente de desenvolvimento do **PlanejeApp**, um app de controle financeiro pessoal com IA.
Leia o arquivo `PLANEJAPP_DOCS.md` antes de qualquer tarefa. Ele contém toda a arquitetura, regras de negócio e padrões do projeto.

---

## Identidade do Projeto

- **App:** https://app.planejapp.com.br
- **Landing:** https://planejapp.com.br
- **Repositório:** https://github.com/Rheverson/planejapp.git
- **Stack:** React + Vite + Supabase + Stripe + Vercel
- **IA:** Groq (`openai/gpt-oss-120b`) — não é a Claude API, apesar do nome Finn
- **Provedores em cascata:** `supabase/functions/_shared/ia.ts` tenta
  Groq → Gemini → Cerebras. Todos falam o protocolo OpenAI, então trocar é só
  endpoint, chave e nome do modelo. Cada um é opcional: sem a chave no ambiente
  (`GROQ_API_KEY`, `GEMINI_API_KEY`, `CEREBRAS_API_KEY`), é pulado. Cota, chave
  inválida ou 5xx pulam o provedor inteiro; modelo fora do ar ou resposta vazia
  pulam só o modelo. Nunca chame um provedor direto por `fetch` — use
  `chamarIA()`, senão aquele caminho fica sem fallback (foi o caso do
  `whatsapp-bot`).
- **Estado dos provedores em 27/08/2026** (conferido contra o `/models` de cada
  conta, não contra a documentação):
  - Groq — `openai/gpt-oss-120b` e `gpt-oss-20b` respondem. 8.000 tokens/min e
    **200.000/dia** somando todos os usuários. A ~1.800 por mensagem, são
    ~100 mensagens/dia no app inteiro; foi esse teto que derrubou o Finn.
  - Gemini — `gemini-3.5-flash-lite`, `gemini-flash-lite-latest` e
    `gemini-3.5-flash` respondem. Cota contada em requisições (~1.000/dia), o
    que complementa bem um limite de tokens.
  - Cerebras — 402 "Payment required" nos dois modelos da conta, apesar de o
    painel listar 3M tokens/dia. A chave é válida (lista modelos); falta
    billing. Fica em último e volta sozinho quando for resolvido.
- **Nomes de modelo saem de linha sem aviso:** os `gemini-2.5-*` já respondem
  404 "no longer available to new users". Conferir contra o `/models` do
  provedor antes de fixar um nome — a cascata pula o que não existe, mas um
  degrau morto não protege ninguém.
- **Acompanhar consumo:** o `console.log` registra
  `IA <provedor>/<modelo>: N entrada + M saída` a cada chamada. Medir antes de
  engordar o prompt do `ai-chat`.
- **Dono:** Rheverson Gois

---

## Comportamento Esperado

### Antes de qualquer tarefa
1. Leia o `PLANEJAPP_DOCS.md` para entender o contexto
2. Identifique qual arquivo precisa ser alterado
3. Entenda o impacto da mudança antes de executar
4. Se tiver dúvida sobre regra de negócio, pergunte antes de implementar

### Ao escrever código
- O projeto é **híbrido**: páginas e componentes de domínio usam estilo inline;
  o `Layout`, os 60 componentes `shadcn/ui` e a página `AIInsights` usam Tailwind,
  que **está** instalado e configurado (`tailwind.config.js` + `src/index.css`)
- Cores, raios, espaçamentos e tipografia vêm de `src/design/tokens.js`
- Tema: `useTheme()` ou `useIsDark()` de `@/design/useTheme` — não recriar o hook local
- Siga os tokens de cor já existentes nos componentes (`dark ? "#0c0e13" : "#ffffff"`)
- Use `useTheme()` de `@/design/useTheme` para detectar o tema
- Mantenha o padrão visual: fundo escuro `#060709`, azul `#1d4ed8`, textos `#e8edf5`
- Fontes: **Cabinet Grotesk** (títulos/números) + **Outfit** (corpo)
- Componentes funcionais com hooks — sem classes React
- TanStack Query para todos os fetches — nunca `useEffect` + `fetch` direto

### Ao mexer no banco
- Sempre filtrar por `user_id` — nunca remover esse filtro
- Para testar: use o usuário `rheverson.gois@americanled.com.br`
- Migrations vão em `supabase/migrations/` com nome descritivo — o schema passou
  a ser versionado; nunca altere o banco só pelo painel
- RLS está ativo em todas as tabelas

### Ao fazer deploy
- **Antes de tudo:** `npm test` (Vitest sobre o módulo de domínio) e `npm run build`
- **App:** `git add . && git commit -m "..." && git push` (Vercel detecta automaticamente)
- **Landing:** `cd src/pages/planejapp-landing && npx vercel --prod` (sem Git)
- **Edge Functions:** `npx supabase functions deploy <nome>`
- **Ordem importa quando o protocolo do Finn muda:** publique o **app primeiro**,
  a Edge Function depois. O `ai-chat` e o `AIInsights.jsx` conversam por blocos
  (`__DELETE_TX__{...}__END_DELETE__`). Se a função sair na frente, ela emite um
  bloco que o app ainda não sabe recortar e o JSON aparece cru na tela do usuário
  — foi o que aconteceu com `__DUPLICATE_TX__`. O limpador hoje tem uma rede
  genérica para blocos desconhecidos, mas a ordem continua sendo a correta.

---

## Regras Críticas de Negócio

> Todo cálculo financeiro vive em **`src/domain/financas.js`**, coberto por testes
> (`npm test`). Não reimplemente saldo, KPIs, progresso de meta, mês de fatura ou
> taxa de poupança em componente — importe do módulo. Foi a duplicação dessas
> regras que fez telas diferentes mostrarem números diferentes.

### Saldo de contas
```js
// Compras no cartão NÃO afetam saldo da conta
if (t.credit_card_id && t.type === 'expense') return;
// Só o pagamento da fatura afeta
```

### Projeção Final do Mês
```
Projeção = saldo_atual_contas + entradas_previstas - saidas_previstas
```
- Usa o saldo REAL atual (histórico completo, não só o mês)
- Exclui contas do tipo `investment`
- Inclui despesas sem `account_id` (account_id NULL)

### Transações
- `is_realized = true` → realizada (afeta saldo)
- `is_realized = false` → prevista (não afeta saldo)
- `type`: `income` | `expense` | `transfer`
- Transferências: `account_id` = origem, `transfer_account_id` = destino

### Cartão de crédito
- `invoice_month` = 'YYYY-MM' determina em qual mês a despesa entra
- `closing_day` do cartão define se vai para o mês atual ou próximo

---

## O Que NUNCA Fazer

- ❌ Ler `userId` do corpo da requisição numa Edge Function — a identidade vem
  sempre do JWT, via `requireUser()` de `supabase/functions/_shared/auth.ts`
- ❌ Publicar Edge Function com `verify_jwt = false` fora de webhook externo ou
  cron (e, nesses casos, autenticar dentro da função)
- ❌ Criar policy RLS com `USING (true)` em tabela com dado de usuário
- ❌ Criar função `SECURITY DEFINER` que recebe o alvo por parâmetro sem checar
  `auth.uid()` — use `pode_acessar_perfil()` como molde
- ❌ Duplicar regra de cálculo financeiro fora de `src/domain/financas.js`
- ❌ Remover filtro de `user_id` em queries
- ❌ Fazer deploy da landing via `git push` (ela não tem conexão Git)
- ❌ Alterar `stripe-webhook` sem testar cuidadosamente
- ❌ Usar `useEffect + fetch` — sempre TanStack Query
- ❌ Criar componentes de classe React
- ❌ Esquecer de invalidar queries após mutations
- ❌ Misturar lógica de cartão com lógica de débito no saldo

---

## Arquivos Mais Importantes

```
src/pages/Home.jsx                              # Dashboard — KPIs, saldos, botões
src/pages/Transactions.jsx                      # Lista de transações
src/components/transactions/TransactionForm.jsx # Formulário entrada/saída
src/components/transactions/TransferForm.jsx    # Formulário de transferência
src/components/financial/FinancialScore.jsx     # Score financeiro
src/components/financial/CashFlowProjection.jsx # Projeção 30 dias
src/lib/supabase.js                             # Cliente Supabase
src/lib/AuthContext.jsx                         # Auth
supabase/functions/create-checkout/index.ts     # Checkout Stripe
supabase/functions/ai-chat/index.ts             # Finn (IA)
supabase/functions/stripe-webhook/index.ts      # Webhook Stripe
src/pages/planejapp-landing/index.html          # Landing page
```

---

## Padrão de Resposta

Ao receber uma tarefa:
1. **Confirme** o que vai fazer em 1-2 linhas
2. **Implemente** diretamente — sem perguntas desnecessárias
3. **Mostre** apenas o trecho relevante alterado (não o arquivo inteiro, a menos que seja pequeno)
4. **Informe** o comando de deploy necessário ao final
5. **Avise** se a mudança tem risco ou impacto em outras partes

Se a tarefa for ambígua, faça uma única pergunta objetiva antes de implementar.

---

## Contexto do Negócio

- Plano: R$ 12,90/mês após trial gratuito
- Trial padrão: 30 dias
- Código do evento: `EVENTO2026` (60 dias, reutilizável)
- IA do app se chama **Finn** — consultor financeiro pessoal
- Usuários ativos: ~31 cadastrados, 9 com acesso ativo
- O app ainda está em fase de lançamento — prioridade: estabilidade e UX mobile

---

## Estado da Auditoria

O diagnóstico completo e o controle de execução estão em **`AUDITORIA.md`**.
Consulte antes de mexer em segurança, cálculo financeiro ou recorrência —
várias armadilhas já documentadas ali.
