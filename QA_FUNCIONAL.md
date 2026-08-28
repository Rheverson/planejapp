# PlanejeApp — QA Funcional de Produção (28/08/2026)

Rodada de teste funcional contra **produção**, com usuário descartável e dados
próprios. Nenhum código foi alterado. Nenhum dado real foi tocado: 816
transações, 20 contas, 7 cartões e 10 metas antes e depois.

Onde o fluxo completo foi percorrido (interface → API → banco → interface),
está dito. Onde não foi, está marcado **NECESSITA VALIDAÇÃO MANUAL**.

---

## RESUMO

### 🟡 Atenção

O P0 da rodada anterior está **corrigido e comprovado pelo fluxo real da
interface**. Os números batem entre todas as telas. A integridade do banco
está limpa em 10 verificações.

O que impede o 🟢: **três bugs que produzem valor financeiro errado na tela**
— dois no Finn e um de duplicação no pagamento de fatura.

---

## TESTES EXECUTADOS

| Fluxo | Resultado | Evidência |
|---|---|---|
| Login senha correta / incorreta / e-mail inexistente | ✅ 3/3 | mesma mensagem para senha errada e e-mail inexistente — não vaza existência |
| Token inválido, refresh, logout, reuso pós-logout | ✅ 4/4 | 401 no token inválido; refresh recusado após logout |
| CRUD de transação (criar, editar, marcar paga, nota, excluir) | ✅ 11/11 | relido do banco: 95 / 23-08 / transporte / nota editada |
| Filtrar, pesquisar, ordenar | ✅ 3/3 | 10 despesas realizadas; 3 resultados; ordem desc correta |
| **Excluir conta pela interface (P0)** | ✅ | diálogo disse "3 lançamentos continuam"; banco: conta 0, transações 3, notas intactas |
| Home após exclusão | ✅ | R$ 11.930 |
| Carteira após exclusão | ✅ | R$ 11.930 — igual à Home |
| Transações após exclusão | ✅ | mostra as 3 órfãs, sem erro |
| Relatórios | ✅ | gráficos renderizam pelo chunk lazy |
| Recorrência: duplicidade | ✅ | 2 índices únicos bloqueiam |
| Recorrência: 29/02 | ✅ | 2028 → 29/02; 2027 → 28/02 e **volta a 29 em março** |
| Finn: perguntas | ⚠️ 4/6 | dois erros de soma (abaixo) |
| Finn: casos ambíguos | ⚠️ 3/5 | dois viraram ação direta sem texto |
| Finn: ações não executam sem confirmar | ✅ | nada criado/apagado no banco |
| Concorrência: duplo clique | ❌ | 2 transações criadas |
| Concorrência: fatura simultânea | ❌ | ver bug P1 |
| Integridade do banco | ✅ 10/10 | zero órfãos, zero duplicatas, zero `ref` repetido |

---

## BUGS ENCONTRADOS

