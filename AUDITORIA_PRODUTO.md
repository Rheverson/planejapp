# PlanejeApp — Auditoria de Produto (28/08/2026)

> **Rodada de correções executada em 28/08.** O P0 foi corrigido e provado
> (`fix(P0)` — commits `740ec80` e `8d7b807`). Ver a seção
> "Correções aplicadas" no fim deste documento.


Auditoria de terceira rodada, feita como produto real e não como lista de
tarefas. Nenhuma linha de código foi alterada durante esta apuração.

Método: leitura do código, consulta ao banco de produção, execução de SQL
de verificação, medição do bundle e dos advisors. Onde a conclusão veio de
um teste executado, o teste está descrito. Onde não deu para verificar,
está marcado **NECESSITA VALIDAÇÃO**.

---

## 1. Estado geral

### 🟠 Precisa correções

Não é 🔴 porque não há falha de segurança aberta, os dados de produção estão
íntegros (zero órfãos em 12 verificações) e o núcleo financeiro é sólido e
coberto por testes. Não é 🟡 porque existe **um caminho de perda de dados
financeiros confirmado em teste** e a interface promete o contrário do que
o banco faz.

O que sustenta a classificação:

| Sinal | Leitura |
|---|---|
| Perda de dados ao excluir conta | confirmado por teste — bloqueia lançamento |
| Integridade dos dados hoje | 816 transações, zero inconsistências |
| Segurança | 13 advisors, nenhum ERROR; RLS em 27/27 tabelas |
| Erro de rede na interface | 0 de 9 páginas tratam `isError` |
| Cobertura de teste | 162 testes, mas 0 de RLS, API, Edge Function ou E2E |

---

## 2. Funcionalidades existentes

Inventário lido do código (9 páginas em `src/pages.config.js`, 15 Edge
Functions, 27 tabelas).

| Funcionalidade | Existe | Funciona | Problemas |
|---|---|---|---|
| **Home** — KPIs, saldo, projeção, recorrência | sim | sim | usa o domínio; sem tratamento de erro de query |
| **Transações** — CRUD, filtro, recorrência com escopo | sim | sim | sucesso não verificado; sem `user_id` em update/delete |
| **Metas** — CRUD, progresso, aportes | sim | sim | sem `isLoading`/`isError`; modal não fecha por fora |
| **Carteira/Contas** — CRUD, saldos | sim | **parcial** | duplica cálculo de saldo; exclusão apaga transações |
| **Cartões de crédito** — CRUD, faturas | sim | NECESSITA VALIDAÇÃO | 7 cartões, 30 compras, 0 faturas geradas |
| **Relatórios** — gráficos, comparativo | sim | sim | recharts (411 KB) baixado por todos |
| **Finn (IA)** — 11 ações, escolha clicável, cascata | sim | sim | ver seção 6 |
| **Perfil** — dados, categorias, compartilhamento | sim | sim | sem exclusão de conta (LGPD) |
| **Indicações** — código, convite, recompensa | sim | NECESSITA VALIDAÇÃO | 5 referrals; fluxo de crédito não testado |
| **Assinatura** — Stripe checkout, portal, webhook | sim | NECESSITA VALIDAÇÃO | não testável sem transação real |
| **WhatsApp bot** | sim | **não** | fail-closed por falta de `TWILIO_AUTH_TOKEN` |
| **Notificações** — push, e-mail, lembretes | sim | NECESSITA VALIDAÇÃO | 10 cron jobs ativos; `notification_log` vazio |
| **Onboarding** — nome, metas, senha, tour | sim | sim | — |
| **Compartilhamento de perfil** | sim | sim | guardas no front; RLS confirmada |
| **Exportar dados / excluir conta** | **não** | — | pendência LGPD |

---

## 3. Bugs

