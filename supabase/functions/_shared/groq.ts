// ============================================================
// Groq — ponto único de configuração da IA
//
// Provedor: **Groq** (api.groq.com), não xAI/Grok. São coisas
// diferentes com nomes parecidos; o projeto sempre usou Groq.
//
// Em 27/08/2026 o Finn parou de responder. A causa não era a chave:
// a Groq descomissionou `llama-3.3-70b-versatile` e passou a devolver
//   HTTP 500 — "The model ... does not exist or you do not have access to it."
// O modelo estava escrito em três arquivos, então a correção precisava
// ser feita em três lugares. Agora vive aqui.
//
// A lista de modelos disponíveis na conta foi consultada em
// /openai/v1/models antes da escolha. `openai/gpt-oss-120b` foi o
// candidato com melhor qualidade e saída limpa; `qwen/qwen3.6-27b` foi
// descartado por vazar o raciocínio `<think>` dentro da resposta.
// ============================================================

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

/** Modelo principal e alternativas, em ordem de preferência. */
export const MODELOS_GROQ = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "groq/compound-mini",
];

/** O erro indica que o modelo saiu do ar? */
function modeloIndisponivel(mensagem: string): boolean {
  const m = (mensagem || "").toLowerCase();
  return m.includes("does not exist") ||
         m.includes("decommissioned") ||
         m.includes("has been deprecated") ||
         m.includes("model_not_found");
}

export type RespostaGroq =
  | { ok: true; texto: string; modelo: string }
  | { ok: false; motivo: "sem_chave" | "limite" | "indisponivel" | "vazio" | "erro"; detalhe: string };

/**
 * Chama a Groq percorrendo a lista de modelos.
 *
 * Se o modelo principal tiver sido descomissionado, tenta o próximo em
 * vez de derrubar o Finn — foi exatamente esse cenário que quebrou a IA.
 * Qualquer outro erro interrompe na hora: não faz sentido repetir uma
 * chamada que falhou por limite de uso ou chave inválida.
 */
export async function chamarGroq(
  mensagens: Array<{ role: string; content: string }>,
  opcoes: { temperature?: number; maxTokens?: number } = {},
): Promise<RespostaGroq> {
  const chave = Deno.env.get("GROQ_API_KEY");
  if (!chave) return { ok: false, motivo: "sem_chave", detalhe: "GROQ_API_KEY não configurada" };

  let ultimoDetalhe = "";

  for (const modelo of MODELOS_GROQ) {
    let resposta: Response;
    try {
      resposta = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}` },
        body: JSON.stringify({
          model: modelo,
          messages: mensagens,
          temperature: opcoes.temperature ?? 0.2,
          max_tokens: opcoes.maxTokens ?? 500,
        }),
      });
    } catch (e) {
      return { ok: false, motivo: "erro", detalhe: `falha de rede: ${(e as Error)?.message}` };
    }

    const dados = await resposta.json().catch(() => ({}));

    if (resposta.ok) {
      const texto = dados?.choices?.[0]?.message?.content;
      if (typeof texto === "string" && texto.trim()) {
        return { ok: true, texto, modelo };
      }
      return { ok: false, motivo: "vazio", detalhe: `modelo ${modelo} devolveu resposta vazia` };
    }

    const detalhe = dados?.error?.message ?? `HTTP ${resposta.status}`;
    ultimoDetalhe = detalhe;

    if (resposta.status === 429) {
      return { ok: false, motivo: "limite", detalhe };
    }
    if (modeloIndisponivel(detalhe)) {
      console.warn(`Modelo ${modelo} indisponível na Groq; tentando o próximo.`);
      continue;
    }
    return { ok: false, motivo: "erro", detalhe };
  }

  return {
    ok: false,
    motivo: "indisponivel",
    detalhe: `nenhum modelo da lista respondeu. Último erro: ${ultimoDetalhe}`,
  };
}
