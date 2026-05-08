import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import Stripe from "https://esm.sh/stripe@13.11.0?deno-std=0.177.0"

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" })
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" }
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return json({ error: "Nao autorizado." }, 401)

    const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser()
    if (userError || !user) return json({ error: "Sessao expirada." }, 401)

    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)

    const body = await req.json()
    const userId: string = body.userId
    const email: string = body.email
    const referralCode: string | null = body.referralCode || null
    const promoCode: string | null = body.promoCode || null
    let trialDays: number = body.trialDays || 30

    if (!userId || !email) return json({ error: "Dados incompletos." }, 400)

    // Valida codigo promo
    if (promoCode) {
      const { data: promo } = await supabaseAdmin.from("promo_codes").select("*").eq("code", promoCode.toUpperCase()).single()
      if (!promo || promo.is_used || new Date(promo.expires_at) < new Date()) {
        return json({ error: "Codigo promocional invalido ou ja utilizado." }, 400)
      }
      trialDays = promo.trial_days
    }

    // Verifica assinatura ativa
    const { data: existingSub } = await supabaseAdmin.from("subscriptions").select("stripe_customer_id, status").eq("user_id", userId).maybeSingle()
    if (existingSub && ['active', 'trialing'].includes(existingSub.status)) {
      return json({ error: "Voce ja possui uma assinatura ativa." }, 400)
    }

    // Cria ou reutiliza customer
    let customerId = existingSub?.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({ email, metadata: { userId } })
      customerId = customer.id
      await supabaseAdmin.from("subscriptions").insert({ user_id: userId, stripe_customer_id: customerId, status: "incomplete" })
    }

    // Processa referral
    if (referralCode) {
      const { data: referrer } = await supabaseAdmin.from("profiles").select("id").eq("referral_code", referralCode.toUpperCase()).maybeSingle()
      if (referrer && referrer.id !== userId) {
        const { data: existingRef } = await supabaseAdmin.from("referrals").select("id").eq("referred_id", userId).maybeSingle()
        if (!existingRef) {
          await supabaseAdmin.from("referrals").insert({ referrer_id: referrer.id, referred_id: userId, referral_code: referralCode.toUpperCase(), status: "pending" })
          await supabaseAdmin.functions.invoke("send-notification", { body: { user_id: referrer.id, title: "Alguem usou seu codigo!", body: "Um novo amigo se cadastrou com seu codigo!" } })
        }
      }
    }

    // Cria sessao Stripe com trial correto
    const metadata: Record<string, string> = { userId }
    if (promoCode) metadata.promoCode = promoCode

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      locale: "pt-BR",
      line_items: [{ price: Deno.env.get("STRIPE_PRICE_ID")!, quantity: 1 }],
      mode: "subscription",
      subscription_data: { trial_period_days: trialDays, metadata },
      success_url: `${Deno.env.get("APP_URL")}/subscription-success`,
      cancel_url: `${Deno.env.get("APP_URL")}/subscribe`,
    })

    if (!session?.url) return json({ error: "Erro ao gerar link." }, 500)

    // Marca promo como usado
    if (promoCode) {
      await supabaseAdmin.from("promo_codes").update({ is_used: true, used_by: userId, used_at: new Date().toISOString() }).eq("code", promoCode.toUpperCase()).eq("is_used", false)
    }

    return json({ url: session.url })

  } catch (err: any) {
    console.error("Erro:", err)
    return json({ error: "Erro inesperado." }, 500)
  }
})