// ============================================================
// Números financeiros para o Finn
//
// Antes daqui o prompt mandava listas e o modelo somava. Ele errava:
// respondeu R$ 3.160 para um gasto real de R$ 3.300 (acertando as
// parcelas e errando o total) e R$ 14.030 para "quanto recebi", somando
// julho com agosto porque as duas listas conviviam no contexto.
//
// A regra agora é: o banco calcula, o modelo lê. Nenhum total que o
// backend consiga produzir deve depender da aritmética do modelo.
//
// As regras espelham `src/domain/financas.js`, que é a fonte da verdade
// do app: soma em centavos inteiros, previstas separadas das
// realizadas, compra no cartão fora do saldo da conta.
// ============================================================

export type Transacao = {
  amount: number | string;
  date: string;
  type: "income" | "expense" | "transfer";
  is_realized?: boolean | null;
  account_id?: string | null;
  credit_card_id?: string | null;
  transfer_account_id?: string | null;
  category?: string | null;
  description?: string | null;
};

// ── dinheiro em centavos ────────────────────────────────────

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};
export const paraCentavos = (v: unknown) => Math.round(num(v) * 100);
export const paraReais = (c: number) => Math.round(num(c)) / 100;

export const ehRealizada = (t: Transacao) => t?.is_realized !== false;
export const ehPrevista = (t: Transacao) => t?.is_realized === false;
export const ehCompraNoCartao = (t: Transacao) =>
  Boolean(t?.credit_card_id) && t?.type === "expense";

// ── datas em horário de Brasília ────────────────────────────

/**
 * Hoje em São Paulo, não em UTC.
 *
 * `new Date().toISOString()` devolve UTC: entre 21h e meia-noite de
 * Brasília o dia já virou lá, e no fim do mês isso jogava a pergunta
 * "quanto gastei este mês" para o mês seguinte.
 */
export function hojeBrasilia(): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()).split("/").reverse().join("-");
}

export const mesDe = (dataISO: string) => String(dataISO).slice(0, 7);

/** Último dia do mês "AAAA-MM", respeitando ano bissexto. */
export function ultimoDiaDoMes(mes: string): number {
  const [ano, m] = mes.split("-").map(Number);
  return new Date(ano, m, 0).getDate();
}

/** Soma meses a "AAAA-MM" (aceita negativo). */
export function somarMeses(mes: string, delta: number): string {
  const [ano, m] = mes.split("-").map(Number);
  const total = ano * 12 + (m - 1) + delta;
  const novoAno = Math.floor(total / 12);
  const novoMes = (total % 12) + 1;
  return `${novoAno}-${String(novoMes).padStart(2, "0")}`;
}

// ── período ─────────────────────────────────────────────────

export type Periodo = { de: string; ate: string; rotulo: string };

export const periodoDoMes = (mes: string): Periodo => ({
  de: `${mes}-01`,
  ate: `${mes}-${String(ultimoDiaDoMes(mes)).padStart(2, "0")}`,
  rotulo: nomeDoMes(mes),
});

const MESES = ["janeiro","fevereiro","março","abril","maio","junho",
               "julho","agosto","setembro","outubro","novembro","dezembro"];

