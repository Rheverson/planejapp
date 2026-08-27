import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { cors, preflight, requireInternalOrCron } from "../_shared/auth.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')!

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'PlanejApp', email: 'noreply@planejapp.com.br' },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  })
  if (!res.ok) console.error('Brevo error:', await res.text())
  return res.ok
}

function fmt(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

const CATEGORY_EMOJI: Record<string, string> = {
  alimentacao: '🍔', alimentação: '🍔', transporte: '🚗', moradia: '🏠',
  saude: '❤️', saúde: '❤️', educacao: '📚', educação: '📚',
  lazer: '🎉', compras: '🛍️', doacao: '🙏', doação: '🙏',
  beleza: '💅', outros: '📦', internet: '🌐', assinaturas: '📱',
  pet: '🐾', imprevistos: '⚡'
}

function getLastDayOfMonth(year: number, month: number): string {
  const last = new Date(year, month, 0).getDate()
  return `${year}-${String(month).padStart(2,'0')}-${String(last).padStart(2,'0')}`
}

function buildHtml(title: string, preheader: string, body: string): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${preheader}</span>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0">
<tr><td align="center">
<table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
<tr><td style="background:linear-gradient(135deg,#0d1829 0%,#1d4ed8 50%,#312e81 100%);padding:24px 32px;text-align:center">
  <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700">💜 PlanejApp</h1>
  <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:13px">${title}</p>
</td></tr>
<tr><td style="padding:28px 32px">${body}</td></tr>
<tr><td style="background:#f9fafb;padding:14px 32px;text-align:center;border-top:1px solid #e5e7eb">
  <p style="margin:0;color:#9ca3af;font-size:11px">PlanejApp · Seu assistente financeiro pessoal</p>
</td></tr>
</table></td></tr></table></body></html>`
}

serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  const corsHeaders = cors(req)

  try {
    // ✅ Só chamadas internas (cron jobs / service_role).
    // Antes qualquer pessoa disparava esta rotina para toda a base.
    const negado = await requireInternalOrCron(req)
    if (negado) return negado

    const body = await req.json()
    const period: string = body.period
    const testEmail: string | null = body.test_email || null

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const now = new Date()
    const brasilia = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
    const year  = brasilia.getFullYear()
    const month = brasilia.getMonth() + 1
    const day   = brasilia.getDate()
    const todayStr   = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    const startMonth = `${year}-${String(month).padStart(2,'0')}-01`
    const endMonth   = getLastDayOfMonth(year, month)
    const monthLabel = brasilia.toLocaleString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' })

    const { data: usersData } = await supabase.auth.admin.listUsers()
    const allUsers = (usersData?.users || []).filter(u =>
      u.email && (testEmail ? u.email === testEmail : true)
    )

    let sent = 0

    for (const user of allUsers) {
      if (!user.email) continue
      try {
        // Busca contas de investimento para excluir
        const { data: accounts } = await supabase
          .from('accounts')
          .select('id, type')
          .eq('user_id', user.id)

        const investmentIds = new Set(
          (accounts || []).filter(a => a.type === 'investment').map(a => a.id)
        )

        // ✅ Todas realizadas do mês (sem filtro de data <= hoje)
        // igual ao app na aba Realizados
        const { data: txs, error: txErr } = await supabase
          .from('transactions')
          .select('type, amount, is_realized, date, description, category, account_id')
          .eq('user_id', user.id)
          .gte('date', startMonth)
          .lte('date', endMonth)
          .neq('type', 'transfer')
          .neq('is_realized', false)

        if (txErr) { console.error('txErr:', txErr.message); continue }

        // Exclui investimentos — igual ao app
        const filteredTxs = (txs || []).filter(t => !investmentIds.has(t.account_id))

        console.log(`${user.email}: ${filteredTxs.length} txs realizadas no mês`)

        const monthIncome  = filteredTxs.filter(t => t.type === 'income' ).reduce((s,t) => s + Number(t.amount), 0)
        const monthExpense = filteredTxs.filter(t => t.type === 'expense').reduce((s,t) => s + Number(t.amount), 0)
        const monthBalance = monthIncome - monthExpense
        const usagePct = monthIncome > 0 ? Math.round((monthExpense / monthIncome) * 100) : 0

        // Movimentação de hoje
        const todayTxs    = filteredTxs.filter(t => t.date === todayStr)
        const todayIncome  = todayTxs.filter(t => t.type === 'income' ).reduce((s,t) => s + Number(t.amount), 0)
        const todayExpense = todayTxs.filter(t => t.type === 'expense').reduce((s,t) => s + Number(t.amount), 0)

        const catMap: Record<string,number> = {}
        todayTxs.filter(t => t.type === 'expense').forEach(t => {
          const cat = t.category || 'outros'
          catMap[cat] = (catMap[cat] || 0) + Number(t.amount)
        })
        const catEntries = Object.entries(catMap).sort((a,b) => b[1]-a[1])

        // Contas vencendo hoje não realizadas
        const { data: todayBills } = await supabase
          .from('transactions')
          .select('description, amount')
          .eq('user_id', user.id)
          .eq('date', todayStr)
          .eq('is_realized', false)
          .eq('type', 'expense')

        // ── BOM DIA ──────────────────────────────────────────
        if (period === 'morning') {
          let billsHtml = ''
          if (todayBills && todayBills.length > 0) {
            const total = todayBills.reduce((s,t) => s + Number(t.amount), 0)
            billsHtml = `
            <div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:12px;padding:16px;margin:0 0 20px">
              <p style="margin:0 0 8px;font-weight:700;color:#92400e;font-size:14px">⚠️ ${todayBills.length} conta(s) vencem hoje</p>
              ${todayBills.map(b=>`<p style="margin:3px 0;color:#78350f;font-size:13px">• ${b.description} — <strong>${fmt(Number(b.amount))}</strong></p>`).join('')}
              <p style="margin:10px 0 0;color:#92400e;font-size:13px;font-weight:700">Total: ${fmt(total)}</p>
            </div>`
          }

          const emailBody = `
          <h2 style="margin:0 0 4px;font-size:18px;color:#111827">Bom dia! ☀️</h2>
          <p style="margin:0 0 20px;color:#6b7280;font-size:14px">${new Date(todayStr+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})}</p>
          ${billsHtml}
          <div style="background:#f9fafb;border-radius:12px;padding:16px">
            <p style="margin:0 0 12px;font-weight:700;color:#374151;font-size:14px">📊 Resumo de ${monthLabel}</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:5px 0"><span style="color:#6b7280;font-size:13px">Entradas</span></td><td align="right"><span style="color:#059669;font-weight:700;font-size:13px">${fmt(monthIncome)}</span></td></tr>
              <tr><td style="padding:5px 0"><span style="color:#6b7280;font-size:13px">Saídas</span></td><td align="right"><span style="color:#dc2626;font-weight:700;font-size:13px">${fmt(monthExpense)}</span></td></tr>
              <tr style="border-top:1px solid #e5e7eb">
                <td style="padding:8px 0 0"><span style="color:#111827;font-weight:700;font-size:14px">Saldo</span></td>
                <td align="right" style="padding:8px 0 0"><span style="color:${monthBalance>=0?'#059669':'#dc2626'};font-weight:700;font-size:15px">${fmt(monthBalance)}</span></td>
              </tr>
            </table>
          </div>
          <div style="text-align:center;margin-top:24px">
            <a href="https://app.planejapp.com.br" style="display:inline-block;background:linear-gradient(135deg,#1d4ed8,#3730a3);color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:600">Abrir PlanejApp</a>
          </div>`

          const ok = await sendEmail(
            user.email,
            `☀️ Bom dia! ${todayBills?.length ? `${todayBills.length} conta(s) vencem hoje` : 'Seu resumo financeiro'}`,
            buildHtml('Bom dia!', `Saldo do mês: ${fmt(monthBalance)}`, emailBody)
          )
          if (ok) sent++
        }

        // ── RESUMO NOTURNO ───────────────────────────────────
        if (period === 'evening') {
          if (todayIncome === 0 && todayExpense === 0) {
            console.log(`${user.email}: sem movimentacao hoje`)
            continue
          }

          const catHtml = catEntries.length > 0 ? `
          <div style="background:#f9fafb;border-radius:12px;padding:16px;margin:16px 0">
            <p style="margin:0 0 12px;font-weight:700;color:#374151;font-size:14px">📂 Saídas por categoria hoje</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              ${catEntries.map(([cat,val])=>`
              <tr>
                <td style="padding:4px 0"><span style="color:#6b7280;font-size:13px">${CATEGORY_EMOJI[cat]||'📦'} ${cat}</span></td>
                <td align="right"><span style="color:#dc2626;font-weight:600;font-size:13px">${fmt(val)}</span></td>
              </tr>`).join('')}
            </table>
          </div>` : ''

          const emailBody = `
          <h2 style="margin:0 0 4px;font-size:18px;color:#111827">Resumo do dia 🌙</h2>
          <p style="margin:0 0 20px;color:#6b7280;font-size:14px">${new Date(todayStr+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})}</p>
          <div style="background:#f9fafb;border-radius:12px;padding:16px;margin:0">
            <p style="margin:0 0 12px;font-weight:700;color:#374151;font-size:14px">💰 Movimentação de hoje</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              ${todayIncome>0?`<tr><td style="padding:5px 0"><span style="color:#6b7280;font-size:13px">Entradas</span></td><td align="right"><span style="color:#059669;font-weight:700;font-size:13px">+${fmt(todayIncome)}</span></td></tr>`:''}
              ${todayExpense>0?`<tr><td style="padding:5px 0"><span style="color:#6b7280;font-size:13px">Saídas</span></td><td align="right"><span style="color:#dc2626;font-weight:700;font-size:13px">-${fmt(todayExpense)}</span></td></tr>`:''}
            </table>
          </div>
          ${catHtml}
          <div style="background:#f9fafb;border-radius:12px;padding:16px;margin:16px 0">
            <p style="margin:0 0 12px;font-weight:700;color:#374151;font-size:14px">📊 Resumo de ${monthLabel}</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:5px 0"><span style="color:#6b7280;font-size:13px">Entradas</span></td><td align="right"><span style="color:#059669;font-weight:700;font-size:13px">${fmt(monthIncome)}</span></td></tr>
              <tr><td style="padding:5px 0"><span style="color:#6b7280;font-size:13px">Saídas</span></td><td align="right"><span style="color:#dc2626;font-weight:700;font-size:13px">${fmt(monthExpense)}</span></td></tr>
              <tr><td style="padding:5px 0"><span style="color:#6b7280;font-size:13px">Uso da renda</span></td><td align="right"><span style="color:${usagePct>80?'#dc2626':'#059669'};font-weight:700;font-size:13px">${usagePct}%</span></td></tr>
              <tr style="border-top:1px solid #e5e7eb">
                <td style="padding:8px 0 0"><span style="color:#111827;font-weight:700;font-size:14px">Saldo</span></td>
                <td align="right" style="padding:8px 0 0"><span style="color:${monthBalance>=0?'#059669':'#dc2626'};font-weight:700;font-size:15px">${fmt(monthBalance)}</span></td>
              </tr>
            </table>
          </div>
          ${usagePct>80?`<div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:12px;padding:12px 16px;margin:0 0 16px"><p style="margin:0;color:#991b1b;font-size:13px">⚠️ Você já usou <strong>${usagePct}%</strong> da sua renda!</p></div>`:''}
          <div style="text-align:center;margin-top:20px">
            <a href="https://app.planejapp.com.br" style="display:inline-block;background:linear-gradient(135deg,#1d4ed8,#3730a3);color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:600">Ver detalhes</a>
          </div>`

          const ok = await sendEmail(
            user.email,
            `🌙 Resumo do dia — ${todayExpense>0?`${fmt(todayExpense)} em saídas`:`${fmt(todayIncome)} em entradas`}`,
            buildHtml('Resumo do dia', `Saldo do mês: ${fmt(monthBalance)}`, emailBody)
          )
          if (ok) sent++
        }

      } catch (e: any) {
        console.error(`Erro ${user.email}:`, e.message)
      }
    }

    return new Response(JSON.stringify({ ok: true, sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    console.error('Erro:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})