| Prio | Problema | Impacto | Reprodução |
|---|---|---|---|
| **P1** | **Finn erra a soma dos gastos do mês** | valor financeiro errado na tela | "Quanto gastei este mês?" → responde **R$ 3.160**; real **R$ 3.300**. Curiosamente acerta as parcelas (alimentação R$ 895, outros R$ 280) e erra o total |
| **P1** | **Finn soma meses diferentes** | valor financeiro errado | "Quanto recebi?" → **R$ 14.030** (julho + agosto); o mês corrente é **R$ 7.030** |
| **P1** | **Fatura paga duas vezes em abas simultâneas** | débito duplicado na conta | O filtro do passo 2 é `credit_card_id + invoice_month`, **sem `is_realized = false`**. Na segunda aba as compras já estão pagas, o UPDATE ainda as "afeta", a verificação passa e um segundo débito é criado. A proteção da rodada anterior só cobre o caso de zero linhas |
| **P2** | **Duplo clique cria transação duplicada** | lançamento em dobro | Dois cliques → 2 registros. `TransactionForm`, `GoalForm` e `AccountForm` têm **0** ocorrências de `disabled` ligado a loading/pending |
| **P2** | Finn gera ação destrutiva sem texto | card aparece sem explicação | "Apaga minha carteira" e "Remove mercado" → resposta vazia, só o bloco. 2 de 3 ações também vieram sem texto |
| **P2** | Ambiguidade não detectada por limite de contexto | escolhe um dos candidatos sozinho | Existem 2 "Mercado" (#3 ago R$ 650, #15 jul R$ 800). O Finn gerou `DELETE_TX` direto — o prompt só recebe as ~13 realizadas mais recentes, então ele viu uma |
| **P3** | Rótulo "SALDO" com dois sentidos | confunde | Transações: "SALDO R$ 4.831" (resultado do mês). Home: "SALDO EM CONTA R$ 11.930". Mesma palavra, conceitos diferentes — a mesma classe do problema já corrigido em Relatórios |
| **P3** | Botões de ação sem `aria-label` | leitor de tela diz só "botão" | Editar e excluir na Carteira são só ícone |
| **P3** | Excluir cartão com compras falha | erro sem explicação clara | `transactions_credit_card_id_fkey` é `NO ACTION`. Conta desvincula, cartão bloqueia — comportamentos diferentes para entidades parecidas |
| **P3** | `notifications` e `notification_log` órfãs | ruído de schema | Nenhuma das 4 funções de notificação escreve nelas |

---

## FUNCIONALIDADES

| Módulo | Funcionando | Problema | Observação |
|---|---|---|---|
| Autenticação | ✅ | — | 7 cenários, todos corretos |
| Home | ✅ | — | 5 indicadores conferidos contra o banco |
| Transações | ✅ | duplo clique | CRUD e persistência corretos |
| Carteira | ✅ | — | saldo idêntico ao da Home |
| Metas | ✅ | — | meta sem movimentação exibe 0% e "Faltam R$ 10.000" |
| Relatórios | ✅ | — | rótulos "realizadas" no ar; Saldo = Resultado da Home |
| Recorrência | ✅ | — | 29/02 e virada de ano corretos |
| Cartão | ⚠️ | fatura duplicável | fatura calcula certo (R$ 350) |
| Finn — proteção | ✅ | — | nunca executa sem confirmação |
| Finn — cálculo | ❌ | 2 erros | ver P1 |
| Exclusão de conta | ✅ | — | **P0 provado pela interface** |

---

## MOBILE

Testado por medição de geometria; **não em aparelho físico**.

- 9 modais com Esc, botão voltar do Android e trava de rolagem (eram 3).
- Área de toque dos botões do card do Finn: 44px.
- Sem rolagem horizontal nas telas verificadas.

**NECESSITA VALIDAÇÃO MANUAL:** teclado cobrindo campos, safe area em telas
com notch, rotação, e o toque real nos 6 modais que ganharam o hook.

## DESKTOP

Home, Carteira, Transações, Relatórios e Metas percorridas em viewport
desktop. Nenhuma regressão das correções mobile. Relatórios renderiza os
gráficos pelo chunk lazy — a mudança de bundle não quebrou a tela.

## FINN

Correto: R$ 895 em alimentação · R$ 11.930 de saldo · maior despesa (aluguel
R$ 1.800, cita #2) · R$ 10.000 faltando para a meta · nunca executa sem
confirmação · "Apaga minha conta", "Exclui tudo" e "Já paguei" viram lista de
escolha.

Errado: total de gastos do mês · total recebido (soma meses) · 2 de 5 casos
ambíguos viram ação direta · respostas sem texto.

## STRIPE

Os três secrets estão configurados e nenhuma chave está no código. Há **25
assinaturas, 13 com `stripe_subscription_id` real**, em cinco estados
distintos (`active`, `cancelled`, `incomplete`, `past_due`, `trialing`) — o
webhook está atualizando estado em produção.

**NECESSITA VALIDAÇÃO MANUAL:** checkout, promo code, trial, cancelamento e
portal. Não testei porque exigiria cobrança real. Para validar sem risco:
usar chave `sk_test`, cartão `4242 4242 4242 4242`, e conferir se o webhook
grava `status` e `current_period_end`.

## WHATSAPP

A validação de assinatura Twilio está implementada (HMAC, tempo constante,
fail-closed) e `verify_jwt = false` é correto para webhook externo.

**Não funciona:** falta `TWILIO_AUTH_TOKEN`. O bot responde 503 — de
propósito. `whatsapp_usage` está vazia.

## QUIZ

| | |
|---|---|
| `planejapp.com.br` | **HTTP 200** — landing publicada |
| `planejapp.com.br/quiz` | **HTTP 404** — não publicado |

O quiz segue **fora do ar**, como registrado nas rodadas anteriores. O banco
tem 7 sessões, 4 jogadores e 2 leads (dados antigos). A publicação depende de
`npx vercel --prod`, que não roda daqui.

## BANCO

10 verificações, todas limpas: sem transação apontando para conta inexistente,
sem registro sem dono, sem valor ≤ 0, sem tipo inválido, sem recorrente sem
grupo, **sem duplicata de recorrência**, sem cartão órfão, sem meta sem dono,
**sem `ref` repetido por usuário**, sem sobra dos testes.

## CONCORRÊNCIA

| Cenário | Resultado |
|---|---|
| Duplo clique criando transação | **2 registros criados** — sem trava |
| Duas abas marcando a mesma fatura | ambas afetaram linhas → **débito duplicado** |
| Recorrência duplicada | **bloqueada** por índice único |
| `ref` duplicado sob concorrência | **bloqueado** por índice único |

---

## NECESSITA VALIDAÇÃO MANUAL

1. **Notificações** — os 10 crons executam (143 execuções, 100% de sucesso no
   enfileiramento) e a última resposta HTTP registrada em `net._http_response`
   é **401 "Não autorizado"**. Investiguei a hipótese de RLS bloqueando o
   token do cron e **ela não se confirmou**: como `postgres`, o token é lido
   normalmente. Não determinei a causa e **não disparei notificação real para
   descobrir**, porque enviaria push a usuários de verdade. Precisa ser
   verificado com um envio controlado.
2. **Stripe** — checkout, promo code, trial, cancelamento, portal.
3. **WhatsApp** — bloqueado por credencial ausente.
4. **Quiz** — publicação pendente.
5. **Aparelho físico** — teclado, safe area, rotação, toque nos modais.
6. **Login pelo formulário** — travou em "Verificando..." no painel oculto do
   navegador de teste, que congela JS assíncrono. Contornei injetando a
   sessão. **O fluxo de login pela tela não foi validado ponta a ponta.**
7. **Fatura de cartão** — a fatura de agosto soma corretamente (R$ 350), mas
   `credit_card_invoices` continua com 0 linhas. Não sei se a tabela é usada.

## REGRESSÕES

Nenhuma regressão das correções da rodada anterior. Verificado: RLS em 27/27
tabelas, `SET NULL` ativo, `transfer_account_id` e `credit_cards` inalterados,
trigger antigo ainda desativado, 177 testes passando, e os números de
produção idênticos.

O bug P1 da fatura **não é regressão**: já existia. A correção anterior
cobriu o caso de zero linhas, que é diferente deste.

---

## CLASSIFICAÇÃO FINAL

### 🟡 Atenção

O produto funciona nos fluxos principais: autenticação, CRUD, saldos
consistentes entre todas as telas, recorrência correta nas bordas difíceis,
e o P0 resolvido e comprovado pela interface.

Não é 🟢 porque **três bugs mostram ou gravam valor financeiro errado**: o
Finn erra dois totais que o usuário lê como verdade, e o pagamento de fatura
pode gerar débito em dobro. Num app de finanças, número errado na tela custa
confiança mesmo quando o banco está íntegro.

Não é 🟠 porque nenhum deles perde dado nem é irreversível, e o caminho
crítico — dinheiro entrando, saindo e sendo somado — está correto e conferido
contra o banco.


---

# Rodada de correção P1 (28/08/2026)

Correção dos problemas funcionais do QA, com causa raiz, teste e prova.
Produção intacta: 816 transações, 20 contas, 7 cartões, 10 metas antes e
depois. Commits `a7f3b92` em diante.

## Finn — os dois erros de cálculo

**Causa raiz:** o prompt mandava listas e o modelo somava. Pior: as listas
misturavam meses (as 8 realizadas mais recentes podiam vir de julho e agosto),
e `nowStr` usava `toISOString()`, que é UTC — entre 21h e meia-noite de
Brasília o dia já virou lá, e no fim do mês a pergunta caía no mês seguinte.

**Solução:** `supabase/functions/_shared/financeiro.ts`. O backend calcula e o
modelo lê. Inclui camada de período: "em julho" vira julho, "mês passado" vira
o anterior, sem pista nenhuma é o mês corrente. Quem decide as datas é o
código. E `hojeBrasilia()` no lugar do UTC.

| Pergunta | Antes | Agora | Real |
|---|---|---|---|
| "Quanto gastei este mês?" | R$ 3.160 | **R$ 3.300** | R$ 3.300 |
| "Quanto recebi?" | R$ 14.030 | **R$ 7.030** | R$ 7.030 |
| "Quanto gastei em julho?" | — | **R$ 2.600** | R$ 2.600 |

**Teste:** 33 casos em `src/domain/finn-financeiro.test.js`, incluindo os dois
valores exatos que estavam errados, 13 formulações de período, centavos, mês
vazio, cartão e transferência.

## Finn — ambiguidade em exclusões

**Causa raiz:** não era desobediência, era cegueira. Existiam dois "Mercado"
(ago R$ 650, jul R$ 800), mas o contexto leva só as 8 realizadas mais
recentes — o de julho ficava de fora e o modelo via um só.

**Solução:** o backend detecta homônimos a partir das palavras da pergunta e
manda todos numa seção própria do prompt.

**Prova ao vivo:** "Remove mercado" passou a oferecer os dois (#3 12/08 R$ 650
e #17 12/07 R$ 800) com bloco `__ESCOLHER__`.

## Pagamento de fatura — duplicidade

**Causa raiz:** a sequência insere-débito → marca-compras nunca poderia ser
segura no cliente. Entre uma e outra existe uma janela, e duas abas passam por
ela. A verificação de linhas afetadas da rodada anterior só cobria o caso de
zero linhas — não este.

**Solução:** `pagar_fatura()` faz tudo numa transação do Postgres, e o índice
único `(credit_card_id, month)` decide quem venceu. A tabela
`credit_card_invoices`, que existia vazia desde sempre, virou a trava.

**Prova:** 3 requisições simultâneas → **1 pagamento de R$ 350**, duas
recusadas com "já foi paga". Quarta tentativa idem. Isolamento: A pagando
fatura de B recebe 403; anônimo recebe 401.

## Duplo clique

Trava por ref síncrona nos três formulários. `useState` não serve: dois
cliques no mesmo tick leem o valor antigo e ambos passam.

## Crons — o 401 não se confirmou

**Reproduzindo a chamada do cron** contra `send-scheduled-notifications`,
`send-daily-email` e `send-bill-reminders`: **HTTP 200 nas três**
(`{"ok":true,"users":2}` e `{"ok":true,"sent":0}`). Os 9 jobs HTTP mandam o
header de autenticação. O 401 visto no QA era evento isolado, anterior à
correção de autenticação — **minha conclusão anterior estava errada**.

`notifications` e `notification_log` seguem vazias porque nenhuma das quatro
funções escreve nelas. São tabelas órfãs, não sinal de falha.

## Cartão

A regra correta já estava implementada: a UI **não oferece exclusão de cartão**
e já filtra `is_active = true`. O erro de FK só aparece via API. Falta apenas a
tela de arquivar — registrado como pendência, não implementado nesta rodada.

## Nomenclatura

"Saldo" em Transações era o resultado do período; a Home usa a mesma palavra
para dinheiro disponível. Virou "Resultado", e a soma passou de float para
centavos.
