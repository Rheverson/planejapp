import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import Stripe from "https://esm.sh/stripe@13.11.0?deno-std=0.177.0"

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" })
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

async function sendNotification(userId: string, title: string, body: string) {
  try {
    await supabase.functions.invoke('send-notification', {
      body: { user_id: userId, title, body }
    })
  } catch (err) {
    console.error('Erro ao enviar notificação:', err)
  }
}

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

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", obj.customer)
      .single()

    if (sub?.user_id) {
      await supabase.from("referrals")
        .update({ status: "cancelled" })
        .eq("referred_id", sub.user_id)

      await recalcularDescontoIndicador(sub.user_id)

      // Notifica o usuário que cancelou
      await sendNotification(
        sub.user_id,
        '😢 Assinatura cancelada',
        'Sua assinatura foi cancelada. Sentiremos sua falta! Volte quando quiser.'
      )
    }
  }

  // ── Pagamento de fatura realizado ────────────────────────
  if (event.type === "invoice.payment_succeeded") {
    if (obj.billing_reason === "subscription_cycle" || obj.billing_reason === "subscription_update") {

      const { data: sub } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("stripe_customer_id", obj.customer)
        .single()

      if (sub?.user_id) {
        // Ativa o referral
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

          // Notifica o indicado que pagou
          await sendNotification(
            sub.user_id,
            '✅ Pagamento confirmado!',
            'Seu pagamento foi confirmado. Obrigado por assinar o PlanejeApp!'
          )
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
})

// ── Recalcula desconto do indicador ─────────────────────
async function recalcularDescontoIndicador(referrerId: string) {
  const { count } = await supabase
    .from("referrals")
    .select("*", { count: "exact", head: true })
    .eq("referrer_id", referrerId)
    .eq("status", "active")

  const activeCount = count || 0

  let discountPercent = 0
  if (activeCount >= 4) discountPercent = 100
  else if (activeCount === 3) discountPercent = 75
  else if (activeCount === 2) discountPercent = 50
  else if (activeCount === 1) discountPercent = 25

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("user_id", referrerId)
    .single()

  if (!sub?.stripe_subscription_id) return

  if (discountPercent === 0) {
    await stripe.subscriptions.update(sub.stripe_subscription_id, { discounts: [] })
  } else {
    const coupon = await stripe.coupons.create({
      percent_off: discountPercent,
      duration: "forever",
      name: discountPercent === 100 ? "Indicação 100% - Gratuito" : `Indicação ${discountPercent}%`
    })
    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      discounts: [{ coupon: coupon.id }]
    })
  }

  console.log(`✅ Desconto de ${discountPercent}% aplicado para ${referrerId}`)

  // Notifica o indicador sobre o novo desconto
  if (discountPercent > 0) {
    const nextDiscount = discountPercent === 100 ? null : discountPercent + 25
    await sendNotification(
      referrerId,
      '💰 Seu desconto aumentou!',
      nextDiscount
        ? `Seu desconto agora é ${discountPercent}%! Indique mais 1 amigo para chegar a ${nextDiscount}%!`
        : '🎉 Incrível! Você agora tem 100% de desconto — PlanejeApp gratuito para sempre!'
    )
  }
}

// Notifica quando alguém usa o código de indicação
export async function notifyReferralUsed(referrerId: string) {
  await sendNotification(
    referrerId,
    '🎉 Alguém usou seu código!',
    'Um novo amigo se cadastrou com seu código. Aguardando o primeiro pagamento para ativar seu desconto!'
  )
}