import { describe, it, expect, vi } from "vitest";

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

// `vi.hoisted` porque `vi.mock` é içado acima das declarações do
// arquivo: um `const` comum aqui daria "Cannot access before
// initialization" na hora de montar o mock.
const { registrarPlugin } = vi.hoisted(() => ({
  registrarPlugin: vi.fn(() => ({
    isPermissionGranted: () => Promise.resolve({ granted: false }),
    requestPermission: () => Promise.resolve({ opened: true }),
    addListener: () => Promise.resolve({ remove: () => {} }),
  })),
}));

vi.mock("@capacitor/core", () => ({
  registerPlugin: (...a) => registrarPlugin(...a),
  Capacitor: { isNativePlatform: () => false, isPluginAvailable: () => false },
}));
vi.mock("@capacitor/app", () => ({ App: { addListener: () => Promise.resolve({ remove: () => {} }) } }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: () => ({}) } }));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import {
  normalizar, bancoDoPacote, jaCapturada, JANELA_REPETICAO, paraDataLocal,
} from "./useNotificationListener";

describe("o plugin é registrado do jeito que o Capacitor 8 exige", () => {
  it("usa registerPlugin com o nome que o Java anuncia", () => {
    // O hook lia `Plugins.NotificationListener` — objeto REMOVIDO do
    // Capacitor na versão 3, e o projeto está na 8. Era `undefined`, e o
    // resultado é que `isAvailable` nunca virava true: o banner que pede
    // a permissão de leitura de notificações nunca aparecia, e o ouvinte
    // nunca era registrado. Uma API que some sem quebrar o build custa
    // caro justamente por isso.
    //
    // "NotificationListener" precisa ser idêntico ao
    // @CapacitorPlugin(name = ...) de NotificationPlugin.java.
    expect(registrarPlugin).toHaveBeenCalledWith("NotificationListener");
  });
});

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

// A escolha de conta saiu daqui: virou `escolherContaDaCaptura` em
// `src/domain/captura.js`, com regra MAIS ESTRITA — não cai mais na
// conta mais antiga em silêncio. Os testes vivem junto da regra, em
// `captura.test.js`.

describe("a data é a da notificação, não a de hoje", () => {
  it("usa o fuso do aparelho, não UTC", () => {
    // `toISOString()` é UTC: um Pix às 22h de sexta em Brasília já é
    // sábado lá. No fim do mês, jogaria o lançamento para o mês
    // seguinte — o mesmo erro que já corrigimos no Finn.
    const sexta22h = new Date(2026, 8, 4, 22, 30);
    expect(paraDataLocal(sexta22h)).toBe("2026-09-04");
  });

  it("data inválida não derruba a captura", () => {
    expect(paraDataLocal(NaN)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
