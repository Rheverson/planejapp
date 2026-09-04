// ============================================================
// Limites de plano do PlanejeApp — fonte única de verdade
//
// Mesmo padrão de `financas.js` e `assinatura.js`: função pura, sem
// React, sem Supabase. Recebe dados, devolve decisão.
//
// ESTE ARQUIVO NÃO É A TRAVA. Quem impede a criação são os triggers no
// banco (migration 20260904093000): `accounts`, `credit_cards`, `goals`
// e `transactions` aceitam escrita do dono, então um POST direto no
// PostgREST passaria por cima de qualquer validação em JavaScript. Foi
// a lição do P0 de `subscriptions` e do P1 de `referrals` — validação
// em função não vale nada se a tabela aceita escrita do cliente.
//
// O que mora aqui é o que a INTERFACE precisa: saber quanto falta, para
// avisar antes e abrir o paywall na hora certa em vez de deixar o
// usuário bater num erro.
// ============================================================

export const PLANO = { FREE: "free", PRO: "pro" };

/**
 * Padrões do código. A tabela `planos_limites` sobrepõe estes valores
 * — é ela que manda, justamente para mudar um limite sem release.
 *
 * `null` = ilimitado. `0` = recurso indisponível no plano. São coisas
 * diferentes: o Free tem 0 recorrências (não pode) e o Pro tem null
 * (quantas quiser).
 */
export const LIMITES_PADRAO = {
  free: {
    contas: 2,
    cartoes: 1,
    transacoes_mes: 100,
    metas: 1,
    finn_mensagens_mes: 10,
    compartilhamento: 0,
    recorrencias: 0,
    relatorio_historico: 0,
  },
  pro: {
    contas: null,
    cartoes: null,
    transacoes_mes: null,
    metas: null,
    finn_mensagens_mes: 300,
    compartilhamento: null,
    recorrencias: null,
    relatorio_historico: null,
  },
};

/**
 * O plano efetivo do usuário.
 *
 * `ehFundador` vem de `usuarios_fundadores` — os 36 que já usavam o app
 * antes do Free/Pro. Eles não passam pelo Stripe e não esbarram em
 * limite nenhum. A flag mora em tabela própria, somente leitura: em
 * `profiles`, que é gravável pelo dono, ela seria auto-promoção a PRO.
 *
 * `temAcesso` vem de `temAcessoPro(assinatura)` em `assinatura.js`.
 * Recebo o booleano em vez de importar, para este módulo não decidir
 * duas coisas ao mesmo tempo.
 */
export function planoDoUsuario({ temAcesso = false, ehFundador = false } = {}) {
  return ehFundador || temAcesso ? PLANO.PRO : PLANO.FREE;
}

/**
 * O teto de um recurso. `Infinity` quando ilimitado — assim `atual <
 * limite` funciona sem tratar null em cada chamador.
 *
 * `limitesDoBanco` é o conteúdo de `planos_limites`, quando carregado;
 * sem ele, valem os padrões daqui.
 */
export function limiteDe(plano, recurso, limitesDoBanco = null) {
  const tabela = limitesDoBanco ?? LIMITES_PADRAO;
  const doPlano = tabela?.[plano];
  if (!doPlano || !(recurso in doPlano)) return Infinity;
  const bruto = doPlano[recurso];
  return bruto === null || bruto === undefined ? Infinity : Number(bruto);
}

/**
 * Cabe mais um?
 *
 * Devolve o quadro inteiro em vez de só um booleano, porque a tela
 * precisa dos números: "última meta do plano Free" é aviso, "você
 * atingiu o limite" é paywall, e as duas frases saem daqui.
 */
export function podeCriar({ plano, recurso, atual = 0, limitesDoBanco = null } = {}) {
  const limite = limiteDe(plano, recurso, limitesDoBanco);
  const restantes = limite === Infinity ? Infinity : Math.max(0, limite - atual);
  return {
    permitido: atual < limite,
    limite,
    atual,
    restantes,
    ilimitado: limite === Infinity,
    // zero não é "acabou a cota": é recurso que o plano não tem.
    indisponivelNoPlano: limite === 0,
    // último antes de bater no teto — vale um aviso discreto.
    ultimo: limite !== Infinity && restantes === 1,
  };
}

/** O recurso existe neste plano? Para esconder promessa, não botão. */
export function recursoDisponivel(plano, recurso, limitesDoBanco = null) {
  return limiteDe(plano, recurso, limitesDoBanco) !== 0;
}

/**
 * O erro que veio do banco é um limite de plano?
 *
 * Os triggers lançam `LIMITE_PLANO:<recurso>:<atual>/<limite>`. A tela
 * usa isto para abrir o paywall em vez de mostrar erro técnico — o
 * usuário nunca deve ver a mensagem crua do Postgres.
 */
export function erroDeLimite(erro) {
  const texto = erro?.message ?? String(erro ?? "");
  const m = texto.match(/LIMITE_PLANO:([a-z_]+):(\d+)\/(\d+)/);
  if (!m) return null;
  return { recurso: m[1], atual: Number(m[2]), limite: Number(m[3]) };
}

/** Converte a tabela `planos_limites` no formato que este módulo usa. */
export function tabelaDeLimites(linhas) {
  const fora = { free: {}, pro: {} };
  (Array.isArray(linhas) ? linhas : []).forEach((l) => {
    if (!fora[l.plano]) fora[l.plano] = {};
    fora[l.plano][l.recurso] = l.limite;
  });
  return fora;
}
