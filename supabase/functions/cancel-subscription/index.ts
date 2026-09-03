// Edge function: cancel-subscription
// Deploy: supabase functions deploy cancel-subscription
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { cors, preflight, requireUser } from "../_shared/auth.ts"

serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  const corsHeaders = cors(req)

  try {
    // ✅ Só o próprio titular cancela a própria assinatura.
    // Antes o userId vinha do corpo e qualquer um cancelava a de qualquer outro.
    const auth = await requireUser(req)
    if (auth.response) return auth.response
    const userId = auth.user.id

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    // Busca assinatura do usuário
    const { data: sub, error: subErr } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    if (subErr || !sub) throw new Error("Assinatura não encontrada")

    if (sub.status === "cancelled" || sub.cancel_at_period_end === true) {
      return new Response(JSON.stringify({ ok: true, message: "Já cancelada" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!

    // Cancela no Stripe ao fim do período (at_period_end = true)
    if (sub.stripe_subscription_id) {
      const stripeRes = await fetch(
        `https://api.stripe.com/v1/subscriptions/${sub.stripe_subscription_id}`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: "cancel_at_period_end=true",
        }
      )

      const stripeData = await stripeRes.json()
      console.log("Stripe response:", JSON.stringify(stripeData))

      if (!stripeRes.ok) throw new Error(`Stripe error: ${stripeData.error?.message}`)
    }

    // Marca a INTENÇÃO, não o estado (P2-C).
    //
    // A função pede `cancel_at_period_end=true` no Stripe, e o Stripe
    // mantém a assinatura em `active` até o período virar — é assim que
    // o cliente continua com acesso pelo mês que já pagou.
    //
    // Antes daqui gravávamos `status = "cancelled"` por conta própria.
    // Funcionava só porque o `customer.subscription.updated` não estava
    // sendo entregue; assim que ele passou a ser (P1-B), o webhook
    // devolveria a linha para `active` e o cancelamento sumiria da tela
    // segundos depois de o usuário pedir.
    //
    // Agora quem manda no `status` é o Stripe, via webhook. Aqui só se
    // registra que o cancelamento foi pedido — o que dá resposta
    // imediata na interface sem competir com o webhook.
    const { error: updateErr } = await supabase
      .from("subscriptions")
      .update({ cancel_at_period_end: true })
      .eq("user_id", userId)

    if (updateErr) throw updateErr

    return new Response(
      JSON.stringify({ ok: true, message: "Cancelado com sucesso. Acesso mantido até o fim do período." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (err: any) {
    console.error("Erro:", err.message)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})