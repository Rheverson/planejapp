import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { adminClient, cors, preflight, requireUser } from "../_shared/auth.ts"
import { chamarIA } from "../_shared/ia.ts"
import { registrarUsoDoFinn } from "../_shared/limites.ts"
import {
  hojeBrasilia, detectarPeriodo, periodoDoMes, calcularTotais,
  somarMeses, mesDe, nomeDoMes,
} from "../_shared/financeiro.ts"

serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  const corsHeaders = cors(req)

  try {
    // ✅ A identidade vem do JWT, nunca do corpo da requisição.
    const auth = await requireUser(req)
    if (auth.response) return auth.response
    const userId = auth.user.id

    const corpo = await req.json().catch(() => ({}))
    const message = typeof corpo?.message === "string" ? corpo.message.trim() : ""
    // `history` já veio como string em teste; qualquer coisa que não
    // seja lista é descartada em vez de derrubar a função.
    const history = Array.isArray(corpo?.history) ? corpo.history : []

    // Sem pergunta não há o que responder — e não faz sentido gastar
    // uma chamada da cota gratuita para descobrir isso.
    if (!message) {
      return new Response(
        JSON.stringify({ error: "mensagem_vazia" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }
    if (message.length > 2000) {
      return new Response(
        JSON.stringify({ error: "mensagem_longa" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const supabase = adminClient()

    // Horário de Brasília, não UTC: `toISOString()` já virou o dia entre
    // 21h e meia-noite daqui, e no fim do mês isso jogava "quanto gastei
    // este mês" para o mês seguinte.
    const nowStr = hojeBrasilia()
    const now = new Date(`${nowStr}T12:00:00`)
    const startDate = `${now.getFullYear() - 1}-01-01`
    const endDate = `${now.getFullYear() + 1}-12-31`
    const currentMonthStr = mesDe(nowStr)

    const [transactionsRes, accountsRes, goalsRes, profileRes] = await Promise.all([
      supabase.from("transactions").select("*").eq("user_id", userId).gte("date", startDate).lte("date", endDate).neq("type", "transfer").order("date", { ascending: true }),
      supabase.from("accounts").select("*").eq("user_id", userId),
      supabase.from("goals").select("*").eq("user_id", userId),
      supabase.from("profiles").select("referral_code, email").eq("id", userId).single()
    ])

    const transactions = transactionsRes.data || []
    const accounts = accountsRes.data || []
    const goals = goalsRes.data || []
    const profile = profileRes.data

    // ✅ Inclui transferências: sem elas o saldo por conta divergia do painel.
    // A regra é a mesma do app (src/domain/financas.js):
    //  - previstas não entram
    //  - compra no cartão não afeta a conta (só o pagamento da fatura)
    //  - transferência sai da origem e entra no destino
    const allTransactionsRes = await supabase.from("transactions").select("*").eq("user_id", userId).neq("is_realized", false)
    const allTransactions = allTransactionsRes.data || []

    const accountBalances: Record<string, number> = {}
    accounts.forEach((acc: any) => { accountBalances[acc.id] = Number(acc.initial_balance) || 0 })
    allTransactions.forEach((t: any) => {
      const valor = Number(t.amount) || 0
      if (t.credit_card_id && t.type === 'expense') return
      if (t.type === 'transfer') {
        if (t.account_id)          accountBalances[t.account_id]          = (accountBalances[t.account_id] || 0)          - valor
        if (t.transfer_account_id) accountBalances[t.transfer_account_id] = (accountBalances[t.transfer_account_id] || 0) + valor
        return
      }
      if (!t.account_id) return
      if (t.type === 'income')       accountBalances[t.account_id] = (accountBalances[t.account_id] || 0) + valor
      else if (t.type === 'expense') accountBalances[t.account_id] = (accountBalances[t.account_id] || 0) - valor
    })

    const regularAccounts = accounts.filter((a: any) => a.type !== 'investment')
    const investmentAccounts = accounts.filter((a: any) => a.type === 'investment')
    const totalBalance = regularAccounts.reduce((s: number, a: any) => s + (accountBalances[a.id] || 0), 0)
    const totalInvested = investmentAccounts.reduce((s: number, a: any) => s + (accountBalances[a.id] || 0), 0)

    // ── Economia de tokens ──────────────────────────────────
    // A conta está no plano gratuito da Groq: 8.000 tokens por minuto,
    // somando todos os usuários. Medido antes desta mudança, cada
    // mensagem custava ~3.200 tokens de entrada — a segunda mensagem
    // seguida já batia no limite e voltava 429.
    //
    // O maior gasto escondido eram os UUIDs: cada
    // "ID:c84fdf03-2102-46af-a7f7-6d556465a1da" custa cerca de 20
    // tokens, e o prompt listava dezenas deles.
    // Cada registro tem um numero sequencial proprio do usuario
    // (coluna `ref`): #1, #2, #3. Antes daqui o Finn usava um prefixo do
    // UUID ("#f18267f0"), que nao diz nada a quem le e vazava para a tela.
    //
    // O numero se repete entre tabelas -- a conta #3 e a transacao #3
    // existem ao mesmo tempo -- entao cada tipo tem o seu mapa e a
    // expansao escolhe pelo bloco de acao que a IA gerou.
    const mapaTx    = new Map<number, string>()
    const mapaConta = new Map<number, string>()
    const mapaMeta  = new Map<number, string>()

    const numerar = (mapa: Map<number, string>) => (registro: any) => {
      const n = Number(registro?.ref)
      // Sem numero o registro nao entra na lista: melhor o Finn dizer
      // que nao achou do que apontar para a linha errada.
      if (!Number.isInteger(n) || n <= 0) return null
      mapa.set(n, String(registro.id))
      return n
    }
    const numTx    = numerar(mapaTx)
    const numConta = numerar(mapaConta)
    const numMeta  = numerar(mapaMeta)

    const dinheiro = (v: any) => `R$${Number(v || 0).toFixed(2)}`
    const diaMes = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

    const accountsSummary = accounts
      .map((a: any) => ({ a, n: numConta(a) }))
      .filter(({ n }) => n !== null)
      .map(({ a, n }) => `#${n} ${a.name} (${a.type}) ${dinheiro(accountBalances[a.id])}`)
      .join('\n')

    const monthlyData: Record<string, { income: number, expense: number, planned_income: number, planned_expense: number }> = {}
    transactions.forEach((t: any) => {
      const m = t.date.slice(0, 7)
      if (!monthlyData[m]) monthlyData[m] = { income: 0, expense: 0, planned_income: 0, planned_expense: 0 }
      if (t.is_realized !== false) {
        if (t.type === 'income') monthlyData[m].income += parseFloat(t.amount)
        else if (t.type === 'expense') monthlyData[m].expense += parseFloat(t.amount)
      } else {
        if (t.type === 'income') monthlyData[m].planned_income += parseFloat(t.amount)
        else if (t.type === 'expense') monthlyData[m].planned_expense += parseFloat(t.amount)
      }
    })

    // Seis meses bastam para o Finn falar de tendência; o histórico
    // completo ia até dois anos e não mudava nenhuma resposta.
    const monthlySummary = Object.entries(monthlyData)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 6)
      .reverse()
      .map(([m, d]) => `${m} +${d.income.toFixed(0)} -${d.expense.toFixed(0)}`)
      .join(' | ')

    // ── Números prontos, calculados aqui ────────────────────────────
    //
    // O período sai da própria pergunta: "em julho" vira julho, "mês
    // passado" vira o anterior, e sem pista nenhuma é o mês corrente.
    // Quem decide as datas é este código, não o modelo — deixar isso a
    // cargo dele foi o que fez "quanto recebi" somar julho com agosto.
    const periodoDaPergunta = detectarPeriodo(message, nowStr)
    const totaisPergunta = calcularTotais(transactions as any, periodoDaPergunta)
    const totaisMes      = calcularTotais(transactions as any, periodoDoMes(currentMonthStr))
    const totaisAnterior = calcularTotais(transactions as any, periodoDoMes(somarMeses(currentMonthStr, -1)))

    const linhaTotais = (rotulo: string, t: typeof totaisMes) =>
      `${rotulo}: entrou ${dinheiro(t.entradasRealizadas)}, saiu ${dinheiro(t.saidasRealizadas)}`
      + `, resultado ${dinheiro(t.resultado)}`
      + (t.entradasPrevistas || t.saidasPrevistas
          ? ` | ainda previsto: +${dinheiro(t.entradasPrevistas)} / -${dinheiro(t.saidasPrevistas)}`
          : "")

    const currentMonthByCategory: Record<string, number> = {}
    transactions
      .filter((t: any) => t.is_realized !== false && t.type === 'expense' && t.date.startsWith(currentMonthStr))
      .forEach((t: any) => { const cat = t.category || 'outros'; currentMonthByCategory[cat] = (currentMonthByCategory[cat] || 0) + parseFloat(t.amount) })

    // Previstas são as que o usuário mais aciona ("paguei o aluguel"),
    // então continuam com ID — mas só as 12 mais próximas.
    const upcomingDetailed = transactions
      .filter((t: any) => t.is_realized === false && t.date >= nowStr)
      .sort((a: any, b: any) => a.date.localeCompare(b.date))
      .slice(0, 12)
      .map((t: any) => ({ t, n: numTx(t) }))
      .filter(({ n }) => n !== null)
      .map(({ t, n }) => `#${n} ${diaMes(t.date)} ${t.type === 'income' ? '+' : '-'}${dinheiro(t.amount)} ${t.description}${t.category ? ` [${t.category}]` : ''}`)
      .join('\n')

    // Realizadas servem para "exclui o mercado de ontem" e para o Finn
    // reconhecer a renda recorrente do usuário.
    const realizadas = transactions
      .filter((t: any) => t.is_realized !== false && t.date <= nowStr)
      .sort((a: any, b: any) => b.date.localeCompare(a.date))

    // As últimas por data cobrem "exclui o mercado de ontem". Mas se o
    // período recente for só de despesas, o Finn fica sem nenhuma renda
    // para associar a "salário" -- então as entradas entram garantidas.
    const ultimas = realizadas.slice(0, 8)
    const entradas = realizadas.filter((t: any) => t.type === 'income').slice(0, 5)
    const escolhidas = [...ultimas]
    for (const t of entradas) {
      if (!escolhidas.some((e: any) => e.id === t.id)) escolhidas.push(t)
    }

    const recentRealized = escolhidas
      .sort((a: any, b: any) => b.date.localeCompare(a.date))
      .map((t: any) => ({ t, n: numTx(t) }))
      .filter(({ n }) => n !== null)
      .map(({ t, n }) => `#${n} ${diaMes(t.date)} ${t.type === 'income' ? '+' : '-'}${dinheiro(t.amount)} ${t.description}${t.category ? ` [${t.category}]` : ''}`)
      .join('\n')

    const last3Months = Object.entries(monthlyData)
      .filter(([m]) => m <= currentMonthStr)
      .sort((a, b) => b[0].localeCompare(a[0])).slice(0, 3)
    const avgIncome = last3Months.length > 0 ? last3Months.reduce((s, [, d]) => s + d.income, 0) / last3Months.length : 0
    const avgExpense = last3Months.length > 0 ? last3Months.reduce((s, [, d]) => s + d.expense, 0) / last3Months.length : 0

    const goalsSummary = goals.length > 0
      ? goals
          .map((g: any) => ({ g, n: numMeta(g) }))
          .filter(({ n }) => n !== null)
          .map(({ g, n }) => {
            const gasto = currentMonthByCategory[g.category?.toLowerCase()] || 0
            return `#${n} ${g.name} (${g.type}) limite ${dinheiro(g.target_amount)} gasto ${dinheiro(gasto)} cat:${g.category || 'geral'}`
          }).join('\n')
      : 'nenhuma'

    // Razoes derivadas das medias que ja estao acima. Nao sao regra de
    // saldo nem de KPI (essas vivem em src/domain/financas.js, no app):
    // sao proporcoes prontas para o Finn nao precisar estimar de cabeca
    // e poder responder com numero em vez de conselho generico.
    const sobra = avgIncome - avgExpense
    const taxaPoupanca = avgIncome > 0 ? (sobra / avgIncome) * 100 : 0
    const catsOrdenadas = Object.entries(currentMonthByCategory)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
    const topCategorias = catsOrdenadas.slice(0, 3)
      .map(([c, v]) => `${c} ${dinheiro(v as number)}${avgIncome > 0 ? ` (${(((v as number) / avgIncome) * 100).toFixed(0)}% da renda)` : ''}`)
      .join(', ')

    const previstasEntram = transactions
      .filter((t: any) => t.is_realized === false && t.date >= nowStr && t.type === 'income')
      .reduce((soma: number, t: any) => soma + parseFloat(t.amount), 0)
    const previstasSaem = transactions
      .filter((t: any) => t.is_realized === false && t.date >= nowStr && t.type === 'expense')
      .reduce((soma: number, t: any) => soma + parseFloat(t.amount), 0)
    const projecaoFim = totalBalance + previstasEntram - previstasSaem

    // ── Homônimos: tudo que a pergunta pode estar apontando ─────────
    //
    // "Remove mercado" ia apagar o Mercado errado: existiam dois (ago
    // R$650, jul R$800), mas o contexto leva só as 8 realizadas mais
    // recentes e o de julho ficava de fora. O modelo não escolheu mal —
    // ele via um só. Aqui todos os xarás entram, numa seção própria.
    const IRRELEVANTES = new Set([
      "quanto","gastei","recebi","tenho","apaga","apagar","exclui","excluir","remove","remover",
      "deleta","deletar","paga","pagar","paguei","realiza","realizar","marca","marcar","cria",
      "criar","edita","editar","altera","alterar","duplica","duplicar","minha","meu","meus",
      "minhas","este","esta","esse","essa","aquele","aquela","para","com","dos","das","por",
      "que","uma","umas","uns","nao","sim","tudo","todos","todas","mes","ano","dia","hoje",
      "ontem","conta","contas","valor","reais","real","transacao","lancamento","despesa",
      "receita","entrada","saida",
    ])
    const semAcento = (v: string) =>
      String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")

    const palavrasDaPergunta = semAcento(message)
      .split(/[^a-z0-9]+/)
      .filter((p) => p.length >= 4 && !IRRELEVANTES.has(p))

    const porDescricao: Record<string, any[]> = {}
    if (palavrasDaPergunta.length) {
      transactions.forEach((t: any) => {
        if (!palavrasDaPergunta.some((p) => semAcento(t.description).includes(p))) return
        const k = semAcento(t.description)
        ;(porDescricao[k] = porDescricao[k] || []).push(t)
      })
    }

    const homonimos = Object.values(porDescricao)
      .filter((grupo) => grupo.length > 1)
      .flat()
      .sort((a: any, b: any) => b.date.localeCompare(a.date))
      .slice(0, 10)

    const blocoHomonimos = homonimos
      .map((t: any) => ({ t, n: numTx(t) }))
      .filter(({ n }) => n !== null)
      .map(({ t, n }) =>
        `#${n} ${diaMes(t.date)} ${t.type === "income" ? "+" : "-"}${dinheiro(t.amount)} ${t.description}`
        + `${t.category ? ` [${t.category}]` : ""}${t.is_realized === false ? " (previsto)" : ""}`)
      .join("\n")

    // Só os nomes: o ID de cada conta já aparece na lista acima.
    const accountNames = accounts.map((a: any) => a.name).join(', ')
    const referralLink = `https://www.planejapp.com.br/subscribe?ref=${profile?.referral_code || ''}`

    // O bloco de instruções era o maior custo fixo: quase mil tokens
    // só de moldura e exemplos repetidos. Mesmas 9 ações, escrito curto.
    const systemPrompt = `Você é Finn, consultor financeiro brasileiro. Hoje: ${nowStr}.

COMO RESPONDER
2 a 5 frases, sempre com número: valor, % da renda e o próximo passo com prazo. Só os dados abaixo — não estime. Havendo linhas nas listas, nunca diga que não há registros. Compare com a média de 3 meses ou a meta. Cite o número do item (#3) junto da descrição. Sem jargão nem dicas prontas.
NÃO FAÇA CONTA. Os totais abaixo já vêm somados e conferidos pelo sistema. Leia o número — não some as listas. Elas existem só para você identificar um lançamento específico; somá-las conta o mesmo dinheiro duas vezes e dá resultado errado.
Perguntou "quanto gastei/recebi/sobrou"? Responda com o número de NÚMEROS DO PERÍODO — ele já corresponde ao período que o usuário quis dizer.

NÚMEROS DO PERÍODO — ${periodoDaPergunta.rotulo}
${linhaTotais("Neste período", totaisPergunta)}
Lançamentos no período: ${totaisPergunta.quantidade}
${totaisPergunta.maiorDespesa ? `Maior despesa: ${totaisPergunta.maiorDespesa.descricao} ${dinheiro(totaisPergunta.maiorDespesa.valor)} em ${diaMes(totaisPergunta.maiorDespesa.data)}` : "Nenhuma despesa realizada no período."}
Por categoria: ${totaisPergunta.porCategoria.map((c) => `${c.categoria} ${dinheiro(c.valor)}`).join(", ") || "nenhuma"}

PARA COMPARAR
${linhaTotais(nomeDoMes(currentMonthStr), totaisMes)}
${linhaTotais(nomeDoMes(somarMeses(currentMonthStr, -1)), totaisAnterior)}

CONTAS
${accountsSummary}
Saldo ${dinheiro(totalBalance)} | Investido ${dinheiro(totalInvested)}
Média 3m: renda ${avgIncome.toFixed(0)}, gasto ${avgExpense.toFixed(0)}, sobra ${sobra.toFixed(0)} (${taxaPoupanca.toFixed(0)}%)
A receber ${dinheiro(previstasEntram)} | A pagar ${dinheiro(previstasSaem)} | Projeção ${dinheiro(projecaoFim)}
MESES: ${monthlySummary || 'sem dados'}
GASTOS DO MÊS: ${Object.entries(currentMonthByCategory).map(([c, v]) => `${c} ${(v as number).toFixed(0)}`).join(', ') || 'nenhum'}

${blocoHomonimos ? `ATENÇÃO — MAIS DE UM LANÇAMENTO COM ESSE NOME
${blocoHomonimos}
O que o usuário pediu casa com TODOS os de cima. É proibido escolher um por conta própria: ofereça a lista com __ESCOLHER__, citando número, valor e data de cada.

` : ''}PREVISTAS
${upcomingDetailed || 'nenhuma'}

REALIZADAS
${recentRealized || 'nenhuma'}

METAS
${goalsSummary}

REFERÊNCIAS: poupança saudável 10–20%; abaixo de 0 é déficit. Moradia acima de ~30%, ou uma categoria variável acima de ~15%, explica o aperto. Reserva = 6x o gasto mensal (${(avgExpense * 6).toFixed(0)}).

NÚMEROS: cada item tem número próprio, e contas/transações/metas numeram separado — a conta #3 não é a transação #3. Nunca invente número fora das listas.

AGIR OU SÓ FALAR
O usuário mandou fazer, nesta mensagem, no imperativo ("exclui", "paga", "realiza", "duplica", "lança", "cria")? Se NÃO, só texto, nenhum bloco — vale para toda pergunta e todo pedido de análise ou recomendação. Recomendar não é executar: sugira citando o número e pare. Se SIM, no máximo UM bloco.

ACHAR O ITEM (realizar, duplicar, excluir, pagar parte)
Cada linha traz [categoria]. Nesta ordem:
1. A palavra do usuário está na descrição? → gere o bloco daquela linha.
2. Senão, use categoria e tipo: "salário"/"meu pagamento"/"o que recebi" → as ENTRADAS (+); "gasolina" → [transporte]; "mercado"/"marmita" → [alimentação]; "aluguel"/"luz" → [moradia]. Freelance, bônus e pix recebido SÃO renda. Achando por aqui, NUNCA escolha sozinho: ofereça os candidatos, mesmo que seja um só.
3. Mais de uma linha bate → ofereça os candidatos.
4. Nada plausível → diga que não encontrou.
REGRA DURA: se a resposta pergunta "qual você quer?", ela é OBRIGADA a trazer o bloco ESCOLHER. Perguntar sem os botões é erro — o usuário não digita número. Pedido genérico com lista atrás também vira escolha: "pagamento"/"paguei" → as PREVISTAS com realize; "duplicar" sem dizer qual → as últimas realizadas. "Conta" é ambíguo (bancária ou a pagar): pergunte qual.
Exemplo — sem nenhuma linha "salário", mas com entradas #4 ajuste e #5 Freelance:
"Duplique salário" → "Não achei nada chamado salário. Suas entradas recentes são estas — qual delas?" + __ESCOLHER__{"acao":"duplicate_tx","ids":["#5","#4"]}__END_ESCOLHER__

BLOCOS — catálogo interno. NUNCA escreva o rótulo de uma ação na resposta: o usuário vê só o seu texto e o cartão que o app monta. O bloco vai sozinho na última linha. Vários pedidos: faça o primeiro e diga que faz o próximo.
__PENDING_TX__{"type":"expense|income","amount":0,"description":"","category":"","account_name":"","date":"${nowStr}","is_realized":true}__END_TX__
__REALIZE_TX__{"id":"#N","date":"${nowStr}"}__END_REALIZE__
__PARTIAL_REALIZE__{"id":"#N","paid_amount":0,"date":"${nowStr}"}__END_PARTIAL__ — só com valor pago dito pelo usuário e maior que zero
__DELETE_TX__{"id":"#N"}__END_DELETE__
__DUPLICATE_TX__{"id":"#N"}__END_DUPLICATE__
__DELETE_GOAL__{"id":"#N"}__END_DELETE_GOAL__
__DELETE_ACCOUNT__{"id":"#N"}__END_DELETE_ACCOUNT__
__CREATE_GOAL__{"name":"","type":"expense","category":"","target_amount":0,"start_date":"${nowStr}","end_date":"AAAA-MM-DD"}__END_GOAL__
__CREATE_ACCOUNT__{"name":"","type":"bank|digital|wallet|investment|other","initial_balance":0}__END_ACCOUNT__
__SEND_INVITE__{"email":"","name":""}__END_INVITE__ — link ${referralLink}
__ESCOLHER__{"acao":"delete_tx|realize|duplicate_tx|partial_realize|delete_goal|delete_account","ids":["#N","#N"]}__END_ESCOLHER__ — até 6 candidatos
Nunca invente outro tipo de bloco.

Categorias: alimentação, transporte, moradia, saúde, educação, lazer, compras, outros.
Contas: ${accountNames}`

    // ── Cota do Finn ──────────────────────────────────────────
    //
    // Contabiliza ANTES de chamar o provedor. Uma mensagem que estourou
    // o limite não pode consumir a cota da Groq — que é o teto de
    // verdade aqui: ~8.000 tokens/min a ~1.400 por mensagem dão ~5,7
    // mensagens por minuto no app INTEIRO, somando todos os usuários.
    //
    // O incremento é atômico (`on conflict do update`), então duas
    // perguntas simultâneas não perdem contagem.
    //
    // Se o contador falhar, `registrarUsoDoFinn` devolve
    // `dentroDoLimite: true`: contador quebrado não cala o Finn.
    const cota = await registrarUsoDoFinn(userId)
    if (!cota.dentroDoLimite) {
      // Motivo legível para a tela escolher a mensagem e oferecer o
      // upgrade. O usuário nunca vê erro técnico.
      return new Response(
        JSON.stringify({
          error: "limite_do_plano",
          recurso: "finn_mensagens_mes",
          usadas: cota.usadas - 1,
          limite: cota.limite,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const messages = [
      ...(history || []).map((h: any) => ({ role: h.role, content: h.content })),
      { role: "user", content: message }
    ]

    const resposta = await chamarIA(
      [{ role: "system", content: systemPrompt }, ...messages],
      // 350 basta: as respostas do Finn medidas ficaram entre 46 e 202
      // tokens. Teto maior só alonga o pior caso e gasta cota.
      { temperature: 0.2, maxTokens: 350 },
    )

    if (!resposta.ok) {
      // O motivo sobe para o cliente, para a tela poder dizer o que houve
      // em vez de fingir que o Finn não entendeu a pergunta.
      console.error("Groq falhou:", resposta.motivo, resposta.detalhe)
      return new Response(
        // O detalhe da Groq traz id da organização, nome do modelo e
        // limites da conta. Fica no log do servidor; para fora vai só o
        // motivo, que é o que o app precisa para escolher a mensagem.
        // A trilha traz só provedor, modelo e rótulo curto — nunca a
        // mensagem do provedor, que carrega id de organização e limites
        // da conta. É o que permite diagnosticar sem o log do servidor.
        JSON.stringify({ error: "ia_indisponivel", motivo: resposta.motivo, tentativas: resposta.tentativas }),
        { status: resposta.motivo === "limite" ? 429 : 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // O modelo responde com o numero legivel; o app espera o UUID real.
    //
    // O mesmo numero existe em tabelas diferentes, entao a traducao e
    // feita bloco a bloco: dentro de __DELETE_ACCOUNT__ o #3 so pode ser
    // uma conta. Um numero que nao estava na lista enviada simplesmente
    // nao vira UUID -- o app rejeita, em vez de agir no registro errado.
    // O bloco de escolha carrega vários números numa lista, e a tabela
    // depende da acao que ele anuncia.
    const TABELA_DA_ACAO: Record<string, Map<number, string>> = {
      delete_tx: mapaTx, realize: mapaTx, partial_realize: mapaTx, duplicate_tx: mapaTx,
      delete_goal: mapaMeta, delete_account: mapaConta,
    }

    const MAPA_POR_BLOCO: Array<[RegExp, Map<number, string>]> = [
      [/__DUPLICATE_TX__[\s\S]*?__END_DUPLICATE__/g,          mapaTx],
      [/__PARTIAL_REALIZE__[\s\S]*?__END_PARTIAL__/g,          mapaTx],
      [/__REALIZE_TX__[\s\S]*?__END_REALIZE__/g,               mapaTx],
      [/__DELETE_TX__[\s\S]*?__END_DELETE__/g,                 mapaTx],
      [/__DELETE_GOAL__[\s\S]*?__END_DELETE_GOAL__/g,          mapaMeta],
      [/__DELETE_ACCOUNT__[\s\S]*?__END_DELETE_ACCOUNT__/g,    mapaConta],
    ]

    let respostaExpandida = resposta.texto

    // __ESCOLHER__ primeiro: os ids vêm numa lista, não em "id":"#N".
    respostaExpandida = respostaExpandida.replace(
      /__ESCOLHER__[\s\S]*?__END_ESCOLHER__/g,
      (bloco) => {
        const corpo = bloco.match(/\{[\s\S]*\}/)
        let dados: any = null
        try { dados = corpo ? JSON.parse(corpo[0]) : null } catch { dados = null }
        const mapa = dados && TABELA_DA_ACAO[String(dados.acao)]
        if (!mapa || !Array.isArray(dados.ids)) return ''

        // Só entram os números que estavam na lista enviada. Um número
        // inventado simplesmente não vira opção.
        const ids = dados.ids
          .map((n: any) => mapa.get(Number(String(n).replace('#', ''))))
          .filter(Boolean)
          .slice(0, 6)
        if (!ids.length) return ''
        return `__ESCOLHER__${JSON.stringify({ acao: dados.acao, ids })}__END_ESCOLHER__`
      },
    )

    for (const [blocoRe, mapa] of MAPA_POR_BLOCO) {
      respostaExpandida = respostaExpandida.replace(blocoRe, (bloco) =>
        bloco.replace(/"id"\s*:\s*"?#?(\d{1,7})"?/g, (original, numero) => {
          const completo = mapa.get(Number(numero))
          return completo ? `"id":"${completo}"` : original
        }),
      )
    }

    // Descarta bloco que nao pode dar em acao valida.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const TODOS_OS_BLOCOS =
      /[*]*_{0,2}(PENDING_TX|RECURRING_TX|PARTIAL_REALIZE|REALIZE_TX|DELETE_TX|DUPLICATE_TX|CREATE_GOAL|DELETE_GOAL|CREATE_ACCOUNT|DELETE_ACCOUNT|SEND_INVITE)_{0,2}[*]*[\s\S]*?[*]*_{0,2}(END_TX|END_RECURRING|END_PARTIAL|END_REALIZE|END_DELETE_GOAL|END_DELETE_ACCOUNT|END_DUPLICATE|END_DELETE|END_GOAL|END_ACCOUNT|END_INVITE)_{0,2}[*]*/g

    respostaExpandida = respostaExpandida.replace(TODOS_OS_BLOCOS, (bloco, tipo) => {
      const corpo = bloco.match(/\{[\s\S]*\}/)
      let dados: any = null
      try { dados = corpo ? JSON.parse(corpo[0]) : null } catch { dados = null }
      if (!dados) return ''

      // Numero que nao estava na lista nunca virou UUID: o modelo
      // apontou para um item que o usuario nao tem.
      const precisaDeId = ['PARTIAL_REALIZE', 'REALIZE_TX', 'DELETE_TX', 'DUPLICATE_TX', 'DELETE_GOAL', 'DELETE_ACCOUNT'].includes(tipo)
      if (precisaDeId && !UUID_RE.test(String(dados.id ?? ''))) {
        console.warn('bloco descartado: id nao resolvido', tipo)
        return ''
      }

      // Pagamento parcial de zero nao e pagamento parcial.
      if (tipo === 'PARTIAL_REALIZE' && !(Number(dados.paid_amount) > 0)) {
        console.warn('bloco descartado: parcial sem valor pago')
        return ''
      }

      return bloco
    }).trim()

    return new Response(JSON.stringify({ reply: respostaExpandida, uso: resposta.uso }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })

  } catch (err) {
    console.error("Erro:", err)
    // Nunca devolver a mensagem crua da exceção: ela pode carregar
    // trecho de prompt, cabeçalho ou identificador interno.
    console.error("Erro inesperado:", err?.message ?? err)
    return new Response(JSON.stringify({ error: "erro_inesperado" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }
})