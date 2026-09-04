// ============================================================
// Espelho de src/domain/eventos.js — mesma dupla de
// `financas.js` / `financeiro.ts`, que já provou o valor.
//
// A TERCEIRA cópia está no banco, no CHECK de `eventos_plano`. Se um
// nome mudar aqui e não lá, o INSERT falha na hora em vez de gravar
// categoria errada — o CHECK é a rede, não a documentação.
// ============================================================

import { adminClient } from "./auth.ts";

export const EVENTO = {
  PAYWALL_VISTO: "paywall_visto",
  CHECKOUT_INICIADO: "checkout_iniciado",
  CHECKOUT_CONCLUIDO: "checkout_concluido",
  PLANO_MUDOU: "plano_mudou",
} as const;

export const MOTIVO = {
  TRIAL_EXPIROU: "trial_expirou",
  PAGAMENTO_FALHOU: "pagamento_falhou",
  ASSINOU: "assinou",
  CANCELAMENTO: "cancelamento",
  REATIVACAO: "reativacao",
} as const;

export type Evento = typeof EVENTO[keyof typeof EVENTO];
export type Motivo = typeof MOTIVO[keyof typeof MOTIVO];

export interface EventoPlano {
  user_id: string;
  evento: Evento;
  recurso?: string | null;
  plano_anterior?: string | null;
  plano_novo?: string | null;
  motivo?: Motivo | null;
  checkout_session_id?: string | null;
  stripe_subscription_id?: string | null;
  is_test?: boolean;
}

/**
 * Grava um evento do funil.
 *
 * FALHA EM SILÊNCIO, de propósito. Telemetria não pode derrubar
 * checkout nem webhook: se o INSERT falhar, o pior que acontece é uma
 * linha faltando no relatório; se ele derrubasse o webhook, o Stripe
 * reentregaria e o usuário ficaria sem assinatura no banco.
 *
 * O 23505 é esperado e não é erro: é o índice único de
 * `(evento, checkout_session_id)` barrando entrega repetida — este
 * projeto tem três endpoints LIVE apontando para a mesma função.
 */
export async function registrarEvento(e: EventoPlano): Promise<void> {
  try {
    const supabase = adminClient();
    const { error } = await supabase.from("eventos_plano").insert(e);
    if (error && error.code !== "23505") {
      console.error("evento nao registrado:", error.message);
    }
  } catch (err) {
    console.error("evento nao registrado:", (err as Error)?.message);
  }
}

/**
 * Deriva o motivo de uma mudança de plano a partir do que o Stripe
 * mandou. Só é chamado quando o plano REALMENTE mudou.
 *
 *   free -> pro : `assinou` quando veio de checkout; `reativacao`
 *                 quando a assinatura já existia e voltou a valer
 *                 (cartão regularizado, por exemplo).
 *   pro -> free : `pagamento_falhou` para past_due/unpaid;
 *                 `trial_expirou` quando o que acabou foi o trial;
 *                 `cancelamento` no resto.
 */
export function motivoDaMudanca(
  planoAnterior: string,
  planoNovo: string,
  statusAnterior: string | null,
  statusNovo: string | null,
  veioDeCheckout: boolean,
): Motivo {
  if (planoNovo === "pro") {
    return veioDeCheckout ? MOTIVO.ASSINOU : MOTIVO.REATIVACAO;
  }
  const s = String(statusNovo || "").toLowerCase();
  if (s === "past_due" || s === "unpaid") return MOTIVO.PAGAMENTO_FALHOU;
  if (String(statusAnterior || "").toLowerCase() === "trialing") {
    return MOTIVO.TRIAL_EXPIROU;
  }
  return MOTIVO.CANCELAMENTO;
}
