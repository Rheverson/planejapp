import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

async function sendPush(userId: string, title: string, body: string) {
  try {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
      },
      body: JSON.stringify({ user_id: userId, title, body })
    })
    const data = await res.json()
    console.log(`Push ${userId}: ${title} →`, JSON.stringify(data))
  } catch (e) {
    console.error(`Erro push ${userId}:`, e)
  }
}

function fmt(v: number): string {
  return `R$ ${v.toFixed(2).replace('.', ',')}`
}

function getMonthName(month: number): string {
  return ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][month]
}

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length]
}

serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}))
    const period: string = body.period || 'morning'

    const now = new Date()
    const brasilia = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
    const day   = brasilia.getDate()
    const month = brasilia.getMonth()

    console.log(`Notificações: period=${period} dia=${day}`)

    // Buscar apenas o token mais recente do usuário
    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token, platform')
      .eq('user_id', user_id)
      .order('updated_at', { ascending: false })
      .limit(1)  // ← só 1 token!

    const userIds = [...new Set(tokens?.map((t: any) => t.user_id) || [])]
    console.log(`${userIds.length} usuários`)

    for (const userId of userIds) {
      try {
        await handleUser(userId, period, day, month, brasilia)
      } catch (e) {
        console.error(`Erro usuário ${userId}:`, e)
      }
    }

    return new Response(JSON.stringify({ ok: true, period, users: userIds.length }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})

