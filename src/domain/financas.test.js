import { describe, it, expect } from "vitest";
import {
  calcularSaldosPorConta,
  calcularTotaisDeSaldo,
  calcularKPIsMes,
  calcularMesFatura,
  calcularProgressoMeta,
  calcularSobraDoMes,
  calcularTaxaPoupanca,
  dataNoMes,
  ehRealizada,
  transacoesDoMes,
  gerarOcorrenciasRecorrentes,
} from "./financas.js";

// Contas usadas nos cenários
const CONTA_CORRENTE = { id: "cc", name: "Nubank", type: "bank", initial_balance: 1000 };
const CARTEIRA       = { id: "ct", name: "Carteira", type: "wallet", initial_balance: 100 };
const INVESTIMENTO   = { id: "inv", name: "Reserva", type: "investment", initial_balance: 5000 };
const CONTAS = [CONTA_CORRENTE, CARTEIRA, INVESTIMENTO];

const tx = (over) => ({
  id: Math.random().toString(36).slice(2),
  type: "expense",
  amount: 100,
  date: "2026-08-10",
  is_realized: true,
  account_id: "cc",
  ...over,
});

describe("ehRealizada", () => {
  it("trata is_realized nulo como realizada (o DEFAULT da coluna é true)", () => {
    expect(ehRealizada({ is_realized: null })).toBe(true);
    expect(ehRealizada({})).toBe(true);
    expect(ehRealizada({ is_realized: false })).toBe(false);
  });
});

describe("calcularSaldosPorConta", () => {
  it("soma entradas e subtrai saídas realizadas", () => {
    const saldos = calcularSaldosPorConta(CONTAS, [
      tx({ type: "income", amount: 500 }),
      tx({ type: "expense", amount: 200 }),
    ]);
    expect(saldos.cc).toBe(1300);
  });

  it("ignora transações previstas", () => {
    const saldos = calcularSaldosPorConta(CONTAS, [
      tx({ type: "expense", amount: 999, is_realized: false }),
    ]);
    expect(saldos.cc).toBe(1000);
  });

  it("não desconta compra no cartão do saldo da conta", () => {
    const saldos = calcularSaldosPorConta(CONTAS, [
      tx({ type: "expense", amount: 800, credit_card_id: "cartao1", account_id: null }),
    ]);
    expect(saldos.cc).toBe(1000);
  });

  it("desconta o pagamento da fatura, que é uma despesa comum", () => {
    const saldos = calcularSaldosPorConta(CONTAS, [
      tx({ type: "expense", amount: 800, description: "Pagamento fatura" }),
    ]);
    expect(saldos.cc).toBe(200);
  });

  it("move o valor da origem para o destino na transferência", () => {
    const saldos = calcularSaldosPorConta(CONTAS, [
      tx({ type: "transfer", amount: 300, account_id: "cc", transfer_account_id: "inv" }),
    ]);
    expect(saldos.cc).toBe(700);
    expect(saldos.inv).toBe(5300);
  });

  it("aceita numeric vindo como string do Postgres", () => {
    const saldos = calcularSaldosPorConta(CONTAS, [
      tx({ type: "income", amount: "250.50" }),
    ]);
    expect(saldos.cc).toBe(1250.5);
  });
});

describe("calcularTotaisDeSaldo", () => {
  it("separa saldo em conta de valor investido", () => {
    const totais = calcularTotaisDeSaldo(CONTAS, []);
    expect(totais.emConta).toBe(1100);   // corrente + carteira
    expect(totais.investido).toBe(5000); // não entra no saldo em conta
  });
});

describe("transacoesDoMes", () => {
  it("exclui transferências e contas de investimento", () => {
    const lista = transacoesDoMes(
      [
        tx({ type: "income", amount: 100 }),
        tx({ type: "transfer", amount: 100, transfer_account_id: "inv" }),
        tx({ type: "expense", amount: 100, account_id: "inv" }),
      ],
      CONTAS,
      "2026-08-15"
    );
    expect(lista).toHaveLength(1);
  });

  it("inclui despesa sem conta vinculada", () => {
    const lista = transacoesDoMes([tx({ account_id: null })], CONTAS, "2026-08-15");
    expect(lista).toHaveLength(1);
  });

  it("respeita o mês de referência", () => {
    const lista = transacoesDoMes([tx({ date: "2026-07-31" })], CONTAS, "2026-08-15");
    expect(lista).toHaveLength(0);
  });
});