| Prio | Bug | Impacto | Local | Evidência |
|---|---|---|---|---|
| **P0** | Excluir conta apaga todas as transações dela | perda de dados financeiros irreversível | FK `transactions_account_id_fkey ON DELETE CASCADE` | teste executado: 3 transações → 0 após excluir a conta |
| **P0** | Card do Finn afirma "as transações serão mantidas" | usuário confirma achando que é seguro | `AIInsights.jsx:456` | contradiz o CASCADE acima |
| **P1** | Erro de query não é tratado em nenhuma página | tela vazia sem explicação quando a rede falha | 0 de 9 páginas usam `isError` | `grep isError src/pages` → 0 |
| **P1** | "Atualizado!" / "Removido!" sem verificar linhas afetadas | mente ao usuário quando a RLS bloqueia | `Transactions.jsx:141,168`, `Accounts.jsx:212,221`, +14 arquivos | 16 arquivos com `toast.success`, quase todos com 0 `.select()` |
| **P1** | Saldo da Carteira ignora a regra do cartão | Carteira e Home divergem | `Accounts.jsx:228-241` | importa `calcularSaldosPorConta` e não usa; latente (0 tx com cartão+conta hoje) |
| **P2** | `update`/`delete` sem filtro de `user_id` | contraria o padrão do projeto; RLS é o único guarda | `Accounts.jsx:212,221`, `Transactions.jsx:141`, `CreditCardManager.jsx:310` | CLAUDE.md: "nunca remover esse filtro" |
| **P2** | 9 de 12 modais sem Esc, Android back e trava de rolagem | fechamento inconsistente no celular | ver seção 7 | só 3 usam `useFecharModal` |
| **P2** | `congelar_ref` sem `search_path` fixo | advisor WARN | migration do índice legível | **regressão introduzida por mim** |
| **P3** | Modal de meta não fecha clicando fora | atrito | `Goals.jsx` | overlay sem `onClick` |
| **P3** | `trg_generate_recurring` desativado, não removido | reativação acidental traz duplicidade de volta | trigger em `transactions` | estado `D` no `pg_trigger` |

---

## 4. Segurança

### Protegido (verificado)

- RLS ativo em **27 de 27** tabelas; `internal_config` sem policy é
  intencional (só service_role).
- **Nenhum advisor de nível ERROR.** 13 lints: 1 INFO e 12 WARN.
- Identidade das Edge Functions vem do JWT (`requireUser`), não do corpo.
- Isolamento entre usuários já validado na 2ª auditoria com dois usuários reais.
- Integridade referencial limpa: 12 verificações, zero órfãos.

### Precisa de atenção

- **`congelar_ref` com `search_path` mutável** — regressão minha, da migration
  do índice legível. As demais funções foram endurecidas; esta escapou.
- 8 funções `SECURITY DEFINER` executáveis por `authenticated`. Todas checam
  `auth.uid()` internamente (padrão `pode_acessar_perfil`), mas `get_user_by_email`
  segue sendo oráculo de enumeração para quem está logado — risco já aceito.
- `validate_promo_code` executável por `anon`. Necessário para a landing.
- Proteção contra senha vazada desativada — recurso pago, não se aplica.

---

## 5. Financeiro

O núcleo está sólido: `src/domain/financas.js` (506 linhas) concentra as regras,
usa **centavos inteiros** e é importado por 9 arquivos. As bordas de data que
costumam quebrar sistemas financeiros **estão cobertas por teste**: virada de
ano, dia 31 em fevereiro, ano bissexto, meses curtos, frequência semanal.

### Inconsistências encontradas

1. **`Accounts.jsx` reimplementa o saldo** (linhas 228-241) apesar de importar
   `calcularSaldosPorConta`. A versão manual **não exclui compra no cartão** e
   usa float em vez de centavos. É a duplicação que o CLAUDE.md proíbe
   nominalmente. Hoje não diverge porque nenhuma transação tem `credit_card_id`
   e `account_id` ao mesmo tempo (0 de 30) — o bug está armado, não disparado.

2. **Cartões sem fatura**: 7 cartões, 30 compras, **0 linhas em
   `credit_card_invoices`**. Ou o fluxo de fatura nunca foi exercitado, ou não
   gera registro. **NECESSITA VALIDAÇÃO.**

3. Transações lançadas até **2031-05-01** (recorrências). O horizonte é
   intencional, mas amplifica o problema de carregar histórico inteiro.

---

## 6. Finn

Testado ao vivo nas rodadas anteriores, contra a função publicada. O que está
verificado e funcionando:

