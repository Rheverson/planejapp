import { describe, it, expect } from "vitest";
import {
  PLANO, LIMITES_PADRAO, planoDoUsuario, limiteDe, podeCriar,
  recursoDisponivel, erroDeLimite, tabelaDeLimites,
} from "./limites";
import { temAcessoPro } from "./assinatura";

// ============================================================
// Os limites de plano.
//
// Este módulo NÃO é a trava — quem impede a criação são os triggers no
// banco. Aqui mora o que a interface precisa para avisar antes e abrir
// o paywall na hora certa.
// ============================================================

describe("qual é o plano", () => {
  it("sem acesso e sem fundador é free", () => {
    expect(planoDoUsuario({})).toBe(PLANO.FREE);
    expect(planoDoUsuario({ temAcesso: false, ehFundador: false })).toBe(PLANO.FREE);
  });

  it("quem tem assinatura em dia é pro", () => {
    expect(planoDoUsuario({ temAcesso: true })).toBe(PLANO.PRO);
  });

  it("cobrança que falhou vira Free, não parede", () => {
    // Se o cartão falhou, a pessoa pode estar justamente sem dinheiro.
    // Trancá-la para fora de um app de controle financeiro é a pior
    // hora possível. Ela perde o Pro, não o app.
    //
    // Esta regra existe em TRÊS lugares e os três precisam concordar:
    // aqui, em `plano_do_usuario` (SQL, migration 20260904092000) e no
    // espelho de `_shared/limites.ts`.
    for (const status of ["past_due", "unpaid", "incomplete", "paused"]) {
      expect(planoDoUsuario({ temAcesso: temAcessoPro({ status }) })).toBe(PLANO.FREE);
    }
  });

  it("assinatura em dia continua pro", () => {
    for (const status of ["active", "trialing"]) {
      expect(planoDoUsuario({ temAcesso: temAcessoPro({ status }) })).toBe(PLANO.PRO);
    }
  });

  it("fundador é pro mesmo sem assinatura", () => {
    // Os 36 que já usavam o app antes do Free/Pro não passam pelo
    // Stripe e não podem esbarrar em limite amanhã.
    expect(planoDoUsuario({ temAcesso: false, ehFundador: true })).toBe(PLANO.PRO);
  });
});

describe("o teto de cada recurso", () => {
  it("os números aprovados do Free", () => {
    expect(limiteDe("free", "contas")).toBe(2);
    expect(limiteDe("free", "cartoes")).toBe(1);
    expect(limiteDe("free", "transacoes_mes")).toBe(100);
    expect(limiteDe("free", "metas")).toBe(1);
    expect(limiteDe("free", "finn_mensagens_mes")).toBe(10);
  });

  it("null vira Infinity, para `atual < limite` funcionar sem tratar nulo", () => {
    expect(limiteDe("pro", "contas")).toBe(Infinity);
    expect(limiteDe("pro", "transacoes_mes")).toBe(Infinity);
  });

  it("o Pro tem teto no Finn, e é de propósito", () => {
    // O gargalo real é o TPM da Groq, não o plano. 300 é folga para
    // uso humano e freio para automação.
    expect(limiteDe("pro", "finn_mensagens_mes")).toBe(300);
  });

  it("recurso desconhecido não bloqueia nada", () => {
    expect(limiteDe("free", "coisa_que_nao_existe")).toBe(Infinity);
  });

  it("zero é diferente de ilimitado", () => {
    // Free tem 0 recorrências (não pode) e Pro tem null (quantas quiser).
    expect(limiteDe("free", "recorrencias")).toBe(0);
    expect(limiteDe("pro", "recorrencias")).toBe(Infinity);
  });
});

describe("cabe mais um?", () => {
  it("dentro do limite, permite", () => {
    const r = podeCriar({ plano: "free", recurso: "contas", atual: 1 });
    expect(r.permitido).toBe(true);
    expect(r.restantes).toBe(1);
    expect(r.ultimo).toBe(true);   // avisar discretamente
  });

  it("no limite, barra", () => {
    const r = podeCriar({ plano: "free", recurso: "contas", atual: 2 });
    expect(r.permitido).toBe(false);
    expect(r.restantes).toBe(0);
    expect(r.limite).toBe(2);
  });

  it("acima do limite (legado) segue barrado, sem número negativo", () => {
    const r = podeCriar({ plano: "free", recurso: "contas", atual: 7 });
    expect(r.permitido).toBe(false);
    expect(r.restantes).toBe(0);
  });

  it("no Pro nunca barra", () => {
    const r = podeCriar({ plano: "pro", recurso: "transacoes_mes", atual: 99999 });
    expect(r.permitido).toBe(true);
    expect(r.ilimitado).toBe(true);
  });

  it("distingue 'acabou a cota' de 'não existe no plano'", () => {
    const cota = podeCriar({ plano: "free", recurso: "metas", atual: 1 });
    const nunca = podeCriar({ plano: "free", recurso: "recorrencias", atual: 0 });
    expect(cota.indisponivelNoPlano).toBe(false);
    expect(nunca.indisponivelNoPlano).toBe(true);
    expect(nunca.permitido).toBe(false);
  });
});

describe("o recurso existe no plano", () => {
  it("compartilhamento e recorrência são exclusivos do Pro", () => {
    expect(recursoDisponivel("free", "compartilhamento")).toBe(false);
    expect(recursoDisponivel("free", "recorrencias")).toBe(false);
    expect(recursoDisponivel("pro", "compartilhamento")).toBe(true);
    expect(recursoDisponivel("pro", "recorrencias")).toBe(true);
  });
});

describe("o erro do banco vira paywall, não erro técnico", () => {
  it("reconhece a mensagem do trigger", () => {
    const e = erroDeLimite({ message: 'LIMITE_PLANO:contas:2/2' });
    expect(e).toEqual({ recurso: "contas", atual: 2, limite: 2 });
  });

  it("reconhece o limite mensal de transações", () => {
    expect(erroDeLimite({ message: "LIMITE_PLANO:transacoes_mes:100/100" }))
      .toEqual({ recurso: "transacoes_mes", atual: 100, limite: 100 });
  });

  it("erro comum não é confundido com limite", () => {
    expect(erroDeLimite({ message: "null value in column start_date" })).toBe(null);
    expect(erroDeLimite(null)).toBe(null);
    expect(erroDeLimite("falha de rede")).toBe(null);
  });
});

describe("a tabela do banco manda mais que o padrão", () => {
  // É a razão de os limites viverem no banco: mudar um número não pode
  // exigir deploy.
  const doBanco = tabelaDeLimites([
    { plano: "free", recurso: "contas", limite: 5 },
    { plano: "free", recurso: "metas", limite: null },
  ]);

  it("sobrepõe o padrão do código", () => {
    expect(limiteDe("free", "contas", doBanco)).toBe(5);
    expect(limiteDe("free", "metas", doBanco)).toBe(Infinity);
  });

  it("lista vazia ou inválida não quebra", () => {
    expect(tabelaDeLimites(null)).toEqual({ free: {}, pro: {} });
    expect(limiteDe("free", "contas", tabelaDeLimites([]))).toBe(Infinity);
  });
});

describe("o padrão do código bate com o que foi aprovado", () => {
  it("Free", () => {
    expect(LIMITES_PADRAO.free).toEqual({
      contas: 2, cartoes: 1, transacoes_mes: 100, metas: 1,
      finn_mensagens_mes: 10, compartilhamento: 0, recorrencias: 0,
      relatorio_historico: 0,
    });
  });
});
