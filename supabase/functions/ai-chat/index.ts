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

    const allTransactionsRes = await supabase.from("transactions").select("*").eq("user_id", userId).eq("is_realized", true).neq("type", "transfer")
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
      `ID:${a.id} | ${a.name} (${a.type}): R$${(accountBalances[a.id] || 0).toFixed(2)}`
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

    const monthlySummary = Object.entries(monthlyData)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([m, d]) => {
        const realized = `realizado: entrada R$${d.income.toFixed(0)} / saída R$${d.expense.toFixed(0)} / saldo R$${(d.income - d.expense).toFixed(0)}`
        const planned = (d.planned_income > 0 || d.planned_expense > 0) ? ` | previsto: +R$${d.planned_income.toFixed(0)} / -R$${d.planned_expense.toFixed(0)}` : ''
        return `${m}: ${realized}${planned}`
      }).join('\n')

    const currentYear = now.getFullYear()
    const byCategory: Record<string, number> = {}
    transactions
      .filter((t: any) => t.is_realized !== false && t.type === 'expense' && t.date.startsWith(String(currentYear)))
      .forEach((t: any) => { const cat = t.category || 'outros'; byCategory[cat] = (byCategory[cat] || 0) + parseFloat(t.amount) })
    const topCategories = Object.entries(byCategory).sort((a, b) => b[1] - a[1])
      .map(([cat, val]) => `${cat}: R$${(val as number).toFixed(0)}`).join(', ')

    const currentMonthByCategory: Record<string, number> = {}
    transactions
      .filter((t: any) => t.is_realized !== false && t.type === 'expense' && t.date.startsWith(currentMonthStr))
      .forEach((t: any) => { const cat = t.category || 'outros'; currentMonthByCategory[cat] = (currentMonthByCategory[cat] || 0) + parseFloat(t.amount) })

    // Transações previstas detalhadas com IDs
    const upcomingDetailed = transactions.filter((t: any) => t.is_realized === false && t.date >= nowStr)
      .sort((a: any, b: any) => a.date.localeCompare(b.date))
      .map((t: any) => `ID:${t.id} | ${t.date} | ${t.type === 'income' ? 'ENTRADA' : 'SAÍDA'} | ${t.description} (${t.category || 'sem categoria'}): R$${parseFloat(t.amount).toFixed(2)}`)
      .join('\n')

    const recentRealized = transactions.filter((t: any) => t.is_realized !== false && t.date <= nowStr)
      .sort((a: any, b: any) => b.date.localeCompare(a.date)).slice(0, 20)
      .map((t: any) => `ID:${t.id} | ${t.date} | ${t.type === 'income' ? 'ENTRADA' : 'SAÍDA'} | ${t.description} (${t.category || 'sem categoria'}): R$${parseFloat(t.amount).toFixed(2)}`)
      .join('\n')

    const last3Months = Object.entries(monthlyData)
      .filter(([m]) => m <= currentMonthStr)
      .sort((a, b) => b[0].localeCompare(a[0])).slice(0, 3)
    const avgIncome = last3Months.length > 0 ? last3Months.reduce((s, [, d]) => s + d.income, 0) / last3Months.length : 0
    const avgExpense = last3Months.length > 0 ? last3Months.reduce((s, [, d]) => s + d.expense, 0) / last3Months.length : 0

    // Metas com IDs
    const goalsSummary = goals.length > 0
      ? goals.map((g: any) => {
          const gastoCategoria = currentMonthByCategory[g.category?.toLowerCase()] || 0
          const progresso = g.target_amount > 0 ? ((gastoCategoria / g.target_amount) * 100).toFixed(0) : 0
          const restante = Math.max(0, g.target_amount - gastoCategoria)
          return `ID:${g.id} | ${g.name} (${g.type}) | limite: R$${g.target_amount} | gasto: R$${gastoCategoria.toFixed(2)} | restante: R$${restante.toFixed(2)} | progresso: ${progresso}% | categoria: ${g.category || 'geral'} | prazo: ${g.end_date}`
        }).join('\n')
      : 'Nenhuma meta cadastrada'

    const accountNames = accounts.map((a: any) => `${a.name} (ID:${a.id})`).join(', ')
    const referralLink = `https://www.planejapp.com.br/subscribe?ref=${profile?.referral_code || ''}`

    const systemPrompt = `Você é Finn, assistente financeiro pessoal brasileiro com superpoderes. Responda de forma DIRETA e CURTA.

REGRAS GERAIS:
- Máximo 3 frases por resposta
- Use APENAS dados reais abaixo
- Sem enrolação
- Data de hoje: ${nowStr}
- Link de convite do usuário: ${referralLink}

═══ PERFIL FINANCEIRO ═══

CONTAS (com IDs):
${accountsSummary}
Saldo disponível: R$${totalBalance.toFixed(2)}
Total investido: R$${totalInvested.toFixed(2)}

MÉDIAS (últimos 3 meses):
Renda: R$${avgIncome.toFixed(2)}/mês | Gasto: R$${avgExpense.toFixed(2)}/mês | Sobra: R$${(avgIncome - avgExpense).toFixed(2)}/mês

HISTÓRICO MENSAL:
${monthlySummary || 'sem dados'}

TRANSAÇÕES PREVISTAS (com IDs para realizar/editar/excluir):
${upcomingDetailed || 'nenhuma prevista'}

ÚLTIMAS 20 REALIZADAS (com IDs):
${recentRealized || 'nenhuma'}

GASTOS POR CATEGORIA (${currentYear}): ${topCategories || 'nenhum'}
GASTOS MÊS ATUAL (${currentMonthStr}): ${Object.entries(currentMonthByCategory).map(([c, v]) => `${c}: R$${(v as number).toFixed(2)}`).join(', ') || 'nenhum'}

METAS (com IDs):
${goalsSummary}

═══ AÇÕES DISPONÍVEIS ═══

Você pode executar estas ações. Para cada uma, gere o bloco correspondente NO FINAL da resposta:

━━ 1. LANÇAR TRANSAÇÃO ━━
Verbos: "gastei", "paguei", "recebi", "lança", "registra"
__PENDING_TX__{"type":"expense","amount":0.00,"description":"...","category":"alimentação","account_name":"...","date":"${nowStr}","is_realized":true}__END_TX__

━━ 2. REALIZAR TRANSAÇÃO PREVISTA (total) ━━
Quando o usuário pagar o valor TOTAL de uma prevista:
__REALIZE_TX__{"id":"uuid-da-transacao-prevista","date":"${nowStr}"}__END_REALIZE__

━━ 3. REALIZAR PARCIALMENTE UMA PREVISTA ━━
Quando o usuário pagar PARTE de uma prevista (ex: "gastei 100 dos 500 de gasolina"):
- Crie uma realizada com o valor pago
- Reduza o valor da prevista pelo que foi pago
__PARTIAL_REALIZE__{"id":"uuid-da-transacao-prevista","paid_amount":100.00,"remaining_amount":400.00,"description":"...","category":"...","account_name":"...","date":"${nowStr}"}__END_PARTIAL__

━━ 4. EXCLUIR TRANSAÇÃO ━━
Verbos: "exclui", "apaga", "remove", "deleta" + nome/descrição
__DELETE_TX__{"id":"uuid-da-transacao"}__END_DELETE__

━━ 5. CRIAR META ━━
Verbos: "cria meta", "nova meta", "quero economizar", "define meta"
__CREATE_GOAL__{"name":"...","type":"expense","category":"alimentação","target_amount":0.00,"start_date":"${nowStr}","end_date":"YYYY-MM-DD"}__END_GOAL__

━━ 6. EXCLUIR META ━━
Verbos: "exclui meta", "remove meta", "apaga meta"
__DELETE_GOAL__{"id":"uuid-da-meta"}__END_DELETE_GOAL__

━━ 7. CRIAR CONTA ━━
Verbos: "cria conta", "nova conta", "adiciona conta"
__CREATE_ACCOUNT__{"name":"...","type":"bank","initial_balance":0.00}__END_ACCOUNT__
Tipos válidos: bank | digital | wallet | investment | other

━━ 8. EXCLUIR CONTA ━━
Verbos: "exclui conta", "remove conta", "apaga conta"
__DELETE_ACCOUNT__{"id":"uuid-da-conta"}__END_DELETE_ACCOUNT__

━━ 9. ENVIAR CONVITE POR EMAIL ━━
Verbos: "convida", "envia convite", "manda link para", "compartilha com"
__SEND_INVITE__{"email":"email@exemplo.com","name":"Nome da pessoa"}__END_INVITE__

━━ REGRAS CRÍTICAS ━━
❌ NUNCA gere ação para perguntas como "posso gastar X?", "quanto gastei?", "como estão minhas finanças?"
❌ NUNCA gere blocos NO_ACTION ou qualquer outro bloco não listado acima. Se não há ação, responda apenas com texto normal.
✅ Para "paguei o aluguel" → procure nas previstas a transação com descrição similar e gere __REALIZE_TX__
✅ Para "exclui a meta de alimentação" → encontre o ID na lista e gere __DELETE_GOAL__
✅ Para "manda o link para joao@gmail.com" → gere __SEND_INVITE__
✅ Tipos de conta: bank=bancária, digital=conta digital, wallet=carteira, investment=investimento

Categorias válidas: alimentação | transporte | moradia | saúde | educação | lazer | compras | outros
Contas disponíveis: ${accountNames}`

    const messages = [
      ...(history || []).map((h: any) => ({ role: h.role, content: h.content })),
      { role: "user", content: message }
    ]

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("GROQ_API_KEY")}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        temperature: 0.2,
        max_tokens: 500
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