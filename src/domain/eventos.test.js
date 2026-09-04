import { describe, it, expect } from "vitest";
import { EVENTO, MOTIVO, PLANO_EVENTO, RECURSOS_MEDIDOS, ehRecursoMedido } from "./eventos";
import { LIMITES_PADRAO } from "./limites";

// ============================================================
// Os nomes do funil.
//
// Isto parece teste de constante, e é — de propósito. Um nome de evento
// é chave de agrupamento de BI: se `checkout_concluido` virar
// `checkout_concluído` num lado só, o relatório não quebra, ele
// MENTE. E relatório que mente sem erro é o pior defeito possível,
// porque a decisão é tomada em cima dele.
//
// Os mesmos quatro nomes estão no CHECK de `eventos_plano` e em
// `_shared/eventos.ts`. As três cópias precisam concordar.
// ============================================================

describe("os nomes que o banco aceita", () => {
  it("são exatamente estes quatro", () => {
    expect(Object.values(EVENTO).sort()).toEqual([
      "checkout_concluido", "checkout_iniciado", "paywall_visto", "plano_mudou",
    ]);
  });

  it("os motivos são só os que o sistema produz de verdade", () => {
    // Motivo que ninguém emite vira categoria vazia no relatório e faz
    // procurar bug onde não há.
    expect(Object.values(MOTIVO).sort()).toEqual([
      "assinou", "cancelamento", "pagamento_falhou", "reativacao", "trial_expirou",
    ]);
  });

  it("os planos batem com os do resto do app", () => {
    expect(Object.values(PLANO_EVENTO).sort()).toEqual(["free", "pro"]);
  });
});

describe("os recursos medidos existem de fato", () => {
  it("todo recurso medido é um limite real do plano Free", () => {
    // Se um nome aqui não existir em `planos_limites`, a RPC descarta em
    // silêncio e o funil perde a etapa sem ninguém notar.
    for (const recurso of RECURSOS_MEDIDOS) {
      expect(Object.keys(LIMITES_PADRAO.free)).toContain(recurso);
    }
  });

  it("todo limite do Free é medido", () => {
    // O outro lado: um limite novo que ninguém instrumentou é um
    // paywall invisível no relatório.
    for (const recurso of Object.keys(LIMITES_PADRAO.free)) {
      expect(RECURSOS_MEDIDOS).toContain(recurso);
    }
  });

  it("nome inventado não passa", () => {
    expect(ehRecursoMedido("contas")).toBe(true);
    expect(ehRecursoMedido("finn_mensagens_mes")).toBe(true);
    expect(ehRecursoMedido("coisa_que_nao_existe")).toBe(false);
    expect(ehRecursoMedido(null)).toBe(false);
  });
});
