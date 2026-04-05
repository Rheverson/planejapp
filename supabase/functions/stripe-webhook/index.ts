import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import Stripe from "https://esm.sh/stripe@13.11.0?deno-std=0.177.0"

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" })
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

serve(async (req) => {
  const body = await req.text()
  const sig = req.headers.get("stripe-signature")!

  let event
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, Deno.env.get("STRIPE_WEBHOOK_SECRET")!)
  } catch (err) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }

  const obj = event.data.object as any

  // ── Assinatura criada ou atualizada ─────────────────────
  if (["customer.subscription.created", "customer.subscription.updated"].includes(event.type)) {
    await supabase.from("subscriptions").update({
      stripe_subscription_id: obj.id,
      status: obj.status,
      trial_end: obj.trial_end ? new Date(obj.trial_end * 1000).toISOString() : null,
      current_period_end: obj.current_period_end ? new Date(obj.current_period_end * 1000).toISOString() : null,
    }).eq("stripe_customer_id", obj.customer)
  }

  // ── Assinatura cancelada ─────────────────────────────────
  if (event.type === "customer.subscription.deleted") {
    await supabase.from("subscriptions")
      .update({ status: "cancelled" })
      .eq("stripe_customer_id", obj.customer)

    // Cancela referrals ativos desse usuário
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", obj.customer)
      .single()

    if (sub?.user_id) {
      await supabase.from("referrals")
        .update({ status: "cancelled" })
        .eq("referred_id", sub.user_id)

      // Recalcula desconto do indicador
      await recalcularDesconto(sub.user_id, "referred_cancelled")
    }
  }

  // ── Pagamento de fatura realizado ────────────────────────
  if (event.type === "invoice.payment_succeeded") {
    // Só processa se for cobrança após trial (não a do trial em si)
    if (obj.billing_reason === "subscription_cycle" || obj.billing_reason === "subscription_update") {

      // Acha o usuário pelo customer_id
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("stripe_customer_id", obj.customer)
        .single()

      if (sub?.user_id) {
        // Ativa o referral desse usuário (ele pagou de verdade!)
        const { data: referral } = await supabase
          .from("referrals")
          .update({ status: "active" })
          .eq("referred_id", sub.user_id)
          .eq("status", "pending")
          .select()
          .single()

        if (referral) {
          // Recalcula desconto do indicador
          await recalcularDescontoIndicador(referral.referrer_id)
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
})

// ── Função que recalcula o desconto do indicador ─────────
async function recalcularDescontoIndicador(referrerId: string) {
  // Conta quantos indicados ativos tem
  const { count } = await supabase
    .from("referrals")
    .select("*", { count: "exact", head: true })
    .eq("referrer_id", referrerId)
    .eq("status", "active")

  const activeCount = count || 0

  // Calcula percentual de desconto
  let discountPercent = 0
  if (activeCount >= 4) discountPercent = 100
  else if (activeCount === 3) discountPercent = 75
  else if (activeCount === 2) discountPercent = 50
  else if (activeCount === 1) discountPercent = 25

  // Pega a assinatura do indicador
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id, stripe_customer_id")
    .eq("user_id", referrerId)
    .single()

  if (!sub?.stripe_subscription_id) return

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" })

  if (discountPercent === 0) {
    // Remove desconto
    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      discounts: []
    })
  } else if (discountPercent === 100) {
    // Grátis — pausa cobrança
    const coupon = await stripe.coupons.create({
      percent_off: 100,
      duration: "forever",
      name: "Indicação 100% - Gratuito"
    })
    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      discounts: [{ coupon: coupon.id }]
    })
  } else {
    // Desconto parcial
    const coupon = await stripe.coupons.create({
      percent_off: discountPercent,
      duration: "forever",
      name: `Indicação ${discountPercent}%`
    })
    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      discounts: [{ coupon: coupon.id }]
    })
  }

  console.log(`✅ Desconto de ${discountPercent}% aplicado para ${referrerId}`)
}

async function recalcularDesconto(userId: string, reason: string) {
  await recalcularDescontoIndicador(userId)
}