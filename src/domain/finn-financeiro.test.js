import { describe, it, expect } from "vitest";
import {
  detectarPeriodo, calcularTotais, calcularSaldos, periodoDoMes,
  somarMeses, ultimoDiaDoMes, nomeDoMes,
} from "../../supabase/functions/_shared/financeiro.ts";

// ============================================================
// Os números que o Finn responde.
//
// Antes o prompt mandava listas e o modelo somava. Ele errou duas vezes
// em produção: R$ 3.160 para um gasto real de R$ 3.300, e R$ 14.030
// para "quanto recebi" — somando julho com agosto porque as duas
// listas conviviam no contexto.
//
// Aqui o cálculo é do backend. O modelo não soma mais nada.
// ============================================================

const HOJE = "2026-08-15";

const tx = (o = {}) => ({
  amount: 0, date: "2026-08-10", type: "expense", is_realized: true,
  account_id: "c1", credit_card_id: null, transfer_account_id: null,
  category: "outros", description: "x", ...o,
});

// Reproduz o cenário exato do QA que produziu os dois erros.
const CENARIO = [
  // agosto — realizadas
  tx({ description: "Salario",   amount: 7000, date: "2026-08-05", type: "income" }),
  tx({ description: "Aluguel",   amount: 1800, date: "2026-08-10", category: "moradia" }),
  tx({ description: "Mercado",   amount: 650,  date: "2026-08-12", category: "alimentação" }),
  tx({ description: "Cafe",      amount: 15,   date: "2026-08-14", category: "alimentação" }),
  tx({ description: "Historico", amount: 250,  date: "2026-08-08", account_id: null }),
  tx({ description: "Academia",  amount: 110,  date: "2026-08-03", category: "saúde" }),
  tx({ description: "QA",        amount: 95,   date: "2026-08-23", category: "transporte" }),
  tx({ description: "Desc1",     amount: 10,   date: "2026-08-01" }),
  tx({ description: "Desc2",     amount: 20,   date: "2026-08-02" }),
  tx({ description: "Desc3",     amount: 30,   date: "2026-08-03", type: "income" }),
  // agosto — cartão
  tx({ description: "Farmacia",    amount: 120, date: "2026-08-06", account_id: null, credit_card_id: "k1", category: "saúde" }),
  tx({ description: "Restaurante", amount: 230, date: "2026-08-15", account_id: null, credit_card_id: "k1", category: "alimentação" }),
  // agosto — previstas
  tx({ description: "Internet",  amount: 99,   date: "2026-08-30", is_realized: false, category: "moradia" }),
  tx({ description: "Freelance", amount: 1200, date: "2026-08-29", is_realized: false, type: "income" }),
  // julho
  tx({ description: "Salario", amount: 7000, date: "2026-07-05", type: "income" }),
  tx({ description: "Aluguel", amount: 1800, date: "2026-07-10", category: "moradia" }),
  tx({ description: "Mercado", amount: 800,  date: "2026-07-12", category: "alimentação" }),
];

describe("os dois erros do QA não voltam", () => {
  const ago = calcularTotais(CENARIO, periodoDoMes("2026-08"));

  it("gasto do mês é 3.300, não 3.160", () => {
    expect(ago.saidasRealizadas).toBe(3300);
  });

  it("recebido do mês é 7.030, não 14.030 (não mistura julho)", () => {
    expect(ago.entradasRealizadas).toBe(7030);
  });

  it("julho fica em julho", () => {
    const jul = calcularTotais(CENARIO, periodoDoMes("2026-07"));
    expect(jul.entradasRealizadas).toBe(7000);
    expect(jul.saidasRealizadas).toBe(2600);
  });

  it("a soma das categorias fecha com o total", () => {
    const soma = ago.porCategoria.reduce((s, c) => s + c.valor, 0);
    expect(soma).toBe(ago.saidasRealizadas);
  });

  it("alimentação é 895", () => {
    expect(ago.porCategoria.find((c) => c.categoria === "alimentação").valor).toBe(895);
  });

  it("maior despesa é o aluguel", () => {
    expect(ago.maiorDespesa.descricao).toBe("Aluguel");
    expect(ago.maiorDespesa.valor).toBe(1800);
  });
});

describe("previsto x realizado", () => {
  const t = calcularTotais(CENARIO, periodoDoMes("2026-08"));
  it("separa entradas previstas", () => expect(t.entradasPrevistas).toBe(1200));
  it("separa saídas previstas", () => expect(t.saidasPrevistas).toBe(99));
  it("resultado usa só realizadas", () => expect(t.resultado).toBe(7030 - 3300));
});

