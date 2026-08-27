import { describe, it, expect } from "vitest";
import {
  paraCentavos,
  paraReais,
  calcularSaldosPorConta,
  calcularTotaisDeSaldo,
  calcularKPIsMes,
  calcularSobraDoMes,
  calcularTaxaPoupanca,
  calcularProgressoMeta,
  percentualDaMeta,
  totalDaFatura,
  gastosPorCategoria,
  gerarOcorrenciasRecorrentes,
} from "./financas.js";

// ============================================================
// Dinheiro em centavos inteiros
//
// A 2ª auditoria mostrou que somar reais em ponto flutuante dava
// 0,01 × 10 = 0.09999999999999999. Estes testes existem para que
// isso não volte: todos usam valores com centavos, de propósito.
// ============================================================

const CONTA = { id: "cc", type: "bank", initial_balance: 0 };
const INVEST = { id: "inv", type: "investment", initial_balance: 0 };
const tx = (o) => ({
  type: "expense", amount: 100, date: "2026-08-10",
  is_realized: true, account_id: "cc", ...o,
});

const saldoDe = (transacoes, contas = [CONTA]) =>
  calcularSaldosPorConta(contas, transacoes).cc;

describe("conversão reais ↔ centavos", () => {
  it("converte os valores da auditoria sem perder centavo", () => {
    expect(paraCentavos(0.01)).toBe(1);
    expect(paraCentavos(0.02)).toBe(2);
    expect(paraCentavos(0.10)).toBe(10);
    expect(paraCentavos(999.99)).toBe(99999);
    expect(paraCentavos(1000.01)).toBe(100001);
    expect(paraCentavos(1000000.01)).toBe(100000001);
  });

  it("aceita numeric em string, como o Postgres devolve", () => {
    expect(paraCentavos("1000.01")).toBe(100001);
    expect(paraCentavos("0.07")).toBe(7);
  });

  it("volta para reais sem resíduo", () => {
    expect(paraReais(100001)).toBe(1000.01);
    expect(paraReais(1)).toBe(0.01);
    expect(paraReais(100000001)).toBe(1000000.01);
  });

  it("trata entrada inválida como zero", () => {
    expect(paraCentavos(null)).toBe(0);
    expect(paraCentavos(undefined)).toBe(0);
    expect(paraCentavos("abc")).toBe(0);
    expect(paraCentavos(Infinity)).toBe(0);
    expect(paraCentavos(NaN)).toBe(0);
  });
});

describe("acumulação — os casos que falhavam antes", () => {
  it("0,10 + 0,20 = 0,30", () => {
    expect(saldoDe([
      tx({ type: "income", amount: 0.10 }),
      tx({ type: "income", amount: 0.20 }),
    ])).toBe(0.30);
  });

  it("0,01 somado 10 vezes = 0,10", () => {
    expect(saldoDe(Array.from({ length: 10 }, () => tx({ type: "income", amount: 0.01 }))))
      .toBe(0.10);
  });

  it("0,07 somado 100 vezes = 7,00", () => {
    expect(saldoDe(Array.from({ length: 100 }, () => tx({ type: "income", amount: 0.07 }))))
      .toBe(7);
  });

  it("0,02 somado 50 vezes = 1,00", () => {
    expect(saldoDe(Array.from({ length: 50 }, () => tx({ type: "income", amount: 0.02 }))))
      .toBe(1);
  });

  it("999,99 × 3 = 2.999,97", () => {
    expect(saldoDe(Array.from({ length: 3 }, () => tx({ type: "income", amount: 999.99 }))))
      .toBe(2999.97);
  });

  it("1.000.000,01 − 0,01 = 1.000.000,00", () => {
    expect(calcularSaldosPorConta(
      [{ ...CONTA, initial_balance: 1000000.01 }],
      [tx({ amount: 0.01 })],
    ).cc).toBe(1000000);
  });

  it("saldo volta exatamente a zero", () => {
    expect(saldoDe([
      tx({ type: "income", amount: 0.10 }),
      tx({ type: "income", amount: 0.20 }),
      tx({ type: "expense", amount: 0.30 }),
    ])).toBe(0);
  });

  it("mil lançamentos de 0,01 dão exatamente 10,00", () => {
    expect(saldoDe(Array.from({ length: 1000 }, () => tx({ type: "income", amount: 0.01 }))))
      .toBe(10);
  });
});

describe("valores limite", () => {
  it("valor zero não altera o saldo", () => {
    expect(saldoDe([tx({ type: "income", amount: 0 })])).toBe(0);
  });

  it("valor negativo é aceito pelo módulo — o banco é quem barra", () => {
    // A constraint CHECK (amount > 0) impede que isso chegue ao banco.
    // Aqui só se documenta que o módulo não inverte o sinal sozinho.
    expect(saldoDe([tx({ type: "expense", amount: -50 })])).toBe(50);
  });

  it("valor muito grande não perde precisão de centavo", () => {
    expect(saldoDe([tx({ type: "income", amount: 90071992547.40 })]))
      .toBe(90071992547.40);
  });
});

