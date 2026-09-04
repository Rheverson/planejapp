import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { EVENTO, MOTIVO, motivoDaMudanca } from "../_shared/eventos.ts"
import Stripe from "https://esm.sh/stripe@13.11.0?deno-std=0.177.0"

// ── Um cliente Stripe por modo ──────────────────────────────
//
// Havia UM cliente, o de producao, e ele era usado tambem no caminho da
// indicacao. Como `recalcularDescontoIndicador` buscava a assinatura do
// indicador SEM filtrar `is_test`, um `invoice.payment_succeeded` de
// TESTE podia criar cupom real numa assinatura real: perda de receita
// direta, disparada por um evento que nao custa nada para produzir.
//
// E a mesma classe do furo corrigido em 09c2ae5 (evento de teste
// alcancando assinatura de producao), sobrevivendo neste ramo porque a
// funcao do desconto nao recebia o modo.
//
// Agora o modo escolhe o cliente, e quem nao tem cliente para o proprio
// modo nao fala com o Stripe.
const stripeLive = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" })
const chaveDeTeste = Deno.env.get("STRIPE_SECRET_KEY_TEST")
const stripeTest = chaveDeTeste
  ? new Stripe(chaveDeTeste, { apiVersion: "2023-10-16" })
  : null

/** O cliente do modo do evento. `null` em teste sem chave configurada. */
function clienteDoModo(eTeste: boolean): Stripe | null {
  return eTeste ? stripeTest : stripeLive
}
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

