// ============================================================
// Regra de assinatura do PlanejeApp — fonte única de verdade
//
// A pergunta "esse usuário tem acesso?" estava respondida em quatro
// lugares, com três respostas diferentes:
//
//   App.jsx        active | trialing | (cancelled e período no futuro)
//   Profile.jsx    active | trialing            ← ignora o período
//   PlanPage.jsx   active | trialing            ← ignora o período
//   create-checkout  ['active','trialing'].includes(status)
//
// Quem manda de fato é o App.jsx, que é o portão. Os outros dois só
// desenham — e desenhavam errado: uma assinatura cancelada com período
// ainda válido aparecia como "cancelada, sem plano" enquanto o usuário
// continuava dentro. É a mesma família da duplicação que já corrigimos
// em `financas.js`.
//
// Aqui a regra existe uma vez. Função pura: recebe a linha da tabela
// `subscriptions`, devolve decisão.
// ============================================================

// ── Fronteira com o Stripe ──────────────────────────────────
//
// O Stripe escreve `canceled`, com um L. O app sempre escreveu
// `cancelled`, com dois — é o que está nas 10 linhas de produção hoje,
// gravadas pelo webhook e pelo `cancel-subscription`.
//
// Nenhuma das duas grafias é "certa": o que não pode é as duas
// circularem soltas. A conversão acontece AQUI, na entrada, e o resto
// do app fala só o vocabulário do domínio. Substituição textual cega
// pelo código seria o caminho errado — quebraria a leitura das linhas
// que já estão gravadas.
export const ESTADO = {
  TRIAL: "trial",
  ATIVA: "ativa",
  CANCELADA: "cancelada",
  PAGAMENTO_PENDENTE: "pagamento_pendente",
  INCOMPLETA: "incompleta",
  PAUSADA: "pausada",
  NENHUMA: "nenhuma",
};

/** Status do Stripe (ou do banco) → estado do domínio. */
const DO_STRIPE = {
  trialing: ESTADO.TRIAL,
  active: ESTADO.ATIVA,
  canceled: ESTADO.CANCELADA,   // grafia do Stripe
  cancelled: ESTADO.CANCELADA,  // grafia histórica do app
  past_due: ESTADO.PAGAMENTO_PENDENTE,
  unpaid: ESTADO.PAGAMENTO_PENDENTE,
  incomplete: ESTADO.INCOMPLETA,
  incomplete_expired: ESTADO.INCOMPLETA,
  paused: ESTADO.PAUSADA,
};

/**
 * Estado de domínio de uma assinatura.
 * Status desconhecido cai em INCOMPLETA — nunca em acesso liberado.
 * Se o Stripe inventar um status novo amanhã, o usuário não vira PRO
 * por acidente.
 */
export function estadoDaAssinatura(assinatura) {
  if (!assinatura?.status) return ESTADO.NENHUMA;
  return DO_STRIPE[String(assinatura.status).toLowerCase()] ?? ESTADO.INCOMPLETA;
}

function fimDoPeriodo(assinatura) {
  const bruto = assinatura?.current_period_end;
  if (!bruto) return null;
  const d = bruto instanceof Date ? bruto : new Date(bruto);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * O usuário tem acesso PRO?
 *
 *   TRIAL              → sim. O período de teste é acesso pago.
 *   ATIVA              → sim.
 *   CANCELADA          → sim ATÉ o fim do período já pago, e só se
 *                        houver essa data. Quem cancelou pagou pelo mês
 *                        corrente e fica até o fim dele. Sem data, não
 *                        dá para provar que ainda vale: não libera.
 *   PAGAMENTO_PENDENTE → não. `past_due` e `unpaid` são cobrança que
 *                        falhou; o app manda para a tela de pagamento.
 *   INCOMPLETA         → não. Checkout começado e não terminado.
 *   PAUSADA            → não.
 *   NENHUMA            → não.
 *
 * Sobre `cancel_at_period_end`: o Stripe mantém o status em `active`
 * até o período virar, então esse caso já cai em ATIVA e não precisa de
 * regra própria. A coluna nem existe na tabela hoje.
 */
export function temAcessoPro(assinatura, agora = new Date()) {
  const estado = estadoDaAssinatura(assinatura);
  if (estado === ESTADO.TRIAL || estado === ESTADO.ATIVA) return true;
  if (estado === ESTADO.CANCELADA) {
    const fim = fimDoPeriodo(assinatura);
    return !!fim && fim > agora;
  }
  return false;
}

/**
 * A cobrança falhou e o usuário precisa resolver o pagamento?
 *
 * Diferente de "não tem acesso": aqui existe uma assinatura que deu
 * errado, e a tela é a de pagamento, não a de vender o plano.
 */
export function pagamentoFalhou(assinatura, agora = new Date()) {
  const estado = estadoDaAssinatura(assinatura);
  if (estado === ESTADO.PAGAMENTO_PENDENTE) return true;
  if (estado === ESTADO.CANCELADA) {
    const fim = fimDoPeriodo(assinatura);
    return !fim || fim < agora;
  }
  return false;
}

/** O usuário pode iniciar um novo checkout? */
export function podeAssinar(assinatura, agora = new Date()) {
  const estado = estadoDaAssinatura(assinatura);
  return !(estado === ESTADO.TRIAL || estado === ESTADO.ATIVA);
}

/** Rótulo para a interface. Só apresentação — não decide acesso. */
export function rotuloDoEstado(assinatura, agora = new Date()) {
  const estado = estadoDaAssinatura(assinatura);
  switch (estado) {
    case ESTADO.TRIAL: return "Período de teste";
    case ESTADO.ATIVA: return "Ativa";
    case ESTADO.CANCELADA:
      return temAcessoPro(assinatura, agora) ? "Cancelada — ativa até o fim do período" : "Cancelada";
    case ESTADO.PAGAMENTO_PENDENTE: return "Pagamento pendente";
    case ESTADO.INCOMPLETA: return "Assinatura não concluída";
    case ESTADO.PAUSADA: return "Pausada";
    default: return "Sem assinatura";
  }
}
