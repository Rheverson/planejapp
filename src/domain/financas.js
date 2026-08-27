// ============================================================
// Regras financeiras do PlanejeApp — fonte única de verdade
//
// Antes desta camada, o mesmo cálculo existia em até cinco lugares
// (Home, Contas, Metas, Relatórios e a Edge Function ai-chat) com
// resultados diferentes: "Saídas do mês" excluía contas de
// investimento na Home mas não nos Relatórios, o progresso de uma
// meta era calculado por dois algoritmos distintos, e "taxa de
// poupança" tinha duas fórmulas contraditórias.
//
// Tudo aqui é função pura: recebe dados, devolve números. Sem React,
// sem Supabase, sem data/hora implícita — o que torna testável.
// ============================================================

// ── Dinheiro ────────────────────────────────────────────────
//
// Todo cálculo monetário acontece em CENTAVOS INTEIROS.
//
// A segunda auditoria mostrou o motivo: somando em ponto flutuante,
// 0,01 dez vezes dava 0.09999999999999999 e 0,07 cem vezes dava
// 7.000000000000009. A exibição escondia isso (Intl arredonda para
// duas casas), mas as comparações espalhadas pelo app não —
// `restante > 0.01` na realização parcial, `pct >= 100` no orçamento,
// `current >= target_amount` na meta concluída.
//
// A API pública continua falando em reais; a conversão fica na borda.

