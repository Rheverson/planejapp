import { describe, it, expect } from "vitest";
import {
  transacoesDoMes, calcularKPIsMes, calcularSaldosPorConta,
  calcularTotaisDeSaldo, calcularTaxaPoupanca, ehRealizada,
} from "./financas";

// ============================================================
// Despesa paga de conta de investimento é despesa.
//
// `transacoesDoMes` descartava tudo que passasse por conta de
// investimento, com a justificativa de que "é poupança, não gasto". A
// intenção era não contar aporte — mas aporte é `transfer`, já excluído
// pela outra condição. O filtro apagava o que não previa: uma despesa
// real paga com o dinheiro da caixinha.
//
// O caso que revelou: "Imposto de Renda" R$ 354,17 debitado de Caixinhas
// (type = investment). O Finn somava R$ 6.304,29; a Home, R$ 5.950,12.
// Diferença exata: R$ 354,17.
//
// Conta de investimento diz ONDE o dinheiro está, não O QUE foi feito
// com ele.
// ============================================================

const CONTAS = [
  { id: "cc", type: "bank",       initial_balance: 0 },
  { id: "cx", type: "investment", initial_balance: 0 }, // caixinha
  { id: "ci", type: "investment", initial_balance: 0 }, // investimento
];

const tx = (o = {}) => ({
  amount: 0, date: "2026-08-15", type: "expense", is_realized: true,
  account_id: "cc", credit_card_id: null, transfer_account_id: null,
  category: "outros", description: "x", ...o,
});

const somaDoMes = (lista, tipo) =>
  transacoesDoMes(lista, CONTAS, "2026-08-15")
    .filter(ehRealizada)
    .filter((t) => t.type === tipo)
    .reduce((s, t) => s + t.amount, 0);

describe("os seis casos obrigatórios", () => {
  it("A) conta corrente, despesa R$ 100 → saída 100", () => {
    expect(somaDoMes([tx({ account_id: "cc", amount: 100 })], "expense")).toBe(100);
  });

  it("B) conta investment, despesa R$ 200 → saída 200", () => {
    expect(somaDoMes([tx({ account_id: "cx", amount: 200 })], "expense")).toBe(200);
  });

  it("C) conta investment, receita R$ 300 → entrada 300", () => {
    expect(somaDoMes([tx({ account_id: "cx", amount: 300, type: "income" })], "income")).toBe(300);
  });

  it("D) transferência conta corrente → investment: não é saída nem entrada", () => {
    const t = [tx({ account_id: "cc", transfer_account_id: "cx", amount: 500, type: "transfer" })];
    expect(somaDoMes(t, "expense")).toBe(0);
    expect(somaDoMes(t, "income")).toBe(0);
  });

  it("E) transferência investment → conta corrente: não é saída nem entrada", () => {
    const t = [tx({ account_id: "cx", transfer_account_id: "cc", amount: 500, type: "transfer" })];
    expect(somaDoMes(t, "expense")).toBe(0);
    expect(somaDoMes(t, "income")).toBe(0);
  });

  it("F) investment, despesa R$ 354,17 categoria impostos → entra integralmente", () => {
    const t = [tx({ account_id: "cx", amount: 354.17, category: "impostos", description: "Imposto de Renda" })];
    expect(somaDoMes(t, "expense")).toBe(354.17);
  });
});

describe("cenário completo do produto", () => {
  // 100 + 200 + 300 de despesa, 500 de transferência, 1.000 de receita.
  const CENARIO = [
    tx({ account_id: "cc", amount: 100 }),
    tx({ account_id: "cx", amount: 200 }),
    tx({ account_id: "ci", amount: 300 }),
    tx({ account_id: "cx", transfer_account_id: "cc", amount: 500, type: "transfer" }),
    tx({ account_id: "cc", amount: 1000, type: "income" }),
  ];

  it("gastos são 600, não 100", () => {
    expect(somaDoMes(CENARIO, "expense")).toBe(600);
  });

  it("receitas são 1.000", () => {
    expect(somaDoMes(CENARIO, "income")).toBe(1000);
  });

  it("resultado é 400", () => {
    const kpis = calcularKPIsMes({
      transacoes: CENARIO, contas: CONTAS,
      dataReferencia: "2026-08-15", saldoEmConta: 0, hoje: new Date("2026-08-15T12:00:00"),
    });
    expect(kpis.saidasRealizadas).toBe(600);
    expect(kpis.entradasRealizadas).toBe(1000);
    expect(kpis.resultadoDoMes).toBe(400);
  });
});

