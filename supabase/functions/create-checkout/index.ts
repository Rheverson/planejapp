import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import Stripe from "https://esm.sh/stripe@13.11.0?deno-std=0.177.0"

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" })

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  })

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // ── Autenticação ─────────────────────────────────────
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return json({ error: "Não autorizado. Faça login novamente." }, 401)
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser()
    if (userError || !user) {
      return json({ error: "Sessão expirada. Faça login novamente." }, 401)
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    // ── Dados da requisição ──────────────────────────────
    let userId: string, email: string, referralCode: string | null
    try {
      const body = await req.json()
      userId = body.userId
      email = body.email
      referralCode = body.referralCode || null
    } catch {
      return json({ error: "Dados inválidos na requisição." }, 400)
    }

    if (!userId || !email) {
      return json({ error: "Dados do usuário incompletos." }, 400)
    }

    // ── Verifica assinatura ativa ────────────────────────
    const { data: existingSub, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id, status")
      .eq("user_id", userId)
      .maybeSingle()

    if (subError) {
      console.error("Erro ao verificar assinatura:", subError)
      return json({ error: "Erro ao verificar sua assinatura. Tente novamente." }, 500)
    }

    if (existingSub && ['active', 'trialing'].includes(existingSub.status)) {
      return json({ error: "Você já possui uma assinatura ativa." }, 400)
    }

    // ── Cria ou reutiliza customer no Stripe ─────────────
    let customerId = existingSub?.stripe_customer_id

    if (!customerId) {
      try {
        const customer = await stripe.customers.create({
          email,
          metadata: { userId }
        })
        customerId = customer.id

        const { error: insertError } = await supabaseAdmin
          .from("subscriptions")
          .insert({
            user_id: userId,
            stripe_customer_id: customerId,
            status: "incomplete",
          })

        if (insertError) {
          console.error("Erro ao salvar customer:", insertError)
          // Não retorna erro — continua para criar o checkout
        }
      } catch (stripeErr) {
        console.error("Erro ao criar customer no Stripe:", stripeErr)
        return json({ error: "Erro ao configurar pagamento. Tente novamente." }, 500)
      }
    }

    // ── Processa código de indicação ─────────────────────
    if (referralCode) {
      try {
        // Busca o indicador pelo código
        const { data: referrer } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("referral_code", referralCode.toUpperCase())
          .maybeSingle()

        if (!referrer) {
          // Código inválido — não bloqueia o checkout, apenas ignora
          console.log("Código de indicação inválido:", referralCode)
        } else if (referrer.id === userId) {
          // Auto-indicação — ignora silenciosamente
          console.log("Auto-indicação ignorada para:", userId)
        } else {
          // Verifica se já existe referral para esse usuário
          const { data: existingReferral } = await supabaseAdmin
            .from("referrals")
            .select("id")
            .eq("referred_id", userId)
            .maybeSingle()

          if (!existingReferral) {
            const { error: referralError } = await supabaseAdmin
              .from("referrals")
              .insert({
                referrer_id: referrer.id,
                referred_id: userId,
                referral_code: referralCode.toUpperCase(),
                status: "pending",
              })

            if (referralError) {
              // Se for duplicata, ignora. Qualquer outro erro, loga mas não bloqueia
              if (!referralError.message.includes('duplicate') && !referralError.code?.includes('23505')) {
                console.error("Erro ao salvar referral:", referralError)
              }
            } else {
              console.log("Referral criado:", referrer.id, "->", userId)
            }
          }
        }
      } catch (referralErr) {
        // Erro no processamento do referral não deve bloquear o checkout
        console.error("Erro inesperado no referral:", referralErr)
      }
    }

    // ── Cria sessão de checkout ──────────────────────────
    let session
    try {
      session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        locale: "pt-BR",
        line_items: [{ price: Deno.env.get("STRIPE_PRICE_ID")!, quantity: 1 }],
        mode: "subscription",
        subscription_data: {
          trial_period_days: 30,
        },
        success_url: `${Deno.env.get("APP_URL")}/subscription-success`,
        cancel_url: `${Deno.env.get("APP_URL")}/subscribe`,
      })
    } catch (stripeErr: any) {
      console.error("Erro ao criar sessão Stripe:", stripeErr)

      // Mensagens específicas por tipo de erro do Stripe
      if (stripeErr.code === 'resource_missing') {
        // Customer não existe no Stripe — limpa e tenta recriar
        await supabaseAdmin
          .from("subscriptions")
          .update({ stripe_customer_id: null })
          .eq("user_id", userId)
        return json({ error: "Erro de configuração. Tente novamente." }, 500)
      }

      return json({ error: "Erro ao iniciar pagamento. Tente novamente em instantes." }, 500)
    }

    if (!session?.url) {
      return json({ error: "Erro ao gerar link de pagamento. Tente novamente." }, 500)
    }

    return json({ url: session.url })

  } catch (err: any) {
    console.error("Erro inesperado:", err)
    return json({ error: "Erro inesperado. Tente novamente em instantes." }, 500)
  }
})