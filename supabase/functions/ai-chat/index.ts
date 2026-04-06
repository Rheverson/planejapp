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
    const { userId, message, history, month } = await req.json()

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    // Busca dados financeiros do usuário
    const currentMonth = month || new Date().toISOString().slice(0, 7)
    const [year, monthNum] = currentMonth.split('-')
    const lastDay = new Date(parseInt(year), parseInt(monthNum), 0).getDate()

    const [transactionsRes, accountsRes, goalsRes] = await Promise.all([
      supabase.from("transactions")
        .select("*")
        .eq("user_id", userId)
        .gte("date", `${currentMonth}-01`)
        .lte("date", `${currentMonth}-${lastDay}`)
        .neq("type", "transfer"),
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

    const realized = transactions.filter((t: any) => t.is_realized !== false)
    const planned = transactions.filter((t: any) => t.is_realized === false)

    const totalIncome = realized.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + t.amount, 0)
    const totalExpense = realized.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + t.amount, 0)
    const plannedIncome = planned.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + t.amount, 0)
    const plannedExpense = planned.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + t.amount, 0)

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

    const byCategory: Record<string, number> = {}
    realized.filter((t: any) => t.type === 'expense').forEach((t: any) => {
      const cat = t.category || 'outros'
      byCategory[cat] = (byCategory[cat] || 0) + t.amount
    })
    const topCategories = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat, val]) => `${cat}: R$${(val as number).toFixed(2)}`)

    const accountsSummary = accounts.map((a: any) =>
      `${a.name} (${a.type}): R$${(accountBalances[a.id] || 0).toFixed(2)}`
    ).join(', ')

    const goalsSummary = goals.length > 0
      ? goals.map((g: any) => `${g.name} (${g.type}): meta R$${g.target_amount}`).join(', ')
      : 'Nenhuma meta cadastrada'

    const systemPrompt = `Você é um consultor financeiro pessoal e especialista em investimentos brasileiro chamado "Finn". 
Você tem acesso aos dados financeiros reais do usuário e responde de forma SUCINTA, DIRETA e PRÁTICA.

PERFIL FINANCEIRO DO USUÁRIO (${currentMonth}):
- Renda realizada: R$${totalIncome.toFixed(2)}
- Gastos realizados: R$${totalExpense.toFixed(2)}
- Renda prevista: R$${plannedIncome.toFixed(2)}
- Gastos previstos: R$${plannedExpense.toFixed(2)}
- Saldo atual: R$${(totalIncome - totalExpense).toFixed(2)}
- Saldo projetado fim do mês: R$${(totalIncome + plannedIncome - totalExpense - plannedExpense).toFixed(2)}
- Saldo em contas: R$${totalBalance.toFixed(2)}
- Total investido: R$${totalInvested.toFixed(2)}
- Patrimônio total: R$${(totalBalance + totalInvested).toFixed(2)}

CONTAS: ${accountsSummary}
TOP GASTOS: ${topCategories.join(', ') || 'nenhum'}
METAS: ${goalsSummary}

REGRAS DE COMPORTAMENTO:
- Responda em português brasileiro
- Seja SUCINTO — máximo 3-4 parágrafos curtos
- Use os dados reais do usuário nas respostas
- Se perguntarem sobre investimentos, dê opções concretas baseadas no perfil
- Se perguntarem se podem gastar algo, calcule com base no saldo real
- Use emojis com moderação para tornar a resposta mais amigável
- Nunca invente dados que não foram fornecidos
- Se não souber algo específico, seja honesto
- Trate o usuário de forma amigável e encorajadora`

    // Monta histórico de mensagens
    const messages = [
      ...(history || []).map((h: any) => ({
        role: h.role,
        content: h.content
      })),
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
        temperature: 0.7,
        max_tokens: 500
      })
    })

    const groqData = await groqRes.json()

    if (!groqRes.ok) {
      throw new Error("Erro ao chamar a IA: " + (groqData.error?.message || "Erro desconhecido"))
    }

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