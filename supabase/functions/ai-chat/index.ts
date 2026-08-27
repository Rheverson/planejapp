import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { adminClient, cors, preflight, requireUser } from "../_shared/auth.ts"
import { chamarGroq } from "../_shared/groq.ts"

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

    const now = new Date()
    const startDate = `${now.getFullYear() - 1}-01-01`
    const endDate = `${now.getFullYear() + 1}-12-31`
    const nowStr = now.toISOString().slice(0, 10)
    const currentMonthStr = nowStr.slice(0, 7)

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
      .map(({ t, n }) => `#${n} ${diaMes(t.date)} ${t.type === 'income' ? '+' : '-'}${dinheiro(t.amount)} ${t.description}`)
      .join('\n')

    // Realizadas servem para "exclui o mercado de ontem"; seis cobrem
    // o que alguém lembra de cabeça. Eram vinte.
    const recentRealized = transactions
      .filter((t: any) => t.is_realized !== false && t.date <= nowStr)
      .sort((a: any, b: any) => b.date.localeCompare(a.date))
      .slice(0, 6)
      .map((t: any) => ({ t, n: numTx(t) }))
      .filter(({ n }) => n !== null)
      .map(({ t, n }) => `#${n} ${diaMes(t.date)} ${t.type === 'income' ? '+' : '-'}${dinheiro(t.amount)} ${t.description}`)
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

    // Só os nomes: o ID de cada conta já aparece na lista acima.
    const accountNames = accounts.map((a: any) => a.name).join(', ')
    const referralLink = `https://www.planejapp.com.br/subscribe?ref=${profile?.referral_code || ''}`

    // O bloco de instruções era o maior custo fixo: quase mil tokens
    // só de moldura e exemplos repetidos. Mesmas 9 ações, escrito curto.
    const systemPrompt = `Você é Finn, consultor financeiro pessoal brasileiro. Hoje: ${nowStr}.

COMO RESPONDER
- Responda com NÚMERO, não com conselho genérico. "Corte gastos" não serve; "os R$${catsOrdenadas[0] ? (catsOrdenadas[0][1] as number).toFixed(0) : '0'} em ${catsOrdenadas[0]?.[0] || 'x'} são o maior peso do mês" serve.
- Use os dados abaixo. Se o dado não estiver aqui, diga que não tem — nunca estime nem invente.
- As listas abaixo SÃO os registros do usuário. Se houver qualquer linha em CONTAS, PREVISTAS ou ÚLTIMAS REALIZADAS, nunca diga que não há registros: cite pelo menos um lançamento concreto, com valor e data.
- Ao falar de um lançamento, conta ou meta específica, cite o número dele (#3) junto com a descrição — é o mesmo número que aparece na tela do usuário.
- 2 a 5 frases. Diga o que está acontecendo, por quê, e qual o próximo passo concreto com valor e prazo.
- Compare sempre com a referência: média dos 3 meses, a meta do usuário, ou o mês anterior.
- Fale em reais e em percentual da renda. Arredonde para real inteiro.
- Sem jargão, sem lista de dicas prontas, sem "considere avaliar". Direto, como quem olha o extrato junto.

SITUAÇÃO
CONTAS
${accountsSummary}
Saldo hoje ${dinheiro(totalBalance)} | Investido ${dinheiro(totalInvested)}
Média 3 meses: renda ${avgIncome.toFixed(0)}, gasto ${avgExpense.toFixed(0)}, sobra ${sobra.toFixed(0)} (${taxaPoupanca.toFixed(0)}% da renda)
A receber previsto ${dinheiro(previstasEntram)} | A pagar previsto ${dinheiro(previstasSaem)}
Projeção fim do mês ${dinheiro(projecaoFim)}

MESES: ${monthlySummary || 'sem dados'}
MAIORES GASTOS DO MÊS: ${topCategorias || 'nenhum'}
TODAS AS CATEGORIAS: ${Object.entries(currentMonthByCategory).map(([c, v]) => `${c} ${(v as number).toFixed(0)}`).join(', ') || 'nenhum'}

PREVISTAS
${upcomingDetailed || 'nenhuma'}

ÚLTIMAS REALIZADAS
${recentRealized || 'nenhuma'}

METAS
${goalsSummary}

COMO LER OS NÚMEROS
- Taxa de poupança saudável: 10% a 20% da renda. Abaixo de 0 é déficit e consome reserva.
- Moradia acima de ~30% da renda, ou uma única categoria variável acima de ~15%, é o que costuma explicar o aperto.
- Reserva de emergência = 6x o gasto mensal (${(avgExpense * 6).toFixed(0)} para este usuário).
- Déficit recorrente se resolve cortando a MAIOR categoria variável ou antecipando receita prevista — diga qual, com o valor.

IDENTIFICAÇÃO
Cada item das listas acima tem um número próprio (#1, #2...). Contas, transações e metas numeram separado: a conta #3 não é a transação #3. Use o número exatamente como aparece na lista. Nunca invente um número que não esteja listado.

QUANDO AGIR — teste antes de gerar qualquer bloco
Pergunte a si mesmo: o usuário MANDOU fazer, nesta última mensagem, com verbo no imperativo ("exclui", "paga", "realiza", "lança", "cria")?
- NÃO → responda só com texto. NENHUM bloco. Vale para toda pergunta ("estou gastando muito?", "onde vai meu dinheiro?", "como resolver?", "o que você sugere?") e para todo pedido de análise, plano ou recomendação.
- SIM → um bloco só, o da coisa que ele mandou.
Recomendar não é executar. Se a sua análise sugere realizar uma receita ou cortar uma despesa, ESCREVA a sugestão citando o número do item e PARE. Quem decide é o usuário: ele responde "pode realizar o #7" e só então você gera o bloco.

AÇÕES — catálogo interno. NUNCA escreva o nome nem o rótulo de uma ação na resposta ("lançar:", "realizar prevista:", "AÇÕES"): o usuário não pode ver nada disto. Ele vê só o seu texto e um cartão de confirmação montado pelo app.
Formato: no máximo UM bloco por resposta, sozinho na última linha, depois do texto. Nunca no meio da frase, nunca em negrito, nunca dentro de lista. Se o usuário pedir várias coisas, faça a primeira e diga que faz a próxima em seguida.
lançar: __PENDING_TX__{"type":"expense|income","amount":0,"description":"","category":"","account_name":"","date":"${nowStr}","is_realized":true}__END_TX__
realizar prevista: __REALIZE_TX__{"id":"#N","date":"${nowStr}"}__END_REALIZE__
realizar parte: __PARTIAL_REALIZE__{"id":"#N","paid_amount":0,"remaining_amount":0,"date":"${nowStr}"}__END_PARTIAL__
excluir transação: __DELETE_TX__{"id":"#N"}__END_DELETE__
criar meta: __CREATE_GOAL__{"name":"","type":"expense","category":"","target_amount":0,"start_date":"${nowStr}","end_date":"AAAA-MM-DD"}__END_GOAL__
excluir meta: __DELETE_GOAL__{"id":"#N"}__END_DELETE_GOAL__
criar conta: __CREATE_ACCOUNT__{"name":"","type":"bank|digital|wallet|investment|other","initial_balance":0}__END_ACCOUNT__
excluir conta: __DELETE_ACCOUNT__{"id":"#N"}__END_DELETE_ACCOUNT__
convidar: __SEND_INVITE__{"email":"","name":""}__END_INVITE__
Link de convite: ${referralLink}

QUANDO NÃO GERAR BLOCO
- "realizar parte" só com o valor pago dito pelo usuário e maior que zero. Sem valor, pergunte quanto foi pago.
- Antes de excluir ou cancelar, pare e pergunte se:
  · "conta" puder ser conta bancária OU conta a pagar (é ambíguo em português) — pergunte qual das duas.
  · mais de um item casar com a descrição — pergunte qual, citando os candidatos pelo número.
  · nenhum item casar — diga que não encontrou. Nunca escolha o mais parecido.
  · o pedido não disser O QUE excluir ("exclui tudo", "apaga aquilo") — pergunte o quê.
- Nunca invente outro tipo de bloco.
- "paguei o aluguel" → ache a prevista parecida e use __REALIZE_TX__.
- Categorias: alimentação, transporte, moradia, saúde, educação, lazer, compras, outros.
- Contas: ${accountNames}`

    const messages = [
      ...(history || []).map((h: any) => ({ role: h.role, content: h.content })),
      { role: "user", content: message }
    ]

    const resposta = await chamarGroq(
      [{ role: "system", content: systemPrompt }, ...messages],
      { temperature: 0.2, maxTokens: 500 },
    )

    if (!resposta.ok) {
      // O motivo sobe para o cliente, para a tela poder dizer o que houve
      // em vez de fingir que o Finn não entendeu a pergunta.
      console.error("Groq falhou:", resposta.motivo, resposta.detalhe)
      return new Response(
        // O detalhe da Groq traz id da organização, nome do modelo e
        // limites da conta. Fica no log do servidor; para fora vai só o
        // motivo, que é o que o app precisa para escolher a mensagem.
        JSON.stringify({ error: "ia_indisponivel", motivo: resposta.motivo }),
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
    const MAPA_POR_BLOCO: Array<[RegExp, Map<number, string>]> = [
      [/__PARTIAL_REALIZE__[\s\S]*?__END_PARTIAL__/g,          mapaTx],
      [/__REALIZE_TX__[\s\S]*?__END_REALIZE__/g,               mapaTx],
      [/__DELETE_TX__[\s\S]*?__END_DELETE__/g,                 mapaTx],
      [/__DELETE_GOAL__[\s\S]*?__END_DELETE_GOAL__/g,          mapaMeta],
      [/__DELETE_ACCOUNT__[\s\S]*?__END_DELETE_ACCOUNT__/g,    mapaConta],
    ]

    let respostaExpandida = resposta.texto
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
      /[*]*_{0,2}(PENDING_TX|RECURRING_TX|PARTIAL_REALIZE|REALIZE_TX|DELETE_TX|CREATE_GOAL|DELETE_GOAL|CREATE_ACCOUNT|DELETE_ACCOUNT|SEND_INVITE)_{0,2}[*]*[\s\S]*?[*]*_{0,2}(END_TX|END_RECURRING|END_PARTIAL|END_REALIZE|END_DELETE_GOAL|END_DELETE_ACCOUNT|END_DELETE|END_GOAL|END_ACCOUNT|END_INVITE)_{0,2}[*]*/g

    respostaExpandida = respostaExpandida.replace(TODOS_OS_BLOCOS, (bloco, tipo) => {
      const corpo = bloco.match(/\{[\s\S]*\}/)
      let dados: any = null
      try { dados = corpo ? JSON.parse(corpo[0]) : null } catch { dados = null }
      if (!dados) return ''

      // Numero que nao estava na lista nunca virou UUID: o modelo
      // apontou para um item que o usuario nao tem.
      const precisaDeId = ['PARTIAL_REALIZE', 'REALIZE_TX', 'DELETE_TX', 'DELETE_GOAL', 'DELETE_ACCOUNT'].includes(tipo)
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