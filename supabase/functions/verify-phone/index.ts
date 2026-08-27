import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { cors, preflight, requireUser } from "../_shared/auth.ts"

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY")!

/** Limite de envios de OTP por usuário, para não virar ferramenta de SMS bombing. */
const MAX_OTP_POR_HORA = 5

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

function formatPhone(phone: string): string {
  // Remove tudo que nao for numero
  let digits = phone.replace(/\D/g, "")
  // Adiciona +55 se nao tiver codigo do pais
  if (!digits.startsWith("55")) digits = "55" + digits
  return "+" + digits
}

serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  const corsHeaders = cors(req)

  try {
    // ✅ A identidade vem do JWT: antes o userId vinha do corpo, e com
    // isso era possível disparar SMS para números arbitrários.
    const auth = await requireUser(req)
    if (auth.response) return auth.response
    const userId = auth.user.id

    const { action, phone, code } = await req.json()
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    // ── ENVIAR OTP ────────────────────────────────────────
    if (action === "send") {
      if (!phone) throw new Error("phone obrigatorio")

      // Limite por usuário na última hora.
      const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      const { count } = await supabase
        .from("phone_otps")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", umaHoraAtras)

      if ((count ?? 0) >= MAX_OTP_POR_HORA) {
        return new Response(
          JSON.stringify({ error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      const formattedPhone = formatPhone(phone)
      console.log("Enviando OTP para:", formattedPhone)

      // Invalida OTPs anteriores do mesmo usuario
      await supabase.from("phone_otps")
        .update({ used: true })
        .eq("user_id", userId)
        .eq("used", false)

      // Gera novo OTP
      const otp = generateOTP()
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutos

      // Salva no banco
      const { error: insertErr } = await supabase.from("phone_otps").insert({
        user_id: userId,
        phone: formattedPhone,
        code: otp,
        expires_at: expiresAt.toISOString(),
      })
      if (insertErr) throw insertErr

      // Envia SMS via Brevo
      const smsRes = await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
        method: "POST",
        headers: {
          "api-key": BREVO_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: "PlanejApp",
          recipient: formattedPhone,
          content: `PlanejApp: Seu codigo de verificacao e ${otp}. Valido por 10 minutos. Nao compartilhe com ninguem.`,
          type: "transactional",
        }),
      })

      const smsData = await smsRes.json()
      console.log("Brevo SMS response:", JSON.stringify(smsData))

      if (!smsRes.ok) throw new Error("Erro ao enviar SMS: " + JSON.stringify(smsData))

      return new Response(
        JSON.stringify({ ok: true, message: "OTP enviado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // ── VERIFICAR OTP ─────────────────────────────────────
    if (action === "verify") {
      if (!userId || !code) throw new Error("userId e code obrigatorios")

      // Busca OTP valido
      const { data: otp, error: otpErr } = await supabase
        .from("phone_otps")
        .select("*")
        .eq("user_id", userId)
        .eq("code", code)
        .eq("used", false)
        .gte("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .single()

      if (otpErr || !otp) {
        return new Response(
          JSON.stringify({ ok: false, error: "Codigo invalido ou expirado" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      // Marca OTP como usado
      await supabase.from("phone_otps").update({ used: true }).eq("id", otp.id)

      // Atualiza profile com telefone verificado
      const { error: profileErr } = await supabase
        .from("profiles")
        .update({
          phone: otp.phone,
          phone_verified: true,
          phone_verified_at: new Date().toISOString(),
        })
        .eq("id", userId)

      if (profileErr) throw profileErr

      console.log("Telefone verificado:", otp.phone, "para user:", userId)

      return new Response(
        JSON.stringify({ ok: true, phone: otp.phone }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    throw new Error("Action invalida. Use send ou verify")

  } catch (err: any) {
    console.error("Erro:", err.message)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})