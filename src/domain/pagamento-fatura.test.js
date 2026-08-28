import { describe, it, expect } from "vitest";
import {
  transacoesDoMes, calcularKPIsMes, calcularSaldosPorConta,
  calcularTotaisDeSaldo, gastosPorCategoria, ehPagamentoDeFatura,
} from "./financas";

// ============================================================
// Pagar a fatura não é gastar de novo.
//
// `pagar_fatura` grava o pagamento como uma despesa comum com
// `category = 'faturas'`. Do lado do patrimônio isso está certo: é ali
// que o dinheiro sai da conta. Do lado do fluxo estava errado — a
// compra no cartão JÁ era a despesa, e somar as duas dobrava o gasto
// no mês em que a fatura era paga.
//
// O balanço de massa mediu o furo: R$ 300 de compra mais R$ 300 de
// pagamento davam R$ 600 de saída para uma queda real de R$ 300 no
// patrimônio.
// ============================================================

const CONTAS = [
  { id: "cc", type: "bank", initial_balance: 1000 },
  { id: "cx", type: "investment", initial_balance: 0 },
];

const tx = (o = {}) => ({
  amount: 0, date: "2026-08-15", type: "expense", is_realized: true,
  account_id: "cc", credit_card_id: null, transfer_account_id: null,
  category: "outros", description: "x", ...o,
});

const COMPRA    = tx({ amount: 300, account_id: null, credit_card_id: "k1",
                       category: "compras", date: "2026-08-10" });
const PAGAMENTO = tx({ amount: 300, account_id: "cc", category: "faturas",
                       description: "Pagamento fatura Nubank 2026-08", date: "2026-08-20" });

const kpis = (transacoes) => calcularKPIsMes({
  transacoes, contas: CONTAS, dataReferencia: "2026-08-15",
  saldoEmConta: 1000, hoje: new Date("2026-08-15T12:00:00"),
});

describe("o caso do balanço de massa", () => {
  it("compra 300 + pagamento 300 = 300 de saída, não 600", () => {
    expect(kpis([COMPRA, PAGAMENTO]).saidasRealizadas).toBe(300);
  });

  it("a saída do KPI bate com a queda real do patrimônio", () => {
    const antes  = calcularTotaisDeSaldo(CONTAS, []);
    const depois = calcularTotaisDeSaldo(CONTAS, [COMPRA, PAGAMENTO]);
    const queda = antes.emConta - depois.emConta;
    expect(queda).toBe(300);
    expect(kpis([COMPRA, PAGAMENTO]).saidasRealizadas).toBe(queda);
  });

  it("o resultado do mês não é penalizado duas vezes", () => {
    const comRenda = [tx({ amount: 1000, type: "income", category: "salário" }), COMPRA, PAGAMENTO];
    expect(kpis(comRenda).resultadoDoMes).toBe(700);
  });
});

// ── o que NÃO pode ter mudado ───────────────────────────────
describe("o pagamento continua saindo da conta", () => {
  it("calcularSaldosPorConta debita o pagamento da fatura", () => {
    expect(calcularSaldosPorConta(CONTAS, [PAGAMENTO]).cc).toBe(700);
  });

  it("a compra no cartão continua sem tocar o saldo", () => {
    expect(calcularSaldosPorConta(CONTAS, [COMPRA]).cc).toBe(1000);
  });

  it("compra e pagamento juntos derrubam o saldo uma vez só", () => {
    expect(calcularSaldosPorConta(CONTAS, [COMPRA, PAGAMENTO]).cc).toBe(700);
  });
});

describe("a compra no cartão continua sendo gasto do mês", () => {
  it("sozinha, entra integralmente nas saídas", () => {
    expect(kpis([COMPRA]).saidasRealizadas).toBe(300);
  });

  it("aparece na quebra por categoria; o pagamento não", () => {
    const mapa = gastosPorCategoria([COMPRA, PAGAMENTO], CONTAS, "2026-08-15");
    expect(mapa.compras).toBe(300);
    expect(mapa.faturas).toBeUndefined();
  });
});

describe("o recorte não pegou nada além do alvo", () => {
  it("despesa comum continua entrando", () => {
    expect(kpis([tx({ amount: 50, category: "alimentação" })]).saidasRealizadas).toBe(50);
  });

  it("entrada de categoria parecida continua entrando", () => {
    // O predicado exige type = expense: uma receita nunca é liquidação
    // de fatura, mesmo que alguém grave a categoria assim.
    const estranha = tx({ amount: 80, type: "income", category: "faturas" });
    expect(ehPagamentoDeFatura(estranha)).toBe(false);
    expect(kpis([estranha]).entradasRealizadas).toBe(80);
  });

  it("despesa em conta de investimento continua entrando", () => {
    // A regressão da rodada anterior, protegida aqui de novo.
    expect(kpis([tx({ amount: 354.17, account_id: "cx", category: "impostos" })]).saidasRealizadas)
      .toBe(354.17);
  });

  it("transferência continua fora", () => {
    const t = tx({ amount: 500, type: "transfer", transfer_account_id: "cx" });
    expect(kpis([t]).saidasRealizadas).toBe(0);
    expect(kpis([t]).entradasRealizadas).toBe(0);
  });

  it("transacoesDoMes descarta o pagamento e mantém a compra", () => {
    const lista = transacoesDoMes([COMPRA, PAGAMENTO], CONTAS, "2026-08-15");
    expect(lista).toHaveLength(1);
    expect(lista[0].credit_card_id).toBe("k1");
  });
});

describe("pagamento previsto (fatura ainda não paga)", () => {
  it("não infla as saídas previstas", () => {
    const previsto = { ...PAGAMENTO, is_realized: false };
    expect(kpis([previsto]).saidasPrevistas).toBe(0);
  });
});
