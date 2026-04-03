import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import Stripe from "https://esm.sh/stripe@13.11.0?deno-std=0.177.0"


const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" })

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const { userId, email, referralCode } = await req.json()

    const { data: existingSub } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .single()

    let customerId = existingSub?.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({ email, metadata: { userId } })
      customerId = customer.id
      await supabaseAdmin.from("subscriptions").insert({
        user_id: userId,
        stripe_customer_id: customerId,
        status: "incomplete",
      })
    }

    let discounts: any[] = []
    if (referralCode) {
      const { data: referrer } = await supabaseAdmin
        .from("profiles").select("id").eq("referral_code", referralCode).single()

      if (referrer) {
        const { count } = await supabaseAdmin
          .from("referrals")
          .select("*", { count: "exact", head: true })
          .eq("referrer_id", referrer.id)
          .eq("status", "active")

        await supabaseAdmin.from("referrals").insert({
          referrer_id: referrer.id,
          referred_id: userId,
          referral_code: referralCode,
          status: "pending",
        })

        const activeReferrals = (count || 0) + 1
        let couponPercent = 0
        if (activeReferrals >= 4) couponPercent = 100
        else if (activeReferrals === 3) couponPercent = 75
        else if (activeReferrals === 2) couponPercent = 50
        else if (activeReferrals === 1) couponPercent = 25

        if (couponPercent > 0) {
          const coupon = await stripe.coupons.create({
            percent_off: couponPercent,
            duration: "forever",
            name: `Indicação ${couponPercent}%`,
          })
          discounts = [{ coupon: coupon.id }]
        }
      }
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      locale: 'auto',
      line_items: [{ price: Deno.env.get("STRIPE_PRICE_ID")!, quantity: 1 }],
      mode: "subscription",
      subscription_data: {
        trial_period_days: 30,
        ...(discounts.length > 0 ? { discounts } : {}),
      },
      success_url: `${Deno.env.get("APP_URL")}/subscription-success`,
      cancel_url: `${Deno.env.get("APP_URL")}/subscribe`,
    })

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })

  } catch (err) {
    console.error("Erro:", err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})