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
        }
      } catch (stripeErr) {
        console.error("Erro ao criar customer no Stripe:", stripeErr)
        return json({ error: "Erro ao configurar pagamento. Tente novamente." }, 500)
      }
    }

    // ── Processa código de indicação ─────────────────────
    if (referralCode) {
      try {
        const { data: referrer } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("referral_code", referralCode.toUpperCase())
          .maybeSingle()

        if (!referrer) {
          console.log("Código de indicação inválido:", referralCode)
        } else if (referrer.id === userId) {
          console.log("Auto-indicação ignorada para:", userId)
        } else {
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
              if (!referralError.message.includes('duplicate') && !referralError.code?.includes('23505')) {
                console.error("Erro ao salvar referral:", referralError)
              }
            } else {
              console.log("Referral criado:", referrer.id, "->", userId)

              try {
                await supabaseAdmin.functions.invoke('send-notification', {
                  body: {
                    user_id: referrer.id,
                    title: '🎉 Alguém usou seu código!',
                    body: 'Um novo amigo se cadastrou com seu código. Aguardando o primeiro pagamento para ativar seu desconto!'
                  }
                })
              } catch (notifErr) {
                console.error("Erro ao enviar notificação de indicação:", notifErr)
              }
            }
          }
        }
      } catch (referralErr) {
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
        // ✅ CORREÇÃO: não cobra nada durante o trial
        payment_method_collection: "if_required",
        subscription_data: {
          trial_period_days: 30,
          trial_settings: {
            end_behavior: {
              missing_payment_method: "cancel"
            }
          }
        },
        success_url: `${Deno.env.get("APP_URL")}/subscription-success`,
        cancel_url: `${Deno.env.get("APP_URL")}/subscribe`,
      })
    } catch (stripeErr: any) {
      console.error("Erro ao criar sessão Stripe:", stripeErr)

      if (stripeErr.code === 'resource_missing') {
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