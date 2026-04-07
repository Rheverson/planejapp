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

    // Período: ano passado até 1 ano no futuro
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
        .order("date", { ascending: false }),
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

    // Resumo por mês (últimos 12 meses)
    const monthlyData: Record<string, { income: number, expense: number }> = {}
    transactions.filter((t: any) => t.is_realized !== false).forEach((t: any) => {
      const m = t.date.slice(0, 7)
      if (!monthlyData[m]) monthlyData[m] = { income: 0, expense: 0 }
      if (t.type === 'income') monthlyData[m].income += t.amount
      else if (t.type === 'expense') monthlyData[m].expense += t.amount
    })

    const monthlySummary = Object.entries(monthlyData)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([m, d]) => `${m}: entrada R$${d.income.toFixed(0)} / saída R$${d.expense.toFixed(0)} / saldo R$${(d.income - d.expense).toFixed(0)}`)
      .join('\n')

    // Gastos por categoria (ano atual)
    const currentYear = now.getFullYear()
    const byCategory: Record<string, number> = {}
    transactions
      .filter((t: any) => t.is_realized !== false && t.type === 'expense' && t.date.startsWith(String(currentYear)))
      .forEach((t: any) => {
        const cat = t.category || 'outros'
        byCategory[cat] = (byCategory[cat] || 0) + t.amount
      })
    const topCategories = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([cat, val]) => `${cat}: R$${(val as number).toFixed(0)}`)
      .join(', ')

    // Contas a pagar nos próximos 30 dias
    const next30 = new Date(now)
    next30.setDate(next30.getDate() + 30)
    const upcomingBills = transactions
      .filter((t: any) => t.is_realized === false && t.type === 'expense')
      .filter((t: any) => new Date(t.date) <= next30)
      .reduce((s: number, t: any) => s + t.amount, 0)

    // Renda média mensal (últimos 3 meses)
    const last3Months = Object.entries(monthlyData)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 3)
    const avgIncome = last3Months.length > 0
      ? last3Months.reduce((s, [, d]) => s + d.income, 0) / last3Months.length
      : 0
    const avgExpense = last3Months.length > 0
      ? last3Months.reduce((s, [, d]) => s + d.expense, 0) / last3Months.length
      : 0

    // Metas resumidas
    const goalsSummary = goals.length > 0
      ? goals.map((g: any) => `${g.name} (${g.type}): meta R$${g.target_amount} até ${g.end_date}`).join(', ')
      : 'Nenhuma'

    const accountsSummary = accounts.map((a: any) =>
      `${a.name} (${a.type}): R$${(accountBalances[a.id] || 0).toFixed(0)}`
    ).join(', ')

    const systemPrompt = `Você é Finn, consultor financeiro pessoal brasileiro. Responda de forma DIRETA, CURTA e DECISIVA.

REGRAS DE RESPOSTA:
- Máximo 3 frases curtas por resposta
- Seja direto — diga SIM ou NÃO quando perguntado
- Use números reais do perfil do usuário
- Sem enrolação, sem introduções, sem "Com base nos seus dados..."
- Emojis com moderação (máximo 2 por resposta)

PERFIL FINANCEIRO COMPLETO:

CONTAS: ${accountsSummary}
Saldo disponível: R$${totalBalance.toFixed(0)}
Total investido: R$${totalInvested.toFixed(0)}
Patrimônio total: R$${(totalBalance + totalInvested).toFixed(0)}

MÉDIA DOS ÚLTIMOS 3 MESES:
Renda média: R$${avgIncome.toFixed(0)}/mês
Gasto médio: R$${avgExpense.toFixed(0)}/mês
Sobra média: R$${(avgIncome - avgExpense).toFixed(0)}/mês

CONTAS A PAGAR (próximos 30 dias): R$${upcomingBills.toFixed(0)}

TOP GASTOS (${currentYear}): ${topCategories || 'nenhum'}

HISTÓRICO MENSAL:
${monthlySummary || 'sem dados'}

METAS: ${goalsSummary}`

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
        temperature: 0.5,
        max_tokens: 200
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