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
    const { userId, month } = await req.json()

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    // ── Verifica limite de uso (2 por semana) ────────────
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    const { count } = await supabase
      .from("ai_usage")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", weekAgo.toISOString())

    if ((count || 0) >= 2) {
      return new Response(JSON.stringify({
        error: "limite_atingido",
        message: "Você atingiu o limite de 2 análises por semana. Tente novamente em alguns dias!"
      }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    // ── Busca dados financeiros ──────────────────────────
    const startDate = `${month}-01`
    const [year, monthNum] = month.split('-')
    const lastDay = new Date(parseInt(year), parseInt(monthNum), 0).getDate()
    const endDate = `${month}-${lastDay}`

    const [transactionsRes, accountsRes, goalsRes, allTransactionsRes] = await Promise.all([
      supabase.from("transactions")
        .select("*")
        .eq("user_id", userId)
        .gte("date", startDate)
        .lte("date", endDate)
        .neq("type", "transfer"),
      supabase.from("accounts")
        .select("*")
        .eq("user_id", userId),
      supabase.from("goals")
        .select("*")
        .eq("user_id", userId),
      supabase.from("transactions")
        .select("*")
        .eq("user_id", userId)
        .eq("is_realized", true)
        .neq("type", "transfer")
    ])

    const transactions = transactionsRes.data || []
    const accounts = accountsRes.data || []
    const goals = goalsRes.data || []
    const allTransactions = allTransactionsRes.data || []

    const realizedTransactions = transactions.filter((t: any) => t.is_realized !== false)
    const plannedTransactions = transactions.filter((t: any) => t.is_realized === false)

    const totalIncome = realizedTransactions.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + t.amount, 0)
    const totalExpense = realizedTransactions.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + t.amount, 0)
    const plannedIncome = plannedTransactions.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + t.amount, 0)
    const plannedExpense = plannedTransactions.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + t.amount, 0)

    const balance = totalIncome - totalExpense
    const savingsRate = totalIncome > 0 ? ((balance / totalIncome) * 100).toFixed(1) : 0

    // Projeção completa do mês
    const totalIncomeProjected = totalIncome + plannedIncome
    const totalExpenseProjected = totalExpense + plannedExpense
    const balanceProjected = totalIncomeProjected - totalExpenseProjected
    const savingsRateProjected = totalIncomeProjected > 0
      ? ((balanceProjected / totalIncomeProjected) * 100).toFixed(1)
      : '0'
    const isProjectedNegative = balanceProjected < 0

    // Gastos por categoria
    const byCategory: Record<string, number> = {}
    realizedTransactions.filter((t: any) => t.type === 'expense').forEach((t: any) => {
      const cat = t.category || 'outros'
      byCategory[cat] = (byCategory[cat] || 0) + t.amount
    })

    // Inclui previstos no resumo de categorias
    plannedTransactions.filter((t: any) => t.type === 'expense').forEach((t: any) => {
      const cat = t.category || 'outros'
      byCategory[cat] = (byCategory[cat] || 0) + t.amount
    })

    const topCategories = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat, val]) => `${cat}: R$${(val as number).toFixed(2)}`)

    // Saldo real de cada conta
    const accountBalances: Record<string, number> = {}
    accounts.forEach((acc: any) => {
      accountBalances[acc.id] = acc.initial_balance || 0
    })
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
      `${a.name} (${a.type === 'investment' ? 'investimento' : a.type}): R$${(accountBalances[a.id] || 0).toFixed(2)}`
    ).join('\n')

    // Mapeamento de categorias para regra 50/30/20
    const necessidadesCategories = ['alimentação', 'moradia', 'aluguel', 'transporte', 'saúde', 'educação', 'contas', 'mercado', 'agua', 'luz', 'internet', 'telefone', 'gas', 'combustivel', 'gasolina', 'farmacia', 'médico', 'plano de saude']
    const desejosCategories = ['lazer', 'entretenimento', 'restaurante', 'roupas', 'compras', 'viagem', 'streaming', 'assinatura', 'beleza', 'pet', 'presente', 'bar', 'hobby', 'esporte']

    const allMonthExpenses = [...realizedTransactions, ...plannedTransactions].filter((t: any) => t.type === 'expense')

    const gastoNecessidades = allMonthExpenses
      .filter((t: any) => necessidadesCategories.some((c: string) => t.category?.toLowerCase().includes(c)))
      .reduce((s: number, t: any) => s + t.amount, 0)

    const gastoDesejos = allMonthExpenses
      .filter((t: any) => desejosCategories.some((c: string) => t.category?.toLowerCase().includes(c)))
      .reduce((s: number, t: any) => s + t.amount, 0)

    const investidoNoMes = realizedTransactions
      .filter((t: any) => t.type === 'income')
      .filter((t: any) => {
        const acc = accounts.find((a: any) => a.id === t.account_id)
        return acc?.type === 'investment'
      })
      .reduce((s: number, t: any) => s + t.amount, 0)

    // Base de cálculo = renda projetada total do mês
    const rendaBase = totalIncomeProjected > 0 ? totalIncomeProjected : totalIncome

    // Quanto pode investir considerando o saldo projetado
    const investimentoSugerido = isProjectedNegative
      ? 0
      : Math.max(0, balanceProjected * 0.5) // 50% do que sobrar

    const prompt = `Você é um consultor financeiro pessoal especializado em finanças brasileiras. 
Analise os dados financeiros reais do usuário e forneça insights práticos em português brasileiro.

DADOS DO MÊS (${month}):

SITUAÇÃO ATUAL (já realizado):
- Renda realizada: R$${totalIncome.toFixed(2)}
- Gastos realizados: R$${totalExpense.toFixed(2)}
- Saldo atual: R$${balance.toFixed(2)}
- Taxa de poupança atual: ${savingsRate}%

PROJEÇÃO ATÉ O FIM DO MÊS (realizado + previsto):
- Renda total projetada: R$${totalIncomeProjected.toFixed(2)} (faltam receber R$${plannedIncome.toFixed(2)})
- Gasto total projetado: R$${totalExpenseProjected.toFixed(2)} (faltam pagar R$${plannedExpense.toFixed(2)})
- Saldo projetado ao fim do mês: R$${balanceProjected.toFixed(2)} ${isProjectedNegative ? '⚠️ ATENÇÃO: SALDO PROJETADO NEGATIVO!' : '✅ positivo'}
- Taxa de poupança projetada: ${savingsRateProjected}%

PATRIMÔNIO (separado da renda mensal):
- Saldo em contas correntes/carteiras: R$${totalBalance.toFixed(2)}
- Total em investimentos (acumulado): R$${totalInvested.toFixed(2)}

CONTAS DO USUÁRIO:
${accountsSummary}

TOP GASTOS POR CATEGORIA (realizados + previstos):
${topCategories.length > 0 ? topCategories.join('\n') : 'Nenhum gasto no mês'}

METAS ATIVAS: ${goals.length}

IMPORTANTE:
- Use a RENDA PROJETADA (R$${rendaBase.toFixed(2)}) como base para a regra 50/30/20
- Se o saldo projetado for NEGATIVO, ALERTE o usuário e NÃO sugira investimento
- Se o saldo projetado for positivo mas pequeno, sugira investir apenas o que sobrar
- O patrimônio em investimentos (R$${totalInvested.toFixed(2)}) já está guardado
- Seja realista: considere que ainda faltam pagar R$${plannedExpense.toFixed(2)} de gastos previstos

Responda APENAS com JSON válido:
{
  "score": (0-100, penalize fortemente se saldo projetado for negativo),
  "score_label": ("Crítico", "Atenção", "Regular", "Bom" ou "Excelente"),
  "score_color": ("red", "orange", "yellow", "blue" ou "green"),
  "resumo": "resumo considerando tanto o realizado quanto o projetado, alerte se saldo projetado for negativo",
  "alerta_projecao": ${isProjectedNegative ? '"⚠️ Atenção! Seus gastos previstos superam sua renda prevista. Saldo projetado: R$' + balanceProjected.toFixed(2) + '"' : 'null'},
  "insights": [
    {
      "tipo": "positivo|negativo|neutro",
      "titulo": "título curto",
      "descricao": "descrição com números reais incluindo previstos",
      "acao": "ação recomendada"
    }
  ],
  "recomendacoes": [
    {
      "categoria": "nome",
      "gasto_atual": 0.00,
      "gasto_ideal": 0.00,
      "economia_possivel": 0.00,
      "dica": "dica específica"
    }
  ],
  "investimento_sugerido": {
    "valor": ${investimentoSugerido.toFixed(2)},
    "percentual": "${isProjectedNegative ? '0%' : '20%'}",
    "justificativa": "${isProjectedNegative ? 'Não recomendado investir este mês pois o saldo projetado é negativo. Foque em equilibrar as contas.' : 'Baseado no saldo projetado ao fim do mês de R$' + balanceProjected.toFixed(2)}",
    "opcoes": ["Tesouro Direto", "CDB", "Fundo de emergência"]
  },
  "regra_50_30_20": {
    "renda_base": ${rendaBase.toFixed(2)},
    "necessidades": {"ideal": ${(rendaBase * 0.5).toFixed(2)}, "atual": ${gastoNecessidades.toFixed(2)}},
    "desejos": {"ideal": ${(rendaBase * 0.3).toFixed(2)}, "atual": ${gastoDesejos.toFixed(2)}},
    "investimentos": {"ideal": ${(rendaBase * 0.2).toFixed(2)}, "atual": ${investidoNoMes.toFixed(2)}}
  }
}`

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("GROQ_API_KEY")}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 2000
      })
    })

    const groqData = await groqRes.json()
    console.log('Groq status:', groqRes.status)

    if (!groqRes.ok) {
      console.error('Groq error:', JSON.stringify(groqData))
      throw new Error("Erro ao chamar a IA: " + (groqData.error?.message || "Erro desconhecido"))
    }

    const content = groqData.choices?.[0]?.message?.content
    if (!content) throw new Error("Resposta vazia da IA")

    const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const insights = JSON.parse(cleanContent)

    await supabase.from("ai_usage").insert({ user_id: userId })

    return new Response(JSON.stringify({
      insights,
      meta: {
        totalIncome, totalExpense, balance, savingsRate,
        totalIncomeProjected, totalExpenseProjected, balanceProjected,
        savingsRateProjected, isProjectedNegative,
        month, totalBalance, totalInvested, rendaBase
      },
      usage: { used: (count || 0) + 1, limit: 2, remaining: 2 - (count || 0) - 1 }
    }), {
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