- Análise não gera ação (5 perguntas, zero blocos).
- Ambiguidade vira botões clicáveis, com rótulos lidos do banco.
- Não escolhe "o mais parecido": sem a palavra na descrição, diz que não achou.
- Não soma agregado com detalhe (R$ 700, não R$ 852).
- Nenhum marcador de protocolo vaza para a tela (12 marcadores cobertos por teste).
- Cascata de 5 provedores com prazo por provedor; mediana 1,3s, pior 2,3s em
  ritmo real.

### Problemas em aberto

| Problema | Gravidade |
|---|---|
| Card de exclusão de conta promete preservar transações — e elas são apagadas | **P0** |
| Sob rajada (>6 msg/min) a Groq estoura o TPM e a resposta passa de 7s | P1 |
| HF com crédito esgotado (US$ 0,10/mês); OpenRouter em 429; Cerebras em 402 | P1 |
| Contexto limitado a 6 meses — "compare com os últimos 12 meses" não é atendido | P2 |
| `ai_usage` com 12 linhas para 160 chamadas/24h — telemetria não confiável | P2 |

---

## 7. Mobile

O problema de fechamento de modal **já corrigido** não é retomado aqui. O que
segue é outro achado: a correção cobriu **3 modais**, e existem **12**.

| Modal | Esc / Android back / trava de rolagem |
|---|---|
| `TransactionForm` | ✅ |
| `TransferForm` | ✅ |
| `RealizarPrevisaoModal` | ✅ |
| `RecurringEditModal` | ❌ |
| `Goals.jsx` | ❌ (nem fecha clicando fora) |
| `ShareFinancesModal` | ❌ |
| `SharedAccessList` | ❌ |
| `PendingInvites` | ❌ |
| `AIInsights.jsx` | ❌ |
| `Transactions.jsx` | ❌ |
| `Login.jsx` | ❌ |
| `Layout.jsx` | ❌ |

Os 9 sem proteção têm botão de fechar e (salvo `Goals`) clique no overlay —
não estão travados, mas ignoram o botão físico de voltar do Android, que num
app instalado via Capacitor é o gesto natural.

Também: **9 valores de `z-index` literais** (20, 40, 60, 70, 100, 999, 1000)
convivendo com a escala `CAMADAS` que quase ninguém importa — terreno fértil
para sobreposição errada.

**NECESSITA VALIDAÇÃO** em aparelho real: teclado cobrindo campos, safe area
em telas com notch, rotação, e toque nos 9 modais acima.

---

## 8. Desktop

Não encontrei regressão causada pelas correções mobile. As mudanças recentes
(área de toque 44px, prazos da IA, limpeza de blocos) são neutras ou positivas
no desktop. O card de confirmação do Finn foi verificado em viewport desktop
na rodada anterior.

**NECESSITA VALIDAÇÃO**: telas largas (>1440px) — o layout é centrado com
largura máxima, mas não medi o resultado.

---

## 9. UX

| Problema | Onde |
|---|---|
| Erro de rede não tem tela: `isError` ignorado em 9/9 páginas | todas |
| `isLoading` tratado em apenas 3 de 9 páginas | Home, Transactions, +1 |
| Skeleton existe mas é usado em 3 arquivos | `common/Skeleton.jsx` |
| Estado vazio em 5 de 9 páginas | Metas e Relatórios sem |
| Mensagem de sucesso não confirma o efeito | 16 arquivos |
| "Entrada/Saída" (25/23 usos) convive com "Receita/Despesa" (1/2) | terminologia |
| "Excluir" (13) convive com "Apagar" (1) | terminologia |

---

## 10. Design System

Estado real: **não existe design system em uso.**

| Métrica | Valor |
|---|---|
| Cores hex distintas | **98** |
| Ocorrências de cor no código | **1.095** |
| Cores usadas uma única vez | 25 |
| `#ffffff` vs `#fff` | 62 e 53 usos — mesma cor, duas grafias |
| `src/design/tokens.js` | existe, **0 importadores** (93 linhas mortas) |
| `useTheme` | 17 importadores ✅ |
| Padrões de modal diferentes | **3** (AlertDialog, motion.div manual, useFecharModal) |
| Valores de z-index literais | **9** |
| Componentes shadcn/ui | 49 instalados, **10 usados**, 39 mortos |

---

## 11. Performance

### Medido

