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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return json({ error: "Nao autorizado." }, 401)

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser()
    if (userError || !user) return json({ error: "Sessao expirada." }, 401)

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    let userId: string, email: string, referralCode: string | null, promoCode: string | null, trialDays: number
    try {
      const body = await req.json()
      userId = body.userId
      email = body.email
      referralCode = body.referralCode || null
      promoCode = body.promoCode ? body.promoCode.toUpperCase().trim() : null
      trialDays = typeof body.trialDays === 'number' && body.trialDays > 0 ? body.trialDays : 30
    } catch {
      return json({ error: "Dados invalidos." }, 400)
    }

    if (!userId || !email) return json({ error: "Dados incompletos." }, 400)

    // ── Valida promoCode se enviado ────────────────────────
    if (promoCode) {
      const { data: promo, error: promoErr } = await supabaseAdmin
        .from("promo_codes")
        .select("id, trial_days, is_used, is_multiuse, expires_at")
        .eq("code", promoCode)
        .single()

      if (promoErr || !promo) return json({ error: "Codigo promocional invalido." }, 400)
      // ✅ Códigos multiuso (EVENTO2026) não são bloqueados por is_used.
      // Antes, bastava esse campo virar true uma vez para o código do
      // evento parar de funcionar para todo mundo.
      if (!promo.is_multiuse && promo.is_used) return json({ error: "Codigo ja utilizado." }, 400)
      if (new Date(promo.expires_at) < new Date()) return json({ error: "Codigo expirado." }, 400)
      trialDays = promo.trial_days
    }

    // ── Verifica assinatura ativa ─────────────────────────
    const { data: existingSub, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id, status")
      .eq("user_id", userId)
      .maybeSingle()

    if (subError) return json({ error: "Erro ao verificar assinatura." }, 500)
    if (existingSub && ['active', 'trialing'].includes(existingSub.status))
      return json({ error: "Voce ja possui uma assinatura ativa." }, 400)

    // ── Cria ou reutiliza customer no Stripe ──────────────
    let customerId = existingSub?.stripe_customer_id
    if (!customerId) {
      try {
        const customer = await stripe.customers.create({ email, metadata: { userId } })
        customerId = customer.id
        const { error: insertError } = await supabaseAdmin
          .from("subscriptions")
          .insert({
            user_id: userId,
            stripe_customer_id: customerId,
            status: "incomplete",
            promo_code: promoCode || null,
          })
        if (insertError) console.error("Erro ao salvar customer:", insertError)
      } catch (err) {
        console.error("Erro ao criar customer:", err)
        return json({ error: "Erro ao configurar pagamento." }, 500)
      }
    } else if (promoCode) {
      await supabaseAdmin
        .from("subscriptions")
        .update({ promo_code: promoCode })
        .eq("user_id", userId)
    }

    // ── Processa referral ─────────────────────────────────
    if (referralCode && !promoCode) {
      try {
        const { data: referrer } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("referral_code", referralCode.toUpperCase())
          .maybeSingle()

        if (referrer && referrer.id !== userId) {
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
            if (!referralError) {
              try {
                await supabaseAdmin.functions.invoke('send-notification', {
                  body: { user_id: referrer.id, title: 'Alguem usou seu codigo!', body: 'Um amigo se cadastrou com seu codigo de indicacao!' }
                })
              } catch (e) { console.error(e) }
            }
          }
        }
      } catch (err) { console.error("Erro no referral:", err) }
    }

    // ── Cria sessao de checkout ───────────────────────────
    let session
    try {
      session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        locale: "pt-BR",
        line_items: [{ price: Deno.env.get("STRIPE_PRICE_ID")!, quantity: 1 }],
        mode: "subscription",
        payment_method_collection: "always", // ✅ cartao obrigatorio
        subscription_data: {
          trial_period_days: trialDays,
          trial_settings: { end_behavior: { missing_payment_method: "cancel" } }
        },
        success_url: `${Deno.env.get("APP_URL")}/subscription-success`,
        cancel_url: `${Deno.env.get("APP_URL")}/subscribe`,
      })
    } catch (stripeErr: any) {
      console.error("Erro Stripe:", stripeErr)
      if (stripeErr.code === 'resource_missing') {
        await supabaseAdmin.from("subscriptions").update({ stripe_customer_id: null }).eq("user_id", userId)
        return json({ error: "Erro de configuracao. Tente novamente." }, 500)
      }
      return json({ error: "Erro ao iniciar pagamento." }, 500)
    }

    if (!session?.url) return json({ error: "Erro ao gerar link." }, 500)
    return json({ url: session.url })

  } catch (err: any) {
    console.error("Erro inesperado:", err)
    return json({ error: "Erro inesperado." }, 500)
  }
})