// ── Fronteira de vocabulario (P2-C) ─────────────────────────
//
// O Stripe grava `canceled`, com um L. O app sempre gravou `cancelled`,
// com dois -- e o `src/domain/assinatura.js` fala esse. Gravar o valor
// do Stripe cru deixaria as duas grafias circulando no banco.
//
// A traducao acontece AQUI, na entrada. Substituicao textual pelo
// codigo seria o caminho errado: quebraria a leitura das linhas que ja
// estao gravadas.
function statusInterno(doStripe: string): string {
  return doStripe === "canceled" ? "cancelled" : doStripe;
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
      // Qualquer cliente serve aqui: `constructEventAsync` valida com o
      // SEGREDO recebido, nao com a chave de API. O modo e decidido
      // depois, por qual segredo aceitou o evento.
      event = await stripeLive.webhooks.constructEventAsync(body, sig, segredo)
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

  // ── P2-B: entrega repetida nao age duas vezes ─────────────
  //
  // O Stripe reentrega por design, ate 3 dias. A idempotencia de antes
  // era acidental: funcionava porque os UPDATEs sao idempotentes por
  // natureza. Bastava alguem acrescentar um INSERT, um incremento ou um
  // e-mail para deixar de funcionar.
  //
  // Agora o `event.id` e registrado ANTES de agir. Quem chega repetido
  // esbarra na chave primaria e sai sem efeito.
  const { error: erroEvento } = await supabase
    .from("stripe_eventos_processados")
    .insert({ id: event.id, tipo: event.type, modo })

  if (erroEvento) {
    // 23505 = unique_violation: ja processamos este evento.
    if (erroEvento.code === "23505") {
      console.log(`evento ${event.id} ja processado — ignorado`)
      return new Response(JSON.stringify({ ok: true, repetido: true }), { status: 200 })
    }
    // Qualquer outra falha aqui e do banco, nao do Stripe. Responder
    // 500 faz o Stripe reentregar, que e o que queremos.
    console.error("falha ao registrar evento:", erroEvento)
    return new Response("erro ao registrar evento", { status: 500 })
  }

  // ── P1-C: evento atrasado nao desfaz estado mais novo ─────
  //
  // O Stripe NAO garante ordem. Reproduzido na bateria: `created` ->
  // `deleted` -> `created` atrasado deixava a linha `active` depois de
  // cancelada.
  //
  // Compara o horario do EVENTO (nao o do banco): dois eventos podem
  // chegar no mesmo segundo em ordem trocada.
  const eventoEm = new Date(((event as any).created ?? 0) * 1000).toISOString()

  /** Filtro comum a toda escrita: mesma linha, mesmo modo, evento mais novo. */
  const alvo = (q: any) =>
    q.eq("stripe_customer_id", obj.customer)
     .eq("is_test", eTeste)
     .or(`ultimo_evento_em.is.null,ultimo_evento_em.lt.${eventoEm}`)

  // ── Funil de monetizacao ────────────────────────────────
  //
  // O plano vem de `plano_do_usuario`, a MESMA funcao que os triggers
  // usam. Nao ha aqui uma quarta implementacao da regra de acesso: o
  // webhook pergunta ao banco antes e depois de escrever, e so registra
  // se a resposta mudou. Assim o evento nao pode divergir do que o app
  // de fato concede.
  const linhaDoCliente = async () => {
    const { data } = await supabase
      .from("subscriptions")
      .select("user_id, status, stripe_subscription_id")
      .eq("stripe_customer_id", obj.customer)
      .eq("is_test", eTeste)
      .maybeSingle()
    return data
  }

  const planoAgora = async (userId: string) => {
    const { data } = await supabase.rpc("plano_do_usuario", { p_user: userId })
    return typeof data === "string" ? data : null
  }

  /**
   * Registra `plano_mudou` se, e somente se, o plano efetivo mudou.
   *
   * Recarregar a tela nao gera evento porque nada aqui olha o
   * frontend. Entrega repetida nao gera evento porque
   * `stripe_eventos_processados` ja devolveu 200 antes de chegar aqui —
   * e, mesmo que chegasse, o segundo calculo daria "nao mudou".
   */
  const registrarMudancaDePlano = async (
    antes: { user_id: string; status: string | null } | null,
    planoAntes: string | null,
    veioDeCheckout: boolean,
    cancelouNoTrial = false,
  ) => {
    if (!antes?.user_id || !planoAntes) return
    const depois = await linhaDoCliente()
    const planoDepois = await planoAgora(antes.user_id)
    if (!planoDepois || planoDepois === planoAntes) return

    await supabase.from("eventos_plano").insert({
      user_id: antes.user_id,
      evento: EVENTO.PLANO_MUDOU,
      plano_anterior: planoAntes,
      plano_novo: planoDepois,
      motivo: motivoDaMudanca(
        planoAntes, planoDepois, antes.status, depois?.status ?? null,
        veioDeCheckout, cancelouNoTrial,
      ),
      stripe_subscription_id: depois?.stripe_subscription_id ?? obj.id ?? null,
      is_test: eTeste,
    })
  }


  // ── Assinatura criada ou atualizada ─────────────────────
  if (["customer.subscription.created", "customer.subscription.updated"].includes(event.type)) {
    const antes = await linhaDoCliente()
    const planoAntes = antes?.user_id ? await planoAgora(antes.user_id) : null

    await alvo(supabase.from("subscriptions").update({
      stripe_subscription_id: obj.id,
      status: statusInterno(obj.status),
      trial_end: paraISO(obj.trial_end),
      current_period_end: paraISO(fimDoPeriodo(obj)),
      cancel_at_period_end: obj.cancel_at_period_end === true,
      ultimo_evento_em: eventoEm,
    }))

    // `created` vem logo depois de um checkout; `updated` nao.
    await registrarMudancaDePlano(
      antes, planoAntes, event.type === "customer.subscription.created",
    )
  }

  // ── Assinatura cancelada ─────────────────────────────────
  if (event.type === "customer.subscription.deleted") {
    const antes = await linhaDoCliente()
    const planoAntes = antes?.user_id ? await planoAgora(antes.user_id) : null

    // ── Cancelou DURANTE o trial? ─────────────────────────
    //
    // A regra de acesso mantem o Pro de quem cancelou ate o fim do
    // periodo — porque a pessoa PAGOU aquele mes. Num trial nao houve
    // pagamento nenhum: manter o acesso ate o fim seria dar Pro de
    // graca por cancelar.
    //
    // O sinal e o `trial_end` ainda no futuro. Quando o trial acaba
    // sozinho, o Stripe cancela NO fim dele e a data ja passou; quando
    // a pessoa cancela antes, a data ainda esta a frente.
    //
    // A correcao fica AQUI e nao em `temAcessoPro`: a regra continua
    // sendo "cancelada mantem acesso ate o fim do periodo pago". O que
    // muda e parar de afirmar um periodo pago que nunca existiu.
    const fimDoTrial = typeof obj.trial_end === "number" ? obj.trial_end * 1000 : null
    const cancelouNoTrial = fimDoTrial !== null && fimDoTrial > Date.now()

    await alvo(supabase.from("subscriptions")
      .update({
        status: "cancelled",
        cancel_at_period_end: false,
        current_period_end: cancelouNoTrial
          ? null
          : (paraISO(fimDoPeriodo(obj)) ?? undefined),
        ultimo_evento_em: eventoEm,
      }))

    await registrarMudancaDePlano(antes, planoAntes, false, cancelouNoTrial)

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

      await recalcularDescontoIndicador(sub.user_id, eTeste)

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
          await recalcularDescontoIndicador(referral.referrer_id, eTeste)

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

  // ── Trial que virou pagamento ────────────────────────────
  //
  // `checkout_concluido` diz que a pessoa ENTROU no trial: no modelo
  // PLG o cartao e exigido na porta, mas a cobranca so vem 7 dias
  // depois. Sem separar as duas coisas, 100 trials e 3 pagamentos
  // pareceriam 100% de conversao.
  //
  // O sinal de "primeira fatura de verdade": cobranca de ciclo com
  // valor maior que zero. A fatura do trial e de R$ 0 e tem
  // `billing_reason = subscription_create`.
  //
  // `invoice.paid` entra junto com `invoice.payment_succeeded` porque o
  // Stripe manda os dois e so o segundo esta assinado no endpoint hoje
  // — assim a mudanca de configuracao, se vier, nao exige codigo novo.
  // O indice unico por assinatura garante que os dois eventos, ou a
  // renovacao do mes seguinte, nao contem duas vezes.
  if (event.type === "invoice.payment_succeeded" || event.type === "invoice.paid") {
    const pagouDeVerdade = (obj.amount_paid ?? obj.total ?? 0) > 0
    const ehCiclo = obj.billing_reason === "subscription_cycle" ||
                    obj.billing_reason === "subscription_update"

    if (pagouDeVerdade && ehCiclo && obj.subscription) {
      const { data: dono } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("stripe_customer_id", obj.customer)
        .eq("is_test", eTeste)
        .maybeSingle()

      if (dono?.user_id) {
        const { error } = await supabase.from("eventos_plano").insert({
          user_id: dono.user_id,
          evento: EVENTO.TRIAL_CONVERTIDO,
          stripe_subscription_id: typeof obj.subscription === "string" ? obj.subscription : null,
          is_test: eTeste,
        })
        // 23505 e o indice unico barrando a segunda contagem da mesma
        // assinatura: esperado, nao e falha.
        if (error && error.code !== "23505") {
          console.error("trial_convertido nao registrado:", error.message)
        }
      }
    }
  }

  // ── Cobranca recusada ────────────────────────────────────
  //
  // O evento ja era ASSINADO no endpoint e nao era TRATADO no codigo: o
  // `past_due` so chegava ao banco pela via de
  // `customer.subscription.updated`. Hoje funciona porque o Stripe
  // costuma mandar os dois; e uma dependencia de comportamento de
  // terceiro, nao uma garantia — e do outro lado dela esta o banner de
  // cobranca e a queda para Free.
  //
  // Aqui o objeto e uma FATURA, nao uma assinatura: nao traz `status`
  // nem `current_period_end`. Entao a unica coisa escrita e o
  // `status`, e so para fatura de assinatura.
  if (event.type === "invoice.payment_failed") {
    if (obj.subscription) {
      const antes = await linhaDoCliente()
      const planoAntes = antes?.user_id ? await planoAgora(antes.user_id) : null

      // Mesmo `alvo` das demais escritas: mesma linha, mesmo modo,
      // evento mais novo. Uma falha atrasada nao derruba um pagamento
      // que ja foi confirmado depois dela.
      await alvo(supabase.from("subscriptions").update({
        status: "past_due",
        ultimo_evento_em: eventoEm,
      }))

      await registrarMudancaDePlano(antes, planoAntes, false)
    }
  }

  // ── Checkout concluido ───────────────────────────────────
  //
  // A UNICA fonte de verdade para "pagou": o Stripe dizendo que a
  // sessao fechou. O clique no botao ja foi medido em
  // `checkout_iniciado`, la no create-checkout; o frontend nao tem voz
  // nesta etapa.
  //
  // O `checkout_session_id` amarra de volta ao `checkout_iniciado`, e e
  // por ele que a conversao volta ao recurso que a originou — sem
  // depender da metadata, que existe para o relatorio do proprio
  // Stripe.
  if (event.type === "checkout.session.completed") {
    // Quem e o dono. Duas vias, e a segunda existe porque a primeira
    // depende de uma escrita anterior ter dado certo:
    //
    //  1. `client_reference_id`, posto pelo create-checkout na criacao
    //     da sessao. E o vinculo que nao depende de nada mais;
    //  2. o `stripe_customer_id` ja gravado, para sessoes criadas antes
    //     desta mudanca.
    let donoId: string | null =
      typeof obj.client_reference_id === "string" ? obj.client_reference_id : null

    if (!donoId) {
      const { data: porCliente } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("stripe_customer_id", obj.customer)
        .eq("is_test", eTeste)
        .maybeSingle()
      donoId = porCliente?.user_id ?? null
    }

    // Grava o vinculo com o Stripe.
    //
    // O create-checkout ja escreve o `stripe_customer_id` ao criar o
    // cliente. Aqui e a rede, e ela CRIA a linha se nao houver: sem
    // isso, um insert que tenha falhado la atras faria o pagamento
    // chegar sem linha nenhuma — a pessoa pagaria e continuaria sem
    // acesso, que e o pior desfecho possivel deste fluxo.
    //
    // Nao da para usar upsert: `subscriptions` nao tem unicidade por
    // `user_id` (ver pendencia no relatorio), entao e leitura e depois
    // escrita.
    if (donoId) {
      const vinculo = {
        stripe_customer_id: typeof obj.customer === "string" ? obj.customer : null,
        stripe_subscription_id: typeof obj.subscription === "string" ? obj.subscription : null,
      }

      const { data: linha } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("user_id", donoId)
        .eq("is_test", eTeste)
        .maybeSingle()

      if (linha) {
        await supabase.from("subscriptions")
          .update(vinculo)
          .eq("user_id", donoId)
          .eq("is_test", eTeste)
      } else {
        await supabase.from("subscriptions").insert({
          user_id: donoId,
          status: "incomplete",   // o evento de assinatura ajusta em seguida
          is_test: eTeste,
          ...vinculo,
        })
      }
    }

    const sub = donoId ? { user_id: donoId } : null

    if (sub?.user_id) {
      const { error } = await supabase.from("eventos_plano").insert({
        user_id: sub.user_id,
        evento: EVENTO.CHECKOUT_CONCLUIDO,
        recurso: obj?.metadata?.paywall_recurso ?? null,
        checkout_session_id: obj.id,
        stripe_subscription_id: typeof obj.subscription === "string" ? obj.subscription : null,
        is_test: eTeste,
      })
      // 23505 e o indice unico barrando entrega repetida: esperado,
      // nao e falha.
      if (error && error.code !== "23505") {
        console.error("checkout_concluido nao registrado:", error.message)
      }
    }
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
})

// ── Recalcula desconto do indicador ─────────────────────
async function recalcularDescontoIndicador(referrerId: string, eTeste: boolean) {
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

  // ISOLAMENTO. Duas travas, e cada uma sozinha ja barra o desastre:
  //
  //  1. a assinatura do indicador tem de ser do MESMO modo do evento.
  //     Um invoice de teste procura assinatura de teste; a linha de um
  //     usuario real (is_test = false) nao aparece, e a funcao retorna.
  //  2. a chamada ao Stripe usa a chave daquele modo. Mesmo que a
  //     primeira falhasse, um id de assinatura de teste nao existe na
  //     conta LIVE e vice-versa.
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("user_id", referrerId)
    .eq("is_test", eTeste)
    .maybeSingle()

  if (!sub?.stripe_subscription_id) return

  const stripe = clienteDoModo(eTeste)
  if (!stripe) {
    // Modo de teste sem STRIPE_SECRET_KEY_TEST configurada: melhor nao
    // aplicar desconto nenhum do que aplicar na conta errada.
    console.warn("desconto nao aplicado: sem chave Stripe para o modo de teste")
    return
  }

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