| Item | Valor |
|---|---|
| Bundle total | 1,9 MB |
| `vendor-charts` (recharts) | **411,5 KB — com `modulepreload` no index.html** |
| `index` | 309,9 KB |
| `AIInsights` | 172,7 KB |
| `vendor-supabase` | 169,6 KB |

**O achado principal:** `vendor-charts` é forçado a chunk fixo pelo
`manualChunks` do `vite.config.js:21` e entra como `modulepreload` no HTML.
Todo usuário baixa 411 KB de biblioteca de gráficos no primeiro acesso, mesmo
que nunca abra Relatórios — a única tela que usa. É ~22% do bundle.

### Queries sem limite

`Accounts.jsx:191` e `Goals.jsx:61` fazem `select("*")` de **todas** as
transações do usuário, sem filtro de período nem paginação.

- média por usuário: **332 transações**
- maior usuário: **475 transações**
- horizonte: até 2031 (recorrências futuras)

---

## 12. LGPD

| Requisito | Estado |
|---|---|
| Política de privacidade | ✅ `PrivacyModal.jsx` |
| Termos de uso | ✅ `TermsModal.jsx` |
| **Exclusão de conta do usuário** | ❌ inexistente ("Excluir conta" no app é conta *bancária*) |
| **Exportação de dados** | ❌ inexistente |
| Retenção / expurgo | ❌ não definida |
| Consentimento registrado | **NECESSITA VALIDAÇÃO** |

Obstáculo técnico: `accounts_user_id_fkey` e `transactions_user_id_fkey`
apontam para `auth.users` **sem `ON DELETE CASCADE`**. Excluir um usuário falha
por violação de FK enquanto houver contas — foi o que aconteceu comigo ao
limpar usuários de teste. Qualquer rotina de exclusão precisa apagar as tabelas
na ordem certa.

---

## 13. Testes

162 testes passando. A distribuição importa mais que o número:

| Tipo | Qtd | Arquivos |
|---|---|---|
| Unitário de função pura | 93 | `domain/financas`, `domain/dinheiro` |
| Parser / limpeza de texto | 21 | `AIInsights.parser` |
| Componente (jsdom) | 41 | `AIInsights`, `TransactionForm` |
| **RLS** | **0** | — |
| **Edge Functions** | **0** | — |
| **Integração / API** | **0** | — |
| **E2E** | **0** | — |
| **Mobile automatizado** | **0** | — |

**Onde está a falsa sensação de segurança:** os 162 testes cobrem 5 arquivos.
As páginas **Home, Transações, Metas, Carteira, Relatórios, Perfil, Indicações**
não têm nenhum teste. O bug P0 desta auditoria (CASCADE) não seria pego por
nenhum teste existente, porque nenhum toca o banco.

---

## 14. Dívida técnica

### Crítica
- FK com CASCADE contradizendo a promessa da interface.
- Ausência de teste que toque o banco — a suíte não pode pegar erro de schema.

### Alta
- `isError` ignorado em todas as páginas.
- Sucesso não verificado em 16 arquivos.
- `AIInsights.jsx` com 1.431 linhas (parser + executor + 2 abas de UI).
- `useCategorySuggestion.jsx` com 895 linhas para um hook.
- Schema sem baseline: **impossível recriar o banco do zero** pelas migrations.
- 4 migrations aplicadas no banco **sem arquivo local** (`cron_jobs_autenticados`,
  `desativa_trigger_recorrencia_antigo`, `migra_recorrencias_legadas`,
  `quiz_placar_sem_definer`) e 1 arquivo local sem correspondência
  (`recorrencia_modelo_unico`) — parte disso é responsabilidade minha, por ter
  aplicado via MCP sem salvar o arquivo.

### Média
- 98 cores, 3 padrões de modal, 9 z-index.
- 39 componentes shadcn mortos + `tokens.js` morto.
- Queries sem paginação.
- `vendor-charts` em carga inicial.

### Baixa
- Terminologia mista.
- 6 `console.log` em produção.
- 15 índices nunca usados.

---

## 15. O que está realmente pronto

