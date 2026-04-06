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

    // Busca dados financeiros do usuário
    const startDate = `${month}-01`
    const endDate = `${month}-31`

    const [transactionsRes, accountsRes, goalsRes] = await Promise.all([
      supabase.from("transactions")
        .select("*")
        .eq("user_id", userId)
        .gte("date", startDate)
        .lte("date", endDate)
        .eq("is_realized", true),
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

    // Calcula métricas
    const totalIncome = transactions
      .filter(t => t.type === 'income')
      .reduce((s, t) => s + t.amount, 0)

    const totalExpense = transactions
      .filter(t => t.type === 'expense')
      .reduce((s, t) => s + t.amount, 0)

    const balance = totalIncome - totalExpense
    const savingsRate = totalIncome > 0 ? ((balance / totalIncome) * 100).toFixed(1) : 0

    // Gastos por categoria
    const byCategory: Record<string, number> = {}
    transactions.filter(t => t.type === 'expense').forEach(t => {
      const cat = t.category || 'outros'
      byCategory[cat] = (byCategory[cat] || 0) + t.amount
    })

    const topCategories = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat, val]) => `${cat}: R$${val.toFixed(2)}`)

    // Saldo total das contas
    const totalBalance = accounts.reduce((s, a) => s + (a.initial_balance || 0), 0)

    // Prompt para o Claude
    const prompt = `Você é um consultor financeiro pessoal especializado em finanças brasileiras. 
Analise os dados financeiros do usuário e forneça insights práticos e personalizados em português brasileiro.

DADOS FINANCEIROS DO MÊS:
- Entradas: R$${totalIncome.toFixed(2)}
- Saídas: R$${totalExpense.toFixed(2)}
- Saldo do mês: R$${balance.toFixed(2)}
- Taxa de poupança: ${savingsRate}%
- Saldo total nas contas: R$${totalBalance.toFixed(2)}
- Total de transações: ${transactions.length}

TOP CATEGORIAS DE GASTOS:
${topCategories.join('\n')}

METAS ATIVAS: ${goals.length} meta(s)

Forneça uma análise em JSON com exatamente este formato:
{
  "score": (número de 0 a 100 representando saúde financeira),
  "score_label": (texto curto: "Crítico", "Atenção", "Regular", "Bom" ou "Excelente"),
  "score_color": ("red", "orange", "yellow", "blue" ou "green"),
  "resumo": (1 parágrafo resumindo a situação financeira do mês),
  "insights": [
    {
      "tipo": ("positivo", "negativo" ou "neutro"),
      "titulo": (título curto do insight),
      "descricao": (descrição detalhada com números reais),
      "acao": (ação recomendada específica)
    }
  ],
  "recomendacoes": [
    {
      "categoria": (categoria de gasto),
      "gasto_atual": (valor atual),
      "gasto_ideal": (valor recomendado),
      "economia_possivel": (diferença),
      "dica": (dica específica para reduzir)
    }
  ],
  "investimento_sugerido": {
    "valor": (quanto investir por mês),
    "percentual": (% da renda),
    "justificativa": (por que esse valor),
    "opcoes": ["opção 1", "opção 2", "opção 3"]
  },
  "regra_50_30_20": {
    "necessidades": {"ideal": ${(totalIncome * 0.5).toFixed(2)}, "atual": ${transactions.filter(t => t.type === 'expense' && ['moradia','alimentação','transporte','saúde'].includes(t.category)).reduce((s,t) => s+t.amount, 0).toFixed(2)}},
    "desejos": {"ideal": ${(totalIncome * 0.3).toFixed(2)}, "atual": 0},
    "investimentos": {"ideal": ${(totalIncome * 0.2).toFixed(2)}, "atual": 0}
  }
}

Seja direto, use números reais dos dados fornecidos e dê conselhos práticos para a realidade brasileira.`

    // Chama a API do Claude
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }]
      })
    })

    const claudeData = await claudeRes.json()
    const content = claudeData.content[0].text

    // Parse o JSON da resposta
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    const insights = jsonMatch ? JSON.parse(jsonMatch[0]) : null

    if (!insights) {
      throw new Error("Falha ao processar insights da IA")
    }

    return new Response(JSON.stringify({
      insights,
      meta: { totalIncome, totalExpense, balance, savingsRate, month }
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