describe("calcularKPIsMes", () => {
  const transacoes = [
    tx({ type: "income", amount: 5000 }),
    tx({ type: "expense", amount: 1200 }),
    tx({ type: "expense", amount: 800, is_realized: false }),
    tx({ type: "income", amount: 300, is_realized: false }),
  ];

  it("soma realizadas e previstas em entradas e saídas", () => {
    const k = calcularKPIsMes({
      transacoes, contas: CONTAS, dataReferencia: "2026-08-15",
      saldoEmConta: 1100, hoje: new Date("2026-08-15T12:00:00"),
    });
    expect(k.entradas).toBe(5300);
    expect(k.saidas).toBe(2000);
  });

  it("resultado do mês usa apenas realizadas", () => {
    const k = calcularKPIsMes({
      transacoes, contas: CONTAS, dataReferencia: "2026-08-15",
      saldoEmConta: 1100, hoje: new Date("2026-08-15T12:00:00"),
    });
    expect(k.resultadoDoMes).toBe(3800);
  });

  it("no mês corrente a projeção parte do saldo real de hoje", () => {
    const k = calcularKPIsMes({
      transacoes, contas: CONTAS, dataReferencia: "2026-08-15",
      saldoEmConta: 1100, hoje: new Date("2026-08-15T12:00:00"),
    });
    // 1100 + 300 previstas - 800 previstas
    expect(k.projecaoFinal).toBe(600);
    expect(k.ehMesCorrente).toBe(true);
  });

  it("em outro mês a projeção é o líquido do próprio mês", () => {
    const k = calcularKPIsMes({
      transacoes, contas: CONTAS, dataReferencia: "2026-08-15",
      saldoEmConta: 1100, hoje: new Date("2026-12-01T12:00:00"),
    });
    expect(k.projecaoFinal).toBe(3300); // 5300 - 2000
    expect(k.ehMesCorrente).toBe(false);
  });
});

describe("calcularMesFatura", () => {
  const cartaoFechamento = { closing_day: 20, expense_date_mode: "closing_date" };
  const cartaoDataCompra = { closing_day: 20, expense_date_mode: "purchase_date" };

  it("antes do fechamento entra na fatura do próprio mês", () => {
    expect(calcularMesFatura("2026-08-10", cartaoFechamento)).toBe("2026-08");
  });

  it("depois do fechamento vai para a fatura seguinte", () => {
    expect(calcularMesFatura("2026-08-25", cartaoFechamento)).toBe("2026-09");
  });

  it("vira o ano corretamente", () => {
    expect(calcularMesFatura("2026-12-25", cartaoFechamento)).toBe("2027-01");
  });

  it("no modo data da compra ignora o fechamento", () => {
    expect(calcularMesFatura("2026-08-25", cartaoDataCompra)).toBe("2026-08");
  });
});

describe("dataNoMes", () => {
  it("limita o dia 31 ao último dia de fevereiro", () => {
    expect(dataNoMes("2026-02", 31)).toBe("2026-02-28");
  });

  it("respeita ano bissexto", () => {
    expect(dataNoMes("2028-02", 31)).toBe("2028-02-29");
  });

  it("mantém o dia quando ele existe no mês", () => {
    expect(dataNoMes("2026-03", 15)).toBe("2026-03-15");
  });
});

describe("calcularProgressoMeta", () => {
  it("meta de gasto soma as despesas da categoria no período", () => {
    const meta = {
      type: "expense", category: "alimentação", target_amount: 1000,
      start_date: "2026-08-01", end_date: "2026-08-31",
    };
    const atual = calcularProgressoMeta(meta, [
      tx({ category: "alimentação", amount: 300 }),
      tx({ category: "transporte", amount: 500 }),
      tx({ category: "alimentação", amount: 200, date: "2026-09-05" }),
    ], CONTAS);
    expect(atual).toBe(300);
  });

  it("meta de patrimônio usa o saldo atual da conta vinculada", () => {
    const meta = {
      type: "investment", investment_type: "accumulate",
      linked_account_id: "inv", target_amount: 10000,
      start_date: "2026-01-01", end_date: "2026-12-31",
    };
    const atual = calcularProgressoMeta(meta, [
      tx({ type: "transfer", amount: 1000, account_id: "cc", transfer_account_id: "inv" }),
    ], CONTAS);
    expect(atual).toBe(6000); // 5000 inicial + 1000 transferido
  });

  it("meta de aporte conta transferências recebidas no período corrente", () => {
    const meta = {
      type: "investment", investment_type: "contribution",
      contribution_period: "monthly", linked_account_id: "inv", target_amount: 500,
      start_date: "2026-01-01", end_date: "2026-12-31",
    };
    const atual = calcularProgressoMeta(meta, [
      tx({ type: "transfer", amount: 400, account_id: "cc", transfer_account_id: "inv", date: "2026-08-05" }),
      tx({ type: "transfer", amount: 900, account_id: "cc", transfer_account_id: "inv", date: "2026-07-05" }),
    ], CONTAS, new Date("2026-08-15T12:00:00"));
    expect(atual).toBe(400);
  });
});