describe("KPIs com centavos", () => {
  const transacoes = [
    tx({ type: "income", amount: 3333.33 }),
    tx({ type: "income", amount: 3333.33 }),
    tx({ type: "income", amount: 3333.34 }),
    tx({ type: "expense", amount: 0.01, is_realized: false }),
  ];

  it("três parcelas quebradas somam o total redondo", () => {
    const k = calcularKPIsMes({
      transacoes, contas: [CONTA], dataReferencia: "2026-08-15",
      saldoEmConta: 0, hoje: new Date("2026-08-15T12:00:00"),
    });
    expect(k.entradas).toBe(10000);
    expect(k.saidas).toBe(0.01);
    expect(k.resultadoDoMes).toBe(10000);
  });

  it("projeção do mês corrente acerta o centavo", () => {
    const k = calcularKPIsMes({
      transacoes, contas: [CONTA], dataReferencia: "2026-08-15",
      saldoEmConta: 1000.01, hoje: new Date("2026-08-15T12:00:00"),
    });
    expect(k.projecaoFinal).toBe(1000.00);
  });

  it("não quebra com contas null (bug 6.1)", () => {
    expect(() => calcularKPIsMes({
      transacoes: null, contas: null, dataReferencia: "2026-08-15", saldoEmConta: 0,
    })).not.toThrow();
    const k = calcularKPIsMes({ transacoes: null, contas: null, dataReferencia: "2026-08-15", saldoEmConta: 0 });
    expect(k.entradas).toBe(0);
  });

  it("não quebra sem argumento algum", () => {
    expect(() => calcularKPIsMes()).not.toThrow();
  });
});

describe("saldos e listas nulas", () => {
  it("calcularSaldosPorConta aceita null", () => {
    expect(() => calcularSaldosPorConta(null, null)).not.toThrow();
  });

  it("calcularTotaisDeSaldo aceita null", () => {
    const t = calcularTotaisDeSaldo(null, null);
    expect(t.emConta).toBe(0);
    expect(t.investido).toBe(0);
  });

  it("gastosPorCategoria aceita null", () => {
    expect(gastosPorCategoria(null, null, "2026-08-15")).toEqual({});
  });

  it("totalDaFatura aceita null", () => {
    expect(totalDaFatura(null, "x", "2026-08")).toBe(0);
  });
});

describe("percentuais e divisões", () => {
  it("sobra do mês com centavos", () => {
    expect(calcularSobraDoMes({ entradas: 1000.00, saidas: 999.99 })).toBeCloseTo(0.001, 4);
  });

  it("sobra do mês com entradas zero não divide por zero", () => {
    expect(calcularSobraDoMes({ entradas: 0, saidas: 500 })).toBe(0);
  });

  it("sobra do mês sem argumento", () => {
    expect(calcularSobraDoMes()).toBe(0);
  });

  it("gasto maior que a entrada dá sobra negativa", () => {
    expect(calcularSobraDoMes({ entradas: 100, saidas: 150 })).toBe(-50);
  });

  it("taxa de poupança com valores quebrados", () => {
    const r = calcularTaxaPoupanca({
      transacoes: [
        tx({ type: "income", amount: 3333.33, account_id: "cc" }),
        tx({ type: "transfer", amount: 333.33, account_id: "cc", transfer_account_id: "inv" }),
      ],
      contas: [CONTA, INVEST],
      dataReferencia: "2026-08-15",
    });
    expect(r.aporteLiquido).toBe(333.33);
    expect(r.taxa).toBe(10);
  });

  it("taxa de poupança sem dados", () => {
    expect(calcularTaxaPoupanca().taxa).toBe(0);
  });

  it("percentual da meta com centavos", () => {
    expect(percentualDaMeta({ target_amount: 1000.00 }, 999.99)).toBe(100);
    expect(percentualDaMeta({ target_amount: 1000.00 }, 500.00)).toBe(50);
    expect(percentualDaMeta({ target_amount: 0 }, 100)).toBe(0);
  });

  it("meta concluída compara sem erro de arredondamento", () => {
    const meta = {
      type: "expense", category: "alimentação", target_amount: 0.30,
      start_date: "2026-08-01", end_date: "2026-08-31",
    };
    const atual = calcularProgressoMeta(meta, [
      tx({ category: "alimentação", amount: 0.10 }),
      tx({ category: "alimentação", amount: 0.20 }),
    ], [CONTA]);
    expect(atual).toBe(0.30);
    expect(atual >= meta.target_amount).toBe(true);
  });

  it("calcularProgressoMeta aceita listas nulas", () => {
    expect(() => calcularProgressoMeta({ type: "expense" }, null, null)).not.toThrow();
  });
});

describe("recorrência anual em 29/02 — regra explícita", () => {
  const anual = (data) => gerarOcorrenciasRecorrentes({
    description: "Seguro", amount: 100, type: "expense", account_id: "cc",
    date: data, recurring_frequency: "yearly",
  }, "g").map((o) => o.date);

  it("cai em 28/02 nos anos não bissextos, nunca em 01/03", () => {
    const datas = anual("2028-02-29");
    expect(datas[0]).toBe("2028-02-29");
    expect(datas[1]).toBe("2029-02-28");
    expect(datas[2]).toBe("2030-02-28");
    expect(datas.some((d) => d.endsWith("-03-01"))).toBe(false);
  });

  it("volta a 29/02 no próximo bissexto", () => {
    expect(anual("2028-02-29")[4]).toBe("2032-02-29");
  });

  it("dia 31 anual permanece dia 31", () => {
    expect(anual("2026-01-31")[1]).toBe("2027-01-31");
  });
});

describe("recorrência com frequência inválida", () => {
  it("não inventa série", () => {
    const r = gerarOcorrenciasRecorrentes({
      description: "X", amount: 10, type: "expense", account_id: "cc",
      date: "2026-01-15", recurring_frequency: "quinzenal",
    }, "g");
    expect(r).toHaveLength(0);
  });
});

describe("recorrência não duplica datas", () => {
  it("gerar duas vezes o mesmo pedido produz as mesmas datas", () => {
    const pedido = {
      description: "Aluguel", amount: 1500.55, type: "expense", account_id: "cc",
      date: "2026-01-31", recurring_frequency: "monthly",
    };
    const a = gerarOcorrenciasRecorrentes(pedido, "grupo-1").map((o) => o.date);
    const b = gerarOcorrenciasRecorrentes(pedido, "grupo-2").map((o) => o.date);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });
});