describe("cartão", () => {
  it("compra no cartão conta como gasto do mês", () => {
    const t = calcularTotais([
      tx({ amount: 100, credit_card_id: "k1", account_id: null }),
    ], periodoDoMes("2026-08"));
    expect(t.saidasRealizadas).toBe(100);
  });

  it("mas não sai do saldo da conta", () => {
    const { emConta } = calcularSaldos(
      [{ id: "c1", initial_balance: 1000 }],
      [tx({ amount: 100, credit_card_id: "k1", account_id: "c1" })],
    );
    expect(emConta).toBe(1000);
  });
});

describe("centavos", () => {
  it("cem lançamentos de um centavo somam um real", () => {
    const cem = Array.from({ length: 100 }, () => tx({ amount: 0.01 }));
    expect(calcularTotais(cem, periodoDoMes("2026-08")).saidasRealizadas).toBe(1);
  });

  it("0,1 + 0,2 = 0,3", () => {
    const t = calcularTotais([tx({ amount: 0.1 }), tx({ amount: 0.2 })], periodoDoMes("2026-08"));
    expect(t.saidasRealizadas).toBe(0.3);
  });
});

describe("mês sem movimentação", () => {
  const vazio = calcularTotais(CENARIO, periodoDoMes("2026-05"));
  it("devolve zero, não erro", () => {
    expect(vazio.saidasRealizadas).toBe(0);
    expect(vazio.entradasRealizadas).toBe(0);
    expect(vazio.quantidade).toBe(0);
    expect(vazio.maiorDespesa).toBeNull();
  });
});

describe("transferência não é entrada nem saída", () => {
  it("fica de fora dos totais", () => {
    const t = calcularTotais([
      tx({ type: "transfer", amount: 500, transfer_account_id: "c2" }),
    ], periodoDoMes("2026-08"));
    expect(t.saidasRealizadas).toBe(0);
    expect(t.entradasRealizadas).toBe(0);
  });
});

describe("interpretação de período", () => {
  const casos = [
    ["Quanto gastei?",                      "2026-08-01", "2026-08-31"],
    ["Quanto recebi?",                      "2026-08-01", "2026-08-31"],
    ["Quanto gastei este mês?",             "2026-08-01", "2026-08-31"],
    ["Quanto gastei no mês passado?",       "2026-07-01", "2026-07-31"],
    ["Quanto gastei no mês anterior?",      "2026-07-01", "2026-07-31"],
    ["Quanto recebi em julho?",             "2026-07-01", "2026-07-31"],
    ["Quanto gastei em fevereiro?",         "2026-02-01", "2026-02-28"],
    ["Quanto gastei este ano?",             "2026-01-01", "2026-08-15"],
    ["Quanto gastei ano passado?",          "2025-01-01", "2025-12-31"],
    ["Quanto gastei nos últimos 3 meses?",  "2026-06-01", "2026-08-15"],
    ["Compare com os últimos 12 meses",     "2025-09-01", "2026-08-15"],
    ["Quanto gastei hoje?",                 "2026-08-15", "2026-08-15"],
    ["Quanto gastei ontem?",                "2026-08-14", "2026-08-14"],
  ];
  for (const [pergunta, de, ate] of casos) {
    it(`"${pergunta}"`, () => {
      const p = detectarPeriodo(pergunta, HOJE);
      expect(`${p.de}..${p.ate}`).toBe(`${de}..${ate}`);
    });
  }

  it("mês futuro no ano corrente vira o mesmo mês do ano passado", () => {
    // Em agosto/2026, "em dezembro" só pode ser dez/2025.
    expect(detectarPeriodo("Quanto gastei em dezembro?", HOJE).de).toBe("2025-12-01");
  });

  it("fevereiro de ano bissexto termina em 29", () => {
    expect(detectarPeriodo("gastos de fevereiro", "2028-06-10").ate).toBe("2028-02-29");
  });
});

describe("utilitários de data", () => {
  it("último dia do mês", () => {
    expect(ultimoDiaDoMes("2027-02")).toBe(28);
    expect(ultimoDiaDoMes("2028-02")).toBe(29);
    expect(ultimoDiaDoMes("2026-04")).toBe(30);
  });
  it("somar meses vira o ano", () => {
    expect(somarMeses("2026-12", 1)).toBe("2027-01");
    expect(somarMeses("2026-01", -1)).toBe("2025-12");
    expect(somarMeses("2026-08", -12)).toBe("2025-08");
  });
  it("nome do mês em português", () => {
    expect(nomeDoMes("2026-08")).toBe("agosto de 2026");
  });
});
