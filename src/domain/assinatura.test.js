import { describe, it, expect } from "vitest";
import {
  ESTADO, estadoDaAssinatura, temAcessoPro, pagamentoFalhou,
  podeAssinar, rotuloDoEstado,
} from "./assinatura";

// ============================================================
// Uma pergunta, uma resposta.
//
// "Esse usuário tem acesso?" estava respondida em quatro lugares com
// três respostas. App.jsx olhava `current_period_end`; Profile.jsx e
// PlanPage.jsx não olhavam. Uma assinatura cancelada com período ainda
// válido aparecia como "sem plano" para quem continuava dentro.
// ============================================================

const AGORA = new Date("2026-09-02T12:00:00Z");
const FUTURO = "2026-12-31T00:00:00Z";
const PASSADO = "2026-01-31T00:00:00Z";

const sub = (status, fim) => ({ status, current_period_end: fim ?? null });

describe("tradução do vocabulário do Stripe", () => {
  it("as duas grafias de cancelado viram o mesmo estado", () => {
    // O Stripe grava `canceled`; o app sempre gravou `cancelled`.
    expect(estadoDaAssinatura(sub("canceled"))).toBe(ESTADO.CANCELADA);
    expect(estadoDaAssinatura(sub("cancelled"))).toBe(ESTADO.CANCELADA);
  });

  it("cobre os estados do Stripe", () => {
    expect(estadoDaAssinatura(sub("trialing"))).toBe(ESTADO.TRIAL);
    expect(estadoDaAssinatura(sub("active"))).toBe(ESTADO.ATIVA);
    expect(estadoDaAssinatura(sub("past_due"))).toBe(ESTADO.PAGAMENTO_PENDENTE);
    expect(estadoDaAssinatura(sub("unpaid"))).toBe(ESTADO.PAGAMENTO_PENDENTE);
    expect(estadoDaAssinatura(sub("incomplete"))).toBe(ESTADO.INCOMPLETA);
    expect(estadoDaAssinatura(sub("incomplete_expired"))).toBe(ESTADO.INCOMPLETA);
    expect(estadoDaAssinatura(sub("paused"))).toBe(ESTADO.PAUSADA);
  });

  it("sem assinatura é NENHUMA", () => {
    expect(estadoDaAssinatura(null)).toBe(ESTADO.NENHUMA);
    expect(estadoDaAssinatura({})).toBe(ESTADO.NENHUMA);
  });

  it("status desconhecido nunca vira acesso", () => {
    // Se o Stripe inventar um status novo, ninguém vira PRO por acidente.
    expect(estadoDaAssinatura(sub("status_que_nao_existe"))).toBe(ESTADO.INCOMPLETA);
    expect(temAcessoPro(sub("status_que_nao_existe"), AGORA)).toBe(false);
  });
});

describe("quem tem acesso PRO", () => {
  it("trial e ativa liberam", () => {
    expect(temAcessoPro(sub("trialing"), AGORA)).toBe(true);
    expect(temAcessoPro(sub("active"), AGORA)).toBe(true);
  });

  it("cancelada libera até o fim do período pago", () => {
    expect(temAcessoPro(sub("cancelled", FUTURO), AGORA)).toBe(true);
    expect(temAcessoPro(sub("canceled", FUTURO), AGORA)).toBe(true);
  });

  it("cancelada com período vencido não libera", () => {
    expect(temAcessoPro(sub("cancelled", PASSADO), AGORA)).toBe(false);
  });

  it("cancelada sem data não libera", () => {
    // Sem a data não há como provar que o período ainda vale.
    expect(temAcessoPro(sub("cancelled", null), AGORA)).toBe(false);
  });

  it("pagamento pendente, incompleta e pausada não liberam", () => {
    expect(temAcessoPro(sub("past_due", FUTURO), AGORA)).toBe(false);
    expect(temAcessoPro(sub("unpaid"), AGORA)).toBe(false);
    expect(temAcessoPro(sub("incomplete"), AGORA)).toBe(false);
    expect(temAcessoPro(sub("incomplete_expired"), AGORA)).toBe(false);
    expect(temAcessoPro(sub("paused"), AGORA)).toBe(false);
  });

  it("sem assinatura não libera", () => {
    expect(temAcessoPro(null, AGORA)).toBe(false);
  });
});

describe("pagamento falhou", () => {
  it("past_due e unpaid vão para a tela de pagamento", () => {
    expect(pagamentoFalhou(sub("past_due"), AGORA)).toBe(true);
    expect(pagamentoFalhou(sub("unpaid"), AGORA)).toBe(true);
  });

  it("cancelada vencida ou sem data também", () => {
    expect(pagamentoFalhou(sub("cancelled", PASSADO), AGORA)).toBe(true);
    expect(pagamentoFalhou(sub("cancelled", null), AGORA)).toBe(true);
  });

  it("cancelada ainda no prazo não é falha de pagamento", () => {
    expect(pagamentoFalhou(sub("cancelled", FUTURO), AGORA)).toBe(false);
  });

  it("quem está em dia não cai nessa tela", () => {
    expect(pagamentoFalhou(sub("active"), AGORA)).toBe(false);
    expect(pagamentoFalhou(sub("trialing"), AGORA)).toBe(false);
    expect(pagamentoFalhou(null, AGORA)).toBe(false);
  });
});

describe("acesso e falha de pagamento nunca coincidem", () => {
  // Se as duas dessem true ao mesmo tempo, o app teria dois destinos
  // para o mesmo usuário e o roteamento decidiria por ordem de `if`.
  const casos = ["trialing", "active", "past_due", "unpaid", "cancelled",
                 "canceled", "incomplete", "incomplete_expired", "paused"];
  const datas = [null, FUTURO, PASSADO];
  it("nenhuma combinação devolve true nas duas", () => {
    casos.forEach((s) => datas.forEach((d) => {
      const a = sub(s, d);
      expect(temAcessoPro(a, AGORA) && pagamentoFalhou(a, AGORA)).toBe(false);
    }));
  });
});

describe("pode iniciar novo checkout", () => {
  it("quem já tem acesso corrente não assina de novo", () => {
    expect(podeAssinar(sub("active"), AGORA)).toBe(false);
    expect(podeAssinar(sub("trialing"), AGORA)).toBe(false);
  });

  it("quem cancelou ou nunca assinou pode", () => {
    expect(podeAssinar(sub("cancelled", PASSADO), AGORA)).toBe(true);
    expect(podeAssinar(sub("incomplete"), AGORA)).toBe(true);
    expect(podeAssinar(null, AGORA)).toBe(true);
  });
});

describe("rótulo da interface", () => {
  it("distingue cancelada em curso de cancelada encerrada", () => {
    expect(rotuloDoEstado(sub("cancelled", FUTURO), AGORA))
      .toBe("Cancelada — ativa até o fim do período");
    expect(rotuloDoEstado(sub("cancelled", PASSADO), AGORA)).toBe("Cancelada");
  });

  it("nomeia os demais estados", () => {
    expect(rotuloDoEstado(sub("trialing"), AGORA)).toBe("Período de teste");
    expect(rotuloDoEstado(sub("active"), AGORA)).toBe("Ativa");
    expect(rotuloDoEstado(sub("past_due"), AGORA)).toBe("Pagamento pendente");
    expect(rotuloDoEstado(null, AGORA)).toBe("Sem assinatura");
  });
});
