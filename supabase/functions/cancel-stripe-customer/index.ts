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
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const { userId, email } = await req.json()
    if (!userId && !email) return json({ error: "userId ou email obrigatório" }, 400)

    // Busca subscription no Supabase
    let query = supabaseAdmin.from("subscriptions").select("stripe_customer_id, stripe_subscription_id")
    if (userId) query = query.eq("user_id", userId)
    
    const { data: sub } = await query.maybeSingle()

    // Cancela subscription no Stripe
    if (sub?.stripe_subscription_id) {
      try {
        await stripe.subscriptions.cancel(sub.stripe_subscription_id)
        console.log("Subscription cancelada:", sub.stripe_subscription_id)
      } catch (e) {
        console.error("Erro ao cancelar subscription:", e)
      }
    }

    // Se tem email, busca todos os customers com esse email no Stripe e cancela
    if (email) {
      const customers = await stripe.customers.list({ email, limit: 10 })
      for (const customer of customers.data) {
        // Cancela todas as subscriptions do customer
        const subs = await stripe.subscriptions.list({ customer: customer.id })
        for (const s of subs.data) {
          if (!['cancelled', 'canceled'].includes(s.status)) {
            await stripe.subscriptions.cancel(s.id)
            console.log("Subscription cancelada:", s.id)
          }
        }
      }
    }

    return json({ success: true })
  } catch (err) {
    console.error("Erro:", err)
    return json({ error: "Erro ao cancelar" }, 500)
  }
})
