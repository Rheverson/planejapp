import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno"

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" })
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

serve(async (req) => {
  const body = await req.text()
  const sig  = req.headers.get("stripe-signature")!

  let event
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, Deno.env.get("STRIPE_WEBHOOK_SECRET")!)
  } catch (err) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }

  const sub = event.data.object as any

  if (["customer.subscription.created", "customer.subscription.updated"].includes(event.type)) {
    await supabase.from("subscriptions").upsert({
      stripe_customer_id: sub.customer,
      stripe_subscription_id: sub.id,
      status: sub.status,
      trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
      current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    }, { onConflict: "stripe_subscription_id" })
  }

  if (event.type === "customer.subscription.deleted") {
    await supabase.from("subscriptions")
      .update({ status: "cancelled" })
      .eq("stripe_subscription_id", sub.id)
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
})