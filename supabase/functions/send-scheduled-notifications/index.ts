import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

async function sendPush(userId: string, title: string, body: string) {
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
      },
      body: JSON.stringify({ user_id: userId, title, body })
    })
  } catch (e) { console.error(`Erro push ${userId}:`, e) }
}

function fmt(v: number): string {
  return `R$ ${v.toFixed(2).replace('.', ',')}`
}

function getMonthName(month: number): string {
  return ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][month]
}

serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}))
    const period: string = body.period || 'morning'

    const now = new Date()
    const brasilia = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
    const dow   = brasilia.getDay()
    const day   = brasilia.getDate()
    const month = brasilia.getMonth()

    console.log(`Período: ${period} | dow=${dow} dia=${day}`)

    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('user_id, updated_at')
      .order('updated_at', { ascending: false })

    const userIds = [...new Set(tokens?.map((t: any) => t.user_id) || [])]
    console.log(`Enviando para ${userIds.length} usuários`)

    for (const userId of userIds) {
      try { await handleUser(userId, period, dow, day, month, brasilia) }
      catch (e) { console.error(`Erro usuário ${userId}:`, e) }
    }

    return new Response(JSON.stringify({ ok: true, period, users: userIds.length }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})

async function handleUser(userId: string, period: string, dow: number, day: number, month: number, now: Date) {
  const monthStr   = now.toISOString().slice(0, 7)
  const startMonth = `${monthStr}-01`
  const todayStr   = now.toISOString().split('T')[0]
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysLeft   = endOfMonth - day

  const { data: txs } = await supabase
    .from('transactions')
    .select('type, amount, is_realized, date, category')
    .eq('user_id', userId)
    .gte('date', startMonth)
    .lte('date', todayStr)
    .neq('type', 'transfer')

  const income   = txs?.filter((t: any) => t.type === 'income'  && t.is_realized).reduce((s: number, t: any) => s + Number(t.amount), 0) || 0
  const expense  = txs?.filter((t: any) => t.type === 'expense' && t.is_realized).reduce((s: number, t: any) => s + Number(t.amount), 0) || 0
  const planned  = txs?.filter((t: any) => t.type === 'expense' && !t.is_realized).reduce((s: number, t: any) => s + Number(t.amount), 0) || 0
  const usagePct = income > 0 ? Math.round((expense / income) * 100) : 0
  const todayExpense = txs?.filter((t: any) => t.type === 'expense' && t.is_realized && t.date === todayStr)
    .reduce((s: number, t: any) => s + Number(t.amount), 0) || 0

  // ── MANHÃ ─────────────────────────────────────────────────
  if (period === 'morning') {

    // Contas vencendo HOJE
    const { data: todayBills } = await supabase
      .from('transactions')
      .select('description, amount')
      .eq('user_id', userId)
      .eq('date', todayStr)
      .eq('is_realized', false)
      .eq('type', 'expense')
    if (todayBills && todayBills.length > 0) {
      const total = todayBills.reduce((s: number, t: any) => s + Number(t.amount), 0)
      if (todayBills.length === 1) {
        await sendPush(userId, '🔔 Conta vencendo hoje!', `"${todayBills[0].description}" vence hoje — ${fmt(total)}. Não esqueça! ⚠️`)
      } else {
        const names = todayBills.slice(0, 2).map((t: any) => t.description).join(', ')
        await sendPush(userId, `🔔 ${todayBills.length} contas vencem hoje!`, `${names}${todayBills.length > 2 ? ` e mais ${todayBills.length - 2}` : ''} — Total: ${fmt(total)} ⚠️`)
      }
    }

    // Contas vencendo AMANHÃ
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().split('T')[0]
    const { data: tomorrowBills } = await supabase
      .from('transactions')
      .select('description, amount')
      .eq('user_id', userId)
      .eq('date', tomorrowStr)
      .eq('is_realized', false)
      .eq('type', 'expense')
    if (tomorrowBills && tomorrowBills.length > 0) {
      const total = tomorrowBills.reduce((s: number, t: any) => s + Number(t.amount), 0)
      if (tomorrowBills.length === 1) {
        await sendPush(userId, '📅 Lembrete para amanhã', `"${tomorrowBills[0].description}" vence amanhã — ${fmt(total)}. Já separou? 💰`)
      } else {
        const names = tomorrowBills.slice(0, 2).map((t: any) => t.description).join(', ')
        await sendPush(userId, `📅 ${tomorrowBills.length} contas vencem amanhã`, `${names} — Total: ${fmt(total)} 💰`)
      }
    }

    // Dia de pagamento (dia 5 por padrão)
    const { data: profile } = await supabase.from('profiles').select('payday, registration_streak').eq('id', userId).single()
    const payday = profile?.payday || 5
    const streak = profile?.registration_streak || 0

    if (day === payday) {
      await sendPush(userId, '💰 Salário na conta?', 'Primeiro pague a você mesmo: reserve sua meta de economia antes de gastar!')
      return
    }
    if (day === 1) {
      await sendPush(userId, `🚀 ${getMonthName(month)} chegou!`, 'Mês novo, nova chance! Suas metas estão prontas. Vamos bater os recordes? 🎯')
      return
    }
    if (day >= 20) {
      await sendPush(userId, '🏁 Reta final do mês!', `Faltam ${daysLeft} dias. ${planned > 0 ? `Ainda tem ${fmt(planned)} previsto para sair.` : 'Continue assim! 💪'}`)
      return
    }
    if (streak >= 5 && streak % 5 === 0) {
      await sendPush(userId, '🔥 Sequência incrível!', `Você está há ${streak} dias seguidos registrando seus gastos. Continue assim!`)
      return
    }

    const greetings = [
      { title: '☕ Bom dia!', body: 'Que tal definir sua meta de gastos para hoje?' },
      { title: '🛒 Bom dia!', body: 'Dia de mercado? Não esqueça de anotar as comprinhas no app!' },
      { title: '☀️ Bom dia!', body: 'Um novo dia para manter o controle financeiro. Você consegue! 💪' },
      { title: '📊 Bom dia!', body: 'Registrar seus gastos hoje leva menos de 1 minuto. Vale a pena!' },
    ]
    const opt = greetings[day % greetings.length]
    await sendPush(userId, opt.title, opt.body)
  }

  // ── SEGUNDA ───────────────────────────────────────────────
  if (period === 'monday') {
    await sendPush(userId, '🗓️ Nova semana!', 'Você já planejou seus gastos fixos desta semana? Um bom planejamento faz toda a diferença!')
  }

  // ── QUARTA ────────────────────────────────────────────────
  if (period === 'wednesday') {
    if (usagePct > 0) {
      await sendPush(userId, '📊 Metade da semana!', `Você consumiu ${usagePct}% do seu limite este mês. ${usagePct < 60 ? 'Está no caminho certo! ✅' : 'Atenção aos próximos gastos! ⚠️'}`)
    } else {
      await sendPush(userId, '📝 Quarta-feira!', 'Não esquece de registrar seus gastos desta semana!')
    }
  }

  // ── SEXTA ─────────────────────────────────────────────────
  if (period === 'friday') {
    await sendPush(userId, '🍻 Fim de semana chegou!', 'Lembre-se do seu objetivo de economia para este mês. Curta com consciência!')
  }

  // ── NOITE ─────────────────────────────────────────────────
  if (period === 'evening') {
    if (dow === 5) {
      await sendPush(userId, '🗓️ Balanço semanal', `Este mês: ${fmt(income)} entrou, ${fmt(expense)} saiu. ${income - expense >= 0 ? '✅' : '⚠️'}`)
      return  // ← para aqui
    }
    if (todayExpense > 0) {
      const usagePct2 = income > 0 ? Math.round((expense / income) * 100) : 0
      if (usagePct2 > 90) {
        await sendPush(userId, '⚠️ Atenção!', `Você já usou ${usagePct2}% da sua renda este mês. Cuidado! 🚨`)
        return  // ← para aqui
      }
      const opts = [
        { title: '📝 Resumo do dia', body: `Hoje você gastou ${fmt(todayExpense)}. Total do mês: ${fmt(expense)} (${usagePct2}% da renda)` },
        { title: '🔥 Sequência ativa!', body: 'Tudo anotado? Mantenha sua sequência de registros!' },
      ]
      await sendPush(userId, opts[day % 2].title, opts[day % 2].body)
      return  // ← para aqui
    } else {
      const opts = [
        { title: '📝 Não esquece!', body: '1 minuto para registrar o que saiu hoje. Manter o controle faz diferença!' },
        { title: '🌙 Boa noite!', body: 'Registrar pequenos gastos ajuda a entender para onde vai seu dinheiro 💡' },
      ]
      await sendPush(userId, opts[day % 2].title, opts[day % 2].body)
      return  // ← para aqui
    }
  }