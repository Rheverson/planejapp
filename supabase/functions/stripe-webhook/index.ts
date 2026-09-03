import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import Stripe from "https://esm.sh/stripe@13.11.0?deno-std=0.177.0"

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" })
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

// ── Datas do Stripe ─────────────────────────────────────────
//
// HOTFIX 03/09/2026. `current_period_end` era lido de
// `obj.current_period_end`, e na versao de API desta conta
// (2026-03-25.dahlia) esse campo NAO EXISTE MAIS no objeto
// `subscription`: ele passou a viver em
// `subscription.items.data[].current_period_end`.
//
// Resultado: o webhook gravava NULL para todo mundo. E a regra de
// acesso diz que assinatura cancelada mantem PRO ate o fim do periodo
// pago -- sem a data, `temAcessoPro` devolve false e quem pagou o mes e
// cancelou perdia o acesso na hora.
//
// Comprovado nas duas assinaturas ativas reais do LIVE: o campo esta
// ausente no objeto e presente no item, com a data certa.
//
// O item vem primeiro porque e onde a API atual coloca o valor; o campo
// do objeto fica como reserva, para o caso de um endpoint fixado numa
// versao antiga ainda mandar no formato velho.
function fimDoPeriodo(obj: any): number | null {
  const doItem = obj?.items?.data?.[0]?.current_period_end;
  const doObjeto = obj?.current_period_end;
  const bruto = doItem ?? doObjeto;
  return typeof bruto === "number" && Number.isFinite(bruto) ? bruto : null;
}

/**
 * Segundos do Unix -> ISO, ou null.
 *
 * Aceita so numero finito. Antes, um valor inesperado (string, NaN,
 * undefined) viraria `new Date(NaN).toISOString()`, que LANCA
 * RangeError e derrubaria o webhook inteiro com 500 -- o Stripe
 * reentregaria sem parar.
 */
function paraISO(segundos: number | null | undefined): string | null {
  if (typeof segundos !== "number" || !Number.isFinite(segundos)) return null;
  const d = new Date(segundos * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

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

  // ── Assinatura: aceita LIVE e TEST, cada uma com o proprio segredo ──
  //
  // Os dois modos do Stripe assinam com segredos diferentes. Em vez de
  // uma chave global (que obrigaria a VIRAR producao para test, o que
  // ninguem quer), a funcao tenta os segredos que existirem: primeiro o
  // de producao, depois o de teste.
  //
  // Consequencias, de proposito:
  //  - Sem STRIPE_WEBHOOK_SECRET_TEST configurado, o comportamento e
  //    exatamente o de antes. Nada muda em producao.
  //  - Um evento de teste so e aceito se estiver assinado com o segredo
  //    de teste; um evento forjado continua sendo 400 nos dois casos.
  //  - Nao existe caminho em que um evento de teste passe como se fosse
  //    de producao: o proprio evento carrega `livemode`, registrado
  //    abaixo, e o segredo que o validou diz de qual modo ele veio.
  const segredos = [
    ["live", Deno.env.get("STRIPE_WEBHOOK_SECRET")],
    ["test", Deno.env.get("STRIPE_WEBHOOK_SECRET_TEST")],
  ].filter(([, s]) => !!s) as [string, string][]

  if (segredos.length === 0) {
    console.error("Nenhum segredo de webhook configurado")
    return new Response("Webhook Error: sem segredo configurado", { status: 500 })
  }

  let event
  let modo = ""
  let ultimoErro = ""
  for (const [nome, segredo] of segredos) {
    try {
      event = await stripe.webhooks.constructEventAsync(body, sig, segredo)
      modo = nome
      break
    } catch (err) {
      ultimoErro = err.message
    }
  }

  if (!event) {
    return new Response(`Webhook Error: ${ultimoErro}`, { status: 400 })
  }

  // ── Isolamento entre teste e producao ─────────────────────
  //
  // O webhook grava no MESMO banco nos dois modos e casava a linha so
  // por `stripe_customer_id`. Comprovado antes desta guarda: um evento
  // assinado com o segredo de TESTE, nomeando o customer de um cliente
  // REAL, mudava a assinatura dele de `active` para `canceled`.
  //
  // Duas travas agora:
  //
  //  1. O `livemode` que o evento declara tem que bater com o segredo
  //     que o validou. Um evento assinado em teste dizendo ser de
  //     producao (ou o contrario) e recusado.
  //  2. Toda escrita filtra tambem por `is_test`. Evento de teste so
  //     alcanca linha de teste; evento de producao so alcanca linha de
  //     producao. Nao e convencao que alguem precisa lembrar de seguir,
  //     e condicao no WHERE.
  const eTeste = modo === "test"
  const livemode = (event as any).livemode

  if (typeof livemode === "boolean" && livemode === eTeste) {
    console.error(`webhook recusado: segredo=${modo} mas livemode=${livemode}`)
    return new Response("Webhook Error: modo do evento nao confere com a chave", { status: 400 })
  }

  console.log(`webhook ${event.type} · segredo=${modo} · livemode=${livemode} · is_test=${eTeste}`)

  const obj = event.data.object as any

  // ── Assinatura criada ou atualizada ─────────────────────
  if (["customer.subscription.created", "customer.subscription.updated"].includes(event.type)) {
    await supabase.from("subscriptions").update({
      stripe_subscription_id: obj.id,
      status: obj.status,
      trial_end: paraISO(obj.trial_end),
      current_period_end: paraISO(fimDoPeriodo(obj)),
    }).eq("stripe_customer_id", obj.customer).eq("is_test", eTeste)
  }

  // ── Assinatura cancelada ─────────────────────────────────
  if (event.type === "customer.subscription.deleted") {
    await supabase.from("subscriptions")
      .update({ status: "cancelled" })
      .eq("stripe_customer_id", obj.customer)
      .eq("is_test", eTeste)

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", obj.customer)
      .eq("is_test", eTeste)
      .maybeSingle()

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
        .eq("is_test", eTeste)
        .maybeSingle()

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