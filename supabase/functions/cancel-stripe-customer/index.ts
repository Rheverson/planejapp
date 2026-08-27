// ============================================================
// cancel-stripe-customer
//
// ANTES (2ª auditoria, achado CR-1): a função lia `userId` e `email`
// do corpo, rodava com service_role + chave secreta do Stripe e não
// verificava quem chamava. Como `verify_jwt: true` aceita a chave
// anônima — que está publicada no HTML do quiz — qualquer pessoa
// podia cancelar imediatamente todas as assinaturas de um e-mail.
// Comprovado: chamada com a chave anônima devolvia HTTP 200.
//
// AGORA, dois modos e nada entre eles:
//
//   • Usuário autenticado → cancela APENAS a própria assinatura.
//     A identidade vem do JWT. `userId` e `email` do corpo são
//     ignorados por completo: não existe caminho em que o cliente
//     escolha o alvo.
//
//   • Chamada interna (service_role) → modo administrativo, aceita
//     `userId`. O alvo por `email` foi removido: era o vetor que
//     permitia atingir qualquer cliente sem conhecer o UUID.
//
// A resposta nunca inclui identificadores do Stripe.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@13.11.0?deno-std=0.177.0"
import { adminClient, cors, isInternalCall, getAuthenticatedUser, preflight } from "../_shared/auth.ts"

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  const corsHeaders = cors(req)

  const responder = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    })

  if (req.method !== "POST") return responder({ error: "Método não permitido" }, 405)

  try {
    const corpo = await req.json().catch(() => ({}))
    let alvo: string

    if (isInternalCall(req)) {
      // ── Modo administrativo ──
      const informado = typeof corpo?.userId === "string" ? corpo.userId.trim() : ""
      if (!UUID.test(informado)) {
        return responder({ error: "userId inválido" }, 400)
      }
      alvo = informado
    } else {
      // ── Modo usuário: o alvo é sempre quem está autenticado ──
      const user = await getAuthenticatedUser(req)
      if (!user) return responder({ error: "Não autorizado" }, 401)

      // Se o corpo tentar apontar para outra pessoa, isso é recusado
      // em vez de silenciosamente ignorado — o cliente fica sabendo.
      if (corpo?.email) {
        return responder({ error: "Este endpoint não aceita alvo por e-mail." }, 400)
      }
      if (typeof corpo?.userId === "string" && corpo.userId.trim() && corpo.userId.trim() !== user.id) {
        return responder({ error: "Você só pode cancelar a própria assinatura." }, 403)
      }

      alvo = user.id
    }

    // service_role só entra em cena depois de decidido de quem é a assinatura.
    const admin = adminClient()
    const { data: sub } = await admin
      .from("subscriptions")
      .select("stripe_subscription_id, status")
      .eq("user_id", alvo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!sub) return responder({ error: "Assinatura não encontrada." }, 404)

    if (["cancelled", "canceled"].includes(String(sub.status))) {
      return responder({ ok: true, jaCancelada: true })
    }

    if (sub.stripe_subscription_id) {
      try {
        await stripe.subscriptions.cancel(sub.stripe_subscription_id)
      } catch (e) {
        // Assinatura já removida do lado do Stripe não é erro para o usuário.
        console.error("Falha ao cancelar no Stripe:", (e as Error)?.message)
      }
    }

    await admin.from("subscriptions").update({ status: "cancelled" }).eq("user_id", alvo)

    // Sem identificadores do Stripe na resposta.
    return responder({ ok: true })
  } catch (err) {
    console.error("Erro em cancel-stripe-customer:", (err as Error)?.message ?? err)
    return responder({ error: "Não foi possível concluir." }, 500)
  }
})
