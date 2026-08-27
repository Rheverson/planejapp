import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { cors, preflight, requireInternalOrCron } from "../_shared/auth.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')!

function fmt(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

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

function buildHtml(title: string, preheader: string, body: string): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${preheader}</span>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0">
<tr><td align="center">
<table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
<tr><td style="background:linear-gradient(135deg,#0d1829 0%,#1d4ed8 50%,#312e81 100%);padding:24px 32px;text-align:center">
  <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700">&#128156; PlanejApp</h1>
  <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:13px">${title}</p>
</td></tr>
<tr><td style="padding:28px 32px">${body}</td></tr>
<tr><td style="background:#f9fafb;padding:14px 32px;text-align:center;border-top:1px solid #e5e7eb">
  <p style="margin:0;color:#9ca3af;font-size:11px">PlanejApp &middot; Seu assistente financeiro pessoal</p>
  <p style="margin:4px 0 0;color:#9ca3af;font-size:11px">Abra o app para realizar o pagamento.</p>
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

    const { mode } = await req.json() // mode: 'tomorrow' | 'today'
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Data alvo em Brasília
    const now = new Date()
    const brasilia = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
    const today = new Date(brasilia)
    today.setHours(0, 0, 0, 0)

    const targetDate = new Date(today)
    if (mode === 'tomorrow') targetDate.setDate(targetDate.getDate() + 1)

    const targetStr = targetDate.toISOString().slice(0, 10)

    console.log(`Buscando contas para ${mode} = ${targetStr}`)

    // Busca todas as transações não realizadas da data alvo
    const { data: bills } = await supabase
      .from('transactions')
      .select('user_id, description, amount, category, date')
      .eq('date', targetStr)
      .eq('is_realized', false)
      .eq('type', 'expense')

    if (!bills || bills.length === 0) {
      console.log('Nenhuma conta encontrada para', targetStr)
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Agrupa por usuário
    const byUser: Record<string, typeof bills> = {}
    bills.forEach(b => {
      if (!byUser[b.user_id]) byUser[b.user_id] = []
      byUser[b.user_id].push(b)
    })

    // Busca emails dos usuários
    const { data: usersData } = await supabase.auth.admin.listUsers()
    const userMap: Record<string, string> = {}
    usersData?.users?.forEach(u => { if (u.email) userMap[u.id] = u.email })

    let sent = 0

    for (const [userId, userBills] of Object.entries(byUser)) {
      const email = userMap[userId]
      if (!email) continue

      const total = userBills.reduce((s, b) => s + Number(b.amount), 0)
      const dateLabel = mode === 'tomorrow' ? 'amanhã' : 'hoje'
      const dateFormatted = targetDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

      const billsRows = userBills.map(b => `
        <tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:10px 0">
            <p style="margin:0;font-size:14px;font-weight:600;color:#111827">${b.description}</p>
            <p style="margin:2px 0 0;font-size:12px;color:#9ca3af">${b.category || 'Sem categoria'}</p>
          </td>
          <td style="padding:10px 0;text-align:right">
            <p style="margin:0;font-size:14px;font-weight:700;color:#dc2626">${fmt(Number(b.amount))}</p>
          </td>
        </tr>`).join('')

      const isToday = mode === 'today'
      const alertColor = isToday ? '#dc2626' : '#d97706'
      const alertBg    = isToday ? '#fef2f2'  : '#fffbeb'
      const alertBorder= isToday ? '#fca5a5'  : '#fcd34d'
      const alertIcon  = isToday ? '🔴' : '⚠️'
      const alertMsg   = isToday
        ? `Você tem <strong>${userBills.length} conta(s)</strong> vencendo <strong>hoje</strong>!`
        : `Você tem <strong>${userBills.length} conta(s)</strong> vencendo <strong>amanhã</strong>. Prepare-se!`

      const body = `
        <div style="background:${alertBg};border:1px solid ${alertBorder};border-radius:12px;padding:14px 16px;margin:0 0 20px">
          <p style="margin:0;color:${alertColor};font-size:14px;font-weight:600">${alertIcon} ${alertMsg}</p>
          <p style="margin:4px 0 0;color:${alertColor};font-size:12px;opacity:0.8">${dateFormatted}</p>
        </div>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px">
          ${billsRows}
        </table>

        <div style="background:#f9fafb;border-radius:12px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;margin:0 0 24px">
          <span style="font-size:14px;font-weight:600;color:#374151">Total a pagar</span>
          <span style="font-size:18px;font-weight:800;color:#dc2626">${fmt(total)}</span>
        </div>

        <div style="text-align:center">
          <a href="https://app.planejapp.com.br" style="display:inline-block;background:linear-gradient(135deg,#1d4ed8,#3730a3);color:#fff;text-decoration:none;padding:13px 32px;border-radius:12px;font-size:15px;font-weight:700">
            Ver contas no app &#8594;
          </a>
        </div>`

      const subject = isToday
        ? `🔴 ${userBills.length} conta(s) vencem HOJE — ${fmt(total)}`
        : `⚠️ ${userBills.length} conta(s) vencem AMANHÃ — ${fmt(total)}`

      const preheader = isToday
        ? `Não esqueça: ${userBills.map(b => b.description).join(', ')} vencem hoje!`
        : `Lembrete: ${userBills.map(b => b.description).join(', ')} vencem amanhã.`

      const html = buildHtml(
        isToday ? 'Contas vencendo hoje' : 'Lembrete de contas',
        preheader,
        body
      )

      const ok = await sendEmail(email, subject, html)
      if (ok) {
        sent++
        console.log(`Email enviado para ${email} — ${userBills.length} conta(s)`)
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, date: targetStr }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    console.error('Erro:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})