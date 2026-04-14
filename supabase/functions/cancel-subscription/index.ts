// Edge function: cancel-subscription
// Deploy: supabase functions deploy cancel-subscription --no-verify-jwt
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const { userId } = await req.json()
    if (!userId) throw new Error("userId obrigatório")

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

    if (sub.status === "cancelled") {
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

    // Atualiza banco: status cancelled mas mantém current_period_end
    const { error: updateErr } = await supabase
      .from("subscriptions")
      .update({ status: "cancelled" })
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