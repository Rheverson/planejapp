import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================
// A escolha da conta na captura automática.
//
// A captura é o diferencial do produto: o app lê a notificação do banco
// e lança sozinho. Ela ficou QUEBRADA em silêncio quando o CHECK
// `transactions_precisa_de_origem` passou a exigir conta ou cartão — o
// insert não mandava nenhum dos dois, e o código só olhava o caminho de
// sucesso.
//
// A correção precisa escolher uma conta. Escolher a ERRADA é pior do que
// falhar: o gasto entra, o saldo de outra conta fica errado, e ninguém
// percebe. Por isso estes testes.
// ============================================================

const from = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: { from: (...a) => from(...a) } }));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import {
  normalizar, bancoDoPacote, escolherConta, jaCapturada, JANELA_REPETICAO,
} from "./useNotificationListener";

/** Simula a cadeia .select().eq().neq().order() do supabase-js. */
function comContas(contas, error = null) {
  const cadeia = {
    select: () => cadeia,
    eq: () => cadeia,
    neq: () => cadeia,
    order: () => Promise.resolve({ data: contas, error }),
  };
  from.mockReturnValue(cadeia);
}

beforeEach(() => from.mockReset());

describe("a mesma notificação chegando duas vezes", () => {
  // `onNotificationPosted` dispara na postagem E em cada atualização da
  // notificação — e o banco atualiza a dele o tempo todo. Sem trava, o
  // mesmo gasto entra duas vezes. Num app de dinheiro isso não é bug
  // menor: é motivo de desinstalar.
  const t0 = 1_700_000_000_000;

  it("a segunda entrega idêntica é ignorada", () => {
    const assinatura = "com.nu.production|Compra aprovada|Mercado R$ 50,00|50";
    expect(jaCapturada(assinatura, t0)).toBe(false);
    expect(jaCapturada(assinatura, t0 + 1200)).toBe(true);
  });

  it("valores diferentes são compras diferentes", () => {
    expect(jaCapturada("nu|x|y|10", t0)).toBe(false);
    expect(jaCapturada("nu|x|y|11", t0)).toBe(false);
  });

  it("passada a janela, conta de novo", () => {
    // Duas compras idênticas com mais de 90s de intervalo são
    // plausíveis. Barrar seria pior: some um gasto real.
    const a = "itau|Compra|Padaria R$ 8,00|8";
    expect(jaCapturada(a, t0)).toBe(false);
    expect(jaCapturada(a, t0 + JANELA_REPETICAO + 1000)).toBe(false);
  });
});

describe("de qual banco veio a notificação", () => {
  it("reconhece pelo pacote, não pelo texto", () => {
    // O regex devolve "Banco" para tudo que não é Nubank ou Inter. O
    // pacote sabe a verdade — e é o que faz o Itaú virar "Itau" em vez
    // de "Banco" na nota do lançamento.
    expect(bancoDoPacote("com.itau.investimentos")).toBe("Itau");
    expect(bancoDoPacote("com.nu.production")).toBe("Nubank");
    expect(bancoDoPacote("br.com.bb.android.app")).toBe("Banco do Brasil");
    expect(bancoDoPacote("com.picpay")).toBe("PicPay");
  });

  it("app desconhecido não vira banco inventado", () => {
    expect(bancoDoPacote("com.whatsapp")).toBe(null);
    expect(bancoDoPacote("")).toBe(null);
    expect(bancoDoPacote(undefined)).toBe(null);
  });
});

describe("acento não pode atrapalhar o casamento", () => {
  it("Itaú e itau são o mesmo banco", () => {
    expect(normalizar("Itaú")).toBe(normalizar("itau"));
    expect(normalizar("  Conta Corrente  ")).toBe("conta corrente");
  });
});

describe("em qual conta o lançamento entra", () => {
  it("casa o banco com a conta de mesmo nome", async () => {
    comContas([
      { id: "a1", name: "Conta Principal", type: "bank", created_at: "2026-01-01" },
      { id: "a2", name: "Nubank", type: "bank", created_at: "2026-02-01" },
    ]);
    const conta = await escolherConta("u1", "Nubank");
    expect(conta.id).toBe("a2");
  });

  it("casa mesmo com acento e nome composto", async () => {
    comContas([
      { id: "a1", name: "Carteira", type: "wallet", created_at: "2026-01-01" },
      { id: "a2", name: "Cartão Itaú", type: "bank", created_at: "2026-02-01" },
    ]);
    expect((await escolherConta("u1", "Itau")).id).toBe("a2");
  });

  it("sem nome parecido, cai na conta mais antiga", async () => {
    // A mais antiga é, na prática, a principal: foi a primeira que a
    // pessoa cadastrou.
    comContas([
      { id: "a1", name: "Carteira", type: "wallet", created_at: "2026-01-01" },
      { id: "a2", name: "Poupança", type: "bank", created_at: "2026-02-01" },
    ]);
    expect((await escolherConta("u1", "Bradesco")).id).toBe("a1");
  });

  it("banco genérico não força casamento estranho", async () => {
    comContas([
      { id: "a1", name: "Carteira", type: "wallet", created_at: "2026-01-01" },
    ]);
    expect((await escolherConta("u1", null)).id).toBe("a1");
  });

  it("conta encerrada não recebe lançamento", async () => {
    // `is_active` nulo é linha antiga, e nulo é ativa — a mesma regra do
    // resto do app.
    comContas([
      { id: "a1", name: "Nubank", type: "bank", is_active: false, created_at: "2026-01-01" },
      { id: "a2", name: "Carteira", type: "wallet", is_active: null, created_at: "2026-02-01" },
    ]);
    const conta = await escolherConta("u1", "Nubank");
    expect(conta.id).toBe("a2");
  });

  it("sem conta nenhuma devolve null, para quem chama avisar", async () => {
    comContas([]);
    expect(await escolherConta("u1", "Nubank")).toBe(null);
  });

  it("erro de leitura devolve null em vez de estourar", async () => {
    comContas(null, { message: "sem rede" });
    expect(await escolherConta("u1", "Nubank")).toBe(null);
  });
});
