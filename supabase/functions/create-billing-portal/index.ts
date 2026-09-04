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

    // `is_test = false`: o portal e da conta de PRODUCAO. Sem o filtro,
    // uma linha de QA poderia entregar um customer de teste, e a sessao
    // falharia sem que ninguem entendesse por que.
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .eq("is_test", false)
      .maybeSingle()

    if (!sub?.stripe_customer_id) return json({ error: "Assinatura nao encontrada." }, 404)

    // ── Para onde o Stripe devolve o usuario ────────────────
    //
    // `returnUrl` vinha do corpo e ia direto para o Stripe. Isso e
    // redirecionamento aberto: bastava chamar a funcao com a URL de um
    // site qualquer para que a pessoa saisse do portal LEGITIMO do
    // Stripe direto para la — com a confianca toda que a passagem pelo
    // Stripe acabou de construir. E o cenario classico de phishing de
    // cobranca.
    //
    // O destino agora e sempre dentro do app. O corpo so escolhe o
    // CAMINHO; a origem e do servidor.
    const appUrl = Deno.env.get("APP_URL") || ""
    const body = await req.json().catch(() => ({}))
    const caminho = typeof body.returnPath === "string" ? body.returnPath : "/"
    // Barra unica no inicio: "//evil.com" e URL absoluta protocol-relative,
    // e passaria por uma checagem ingenua de "comeca com barra".
    const caminhoSeguro = /^\/(?!\/)[A-Za-z0-9\-._~/?#[\]@!$&'()*+,;=%]*$/.test(caminho)
      ? caminho
      : "/"

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${appUrl}${caminhoSeguro}`,
    })

    return json({ url: session.url })

  } catch (err: any) {
    console.error("Erro:", err)
    return json({ error: err.message || "Erro inesperado." }, 500)
  }
})