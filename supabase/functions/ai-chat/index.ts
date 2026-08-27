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

    const { message, history } = await req.json()

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
    // tokens, e o prompt listava dezenas deles. Aqui eles viram um
    // apelido de 8 caracteres, e a resposta do modelo é traduzida de
    // volta para o UUID real antes de chegar ao app.
    const mapaIds = new Map<string, string>()
    const apelido = (id: string) => {
      const curto = String(id).slice(0, 8)
      mapaIds.set(curto, id)
      return curto
    }

    const dinheiro = (v: any) => `R$${Number(v || 0).toFixed(2)}`
    const diaMes = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

    const accountsSummary = accounts.map((a: any) =>
      `#${apelido(a.id)} ${a.name} (${a.type}) ${dinheiro(accountBalances[a.id])}`
    ).join('\n')

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
      .map((t: any) => `#${apelido(t.id)} ${diaMes(t.date)} ${t.type === 'income' ? '+' : '-'}${dinheiro(t.amount)} ${t.description}`)
      .join('\n')

    // Realizadas servem para "exclui o mercado de ontem"; seis cobrem
    // o que alguém lembra de cabeça. Eram vinte.
    const recentRealized = transactions
      .filter((t: any) => t.is_realized !== false && t.date <= nowStr)
      .sort((a: any, b: any) => b.date.localeCompare(a.date))
      .slice(0, 6)
      .map((t: any) => `#${apelido(t.id)} ${diaMes(t.date)} ${t.type === 'income' ? '+' : '-'}${dinheiro(t.amount)} ${t.description}`)
      .join('\n')

    const last3Months = Object.entries(monthlyData)
      .filter(([m]) => m <= currentMonthStr)
      .sort((a, b) => b[0].localeCompare(a[0])).slice(0, 3)
    const avgIncome = last3Months.length > 0 ? last3Months.reduce((s, [, d]) => s + d.income, 0) / last3Months.length : 0
    const avgExpense = last3Months.length > 0 ? last3Months.reduce((s, [, d]) => s + d.expense, 0) / last3Months.length : 0

    const goalsSummary = goals.length > 0
      ? goals.map((g: any) => {
          const gasto = currentMonthByCategory[g.category?.toLowerCase()] || 0
          return `#${apelido(g.id)} ${g.name} (${g.type}) limite ${dinheiro(g.target_amount)} gasto ${dinheiro(gasto)} cat:${g.category || 'geral'}`
        }).join('\n')
      : 'nenhuma'

    // Só os nomes: o ID de cada conta já aparece na lista acima.
    const accountNames = accounts.map((a: any) => a.name).join(', ')
    const referralLink = `https://www.planejapp.com.br/subscribe?ref=${profile?.referral_code || ''}`

    // O bloco de instruções era o maior custo fixo: quase mil tokens
    // só de moldura e exemplos repetidos. Mesmas 9 ações, escrito curto.
    const systemPrompt = `Você é Finn, consultor financeiro pessoal brasileiro. Responda em no máximo 3 frases, direto, só com os dados abaixo. Hoje: ${nowStr}.

CONTAS
${accountsSummary}
Saldo ${dinheiro(totalBalance)} | Investido ${dinheiro(totalInvested)}
Média 3 meses: renda ${avgIncome.toFixed(0)}, gasto ${avgExpense.toFixed(0)}

MESES: ${monthlySummary || 'sem dados'}
GASTOS DO MÊS: ${Object.entries(currentMonthByCategory).map(([c, v]) => `${c} ${(v as number).toFixed(0)}`).join(', ') || 'nenhum'}

PREVISTAS
${upcomingDetailed || 'nenhuma'}

ÚLTIMAS REALIZADAS
${recentRealized || 'nenhuma'}

METAS
${goalsSummary}

AÇÕES — gere o bloco no fim da resposta, usando o #id da lista acima:
1 lançar: __PENDING_TX__{"type":"expense|income","amount":0,"description":"","category":"","account_name":"","date":"${nowStr}","is_realized":true}__END_TX__
2 realizar prevista: __REALIZE_TX__{"id":"#id","date":"${nowStr}"}__END_REALIZE__
3 realizar parte: __PARTIAL_REALIZE__{"id":"#id","paid_amount":0,"remaining_amount":0,"description":"","category":"","account_name":"","date":"${nowStr}"}__END_PARTIAL__
4 excluir transação: __DELETE_TX__{"id":"#id"}__END_DELETE__
5 criar meta: __CREATE_GOAL__{"name":"","type":"expense","category":"","target_amount":0,"start_date":"${nowStr}","end_date":"AAAA-MM-DD"}__END_GOAL__
6 excluir meta: __DELETE_GOAL__{"id":"#id"}__END_DELETE_GOAL__
7 criar conta: __CREATE_ACCOUNT__{"name":"","type":"bank|digital|wallet|investment|other","initial_balance":0}__END_ACCOUNT__
8 excluir conta: __DELETE_ACCOUNT__{"id":"#id"}__END_DELETE_ACCOUNT__
9 convidar: __SEND_INVITE__{"email":"","name":""}__END_INVITE__
Link de convite: ${referralLink}

REGRAS
- Pergunta ("posso gastar?", "quanto gastei?") NÃO gera bloco. Só texto.
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
        JSON.stringify({ error: resposta.detalhe, motivo: resposta.motivo }),
        { status: resposta.motivo === "limite" ? 429 : 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // O modelo responde com o apelido curto; o app espera o UUID real.
    const respostaExpandida = resposta.texto.replace(
      /"id"\s*:\s*"#?([0-9a-fA-F]{8})"/g,
      (original, curto) => {
        const completo = mapaIds.get(String(curto).toLowerCase())
        return completo ? `"id":"${completo}"` : original
      },
    )

    return new Response(JSON.stringify({ reply: respostaExpandida, uso: resposta.uso }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })

  } catch (err) {
    console.error("Erro:", err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }
})