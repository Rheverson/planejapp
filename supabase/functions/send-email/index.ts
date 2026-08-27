// ============================================================
// send-email
//
// ANTES (auditoria 26/08/2026): sem autenticação e com `to`,
// `subject`, `html` e `senderEmail` livres — um relay aberto que
// permitia enviar phishing assinado pelo domínio do produto.
//
// AGORA: dois modos, ambos autenticados.
//   • Interno (service_role): liberdade total, para cron e webhooks.
//   • Usuário autenticado: apenas templates conhecidos, montados
//     aqui no servidor. O usuário nunca escolhe o HTML nem o remetente.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { adminClient, cors, isInternalCall, getAuthenticatedUser, preflight } from "../_shared/auth.ts"

const REMETENTE = { name: "PlanejApp", email: "noreply@planejapp.com.br" }
const APP_URL = Deno.env.get("APP_URL") ?? "https://app.planejapp.com.br"

function escapar(texto: string): string {
  return String(texto)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

function emailValido(email: unknown): email is string {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
}

/** Único template que um usuário comum pode disparar. */
function templateConvite(nome: string | null, link: string): { subject: string; html: string } {
  const saudacao = nome ? `Olá, ${escapar(nome)}!` : "Olá!"
  return {
    subject: "Você foi convidado para o PlanejApp 💜",
    html: `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0"><tr><td align="center">
<table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden">
<tr><td style="background:linear-gradient(135deg,#1d4ed8,#3730a3);padding:32px;text-align:center">
  <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700">PlanejApp</h1>
  <p style="margin:8px 0 0;color:rgba(255,255,255,.8);font-size:14px">Seu controle financeiro pessoal</p>
</td></tr>
<tr><td style="padding:32px">
  <h2 style="margin:0 0 16px;font-size:20px;color:#111827">${saudacao}</h2>
  <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6">
    Você recebeu um convite para conhecer o PlanejApp — organize entradas, saídas,
    cartões e metas em um lugar só, com a ajuda do Finn.
  </p>
  <div style="text-align:center;margin:24px 0">
    <a href="${escapar(link)}" style="display:inline-block;background:linear-gradient(135deg,#1d4ed8,#3730a3);color:#fff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:16px;font-weight:700">Começar agora</a>
  </div>
  <p style="margin:0;color:#9ca3af;font-size:13px;text-align:center">
    Nós nunca pedimos sua senha por e-mail.
  </p>
</td></tr></table></td></tr></table></body></html>`,
  }
}

serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  const corsHeaders = cors(req)

  const responder = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    })

  try {
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY")
    if (!BREVO_API_KEY) return responder({ error: "BREVO_API_KEY não configurada" }, 500)

    const body = await req.json()
    const interno = isInternalCall(req)

    let destinatarios: string[]
    let assunto: string
    let conteudoHtml: string
    let conteudoTexto: string

    if (interno) {
      // ── Modo interno: cron, stripe-webhook, outras Edge Functions ──
      const { to, subject, html, text } = body
      if (!to || !subject || (!html && !text)) {
        return responder({ error: "to, subject e html/text são obrigatórios" }, 400)
      }
      destinatarios = (Array.isArray(to) ? to : [to]).filter(emailValido)
      if (destinatarios.length === 0) return responder({ error: "Nenhum destinatário válido" }, 400)
      assunto = String(subject)
      conteudoHtml = html || `<p>${escapar(text)}</p>`
      conteudoTexto = text || String(subject)
    } else {
      // ── Modo usuário: só templates conhecidos ──
      const user = await getAuthenticatedUser(req)
      if (!user) return responder({ error: "Não autorizado" }, 401)

      const { template, to, name } = body
      if (template !== "invite") {
        return responder({ error: "Template não permitido" }, 403)
      }
      if (!emailValido(to)) return responder({ error: "E-mail inválido" }, 400)

      // Um destinatário por chamada, para não virar ferramenta de disparo em massa.
      destinatarios = [String(to).trim().toLowerCase()]

      // O link de indicação vem do perfil de quem está chamando — nunca do corpo.
      const admin = adminClient()
      const { data: perfil } = await admin
        .from("profiles").select("referral_code").eq("id", user.id).single()

      const link = perfil?.referral_code
        ? `${APP_URL}/subscribe?ref=${perfil.referral_code}`
        : `${APP_URL}/subscribe`

      const montado = templateConvite(typeof name === "string" ? name.slice(0, 60) : null, link)
      assunto = montado.subject
      conteudoHtml = montado.html
      conteudoTexto = `Você foi convidado para o PlanejApp. Acesse: ${link}`
    }

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        // ✅ Remetente fixo: não é mais escolhido por quem chama.
        sender: REMETENTE,
        to: destinatarios.map((email: string) => ({ email })),
        subject: assunto,
        htmlContent: conteudoHtml,
        textContent: conteudoTexto,
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      console.error("Brevo recusou o envio:", JSON.stringify(data))
      return responder({ error: "Erro ao enviar e-mail" }, 502)
    }

    return responder({ ok: true, messageId: data.messageId })
  } catch (err: any) {
    console.error("Erro em send-email:", err?.message ?? err)
    return responder({ error: "Erro ao enviar e-mail" }, 500)
  }
})