export function nomeDoMes(mes: string): string {
  const [ano, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} de ${ano}`;
}

/**
 * Descobre de que período a pergunta fala.
 *
 * Determinístico de propósito: o modelo interpreta a intenção do texto,
 * mas quem decide as datas é o backend. Deixar o período a cargo do
 * modelo era o que fazia "quanto recebi" somar dois meses.
 *
 * Sem nenhuma pista de tempo, o padrão é o mês corrente — que é o que
 * alguém quer dizer ao perguntar "quanto gastei?".
 */
export function detectarPeriodo(pergunta: string, hoje = hojeBrasilia()): Periodo {
  const t = (pergunta || "").toLowerCase();
  const mesAtual = mesDe(hoje);
  const ano = hoje.slice(0, 4);

  // "em julho", "de dezembro"
  for (let i = 0; i < MESES.length; i++) {
    if (new RegExp(`\\b${MESES[i]}\\b`).test(t)) {
      const mm = String(i + 1).padStart(2, "0");
      // Mês já passado neste ano, ou o mesmo mês do ano anterior.
      const candidato = `${ano}-${mm}`;
      const mes = candidato > mesAtual ? `${Number(ano) - 1}-${mm}` : candidato;
      return periodoDoMes(mes);
    }
  }

  if (/\bano passado\b|\bano anterior\b/.test(t)) {
    const a = Number(ano) - 1;
    return { de: `${a}-01-01`, ate: `${a}-12-31`, rotulo: `${a}` };
  }
  if (/\beste ano\b|\bno ano\b|\bnesse ano\b|\bano atual\b/.test(t)) {
    return { de: `${ano}-01-01`, ate: hoje, rotulo: `${ano} até hoje` };
  }

  const ultimosMeses = t.match(/[úu]ltimos?\s+(\d{1,2})\s+m[eê]s/);
  if (ultimosMeses) {
    const n = Math.min(24, Math.max(1, Number(ultimosMeses[1])));
    const inicio = somarMeses(mesAtual, -(n - 1));
    return { de: `${inicio}-01`, ate: hoje, rotulo: `últimos ${n} meses` };
  }

  const ultimosAnos = t.match(/[úu]ltimos?\s+(\d{1,2})\s+anos?/);
  if (ultimosAnos) {
    const n = Math.min(5, Math.max(1, Number(ultimosAnos[1])));
    const a = Number(ano) - (n - 1);
    return { de: `${a}-01-01`, ate: hoje, rotulo: `últimos ${n} anos` };
  }

  if (/[úu]ltimos?\s+30\s+dias|no[s]?\s+30\s+dias/.test(t)) {
    const d = new Date(`${hoje}T12:00:00`);
    d.setDate(d.getDate() - 29);
    return { de: d.toISOString().slice(0, 10), ate: hoje, rotulo: "últimos 30 dias" };
  }

  if (/\bm[eê]s passado\b|\bm[eê]s anterior\b|\b[úu]ltimo m[eê]s\b/.test(t)) {
    return periodoDoMes(somarMeses(mesAtual, -1));
  }

  if (/\bhoje\b/.test(t)) {
    return { de: hoje, ate: hoje, rotulo: "hoje" };
  }

  if (/\bontem\b/.test(t)) {
    const d = new Date(`${hoje}T12:00:00`);
    d.setDate(d.getDate() - 1);
    const iso = d.toISOString().slice(0, 10);
    return { de: iso, ate: iso, rotulo: "ontem" };
  }

  if (/\besta semana\b|\bnesta semana\b/.test(t)) {
    const d = new Date(`${hoje}T12:00:00`);
    d.setDate(d.getDate() - d.getDay());
    return { de: d.toISOString().slice(0, 10), ate: hoje, rotulo: "esta semana" };
  }

  return periodoDoMes(mesAtual);
}

// ── totais ──────────────────────────────────────────────────

export type Totais = {
  periodo: Periodo;
  entradasRealizadas: number;
  entradasPrevistas: number;
  saidasRealizadas: number;
  saidasPrevistas: number;
  resultado: number;
  porCategoria: Array<{ categoria: string; valor: number }>;
  maiorDespesa: { descricao: string; valor: number; data: string } | null;
  quantidade: number;
};

const dentro = (t: Transacao, p: Periodo) => t.date >= p.de && t.date <= p.ate;

/**
 * Totais de um período. Transferência fica de fora: é movimentação
 * interna, não entrada nem saída. Compra no cartão ENTRA como gasto
 * (foi dinheiro gasto), mesmo não saindo da conta ainda.
 */
export function calcularTotais(transacoes: Transacao[], periodo: Periodo): Totais {
  const doPeriodo = (transacoes || []).filter(
    (t) => t && t.type !== "transfer" && dentro(t, periodo),
  );

  const soma = (itens: Transacao[]) =>
    itens.reduce((acc, t) => acc + paraCentavos(t.amount), 0);

  const entradas = doPeriodo.filter((t) => t.type === "income");
  const saidas = doPeriodo.filter((t) => t.type === "expense");

  const entradasRealizadas = soma(entradas.filter(ehRealizada));
  const entradasPrevistas = soma(entradas.filter(ehPrevista));
  const saidasRealizadas = soma(saidas.filter(ehRealizada));
  const saidasPrevistas = soma(saidas.filter(ehPrevista));

  const porCat: Record<string, number> = {};
  saidas.filter(ehRealizada).forEach((t) => {
    const c = (t.category || "outros").toLowerCase();
    porCat[c] = (porCat[c] || 0) + paraCentavos(t.amount);
  });

  let maior: Totais["maiorDespesa"] = null;
  saidas.filter(ehRealizada).forEach((t) => {
    if (!maior || paraCentavos(t.amount) > paraCentavos(maior.valor)) {
      maior = { descricao: t.description || "sem descrição", valor: paraReais(paraCentavos(t.amount)), data: t.date };
    }
  });

  return {
    periodo,
    entradasRealizadas: paraReais(entradasRealizadas),
    entradasPrevistas: paraReais(entradasPrevistas),
    saidasRealizadas: paraReais(saidasRealizadas),
    saidasPrevistas: paraReais(saidasPrevistas),
    resultado: paraReais(entradasRealizadas - saidasRealizadas),
    porCategoria: Object.entries(porCat)
      .map(([categoria, c]) => ({ categoria, valor: paraReais(c) }))
      .sort((a, b) => b.valor - a.valor),
    maiorDespesa: maior,
    quantidade: doPeriodo.length,
  };
}

/** Saldo por conta — mesma regra do app. */
export function calcularSaldos(
  contas: Array<{ id: string; initial_balance?: number | string; type?: string }>,
  transacoes: Transacao[],
) {
  const centavos: Record<string, number> = {};
  (contas || []).forEach((c) => { centavos[c.id] = paraCentavos(c.initial_balance); });

  (transacoes || []).forEach((t) => {
    if (!ehRealizada(t)) return;
    if (ehCompraNoCartao(t)) return;
    const v = paraCentavos(t.amount);
    if (t.type === "transfer") {
      if (t.account_id) centavos[t.account_id] = (centavos[t.account_id] || 0) - v;
      if (t.transfer_account_id) centavos[t.transfer_account_id] = (centavos[t.transfer_account_id] || 0) + v;
      return;
    }
    if (!t.account_id) return;
    if (t.type === "income") centavos[t.account_id] = (centavos[t.account_id] || 0) + v;
    else if (t.type === "expense") centavos[t.account_id] = (centavos[t.account_id] || 0) - v;
  });

  const comuns = (contas || []).filter((c) => c.type !== "investment");
  const investimentos = (contas || []).filter((c) => c.type === "investment");
  const somar = (itens: typeof comuns) =>
    paraReais(itens.reduce((acc, c) => acc + (centavos[c.id] || 0), 0));

  const saldos: Record<string, number> = {};
  Object.keys(centavos).forEach((id) => { saldos[id] = paraReais(centavos[id]); });

  return { saldos, emConta: somar(comuns), investido: somar(investimentos) };
}