describe("despesa na caixinha x transferência da caixinha", () => {
  const IR = tx({ account_id: "cx", amount: 354.17, category: "impostos" });
  const RESGATE = tx({ account_id: "cx", transfer_account_id: "cc", amount: 354.17, type: "transfer" });

  it("Caixinha → Imposto de Renda AUMENTA os gastos", () => {
    const semIR = somaDoMes([tx({ account_id: "cc", amount: 100 })], "expense");
    const comIR = somaDoMes([tx({ account_id: "cc", amount: 100 }), IR], "expense");
    expect(comIR - semIR).toBe(354.17);
  });

  it("Caixinha → Conta corrente NÃO aumenta os gastos", () => {
    const sem = somaDoMes([tx({ account_id: "cc", amount: 100 })], "expense");
    const com = somaDoMes([tx({ account_id: "cc", amount: 100 }), RESGATE], "expense");
    expect(com).toBe(sem);
  });
});

describe("o caso real de produção", () => {
  it("5.950,12 + 354,17 = 6.304,29", () => {
    const anteriores = tx({ account_id: "cc", amount: 5950.12 });
    const imposto = tx({ account_id: "cx", amount: 354.17, category: "impostos",
                        description: "Imposto de Renda " });
    expect(somaDoMes([anteriores, imposto], "expense")).toBe(6304.29);
  });
});

// ── o que NÃO pode ter mudado ───────────────────────────────
describe("regras patrimoniais seguem intactas", () => {
  const CONTAS_COM_SALDO = [
    { id: "cc", type: "bank",       initial_balance: 10000 },
    { id: "cx", type: "investment", initial_balance: 5000 },
  ];

  it("saldo separa conta comum de investimento", () => {
    const t = [tx({ account_id: "cx", amount: 354.17, category: "impostos" })];
    const { emConta, investido } = calcularTotaisDeSaldo(CONTAS_COM_SALDO, t);
    expect(emConta).toBe(10000);
    // a despesa saiu do dinheiro que estava na caixinha
    expect(investido).toBe(5000 - 354.17);
  });

  it("transferência move entre as duas colunas", () => {
    const t = [tx({ account_id: "cc", transfer_account_id: "cx", amount: 1000, type: "transfer" })];
    const { emConta, investido } = calcularTotaisDeSaldo(CONTAS_COM_SALDO, t);
    expect(emConta).toBe(9000);
    expect(investido).toBe(6000);
  });

  it("taxa de poupança continua medindo aporte, não gasto", () => {
    // Despesa na caixinha não é aporte: não pode inflar a poupança.
    const { taxa, aporteLiquido } = calcularTaxaPoupanca({
      transacoes: [
        tx({ account_id: "cc", amount: 1000, type: "income" }),
        tx({ account_id: "cx", amount: 354.17, category: "impostos" }),
      ],
      contas: CONTAS_COM_SALDO,
      dataReferencia: "2026-08-15",
    });
    // Uma despesa PAGA da caixinha é saque, não aporte.
    expect(aporteLiquido).toBeLessThanOrEqual(0);
    expect(taxa).toBeLessThanOrEqual(0);
  });

  it("aporte de verdade conta como poupança", () => {
    const { taxa, aporteLiquido, renda } = calcularTaxaPoupanca({
      transacoes: [
        tx({ account_id: "cc", amount: 1000, type: "income" }),
        tx({ account_id: "cc", transfer_account_id: "cx", amount: 200, type: "transfer" }),
      ],
      contas: CONTAS_COM_SALDO,
      dataReferencia: "2026-08-15",
    });
    expect(aporteLiquido).toBe(200);
    expect(renda).toBe(1000);
    expect(taxa).toBe(20);
  });

  it("compra no cartão não sai do saldo da conta", () => {
    const saldos = calcularSaldosPorConta(CONTAS_COM_SALDO, [
      tx({ account_id: "cc", credit_card_id: "k1", amount: 500 }),
    ]);
    expect(saldos.cc).toBe(10000);
  });

  it("mas compra no cartão continua sendo gasto do mês", () => {
    expect(somaDoMes([tx({ account_id: null, credit_card_id: "k1", amount: 500 })], "expense")).toBe(500);
  });
});
