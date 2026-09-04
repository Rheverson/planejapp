// ============================================================
// Limites de plano — espelho de src/domain/limites.js
//
// Mesma dupla de `financas.js` / `financeiro.ts`, que já provou o
// valor: o Finn e a Home pararam de divergir quando a regra passou a
// existir dos dois lados com o mesmo texto.
//
// Se um mudar, o outro muda junto. E a TERCEIRA implementação está no
// banco (`plano_do_usuario` e `limite_do_usuario`, migration
// 20260904092000) — é ela que os triggers usam, e é a que vale como
// trava. As três precisam concordar.
// ============================================================

import { adminClient } from "./auth.ts";

export const PLANO = { FREE: "free", PRO: "pro" } as const;
export type Plano = typeof PLANO[keyof typeof PLANO];

export const LIMITES_PADRAO: Record<Plano, Record<string, number | null>> = {
  free: {
    contas: 2,
    cartoes: 1,
    transacoes_mes: 100,
    metas: 1,
    finn_mensagens_mes: 10,
    compartilhamento: 0,
    recorrencias: 0,
    relatorio_historico: 0,
  },
  pro: {
    contas: null,
    cartoes: null,
    transacoes_mes: null,
    metas: null,
    finn_mensagens_mes: 300,
    compartilhamento: null,
    recorrencias: null,
    relatorio_historico: null,
  },
};

/**
 * Plano efetivo, perguntado ao banco.
 *
 * Não recalcula a regra aqui: chama `plano_do_usuario`, a mesma função
 * que os triggers usam. Assim não existe caminho em que a Edge Function
 * ache uma coisa e a trava do banco ache outra.
 */
export async function planoDoUsuario(userId: string): Promise<Plano> {
  const { data, error } = await adminClient().rpc("plano_do_usuario", { p_user: userId });
  if (error || !data) {
    console.error("plano_do_usuario falhou:", error);
    return PLANO.FREE; // falha fechada: na dúvida, o plano restrito
  }
  return data === "pro" ? PLANO.PRO : PLANO.FREE;
}

/** Teto do recurso. `Infinity` quando ilimitado. */
export async function limiteDe(userId: string, recurso: string): Promise<number> {
  const { data, error } = await adminClient()
    .rpc("limite_do_usuario", { p_user: userId, p_recurso: recurso });
  if (error) {
    console.error("limite_do_usuario falhou:", error);
    const padrao = LIMITES_PADRAO.free[recurso];
    return padrao === null || padrao === undefined ? Infinity : padrao;
  }
  return data === null ? Infinity : Number(data);
}

/**
 * Registra uma mensagem do Finn e diz se ela ainda cabia.
 *
 * Incrementa ANTES de responder e devolve o total: o `ai-chat` decide
 * com isso se chama o provedor. Assim uma mensagem que estourou o
 * limite não consome a cota da Groq — que é o teto de verdade
 * (~5,7 mensagens/minuto no app inteiro, ver _shared/ia.ts).
 */
export async function registrarUsoDoFinn(
  userId: string,
): Promise<{ usadas: number; limite: number; dentroDoLimite: boolean }> {
  const limite = await limiteDe(userId, "finn_mensagens_mes");
  const { data, error } = await adminClient().rpc("finn_registrar_uso", { p_user: userId });
  if (error) {
    console.error("finn_registrar_uso falhou:", error);
    // Contador quebrado não pode calar o Finn: falha para o lado do uso.
    return { usadas: 0, limite, dentroDoLimite: true };
  }
  const usadas = Number(data ?? 0);
  return { usadas, limite, dentroDoLimite: usadas <= limite };
}
