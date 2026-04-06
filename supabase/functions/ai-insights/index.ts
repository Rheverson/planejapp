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

    const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const balance = totalIncome - totalExpense
    const savingsRate = totalIncome > 0 ? ((balance / totalIncome) * 100).toFixed(1) : 0

    const byCategory: Record<string, number> = {}
    transactions.filter(t => t.type === 'expense').forEach(t => {
      const cat = t.category || 'outros'
      byCategory[cat] = (byCategory[cat] || 0) + t.amount
    })

    const topCategories = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat, val]) => `${cat}: R$${(val as number).toFixed(2)}`)

    const totalBalance = accounts.reduce((s, a) => s + (a.initial_balance || 0), 0)

    const prompt = `Você é um consultor financeiro pessoal especializado em finanças brasileiras. 
Analise os dados financeiros e forneça insights práticos em português brasileiro.

DADOS DO MÊS:
- Entradas: R$${totalIncome.toFixed(2)}
- Saídas: R$${totalExpense.toFixed(2)}
- Saldo: R$${balance.toFixed(2)}
- Taxa de poupança: ${savingsRate}%
- Saldo total contas: R$${totalBalance.toFixed(2)}
- Transações: ${transactions.length}

TOP GASTOS POR CATEGORIA:
${topCategories.join('\n')}

METAS ATIVAS: ${goals.length}

Responda APENAS com um JSON válido, sem texto antes ou depois:
{
  "score": (0-100 saúde financeira),
  "score_label": ("Crítico", "Atenção", "Regular", "Bom" ou "Excelente"),
  "score_color": ("red", "orange", "yellow", "blue" ou "green"),
  "resumo": "parágrafo resumindo a situação",
  "insights": [
    {
      "tipo": "positivo|negativo|neutro",
      "titulo": "título curto",
      "descricao": "descrição com números reais",
      "acao": "ação recomendada específica"
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
    "valor": 0.00,
    "percentual": "X%",
    "justificativa": "texto",
    "opcoes": ["opção 1", "opção 2", "opção 3"]
  },
  "regra_50_30_20": {
    "necessidades": {"ideal": ${(totalIncome * 0.5).toFixed(2)}, "atual": 0},
    "desejos": {"ideal": ${(totalIncome * 0.3).toFixed(2)}, "atual": 0},
    "investimentos": {"ideal": ${(totalIncome * 0.2).toFixed(2)}, "atual": 0}
  }
}`

    // ── Chama o Google Gemini ────────────────────────────
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${Deno.env.get("GEMINI_API_KEY")}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2000,
          }
        })
      }
    )

    const geminiData = await geminiRes.json()
    console.log('Gemini status:', geminiRes.status)

    if (!geminiRes.ok) {
      console.error('Gemini error:', JSON.stringify(geminiData))
      throw new Error("Erro ao chamar a IA: " + (geminiData.error?.message || "Erro desconhecido"))
    }

    const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text
    if (!content) throw new Error("Resposta vazia da IA")

    // Remove possíveis marcadores de código
    const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const insights = JSON.parse(cleanContent)

    // ── Registra uso ─────────────────────────────────────
    await supabase.from("ai_usage").insert({ user_id: userId })

    return new Response(JSON.stringify({
      insights,
      meta: { totalIncome, totalExpense, balance, savingsRate, month },
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