/** Converte com segurança para número (o Postgres devolve numeric como string). */
export function num(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

/** Reais → centavos inteiros. 10,50 vira 1050. */
export function paraCentavos(valor) {
  return Math.round(num(valor) * 100);
}

/** Centavos inteiros → reais. 1050 vira 10,50. */
export function paraReais(centavos) {
  return Math.round(num(centavos)) / 100;
}

/** Lista sempre iterável, mesmo recebendo null (o default `= []` só cobre undefined). */
function lista(valor) {
  return Array.isArray(valor) ? valor : [];
}

/**
 * Uma transação conta como realizada?
 * `is_realized` pode ser null em registros antigos — e null significa
 * realizada, por causa do DEFAULT true da coluna. Por isso o teste é
 * "diferente de false", nunca "igual a true".
 */
export function ehRealizada(t) {
  return t?.is_realized !== false;
}

/** Prevista = o oposto de realizada. */
export function ehPrevista(t) {
  return t?.is_realized === false;
}

/**
 * Compra no cartão de crédito não altera o saldo da conta.
 * Só o pagamento da fatura altera.
 */
export function ehCompraNoCartao(t) {
  return Boolean(t?.credit_card_id) && t?.type === "expense";
}

/** Converte "2026-04-12" em Date local ao meio-dia, evitando o deslocamento de fuso. */
export function paraData(dataISO) {
  if (!dataISO) return null;
  if (dataISO instanceof Date) return dataISO;
  return new Date(`${String(dataISO).slice(0, 10)}T12:00:00`);
}

/** "2026-04" a partir de uma data ou string. */
export function chaveMes(data) {
  const d = paraData(data);
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** A transação cai no mês da data de referência? */
export function noMes(t, dataReferencia) {
  return chaveMes(t?.date) === chaveMes(dataReferencia);
}

/** Conjunto de ids das contas de investimento. */
export function idsInvestimento(contas) {
  return new Set(lista(contas).filter((c) => c.type === "investment").map((c) => c.id));
}

/** Último dia do mês de uma chave "YYYY-MM". */
export function ultimoDiaDoMes(mes) {
  const [ano, m] = String(mes).split("-").map(Number);
  return new Date(ano, m, 0).getDate();
}

/** Ajusta o dia ao mês de destino: dia 31 em fevereiro vira 28 (ou 29). */
export function dataNoMes(mes, dia) {
  const limite = Math.min(Number(dia), ultimoDiaDoMes(mes));
  return `${mes}-${String(limite).padStart(2, "0")}`;
}

// ── Saldos ──────────────────────────────────────────────────

/**
 * Saldo atual de cada conta, a partir do saldo inicial mais todo o
 * histórico realizado.
 *
 * Regras aplicadas:
 *  - previstas não entram;
 *  - compra no cartão não afeta a conta;
 *  - transferência sai da origem e entra no destino.
 */
export function calcularSaldosPorConta(contas, transacoes) {
  // Acumula em centavos inteiros e converte só no fim.
  const centavos = {};
  lista(contas).forEach((c) => { centavos[c.id] = paraCentavos(c.initial_balance); });

  lista(transacoes).forEach((t) => {
    if (!ehRealizada(t)) return;
    if (ehCompraNoCartao(t)) return;

    const valor = paraCentavos(t.amount);

    if (t.type === "transfer") {
      if (t.account_id) centavos[t.account_id] = (centavos[t.account_id] || 0) - valor;
      if (t.transfer_account_id) {
        centavos[t.transfer_account_id] = (centavos[t.transfer_account_id] || 0) + valor;
      }
      return;
    }

    if (!t.account_id) return;
    if (t.type === "income") centavos[t.account_id] = (centavos[t.account_id] || 0) + valor;
    else if (t.type === "expense") centavos[t.account_id] = (centavos[t.account_id] || 0) - valor;
  });

  const saldos = {};
  Object.keys(centavos).forEach((id) => { saldos[id] = paraReais(centavos[id]); });
  return saldos;
}

/**
 * Totais de saldo separando contas comuns de investimento.
 * O "saldo em conta" exibido no topo do app é `emConta`.
 */
export function calcularTotaisDeSaldo(contas, transacoes) {
  const saldos = calcularSaldosPorConta(contas, transacoes);
  const comuns = lista(contas).filter((c) => c.type !== "investment");
  const investimentos = lista(contas).filter((c) => c.type === "investment");

  const somar = (itens) =>
    paraReais(itens.reduce((acc, c) => acc + paraCentavos(saldos[c.id]), 0));

  return {
    saldos,
    emConta: somar(comuns),
    investido: somar(investimentos),
    contasComuns: comuns,
    contasInvestimento: investimentos,
  };
}

// ── KPIs do mês ─────────────────────────────────────────────

/**
 * Transações que compõem os números de um mês.
 * Exclui transferências (movimentação interna, não é entrada nem saída)
 * e movimentos de contas de investimento — que são poupança, não gasto.
 *
 * Despesas sem conta vinculada (`account_id` nulo) entram: são gastos
 * reais que o usuário registrou sem escolher a conta.
 */
export function transacoesDoMes(transacoes, contas, dataReferencia) {
  const investimento = idsInvestimento(contas);
  return lista(transacoes).filter(
    (t) =>
      t.type !== "transfer" &&
      !investimento.has(t.account_id) &&
      noMes(t, dataReferencia)
  );
}

/**
 * Os quatro KPIs da Home.
 *
 * `saldoEmConta` é o saldo real acumulado hoje (histórico completo),
 * e não apenas o do mês — é o que torna a projeção do mês corrente
 * significativa.
 */
export function calcularKPIsMes({ transacoes, contas, dataReferencia, saldoEmConta, hoje = new Date() } = {}) {
  const doMes = transacoesDoMes(transacoes, contas, dataReferencia);

  // Tudo somado em centavos; a conversão para reais acontece no retorno.
  const soma = (itens, tipo) =>
    itens.filter((t) => t.type === tipo).reduce((acc, t) => acc + paraCentavos(t.amount), 0);

  const realizadas = doMes.filter(ehRealizada);
  const previstas = doMes.filter(ehPrevista);

  const entradasRealizadas = soma(realizadas, "income");
  const entradasPrevistas = soma(previstas, "income");
  const saidasRealizadas = soma(realizadas, "expense");
  const saidasPrevistas = soma(previstas, "expense");

  const ehMesCorrente = chaveMes(dataReferencia) === chaveMes(hoje);

  // Mês corrente: parte do saldo real de hoje e aplica o que ainda falta acontecer.
  // Outros meses: o resultado líquido do próprio mês.
  const projecao = ehMesCorrente
    ? paraCentavos(saldoEmConta) + entradasPrevistas - saidasPrevistas
    : entradasRealizadas + entradasPrevistas - saidasRealizadas - saidasPrevistas;

  return {
    entradas: paraReais(entradasRealizadas + entradasPrevistas),
    saidas: paraReais(saidasRealizadas + saidasPrevistas),
    entradasRealizadas: paraReais(entradasRealizadas),
    entradasPrevistas: paraReais(entradasPrevistas),
    saidasRealizadas: paraReais(saidasRealizadas),
    saidasPrevistas: paraReais(saidasPrevistas),
    resultadoDoMes: paraReais(entradasRealizadas - saidasRealizadas),
    projecaoFinal: paraReais(projecao),
    ehMesCorrente,
  };
}

/** Gastos realizados do mês agrupados por categoria. */
export function gastosPorCategoria(transacoes, contas, dataReferencia) {
  const centavos = {};
  transacoesDoMes(transacoes, contas, dataReferencia)
    .filter((t) => t.type === "expense" && ehRealizada(t))
    .forEach((t) => {
      const cat = t.category || "outros";
      centavos[cat] = (centavos[cat] || 0) + paraCentavos(t.amount);
    });
  const mapa = {};
  Object.keys(centavos).forEach((c) => { mapa[c] = paraReais(centavos[c]); });
  return mapa;
}

// ── Indicadores ─────────────────────────────────────────────

/**
 * Sobra do mês: quanto das entradas não foi consumido pelas saídas.
 *
 * Não confundir com a taxa de poupança. Este número aparecia nos
 * Relatórios rotulado como "taxa de poupança", contradizendo o Score.
 */
export function calcularSobraDoMes({ entradas, saidas } = {}) {
  const e = paraCentavos(entradas);
  const sa = paraCentavos(saidas);
  if (e <= 0) return 0;
  return ((e - sa) / e) * 100;
}

/**
 * Taxa de poupança: quanto da renda virou aporte líquido em contas de
 * investimento. É a mesma definição usada pela função SQL
 * `calculate_financial_score`, que alimenta o Score financeiro.
 */
export function calcularTaxaPoupanca({ transacoes, contas, dataReferencia } = {}) {
  const investimento = idsInvestimento(contas);
  const doMes = lista(transacoes).filter((t) => ehRealizada(t) && noMes(t, dataReferencia));

  // Tudo em centavos: a razão só é calculada no fim.
  const renda = doMes
    .filter((t) => t.type === "income" && !investimento.has(t.account_id))
    .reduce((acc, t) => acc + paraCentavos(t.amount), 0);

  let aportado = 0;
  let sacado = 0;

  doMes.forEach((t) => {
    const valor = paraCentavos(t.amount);
    if (t.type === "income" && investimento.has(t.account_id)) aportado += valor;
    else if (t.type === "transfer" && investimento.has(t.transfer_account_id)) aportado += valor;
    else if (t.type === "expense" && investimento.has(t.account_id)) sacado += valor;
    else if (t.type === "transfer" && investimento.has(t.account_id)) sacado += valor;
  });

  const aporteLiquido = Math.max(0, aportado - sacado);
  if (renda <= 0) {
    return { taxa: 0, renda: paraReais(renda), aporteLiquido: paraReais(aporteLiquido) };
  }

  return {
    taxa: Math.round((aporteLiquido / renda) * 1000) / 10,
    renda: paraReais(renda),
    aporteLiquido: paraReais(aporteLiquido),
  };
}

// ── Cartão de crédito ───────────────────────────────────────

/**
 * Em qual fatura ("YYYY-MM") a compra entra.
 *
 * `expense_date_mode`:
 *  - "purchase_date": sempre o mês da compra;
 *  - "closing_date":  se passou do fechamento, vai para o mês seguinte.
 *
 * A tela de faturas ignorava `expense_date_mode` e usava só a segunda
 * regra, podendo agrupar em mês diferente do lançamento.
 */
export function calcularMesFatura(data, cartao) {
  const d = paraData(data);
  if (!d || !cartao) return chaveMes(d);

  if (cartao.expense_date_mode === "purchase_date") return chaveMes(d);

  const fechamento = Number(cartao.closing_day);
  if (!fechamento || d.getDate() <= fechamento) return chaveMes(d);

  const proximo = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return chaveMes(proximo);
}

/** Total lançado em uma fatura. */
export function totalDaFatura(transacoes, cartaoId, mesFatura) {
  return paraReais(
    lista(transacoes)
      .filter((t) => t.credit_card_id === cartaoId && t.invoice_month === mesFatura)
      .reduce((acc, t) => acc + paraCentavos(t.amount), 0)
  );
}

// ── Metas ───────────────────────────────────────────────────

/** Início e fim do período de aporte de uma meta de contribuição. */
function periodoDoAporte(meta, hoje = new Date()) {
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const dia = hoje.getDate();

  if (meta.contribution_period === "daily") {
    const inicio = new Date(ano, mes, dia);
    const fim = new Date(ano, mes, dia + 1);
    return { inicio, fim };
  }
  if (meta.contribution_period === "weekly") {
    const inicio = new Date(hoje);
    inicio.setDate(dia - hoje.getDay());
    inicio.setHours(0, 0, 0, 0);
    const fim = new Date(inicio);
    fim.setDate(inicio.getDate() + 7);
    return { inicio, fim };
  }
  if (meta.contribution_period === "yearly") {
    return { inicio: new Date(ano, 0, 1), fim: new Date(ano + 1, 0, 1) };
  }
  return { inicio: new Date(ano, mes, 1), fim: new Date(ano, mes + 1, 1) };
}

/**
 * Progresso de uma meta.
 *
 * Havia duas implementações divergentes — Metas tratava aporte
 * periódico e transferências, Relatórios não — e a mesma meta
 * aparecia com percentuais diferentes nas duas telas.
 *
 * Três casos:
 *  - investimento + aporte periódico → entradas no período corrente;
 *  - investimento + patrimônio       → saldo atual da conta vinculada;
 *  - entrada/saída                   → soma no intervalo da meta.
 */
export function calcularProgressoMeta(meta, transacoes, contas, hoje = new Date()) {
  if (!meta) return 0;
  let atual = 0; // sempre em centavos dentro desta função

  if (meta.type === "investment") {
    if (meta.investment_type === "contribution") {
      const { inicio, fim } = periodoDoAporte(meta, hoje);
      lista(transacoes).forEach((t) => {
        if (!ehRealizada(t)) return;
        const entrouNaConta =
          (t.type === "income" && t.account_id === meta.linked_account_id) ||
          (t.type === "transfer" && t.transfer_account_id === meta.linked_account_id);
        if (!entrouNaConta) return;
        const d = paraData(t.date);
        if (!d || d < inicio || d >= fim) return;
        atual += paraCentavos(t.amount);
      });
      return paraReais(atual);
    }

    const conta = lista(contas).find((c) => c.id === meta.linked_account_id);
    if (conta) {
      const saldos = calcularSaldosPorConta([conta], transacoes);
      return num(saldos[conta.id]);
    }

    // Sem conta vinculada: soma o movimento das contas de investimento no período.
    const investimento = idsInvestimento(contas);
    const inicio = paraData(meta.start_date);
    const fim = paraData(meta.end_date);
    lista(transacoes).forEach((t) => {
      if (!ehRealizada(t)) return;
      const d = paraData(t.date);
      if (!d || !inicio || !fim || d < inicio || d > fim) return;
      if (!investimento.has(t.account_id)) return;
      if (t.type === "income") atual += paraCentavos(t.amount);
      else if (t.type === "expense") atual -= paraCentavos(t.amount);
    });
    return paraReais(atual);
  }

  const inicio = paraData(meta.start_date);
  const fim = paraData(meta.end_date);
  lista(transacoes).forEach((t) => {
    if (!ehRealizada(t)) return;
    if (t.type !== meta.type) return;
    if (meta.category && t.category !== meta.category) return;
    const d = paraData(t.date);
    if (!d || !inicio || !fim || d < inicio || d > fim) return;
    atual += paraCentavos(t.amount);
  });
  return paraReais(atual);
}

/** Percentual concluído de uma meta, limitado a 100. */
export function percentualDaMeta(meta, atual) {
  const alvo = paraCentavos(meta?.target_amount);
  if (alvo <= 0) return 0;
  return Math.min(100, Math.round((paraCentavos(atual) / alvo) * 100));
}

// ── Recorrência ─────────────────────────────────────────────

export const MAX_OCORRENCIAS = 24;
const OCORRENCIAS_SEM_DATA_FIM = 12;

/**
 * Expande um lançamento recorrente nas suas ocorrências.
 *
 * Existiam dois motores de recorrência ativos ao mesmo tempo: este, em
 * JavaScript, usado pela tela de Transações; e um trigger no banco
 * (`trg_generate_recurring`, que grava `recurring_parent_id`) disparado
 * quando a linha entrava com `is_recurring = true` — o caminho da Home.
 * O resultado mudava conforme a tela pela qual o usuário criou a série,
 * e só uma delas suportava "editar todos os seguintes".
 *
 * Agora as duas telas chamam esta função, e as ocorrências entram com
 * `is_recurring: false` para não acordar o trigger antigo.
 */
export function gerarOcorrenciasRecorrentes(dados, groupId) {
  const grupo = groupId ?? (globalThis.crypto?.randomUUID?.() ?? String(Date.now()));
  const base = paraData(dados.date);
  if (!base) return [];

  const fim = dados.recurring_end_date ? paraData(dados.recurring_end_date) : null;
  const frequencia = dados.recurring_frequency || "monthly";
  const diaEscolhido = base.getDate();

  const ocorrencias = [];

  for (let i = 0; i < MAX_OCORRENCIAS; i++) {
    // No mensal, a data é derivada do índice a partir do dia 1 do mês alvo.
    // Avançar somando o dia escolhido transbordaria: new Date(2026, 1, 31)
    // vira 3 de março, e fevereiro seria pulado.
    let data;
    let mes;

    if (frequencia === "monthly") {
      const alvo = new Date(base.getFullYear(), base.getMonth() + i, 1);
      mes = chaveMes(alvo);
      data = dataNoMes(mes, diaEscolhido); // dia 31 vira 28/29/30 conforme o mês
    } else if (frequencia === "weekly") {
      const alvo = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i * 7);
      mes = chaveMes(alvo);
      data = `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, "0")}-${String(alvo.getDate()).padStart(2, "0")}`;
    } else if (frequencia === "yearly") {
      // Regra explícita para 29/02: nos anos não bissextos a ocorrência
      // cai em 28/02, e NÃO em 01/03. É a mesma regra do mensal — o dia
      // é limitado ao último dia do mês de destino — para que a série
      // não escorregue de mês com o tempo.
      mes = `${base.getFullYear() + i}-${String(base.getMonth() + 1).padStart(2, "0")}`;
      data = dataNoMes(mes, diaEscolhido);
    } else {
      // Frequência desconhecida: não inventa série.
      break;
    }

    if (fim && paraData(data) > fim) break;

    ocorrencias.push({
      ...dados,
      date: data,
      is_realized: false,
      is_recurring: false,
      recurring_group_id: grupo,
      recurring_end_date: null,
      recurring_frequency: null,
      recurring_day: null,
      invoice_month: dados.credit_card_id ? mes : (dados.invoice_month ?? null),
    });

    if (!fim && ocorrencias.length >= OCORRENCIAS_SEM_DATA_FIM) break;
  }

  return ocorrencias;
}
