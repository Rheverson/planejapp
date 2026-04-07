import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { userId, message, history } = await req.json()

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const now = new Date()
    const startDate = `${now.getFullYear() - 1}-01-01`
    const endDate = `${now.getFullYear() + 1}-12-31`

    const [transactionsRes, accountsRes, goalsRes] = await Promise.all([
      supabase.from("transactions")
        .select("*")
        .eq("user_id", userId)
        .gte("date", startDate)
        .lte("date", endDate)
        .neq("type", "transfer")
        .order("date", { ascending: true }),
      supabase.from("accounts")
        .select("*")
        .eq("user_id", userId),
      supabase.from("goals")
        .select("*")
        .eq("user_id", userId)
    ])

    const transactions = transactionsRes.data || []
    const accounts = accountsRes.data || []
    const goals = goalsRes.data || []

    // Saldo real das contas
    const allTransactionsRes = await supabase.from("transactions")
      .select("*").eq("user_id", userId).eq("is_realized", true).neq("type", "transfer")
    const allTransactions = allTransactionsRes.data || []

    const accountBalances: Record<string, number> = {}
    accounts.forEach((acc: any) => { accountBalances[acc.id] = acc.initial_balance || 0 })
    allTransactions.forEach((t: any) => {
      if (!t.account_id) return
      if (t.type === 'income') accountBalances[t.account_id] = (accountBalances[t.account_id] || 0) + t.amount
      else if (t.type === 'expense') accountBalances[t.account_id] = (accountBalances[t.account_id] || 0) - t.amount
    })

    const regularAccounts = accounts.filter((a: any) => a.type !== 'investment')
    const investmentAccounts = accounts.filter((a: any) => a.type === 'investment')
    const totalBalance = regularAccounts.reduce((s: number, a: any) => s + (accountBalances[a.id] || 0), 0)
    const totalInvested = investmentAccounts.reduce((s: number, a: any) => s + (accountBalances[a.id] || 0), 0)

    const accountsSummary = accounts.map((a: any) =>
      `${a.name} (${a.type}): R$${(accountBalances[a.id] || 0).toFixed(2)}`
    ).join('\n')

    // Resumo por mês
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

    const monthlySummary = Object.entries(monthlyData)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([m, d]) => {
        const realized = `realizado: entrada R$${d.income.toFixed(0)} / saída R$${d.expense.toFixed(0)} / saldo R$${(d.income - d.expense).toFixed(0)}`
        const planned = (d.planned_income > 0 || d.planned_expense > 0)
          ? ` | previsto: +R$${d.planned_income.toFixed(0)} / -R$${d.planned_expense.toFixed(0)}`
          : ''
        return `${m}: ${realized}${planned}`
      })
      .join('\n')

    // Gastos por categoria realizados
    const currentYear = now.getFullYear()
    const byCategory: Record<string, number> = {}
    transactions
      .filter((t: any) => t.is_realized !== false && t.type === 'expense' && t.date.startsWith(String(currentYear)))
      .forEach((t: any) => {
        const cat = t.category || 'outros'
        byCategory[cat] = (byCategory[cat] || 0) + parseFloat(t.amount)
      })
    const topCategories = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, val]) => `${cat}: R$${(val as number).toFixed(0)}`)
      .join(', ')

    // Todas transações previstas detalhadas (futuras)
    const nowStr = now.toISOString().slice(0, 10)
    const upcomingDetailed = transactions
      .filter((t: any) => t.is_realized === false && t.date >= nowStr)
      .sort((a: any, b: any) => a.date.localeCompare(b.date))
      .map((t: any) => `${t.date} | ${t.type === 'income' ? 'ENTRADA' : 'SAÍDA'} | ${t.description} (${t.category || 'sem categoria'}): R$${parseFloat(t.amount).toFixed(2)}`)
      .join('\n')

    // Últimas 20 transações realizadas
    const recentRealized = transactions
      .filter((t: any) => t.is_realized !== false && t.date <= nowStr)
      .sort((a: any, b: any) => b.date.localeCompare(a.date))
      .slice(0, 20)
      .map((t: any) => `${t.date} | ${t.type === 'income' ? 'ENTRADA' : 'SAÍDA'} | ${t.description} (${t.category || 'sem categoria'}): R$${parseFloat(t.amount).toFixed(2)}`)
      .join('\n')

    // Médias
    const last3Months = Object.entries(monthlyData)
      .filter(([m]) => m <= nowStr.slice(0, 7))
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 3)
    const avgIncome = last3Months.length > 0
      ? last3Months.reduce((s, [, d]) => s + d.income, 0) / last3Months.length : 0
    const avgExpense = last3Months.length > 0
      ? last3Months.reduce((s, [, d]) => s + d.expense, 0) / last3Months.length : 0

    // Metas
    const goalsSummary = goals.length > 0
      ? goals.map((g: any) => `${g.name} (${g.type}) | meta: R$${g.target_amount} | prazo: ${g.end_date} | categoria: ${g.category || 'geral'}`).join('\n')
      : 'Nenhuma meta cadastrada'

    const systemPrompt = `Você é Finn, consultor financeiro pessoal brasileiro. Responda de forma DIRETA, CURTA e DECISIVA.

REGRAS DE RESPOSTA:
- Máximo 3 frases curtas por resposta
- Seja direto — diga SIM ou NÃO quando perguntado
- Use APENAS os dados reais abaixo — nunca invente valores
- Sem enrolação, sem "Com base nos seus dados..."
- Tom URGENTE quando há risco financeiro — não suavize
- Dê UMA ação concreta, não uma lista
- Fale como consultor que cobra caro e não tem tempo a perder
- Data de hoje: ${nowStr}

═══ PERFIL FINANCEIRO COMPLETO ═══

CONTAS E SALDOS REAIS:
${accountsSummary}
Saldo disponível (sem investimentos): R$${totalBalance.toFixed(2)}
Total investido: R$${totalInvested.toFixed(2)}
Patrimônio total: R$${(totalBalance + totalInvested).toFixed(2)}

MÉDIAS (últimos 3 meses realizados):
Renda média: R$${avgIncome.toFixed(2)}/mês
Gasto médio: R$${avgExpense.toFixed(2)}/mês
Sobra média: R$${(avgIncome - avgExpense).toFixed(2)}/mês

HISTÓRICO MENSAL COMPLETO (realizados + previstos):
${monthlySummary || 'sem dados'}

TRANSAÇÕES FUTURAS PREVISTAS:
${upcomingDetailed || 'nenhuma prevista'}

ÚLTIMAS 20 TRANSAÇÕES REALIZADAS:
${recentRealized || 'nenhuma'}

GASTOS POR CATEGORIA (${currentYear} realizados):
${topCategories || 'nenhum'}

METAS ATIVAS:
${goalsSummary}`

    const messages = [
      ...(history || []).map((h: any) => ({ role: h.role, content: h.content })),
      { role: "user", content: message }
    ]

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("GROQ_API_KEY")}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages
        ],
        temperature: 0.3,
        max_tokens: 250
      })
    })

    const groqData = await groqRes.json()
    if (!groqRes.ok) throw new Error("Erro ao chamar a IA: " + (groqData.error?.message || "Erro desconhecido"))

    const reply = groqData.choices?.[0]?.message?.content
    if (!reply) throw new Error("Resposta vazia da IA")

    return new Response(JSON.stringify({ reply }), {
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