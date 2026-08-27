import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { cors, preflight, requireUser } from "../_shared/auth.ts"

serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  const corsHeaders = cors(req)

  try {
    // ✅ A identidade vem do JWT: antes qualquer um criava lançamentos
    // recorrentes na conta de qualquer outro usuário.
    const auth = await requireUser(req)
    if (auth.response) return auth.response
    const userId = auth.user.id

    const body = await req.json()
    const { type, amount, description, category, accountName, day, months, frequency, startDate, autoRealize } = body

    console.log("RECEBIDO:", JSON.stringify({ userId: userId?.slice(0,8), description, amount, day, months, startDate }))

    if (!userId || !description || !amount || !day || !months) {
      return new Response(JSON.stringify({ error: "Parametros obrigatorios ausentes" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    const monthsInt = Math.min(Math.abs(parseInt(String(months))), 24)
    const dayInt = Math.min(Math.max(parseInt(String(day)), 1), 28)

    console.log(`monthsInt=${monthsInt} dayInt=${dayInt}`)

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)

    let accountId = null
    if (accountName) {
      const { data: accs } = await supabase.from("accounts").select("id").eq("user_id", userId).ilike("name", `%${accountName}%`).limit(1)
      accountId = accs?.[0]?.id || null
    }

    const start = new Date(startDate + "T12:00:00")
    
    // Monta array com datas unicas usando Map para garantir 1 por data
    const dateMap = new Map<string, object>()
    for (let i = 0; i < monthsInt; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, dayInt)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      if (!dateMap.has(dateStr)) {
        dateMap.set(dateStr, {
          user_id: userId,
          type: type || "expense",
          amount: parseFloat(String(amount)),
          description,
          category: category || "outros",
          account_id: accountId,
          date: dateStr,
          is_realized: false,
          is_recurring: true,
          recurring_frequency: frequency || "monthly",
          recurring_day: dayInt,
          auto_realize: autoRealize ?? false,
        })
      }
    }

    const inserts = Array.from(dateMap.values())
    console.log(`Array montado: ${inserts.length} datas unicas`)

    // Verifica quais ja existem no banco
    const dates = inserts.map((r: any) => r.date)
    const { data: existing } = await supabase
      .from("transactions")
      .select("date")
      .eq("user_id", userId)
      .eq("description", description)
      .eq("is_recurring", true)
      .in("date", dates)

    const existingDates = new Set((existing || []).map((r: any) => r.date))
    const newInserts = inserts.filter((r: any) => !existingDates.has(r.date))

    console.log(`Existentes no banco: ${existingDates.size} | Novos: ${newInserts.length}`)

    if (newInserts.length === 0) {
      return new Response(JSON.stringify({ ok: true, inserted: 0, message: "Todas as datas ja existem" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // Insere UM POR UM para garantir que nao duplica
    let insertedCount = 0
    for (const row of newInserts) {
      const { error } = await supabase.from("transactions").insert(row)
      if (!error) insertedCount++
      else console.error(`Erro ao inserir ${(row as any).date}:`, error.message)
    }

    console.log(`Inseridos: ${insertedCount}`)

    return new Response(JSON.stringify({ ok: true, inserted: insertedCount }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })

  } catch (err: any) {
    console.error("Erro:", err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }
})