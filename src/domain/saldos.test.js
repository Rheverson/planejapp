import { describe, it, expect } from "vitest";
import { calcularSaldosPorConta, calcularTotaisDeSaldo } from "./financas";

// ============================================================
// Saldo por conta — a regra que a Carteira reimplementava à mão.
//
// A cópia em Accounts.jsx divergia em dois pontos: descontava compra no
// cartão do saldo da conta e somava em float. Enquanto ninguém lançou
// cartão e conta na mesma transação, as duas versões coincidiram por
// acaso — e o dia em que alguém lançasse, Carteira e Home mostrariam
// números diferentes.
//
// Estes testes fixam o comportamento para que a reimplementação não
// volte por descuido.
// ============================================================

const conta   = (id, saldo = 0, type = "bank") => ({ id, initial_balance: saldo, type });
const tx = (over = {}) => ({
  amount: 0, type: "expense", is_realized: true,
  account_id: null, credit_card_id: null, transfer_account_id: null,
  ...over,
});

describe("saldo por conta", () => {
  it("conta sem transação fica com o saldo inicial", () => {
    expect(calcularSaldosPorConta([conta("a", 100)], [])).toEqual({ a: 100 });
  });

  it("receita soma e despesa subtrai", () => {
    const saldos = calcularSaldosPorConta([conta("a", 100)], [
      tx({ account_id: "a", type: "income", amount: 50 }),
      tx({ account_id: "a", type: "expense", amount: 30 }),
    ]);
    expect(saldos.a).toBe(120);
  });

  it("prevista não entra no saldo", () => {
    const saldos = calcularSaldosPorConta([conta("a", 100)], [
      tx({ account_id: "a", type: "expense", amount: 40, is_realized: false }),
    ]);
    expect(saldos.a).toBe(100);
  });

  // O ponto exato em que a cópia da Carteira divergia.
  it("compra no cartão NÃO desconta do saldo da conta", () => {
    const saldos = calcularSaldosPorConta([conta("a", 1000)], [
      tx({ account_id: "a", credit_card_id: "cartao1", type: "expense", amount: 250 }),
    ]);
    expect(saldos.a).toBe(1000);
  });

  it("pagamento da fatura (sem cartão vinculado) desconta normalmente", () => {
    const saldos = calcularSaldosPorConta([conta("a", 1000)], [
      tx({ account_id: "a", type: "expense", amount: 250, category: "faturas" }),
    ]);
    expect(saldos.a).toBe(750);
  });

  it("conta e cartão na mesma transação: só o cartão manda", () => {
    const saldos = calcularSaldosPorConta([conta("a", 500), conta("b", 500)], [
      tx({ account_id: "a", credit_card_id: "c1", type: "expense", amount: 100 }),
      tx({ account_id: "b", type: "expense", amount: 100 }),
    ]);
    expect(saldos.a).toBe(500);
    expect(saldos.b).toBe(400);
  });

  it("transferência sai da origem e entra no destino", () => {
    const saldos = calcularSaldosPorConta([conta("a", 300), conta("b", 100)], [
      tx({ account_id: "a", transfer_account_id: "b", type: "transfer", amount: 120 }),
    ]);
    expect(saldos.a).toBe(180);
    expect(saldos.b).toBe(220);
  });

  // Depois de excluir uma conta, o FK deixa account_id nulo.
  it("transação sem conta não altera saldo de ninguém", () => {
    const saldos = calcularSaldosPorConta([conta("a", 100)], [
      tx({ account_id: null, type: "expense", amount: 70 }),
    ]);
    expect(saldos.a).toBe(100);
  });

  it("transação apontando para conta que não existe mais é ignorada no total", () => {
    const { emConta } = calcularTotaisDeSaldo([conta("a", 100)], [
      tx({ account_id: "conta-excluida", type: "expense", amount: 50 }),
    ]);
    expect(emConta).toBe(100);
  });

  it("saldo pode ficar negativo", () => {
    const saldos = calcularSaldosPorConta([conta("a", 10)], [
      tx({ account_id: "a", type: "expense", amount: 90 }),
    ]);
    expect(saldos.a).toBe(-80);
  });

  it("centavos não acumulam erro de ponto flutuante", () => {
    // 0.1 + 0.2 em float dá 0.30000000000000004.
    const saldos = calcularSaldosPorConta([conta("a", 0)], [
      tx({ account_id: "a", type: "income", amount: 0.1 }),
      tx({ account_id: "a", type: "income", amount: 0.2 }),
    ]);
    expect(saldos.a).toBe(0.3);
  });

  it("cem lançamentos de centavo somam exatamente um real", () => {
    const cem = Array.from({ length: 100 }, () =>
      tx({ account_id: "a", type: "income", amount: 0.01 }));
    expect(calcularSaldosPorConta([conta("a", 0)], cem).a).toBe(1);
  });
});

describe("totais: conta comum x investimento", () => {
  const contas = [conta("a", 1000), conta("inv", 5000, "investment")];

  it("separa investimento do saldo em conta", () => {
    const { emConta, investido } = calcularTotaisDeSaldo(contas, []);
    expect(emConta).toBe(1000);
    expect(investido).toBe(5000);
  });

  it("aporte move o valor de uma coluna para a outra", () => {
    const { emConta, investido } = calcularTotaisDeSaldo(contas, [
      tx({ account_id: "a", transfer_account_id: "inv", type: "transfer", amount: 200 }),
    ]);
    expect(emConta).toBe(800);
    expect(investido).toBe(5200);
  });

  it("soma dos totais em centavos, sem resíduo", () => {
    const { emConta } = calcularTotaisDeSaldo(
      [conta("a", 0.1), conta("b", 0.2)],
      [],
    );
    expect(emConta).toBe(0.3);
  });
});
