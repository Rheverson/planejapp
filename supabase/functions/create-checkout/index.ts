import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import Stripe from "https://esm.sh/stripe@13.11.0?deno-std=0.177.0"
import { requireUser } from "../_shared/auth.ts"
import { EVENTO, registrarEvento } from "../_shared/eventos.ts"

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
    // A identidade vem do JWT, nunca do corpo.
    //
    // Esta função autenticava e depois usava `body.userId` mesmo assim,
    // com service_role — ou seja, por cima do RLS. Um usuário logado
    // podia informar o id de outro e ler ou escrever a linha de
    // assinatura alheia, inclusive zerar o `stripe_customer_id` da
    // vítima no tratamento de `resource_missing` mais abaixo.
    //
    // Era a única das 15 funções fora do padrão do `_shared/auth.ts`.
    // O front continua mandando `userId`/`email` no corpo; agora são
    // simplesmente ignorados.
    const auth = await requireUser(req)
    if (auth.response) return auth.response
    const userId = auth.user.id
    const email = auth.user.email
    if (!email) return json({ error: "Conta sem e-mail cadastrado." }, 400)

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    // O tamanho do trial também não vem do corpo.
    //
    // `trial_period_days` ia direto do cliente para o Stripe, sem teto:
    // bastava chamar esta função com `{"trialDays": 730}` e sem promo
    // para ganhar dois anos de acesso grátis (730 é o limite do Stripe).
    // O caminho legítimo de trial longo já é outro — o promoCode, que é
    // conferido contra `promo_codes` logo abaixo e sobrescreve este
    // valor. O cliente não tem o que opinar aqui.
    //
    // SETE dias, não trinta. No modelo antigo o trial era a porta de
    // entrada do app e precisava ser longo o bastante para a pessoa
    // conhecer o produto. Agora ela já conhece: chegou até aqui usando
    // o plano gratuito e esbarrou num limite. O trial deixou de ser
    // "conheça o app" e virou "experimente o Pro" — e uma janela curta
    // com cartão na mão converte melhor do que uma longa sem cartão.
    let trialDays = 7

    let referralCode: string | null, promoCode: string | null
    // O que o front DIZ ter originado o checkout. Ainda nao vale nada:
    // e conferido contra os eventos que o backend gravou, mais abaixo.
    let recursoAlegado: string | null = null
    try {
      const body = await req.json()
      referralCode = body.referralCode || null
      promoCode = body.promoCode ? body.promoCode.toUpperCase().trim() : null
      recursoAlegado = typeof body.paywallRecurso === "string" ? body.paywallRecurso : null
    } catch {
      return json({ error: "Dados invalidos." }, 400)
    }

    // Origem do checkout, resolvida depois de autenticar. Declarada
    // aqui porque o evento e gravado depois do try/catch da sessao.
    let recursoOrigem: string | null = null

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

    // ── Ja tem assinatura valendo? ────────────────────────
    //
    // 409 e nao 400: o pedido esta bem formado, o que existe e um
    // CONFLITO com o estado atual. A diferenca importa para quem chama
    // — o front distingue "corrija os dados" de "voce ja tem isso".
    //
    // Esta leitura sozinha NAO fecha a corrida: dois cliques passam
    // aqui antes de qualquer um inserir. Ela evita o caso comum; quem
    // fecha e o indice unico (migration 20260907090000), tratado abaixo.
    //
    // `is_test = false` porque este endpoint e estritamente de
    // producao. Sem o filtro, uma linha de QA esconderia a real.
    const { data: existingSub, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id, status")
      .eq("user_id", userId)
      .eq("is_test", false)
      .maybeSingle()

    if (subError) return json({ error: "Erro ao verificar assinatura." }, 500)
    if (existingSub && ['active', 'trialing'].includes(existingSub.status)) {
      return json({
        error: "Voce ja possui uma assinatura ativa.",
        codigo: "assinatura_ja_ativa",
        status: existingSub.status,
      }, 409)
    }

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
            is_test: false,
          })

        // 23505 = o indice unico barrou: outra aba chegou primeiro.
        // Nao e erro do usuario. Reaproveita o cliente que venceu, em
        // vez de seguir com um customer que nao esta gravado em lugar
        // nenhum — que era o desfecho antigo, e deixava a pessoa
        // pagando num customer orfao.
        if (insertError?.code === "23505") {
          const { data: vencedor } = await supabaseAdmin
            .from("subscriptions")
            .select("stripe_customer_id, status")
            .eq("user_id", userId)
            .eq("is_test", false)
            .maybeSingle()

          if (vencedor && ["active", "trialing"].includes(vencedor.status)) {
            return json({
              error: "Voce ja possui uma assinatura ativa.",
              codigo: "assinatura_ja_ativa",
              status: vencedor.status,
            }, 409)
          }
          if (vencedor?.stripe_customer_id) {
            console.warn(`corrida no checkout: customer ${customerId} descartado em favor do ja gravado`)
            customerId = vencedor.stripe_customer_id
          }
        } else if (insertError) {
          console.error("Erro ao salvar customer:", insertError)
        }
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
      // ── De onde veio este checkout ──────────────────────
      //
      // O front informa o recurso que abriu o paywall, mas o backend NAO
      // acredita nele: so aceita se ELE MESMO tiver registrado um
      // `paywall_visto` desse recurso para este usuario na ultima hora.
      // A atribuicao passa a se apoiar num evento que o servidor
      // gravou, e nao numa afirmacao do cliente.
      //
      // Sem correspondencia, a origem fica NULA — o checkout entra como
      // organico (pilula "Seja Pro", tela de planos). Rotular errado e
      // pior que nao rotular: um numero inventado orienta decisao.
      if (recursoAlegado) {
        const { data: visto } = await supabaseAdmin
          .from("eventos_plano")
          .select("recurso")
          .eq("user_id", userId)
          .eq("evento", EVENTO.PAYWALL_VISTO)
          .eq("recurso", recursoAlegado)
          .gte("ocorrido_em", new Date(Date.now() - 60 * 60 * 1000).toISOString())
          .limit(1)
          .maybeSingle()
        recursoOrigem = visto?.recurso ?? null
      }

      session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        locale: "pt-BR",
        line_items: [{ price: Deno.env.get("STRIPE_PRICE_ID")!, quantity: 1 }],
        mode: "subscription",
        payment_method_collection: "always", // ✅ cartao obrigatorio
        // Quem e o dono desta sessao, dito pelo BACKEND na criacao.
        // Sem isto o webhook so consegue achar o usuario se o
        // `stripe_customer_id` ja estiver gravado — e se a gravacao
        // tiver falhado, o pagamento chega sem dono.
        client_reference_id: userId,
        subscription_data: {
          trial_period_days: trialDays,
          trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
          // Na ASSINATURA, nao so na sessao: a sessao expira, a
          // assinatura fica. E o que permite ver no proprio Stripe qual
          // limite pagou a conta, ao lado da receita.
          metadata: recursoOrigem ? { paywall_recurso: recursoOrigem } : {},
        },
        metadata: recursoOrigem ? { paywall_recurso: recursoOrigem } : {},
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

    // `checkout_iniciado` so aqui: a sessao existe no Stripe e tem URL.
    // Clique em botao nao e checkout iniciado — e intencao.
    await registrarEvento({
      user_id: userId,
      evento: EVENTO.CHECKOUT_INICIADO,
      recurso: recursoOrigem,
      checkout_session_id: session.id,
    })

    return json({ url: session.url })

  } catch (err: any) {
    console.error("Erro inesperado:", err)
    return json({ error: "Erro inesperado." }, 500)
  }
})