describe("indicadores", () => {
  it("sobra do mês é a fração das entradas que não foi gasta", () => {
    expect(calcularSobraDoMes({ entradas: 5000, saidas: 4000 })).toBe(20);
  });

  it("sobra do mês é zero quando não houve entrada", () => {
    expect(calcularSobraDoMes({ entradas: 0, saidas: 100 })).toBe(0);
  });

  it("taxa de poupança olha o aporte líquido em investimento, não a sobra", () => {
    const r = calcularTaxaPoupanca({
      transacoes: [
        tx({ type: "income", amount: 5000, account_id: "cc" }),
        tx({ type: "transfer", amount: 500, account_id: "cc", transfer_account_id: "inv" }),
      ],
      contas: CONTAS,
      dataReferencia: "2026-08-15",
    });
    expect(r.taxa).toBe(10);
    expect(r.aporteLiquido).toBe(500);
  });

  it("saque de investimento reduz o aporte líquido", () => {
    const r = calcularTaxaPoupanca({
      transacoes: [
        tx({ type: "income", amount: 5000, account_id: "cc" }),
        tx({ type: "transfer", amount: 500, account_id: "cc", transfer_account_id: "inv" }),
        tx({ type: "transfer", amount: 200, account_id: "inv", transfer_account_id: "cc" }),
      ],
      contas: CONTAS,
      dataReferencia: "2026-08-15",
    });
    expect(r.aporteLiquido).toBe(300);
  });
});

describe("gerarOcorrenciasRecorrentes", () => {
  const base = {
    description: "Aluguel", amount: 1500, type: "expense",
    category: "moradia", account_id: "cc", date: "2026-01-31",
    is_recurring: true, recurring_frequency: "monthly",
  };

  it("gera 12 ocorrências quando não há data de fim", () => {
    const lista = gerarOcorrenciasRecorrentes(base, "grupo-1");
    expect(lista).toHaveLength(12);
  });

  it("respeita a data de fim", () => {
    const lista = gerarOcorrenciasRecorrentes(
      { ...base, date: "2026-01-10", recurring_end_date: "2026-04-30" }, "grupo-2");
    expect(lista).toHaveLength(4);
  });

  it("ajusta o dia 31 aos meses mais curtos", () => {
    const datas = gerarOcorrenciasRecorrentes(base, "grupo-3").map((o) => o.date);
    expect(datas[0]).toBe("2026-01-31");
    expect(datas[1]).toBe("2026-02-28");
    expect(datas[3]).toBe("2026-04-30");
  });

  it("todas as ocorrências entram previstas, agrupadas e sem acordar o trigger antigo", () => {
    const lista = gerarOcorrenciasRecorrentes(base, "grupo-4");
    expect(lista.every((o) => o.is_realized === false)).toBe(true);
    expect(lista.every((o) => o.is_recurring === false)).toBe(true);
    expect(lista.every((o) => o.recurring_group_id === "grupo-4")).toBe(true);
  });

  it("frequência semanal avança de 7 em 7 dias", () => {
    const lista = gerarOcorrenciasRecorrentes(
      { ...base, date: "2026-03-02", recurring_frequency: "weekly" }, "grupo-5");
    expect(lista[1].date).toBe("2026-03-09");
    expect(lista[2].date).toBe("2026-03-16");
  });

  it("compra no cartão recebe o invoice_month de cada ocorrência", () => {
    const lista = gerarOcorrenciasRecorrentes(
      { ...base, date: "2026-01-10", credit_card_id: "cartao1", account_id: null }, "grupo-6");
    expect(lista[0].invoice_month).toBe("2026-01");
    expect(lista[1].invoice_month).toBe("2026-02");
  });
});