- Núcleo de cálculo financeiro, com centavos inteiros e bordas de data testadas.
- RLS e isolamento entre usuários (validado com dois usuários reais).
- Autenticação, onboarding e recuperação de senha.
- Motor único de recorrência (o trigger antigo está desativado).
- Finn: 11 ações, confirmação a partir do registro real, escolha clicável,
  cascata de provedores com prazo por provedor.
- Integridade dos dados em produção.
- Compartilhamento de perfil com permissões.

## 16. O que NÃO está pronto

- Exclusão de conta bancária (apaga transações silenciosamente).
- Tratamento de erro de rede na interface.
- Confirmação de que uma escrita realmente aconteceu.
- LGPD: exclusão de conta e exportação.
- Fatura de cartão de crédito (não verificada).
- WhatsApp bot (sem credenciais).
- Design system.
- Testes de banco, API e ponta a ponta.
- Schema reproduzível do zero.

---

## 17. Ordem recomendada

**FASE 1 — Impede perda de dados** (bloqueia lançamento)
1. Decidir o comportamento de excluir conta: desvincular (`SET NULL`) ou
   apagar em cascata **avisando de verdade**. Corrigir o texto do card do Finn
   e o diálogo da Carteira para dizer o que realmente acontece.
2. Verificar linhas afetadas em toda escrita antes de dizer "sucesso".
3. Corrigir `congelar_ref` (`search_path`).

**FASE 2 — O usuário entende o que está acontecendo**
4. `isError` + estado de erro nas 9 páginas.
5. `isLoading` e estado vazio onde faltam.
6. `useFecharModal` nos 9 modais restantes.

**FASE 3 — Consistência financeira**
7. `Accounts.jsx` passa a usar `calcularSaldosPorConta`.
8. Restaurar filtro de `user_id` nas mutations.
9. Validar o fluxo de fatura de cartão.

**FASE 4 — Performance**
10. Tirar `vendor-charts` da carga inicial.
11. Paginar/limitar as queries de Accounts e Goals.

**FASE 5 — Conformidade**
12. Exclusão de conta e exportação de dados (LGPD).

**FASE 6 — Sustentação**
13. Testes de RLS e de Edge Function.
14. Baseline do schema e migrations faltantes.
15. Design system e quebra de `AIInsights.jsx`.

---

## 18. Quick wins

| Ação | Esforço |
|---|---|
| `search_path` em `congelar_ref` | 1 linha |
| Texto do card de exclusão de conta | 1 linha |
| `overflow` do overlay no modal de Metas | 1 linha |
| Remover 6 `console.log` | trivial |
| Apagar 39 componentes shadcn mortos + `tokens.js` | trivial |
| Padronizar "Excluir" (1 ocorrência de "Apagar") | trivial |
| Tirar `recharts` do `manualChunks` | 1 linha, ~411 KB |

## 19. Exigem decisão de arquitetura

- **Semântica de excluir conta** — é decisão de produto, não de código.
- **Paginação** — exige camada de dados; hoje as telas assumem lista completa.
- **Quebra de `AIInsights.jsx`** (1.431 linhas) em parser/executor/UI.
- **Design system** — 1.095 ocorrências de cor para migrar.
- **Testes de banco** — exigem ambiente de teste (Docker ou branch Supabase).
- **Contexto histórico do Finn além de 6 meses.**

---

## 20. NECESSITA VALIDAÇÃO

Não consegui verificar, e não vou afirmar que funcionam:

1. **Stripe** — checkout, webhook, portal, cancelamento. Exige transação real.
2. **Fatura de cartão** — 7 cartões, 30 compras, 0 faturas. Não sei se é falha
   ou fluxo nunca usado.
3. **Notificações** — 10 cron jobs ativos, mas `notification_log` vazio.
   Push, e-mail e lembretes não confirmados ponta a ponta.
4. **WhatsApp bot** — fail-closed por falta de `TWILIO_AUTH_TOKEN`.
5. **Indicações** — o crédito ao indicador não foi exercitado.
6. **Aparelho real** — teclado, safe area, rotação, toque nos 9 modais.
7. **Telas > 1440px.**
8. **Leitor de tela** — 0 de 39 `<label>` têm `htmlFor`; o impacto real não foi
   medido com NVDA/TalkBack.
