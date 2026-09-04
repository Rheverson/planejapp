// ============================================================
// Os nomes do funil de monetização, num lugar só.
//
// Um evento é uma chave de agrupamento de BI. Digitar
// `"checkout_iniciado"` à mão em quatro arquivos é como reimplementar
// cálculo financeiro fora de `financas.js`: um dia alguém escreve
// `"checkout_inicado"` e o relatório passa a mentir sem erro nenhum
// aparecer. Aqui e no espelho `_shared/eventos.ts` — e o banco tem a
// terceira cópia, no CHECK da tabela. As três precisam concordar.
// ============================================================

export const EVENTO = {
  /** O usuário esbarrou num limite e viu o convite. Nasce no navegador. */
  PAYWALL_VISTO: "paywall_visto",
  /** A sessão do Stripe foi criada com sucesso. Nasce no create-checkout. */
  CHECKOUT_INICIADO: "checkout_iniciado",
  /**
   * O Stripe confirmou o checkout. Nasce no webhook — nunca no clique.
   *
   * No modelo PLG isto significa "ENTROU NO TRIAL", não "pagou": o
   * cartão é exigido na entrada, mas a primeira cobrança só vem 7 dias
   * depois. Quem paga de fato é `TRIAL_CONVERTIDO`.
   */
  CHECKOUT_CONCLUIDO: "checkout_concluido",
  /**
   * A primeira fatura de verdade foi paga, depois do trial.
   *
   * É o único evento do funil que representa dinheiro entrando. Sem ele,
   * 100 trials iniciados e 3 pagamentos pareceriam 100% de conversão.
   */
  TRIAL_CONVERTIDO: "trial_convertido",
  /** O plano efetivo mudou de verdade. Nasce no webhook. */
  PLANO_MUDOU: "plano_mudou",
};

/**
 * Por que o plano mudou.
 *
 * Só motivos que correspondem a uma transição que o sistema realmente
 * produz — cada um é derivável de um evento do Stripe. Nada aqui existe
 * "por completude": motivo que ninguém emite vira categoria vazia no
 * relatório e faz procurar bug onde não há.
 */
export const MOTIVO = {
  /** Trial acabou sem pagamento. */
  TRIAL_EXPIROU: "trial_expirou",
  /** Cobrança recusada: past_due/unpaid. */
  PAGAMENTO_FALHOU: "pagamento_falhou",
  /** Passou a pagar. */
  ASSINOU: "assinou",
  /** Assinatura encerrada. */
  CANCELAMENTO: "cancelamento",
  /** Voltou ao Pro sem checkout novo (ex.: cartão regularizado). */
  REATIVACAO: "reativacao",
};

export const PLANO_EVENTO = { FREE: "free", PRO: "pro" };

/**
 * O recurso que originou o paywall.
 *
 * São as chaves de `planos_limites` — a RPC valida contra a tabela, e
 * um nome fora dela é descartado em silêncio. Manter esta lista alinhada
 * com `LIMITES_PADRAO` em `limites.js`.
 */
export const RECURSOS_MEDIDOS = [
  "contas",
  "cartoes",
  "transacoes_mes",
  "metas",
  "finn_mensagens_mes",
  "compartilhamento",
  "recorrencias",
  "relatorio_historico",
];

export function ehRecursoMedido(recurso) {
  return RECURSOS_MEDIDOS.includes(recurso);
}
