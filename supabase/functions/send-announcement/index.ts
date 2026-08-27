import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { cors, preflight, requireInternalOrCron } from "../_shared/auth.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')!

const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Novo endereço do PlanejApp</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0">
<tr><td align="center">
<table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
<tr><td style="background:linear-gradient(135deg,#6d28d9,#4f46e5);padding:32px;text-align:center">
  <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700">&#128156; PlanejApp</h1>
  <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px">Aviso importante sobre o endere&#231;o do app</p>
</td></tr>
<tr><td style="padding:32px">
  <h2 style="margin:0 0 16px;font-size:20px;color:#111827">Temos um novo endere&#231;o! &#127881;</h2>
  <p style="margin:0 0 16px;color:#6b7280;font-size:15px;line-height:1.6">Ol&#225;! Informamos que o PlanejApp agora tem um endere&#231;o oficial novo e exclusivo.</p>
  <div style="background:#f5f3ff;border:2px solid #7c3aed;border-radius:12px;padding:20px;text-align:center;margin:24px 0">
    <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#7c3aed;text-transform:uppercase;letter-spacing:1px">Novo endere&#231;o oficial</p>
    <a href="https://app.planejapp.com.br" style="font-size:22px;font-weight:700;color:#6d28d9;text-decoration:none">app.planejapp.com.br</a>
  </div>
  <div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:12px;padding:16px;margin:0 0 24px">
    <p style="margin:0 0 8px;font-weight:700;color:#92400e;font-size:14px">&#9888;&#65039; Aviso de seguran&#231;a</p>
    <p style="margin:0;color:#78350f;font-size:13px;line-height:1.6">Este &#233; o <strong>&#250;nico endere&#231;o oficial e confi&#225;vel</strong> do PlanejApp. Desconfie de qualquer outro link. N&#243;s nunca pedimos sua senha por e-mail.</p>
  </div>
  <p style="margin:0 0 8px;color:#374151;font-size:14px">O que mudou:</p>
  <ul style="margin:0 0 24px;padding-left:20px;color:#6b7280;font-size:14px;line-height:1.8">
    <li>Endere&#231;o antigo: <s>www.planejapp.com.br</s></li>
    <li>Endere&#231;o novo: <strong style="color:#6d28d9">app.planejapp.com.br</strong></li>
    <li>Todos os seus dados foram mantidos &#9989;</li>
    <li>Sua assinatura continua ativa &#9989;</li>
  </ul>
  <div style="text-align:center;margin:24px 0">
    <a href="https://app.planejapp.com.br" style="display:inline-block;background:linear-gradient(135deg,#6d28d9,#4f46e5);color:#fff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:16px;font-weight:700">Acessar o PlanejApp &#8594;</a>
  </div>
  <p style="margin:0;color:#9ca3af;font-size:13px;text-align:center">D&#250;vidas? Fale com o Finn dentro do app.</p>
</td></tr>
<tr><td style="background:#f9fafb;padding:16px 32px;text-align:center;border-top:1px solid #e5e7eb">
  <p style="margin:0;color:#9ca3af;font-size:11px">PlanejApp &middot; Seu assistente financeiro pessoal</p>
  <p style="margin:4px 0 0;color:#9ca3af;font-size:11px">Voc&#234; recebe este e-mail por ser assinante do PlanejApp.</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`

serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  const corsHeaders = cors(req)

  try {
    // ✅ Só chamadas internas (cron jobs / service_role).
    // Antes qualquer pessoa disparava esta rotina para toda a base.
    const negado = await requireInternalOrCron(req)
    if (negado) return negado

    const { emails } = await req.json()
    const targets = emails || ['revlino53@gmail.com']
    let sent = 0

    for (const email of targets) {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { name: 'PlanejApp', email: 'noreply@planejapp.com.br' },
          to: [{ email }],
          subject: '\uD83D\uDD10 Novo endere\u00E7o oficial do PlanejApp',
          htmlContent: html
        })
      })
      const data = await res.json()
      console.log(`Email para ${email}:`, res.status, JSON.stringify(data))
      if (res.ok) sent++
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