async function handleUser(userId: string, period: string, day: number, month: number, now: Date) {
  // Perfil do usuário (payday + streak)
  const { data: profile } = await supabase
    .from('profiles')
    .select('payday, registration_streak, last_registration_date')
    .eq('id', userId)
    .single()

  const payday = profile?.payday || 5
  const streak = profile?.registration_streak || 0

  // Dados do mês
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

  const income   = txs?.filter(t => t.type === 'income'  && t.is_realized).reduce((s, t) => s + Number(t.amount), 0) || 0
  const expense  = txs?.filter(t => t.type === 'expense' && t.is_realized).reduce((s, t) => s + Number(t.amount), 0) || 0
  const planned  = txs?.filter(t => t.type === 'expense' && !t.is_realized).reduce((s, t) => s + Number(t.amount), 0) || 0
  const usagePct = income > 0 ? Math.round((expense / income) * 100) : 0

  // Gastos de hoje
  const todayExpense = txs?.filter(t => t.type === 'expense' && t.is_realized && t.date === todayStr)
    .reduce((s, t) => s + Number(t.amount), 0) || 0

  // Atualizar streak
  await updateStreak(userId, todayStr, profile)

  // ── MANHÃ 08:30 ───────────────────────────────────────────
  if (period === 'morning') {

    // ── CONTAS VENCENDO HOJE ───────────────────────────────────
    const { data: todayBills } = await supabase
      .from('transactions')
      .select('description, amount')
      .eq('user_id', userId)
      .eq('date', todayStr)
      .eq('is_realized', false)
      .eq('type', 'expense')
      .order('amount', { ascending: false })

    if (todayBills && todayBills.length > 0) {
      const total = todayBills.reduce((s, t) => s + Number(t.amount), 0)

      if (todayBills.length === 1) {
        await sendPush(userId,
          '🔔 Conta vencendo hoje!',
          `"${todayBills[0].description}" vence hoje — ${fmt(Number(todayBills[0].amount))}. Não esqueça de pagar! ⚠️`
        )
      } else {
        const names = todayBills.slice(0, 2).map(t => t.description).join(', ')
        const extra = todayBills.length > 2 ? ` e mais ${todayBills.length - 2}` : ''
        await sendPush(userId,
          `🔔 ${todayBills.length} contas vencem hoje!`,
          `${names}${extra} — Total: ${fmt(total)}. Organize os pagamentos! ⚠️`
        )
      }
    }

    // ── CONTAS VENCENDO AMANHÃ ────────────────────────────────
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
      .order('amount', { ascending: false })

    if (tomorrowBills && tomorrowBills.length > 0) {
      const total = tomorrowBills.reduce((s, t) => s + Number(t.amount), 0)

      if (tomorrowBills.length === 1) {
        await sendPush(userId,
          '📅 Lembrete para amanhã',
          `"${tomorrowBills[0].description}" vence amanhã — ${fmt(Number(tomorrowBills[0].amount))}. Já separou o valor? 💰`
        )
      } else {
        const names = tomorrowBills.slice(0, 2).map(t => t.description).join(', ')
        const extra = tomorrowBills.length > 2 ? ` e mais ${tomorrowBills.length - 2}` : ''
        await sendPush(userId,
          `📅 ${tomorrowBills.length} contas vencem amanhã`,
          `${names}${extra} — Total: ${fmt(total)}. Prepare-se! 💰`
        )
      }
    }

    // Dia de pagamento
    if (day === payday) {
      await sendPush(userId,
        '💰 Salário na conta?',
        'Primeiro pague a você mesmo: reserve sua meta de economia antes de gastar!'
      )
      return
    }

    // Dia 1 — reset do mês
    if (day === 1) {
      await sendPush(userId,
        `🚀 ${getMonthName(month)} chegou!`,
        'Mês novo, vida nova! Suas metas estão prontas. Vamos bater os recordes? 🎯'
      )
      return
    }

    // Reta final (dia 20-31)
    if (day >= 20) {
      await sendPush(userId,
        '🏁 Reta final do mês!',
        `Faltam ${daysLeft} dias. ${planned > 0 ? `Ainda tem ${fmt(planned)} previsto para sair.` : 'Sua saúde financeira agradece o esforço de hoje!'}`
      )
      return
    }

    // Streak notável
    if (streak >= 5 && streak % 5 === 0) {
      await sendPush(userId,
        '🔥 Sequência incrível!',
        `Você está há ${streak} dias seguidos registrando seus gastos. Continue assim!`
      )
      return
    }

    // Manhã padrão — alterna entre opções
    const options = [
      { title: '☕ Bom dia!', body: 'Que tal definir sua meta de gastos para hoje?' },
      { title: '🛒 Bom dia!', body: 'Dia de mercado? Não esqueça de anotar as comprinhas no app!' },
      { title: '☀️ Bom dia!', body: 'Um novo dia para manter o controle financeiro. Você consegue! 💪' },
      { title: '📊 Bom dia!', body: 'Registrar seus gastos hoje leva menos de 1 minuto. Vale a pena!' },
    ]
    const opt = pick(options, day)
    await sendPush(userId, opt.title, opt.body)
  }

  // ── SEGUNDA 09:00 ─────────────────────────────────────────
  if (period === 'monday') {
    await sendPush(userId,
      '🗓️ Nova semana!',
      'Você já planejou seus gastos fixos desta semana? Um bom planejamento faz toda a diferença!'
    )
  }

  // ── QUARTA 12:00 ──────────────────────────────────────────
  if (period === 'wednesday') {
    const options = usagePct > 0
      ? [
          { title: '📊 Metade da semana!', body: `Você consumiu ${usagePct}% do seu limite este mês. ${usagePct < 60 ? 'Está no caminho certo! ✅' : 'Atenção aos próximos gastos! ⚠️'}` },
          { title: '🎯 Como estão as metas?', body: 'Metade da semana! Hora de checar se está no ritmo certo 🏃' },
        ]
      : [
          { title: '📝 Quarta-feira!', body: 'Não esquece de registrar seus gastos desta semana! Pequenas anotações fazem grande diferença.' },
          { title: '💡 Dica do dia', body: 'Separar uma % fixa do salário para investimentos é o hábito dos que ficam ricos. Você faz isso? 🎯' },
        ]
    const opt = pick(options, day)
    await sendPush(userId, opt.title, opt.body)
  }

  // ── SEXTA 18:00 ───────────────────────────────────────────
  if (period === 'friday') {
    await sendPush(userId,
      '🍻 Fim de semana chegou!',
      'Lembre-se do seu objetivo de economia para este mês. Curta com consciência!'
    )
  }

  // ── NOITE 20:30 ───────────────────────────────────────────
  if (period === 'evening') {

    // Checagem de metas atingidas
    const { data: goals } = await supabase
      .from('goals')
      .select('id, name, target_amount, type')
      .eq('user_id', userId)
      .eq('type', 'expense')
      .gte('end_date', todayStr)

    for (const goal of goals || []) {
      const goalExpense = txs?.filter(t => t.category === goal.name?.toLowerCase() && t.type === 'expense' && t.is_realized)
        .reduce((s, t) => s + Number(t.amount), 0) || 0
      const pct = goal.target_amount > 0 ? Math.round((goalExpense / Number(goal.target_amount)) * 100) : 0
      if (pct >= 50 && pct < 55) {
        await sendPush(userId,
          '🎯 Meta pela metade!',
          `Você completou 50% da meta "${goal.name}". Continue assim! 💪`
        )
        break
      }
    }

    // Verificar assinatura vencendo amanhã (categoria 'assinaturas' prevista)
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().split('T')[0]
    const { data: subscriptions } = await supabase
      .from('transactions')
      .select('description, amount')
      .eq('user_id', userId)
      .eq('date', tomorrowStr)
      .eq('is_realized', false)
      .eq('category', 'assinaturas')
      .limit(1)

    if (subscriptions?.length) {
      const sub = subscriptions[0]
      await sendPush(userId,
        '📺 Assinatura vencendo amanhã',
        `"${sub.description}" vence amanhã (${fmt(Number(sub.amount))}). Já separou o valor?`
      )
      return
    }

    // Comparativo de delivery da semana
    const lastWeekStart = new Date(now)
    lastWeekStart.setDate(lastWeekStart.getDate() - 7)
    const { data: lastWeekTxs } = await supabase
      .from('transactions')
      .select('type, amount, category, is_realized, date')
      .eq('user_id', userId)
      .gte('date', lastWeekStart.toISOString().split('T')[0])
      .lte('date', todayStr)
      .neq('type', 'transfer')

    const thisWeekDelivery = lastWeekTxs?.filter(t =>
      t.category === 'alimentação' && t.is_realized &&
      t.date >= new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
    ).reduce((s, t) => s + Number(t.amount), 0) || 0

    const prevWeekDelivery = lastWeekTxs?.filter(t =>
      t.category === 'alimentação' && t.is_realized &&
      t.date < new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
    ).reduce((s, t) => s + Number(t.amount), 0) || 0

    if (thisWeekDelivery > 0 && prevWeekDelivery > 0 && thisWeekDelivery < prevWeekDelivery) {
      await sendPush(userId,
        '🍔 Economia na alimentação!',
        `Esta semana você gastou menos com alimentação do que na semana passada. Continue assim!`
      )
      return
    }

    // Noite padrão com gastos do dia
    if (todayExpense > 0) {
      const options = [
        { title: '📝 Resumo do dia', body: `Como foi seu dia financeiro? Você registrou ${fmt(todayExpense)} hoje.` },
        { title: '🔥 Sequência ativa!', body: `Tudo anotado? Mantenha sua sequência de registros! ${streak > 1 ? `${streak} dias seguidos 🎉` : 'Registre hoje também!'}` },
      ]
      const opt = pick(options, day)
      await sendPush(userId, opt.title, opt.body)
    } else {
      const options = [
        { title: '📝 Não esquece!', body: '1 minuto para registrar o que saiu hoje. Manter o controle faz diferença!' },
        { title: '🔥 Sua sequência!', body: `Mantenha sua sequência de registros ativa! ${streak > 0 ? `Você está há ${streak} dias 💪` : 'Comece hoje!'}` },
      ]
      const opt = pick(options, day)
      await sendPush(userId, opt.title, opt.body)
    }
  }
}

async function updateStreak(userId: string, todayStr: string, profile: any) {
  const lastDate = profile?.last_registration_date
  const streak   = profile?.registration_streak || 0

  // Verifica se usuário registrou algo hoje
  const { data: todayTxs } = await supabase
    .from('transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('date', todayStr)
    .eq('is_realized', true)
    .limit(1)

  if (!todayTxs?.length) return // Não registrou hoje ainda

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  let newStreak = 1
  if (lastDate === yesterdayStr) newStreak = streak + 1
  else if (lastDate === todayStr) return // Já atualizou hoje

  await supabase.from('profiles').update({
    registration_streak: newStreak,
    last_registration_date: todayStr
  }).eq('id', userId)
}