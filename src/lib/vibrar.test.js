import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================
// O retorno tátil não pode custar nada.
//
// A propriedade que importa aqui não é "vibrou": é que a vibração
// NUNCA atrapalha o que a pessoa estava fazendo. Um `await` esquecido
// atrasa o salvamento; uma exceção não tratada CANCELA a mutation e o
// lançamento se perde — trocar um gasto registrado por uma vibração
// seria o pior negócio possível.
// ============================================================

const impact = vi.fn(() => Promise.resolve());
const notification = vi.fn(() => Promise.resolve());

vi.mock("@capacitor/haptics", () => ({
  Haptics: {
    impact: (...a) => impact(...a),
    notification: (...a) => notification(...a),
  },
  ImpactStyle: { Light: "LIGHT", Medium: "MEDIUM", Heavy: "HEAVY" },
  NotificationType: { Success: "SUCCESS", Warning: "WARNING", Error: "ERROR" },
}));

import { vibrar } from "./vibrar";

beforeEach(() => { impact.mockClear(); notification.mockClear(); });

describe("cada intenção tem a sua intensidade", () => {
  it("toque é o mais leve", () => {
    vibrar.toque();
    expect(impact).toHaveBeenCalledWith({ style: "LIGHT" });
  });

  it("salvou usa o padrão de sucesso do sistema", () => {
    vibrar.sucesso();
    expect(notification).toHaveBeenCalledWith({ type: "SUCCESS" });
  });

  it("remoção é mais firme que toque", () => {
    // Remoção é irreversível na cabeça de quem fez: a mão precisa
    // registrar que aconteceu.
    vibrar.remocao();
    expect(impact).toHaveBeenCalledWith({ style: "MEDIUM" });
  });

  it("erro não é a mesma coisa que aviso de limite", () => {
    // Bater no teto do plano não é falha — nada quebrou. Dar o pulso
    // duplo de erro ensinaria a pessoa a temer o paywall.
    vibrar.erro();
    vibrar.aviso();
    expect(notification).toHaveBeenCalledWith({ type: "ERROR" });
    expect(impact).toHaveBeenCalledWith({ style: "LIGHT" });
  });
});

describe("nunca derruba a ação", () => {
  it("plugin que rejeita não vira exceção", async () => {
    impact.mockImplementationOnce(() => Promise.reject(new Error("sem vibrador")));
    expect(() => vibrar.toque()).not.toThrow();
    await Promise.resolve();
  });

  it("plugin que estoura na hora também não", () => {
    notification.mockImplementationOnce(() => { throw new Error("plugin ausente"); });
    expect(() => vibrar.sucesso()).not.toThrow();
  });

  it("não devolve promessa para ninguém esperar por engano", () => {
    // Se devolvesse, um `await vibrar.sucesso()` num onSuccess atrasaria
    // o fechamento do formulário pelo tempo do plugin.
    expect(vibrar.toque()).toBeUndefined();
    expect(vibrar.sucesso()).toBeUndefined();
  });
});
