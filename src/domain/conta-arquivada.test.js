import { describe, it, expect } from "vitest";
import {
  ehContaAtiva, contasAtivas, calcularSaldosPorConta,
  calcularTotaisDeSaldo, calcularKPIsMes,
} from "./financas";

// ============================================================
// Conta arquivada sai das listas, nunca do cálculo.
//
// Excluir conta já custou o histórico uma vez (o FK era CASCADE). A
// troca para SET NULL parou a perda de dados e criou outro problema:
// a conta sumia do patrimônio e os lançamentos dela ficavam no fluxo
// para sempre — o mês anterior deixava de fechar.
//
// Arquivar resolve os dois lados, com UMA condição: nenhum cálculo
// pode filtrar arquivadas. Se alguém filtrar antes de
// `calcularSaldosPorConta`, o patrimônio cai de um mês para o outro
// sem nada ter acontecido. Estes testes existem para impedir isso.
// ============================================================

const ATIVA    = { id: "cc", type: "bank",       initial_balance: 1000, is_active: true };
const ANTIGA   = { id: "vl", type: "bank",       initial_balance: 500,  is_active: false };
const CAIXINHA = { id: "cx", type: "investment", initial_balance: 300,  is_active: true };
const CONTAS   = [ATIVA, ANTIGA, CAIXINHA];

const tx = (o = {}) => ({
  amount: 0, date: "2026-08-15", type: "expense", is_realized: true,
  account_id: "cc", credit_card_id: null, transfer_account_id: null,
  category: "outros", description: "x", ...o,
});

describe("o predicado", () => {
  it("is_active false é arquivada", () => {
    expect(ehContaAtiva(ANTIGA)).toBe(false);
  });

  it("is_active true é ativa", () => {
    expect(ehContaAtiva(ATIVA)).toBe(true);
  });

  it("linha antiga sem o campo é ativa", () => {
    // A coluna nasceu com default true e havia linhas anteriores a ela.
    // Nulo não pode virar "arquivada" e sumir do patrimônio.
    expect(ehContaAtiva({ id: "x", type: "bank" })).toBe(true);
    expect(ehContaAtiva({ id: "x", type: "bank", is_active: null })).toBe(true);
  });

  it("contasAtivas descarta só as arquivadas", () => {
    expect(contasAtivas(CONTAS).map(c => c.id)).toEqual(["cc", "cx"]);
  });

  it("aguenta lista vazia ou nula", () => {
    expect(contasAtivas(null)).toEqual([]);
    expect(contasAtivas([])).toEqual([]);
  });
});

// ── o invariante que não pode quebrar ───────────────────────
describe("arquivada continua no cálculo", () => {
  it("o saldo dela continua sendo calculado", () => {
    const saldos = calcularSaldosPorConta(CONTAS, [tx({ account_id: "vl", amount: 100 })]);
    expect(saldos.vl).toBe(400);
  });

  it("o patrimônio soma a arquivada", () => {
    const { emConta, investido } = calcularTotaisDeSaldo(CONTAS, []);
    expect(emConta).toBe(1500);   // 1000 ativa + 500 arquivada
    expect(investido).toBe(300);
  });

  it("arquivar uma conta não muda o patrimônio", () => {
    // O caso que motivou tudo: encerrar a conta não pode mexer no total.
    const antes  = calcularTotaisDeSaldo(CONTAS, []);
    const depois = calcularTotaisDeSaldo(
      CONTAS.map(c => (c.id === "cc" ? { ...c, is_active: false } : c)),
      [],
    );
    expect(depois.emConta).toBe(antes.emConta);
    expect(depois.investido).toBe(antes.investido);
  });

  it("despesa em conta arquivada continua sendo saída do mês", () => {
    const kpis = calcularKPIsMes({
      transacoes: [tx({ account_id: "vl", amount: 250 })],
      contas: CONTAS, dataReferencia: "2026-08-15",
      saldoEmConta: 1500, hoje: new Date("2026-08-15T12:00:00"),
    });
    expect(kpis.saidasRealizadas).toBe(250);
  });

  it("entrada em conta arquivada continua sendo entrada do mês", () => {
    const kpis = calcularKPIsMes({
      transacoes: [tx({ account_id: "vl", amount: 800, type: "income" })],
      contas: CONTAS, dataReferencia: "2026-08-15",
      saldoEmConta: 1500, hoje: new Date("2026-08-15T12:00:00"),
    });
    expect(kpis.entradasRealizadas).toBe(800);
  });

  it("transferência de/para arquivada continua movendo saldo", () => {
    const saldos = calcularSaldosPorConta(CONTAS, [
      tx({ type: "transfer", account_id: "vl", transfer_account_id: "cc", amount: 200 }),
    ]);
    expect(saldos.vl).toBe(300);
    expect(saldos.cc).toBe(1200);
  });

  it("o mes fechado continua fechando depois do arquivamento", () => {
    // Balanço de massa: patrimônio final - inicial = entradas - saídas,
    // com a conta do meio arquivada.
    const movimentos = [
      tx({ account_id: "vl", amount: 100 }),
      tx({ account_id: "cc", amount: 400, type: "income" }),
    ];
    const inicial = calcularTotaisDeSaldo(CONTAS, []);
    const final   = calcularTotaisDeSaldo(CONTAS, movimentos);
    const delta   = (final.emConta + final.investido) - (inicial.emConta + inicial.investido);
    expect(delta).toBe(300);   // 400 de entrada - 100 de saída
  });
});