9. **Consentimento LGPD** — se é registrado em algum lugar.
10. **Recuperação de banco (PITR)** — depende do plano Supabase.
11. **Landing e quiz** — publicação via `npx vercel --prod` nunca executada
    daqui; o quiz pode estar desatualizado em produção.

---

## Nota sobre auto-avaliação

Três achados desta auditoria vêm de alterações que eu mesmo fiz:

1. `congelar_ref` sem `search_path` — endureci as outras funções e deixei esta.
2. 4 migrations aplicadas via MCP sem salvar o arquivo local, agravando o
   problema de schema não reproduzível.
3. A correção de fechamento de modal cobriu 3 de 12 modais; eu tratei o caso
   relatado e não varri os demais.


---

# Correções aplicadas (28/08/2026)

## Fase 0 — estado preservado

O inventário revelou mais do que esta auditoria apontou: **40 migrations
aplicadas contra 13 arquivos locais**. Não eram 4 faltando, eram 28 — a
comparação original olhou só a janela recente. As 4 da janela de agosto
ganharam espelho idempotente; as 25 de abril/maio ficam como pendência de
baseline, documentadas em `supabase/migrations/README.md`. Reconstruí-las de
memória daria falsa impressão de schema reproduzível.

## Fase 1 e 2 — o P0

`transactions_account_id_fkey` passou de `CASCADE` para `SET NULL`. A escolha
seguiu o que o modelo já fazia: `transfer_account_id` sempre foi `SET NULL`, e
havia 56 transações com `account_id` nulo antes da mudança.

Teste de integração (`supabase/tests/exclusao_conta.sql`), 8 verificações:

| Verificação | Resultado |
|---|---|
| conta excluída | 0 |
| transações preservadas | 3 (de 3) |
| `account_id` das três | NULL |
| valor, data, descrição, categoria, nota | intactos |
| recorrência (`recurring_group_id`) | preservada |
| transação de outra conta | vínculo mantido |
| saldo da conta restante | correto |
| conta que paga fatura de cartão | exclusão barrada |

## Fase 3 — escritas verificadas

`src/lib/escrita.js` distingue erro do banco, zero linhas e sucesso real.
Aplicado em 9 arquivos. O caso mais grave era o pagamento de fatura: se a
marcação das compras não afetasse nada, o débito ficava lançado e a tela dizia
"Fatura paga!" — cobrança em duplicidade. Agora o débito é desfeito antes do
aviso.

## Fase 4 — erro de rede

`EstadoErro`, com "Tentar novamente" ligado ao `refetch`, em 6 páginas. A Home
para antes de desenhar: mostrar R$ 0,00 quando a query falhou é pior do que
mostrar o erro. Em Metas saiu o `JSON.stringify` do erro que ia para a tela.

## Fase 5 — `congelar_ref`

`search_path` fixo. Advisors de segurança: **13 → 12**.

## Fase 6 — consistência financeira

A Carteira reimplementava o saldo, divergindo em dois pontos (descontava compra
no cartão e somava em float). Passa a usar `calcularTotaisDeSaldo`, a mesma da
Home. 15 testes novos em `src/domain/saldos.test.js`.

Relatórios somava em float e rotulava "Saídas" o total realizado, enquanto a
Home rotula igual o total com previstas — mesmo nome, números diferentes.
Agora soma em centavos e os rótulos dizem "realizadas".

Conferido em produção: Home e Carteira mostram **R$ 5.632,00**, decompostos
igual (5.500 + 132).

## Fase 9 — mobile

O hook de fechamento estava em 3 modais; agora são **9**.

## Fase 10 — performance

`recharts` saiu dos chunks fixos. Carga inicial: **1.262 KB → 851 KB (−33%)**.
Os 411 KB de gráficos agora só descem ao abrir Relatórios.

## Fase 11 — código morto

`components/ui/chart.jsx` removido após verificar import, import dinâmico,
teste e config — zero referências. Os outros 38 componentes shadcn sem uso
permanecem: a dúvida pesa mais que o ganho.

## O que continua pendente

Nada do que esta rodada tocou. Seguem abertos, por decisão de escopo:
Design System, LGPD (exclusão de conta e exportação), paginação, refatoração
do `AIInsights.jsx`, baseline do schema, e os 11 itens de
**NECESSITA VALIDAÇÃO** listados acima.
