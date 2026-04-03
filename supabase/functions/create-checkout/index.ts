import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno"

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" })
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { userId, email, referralCode } = await req.json()

    // Verifica se já tem customer no Stripe
    const { data: existingSub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .single()

    let customerId = existingSub?.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({ email, metadata: { userId } })
      customerId = customer.id

      await supabase.from("subscriptions").insert({
        user_id: userId,
        stripe_customer_id: customerId,
        status: "incomplete",
      })
    }

    // Calcula desconto por indicações
    let discounts = []
    if (referralCode) {
      const { data: referrer } = await supabase
        .from("profiles").select("id").eq("referral_code", referralCode).single()

      if (referrer) {
        const { count } = await supabase
          .from("referrals")
          .select("*", { count: "exact", head: true })
          .eq("referrer_id", referrer.id)
          .eq("status", "active")

        // Cria referral
        await supabase.from("referrals").insert({
          referrer_id: referrer.id,
          referred_id: userId,
          referral_code: referralCode,
          status: "pending",
        })

        // Desconto progressivo
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
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})