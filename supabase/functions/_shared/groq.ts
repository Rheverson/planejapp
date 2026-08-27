// ============================================================
// Groq — ponto único de configuração da IA
//
// Provedor: **Groq** (api.groq.com), não xAI/Grok. São coisas
// diferentes com nomes parecidos; o projeto sempre usou Groq.
//
// Em 27/08/2026 o Finn parou de responder com
//   HTTP 500 — "The model ... does not exist or you do not have access to it."
//
// A causa não era a chave, e nem o modelo ter sido descontinuado: os
// modelos Meta (llama-3.3-70b-versatile, llama-3.1-8b-instant) passaram
// a exigir "Contact Sales" na Groq e saíram do plano self-serve. Eles
// seguem listados como Production na documentação, mas não aparecem no
// /v1/models desta conta. Era a segunda metade da mensagem de erro —
// "or you do not have access to it" — que importava.
//
// O modelo estava escrito em três arquivos, então a correção precisava
// ser feita em três lugares. Agora vive aqui.
//
// A lista de modelos disponíveis na conta foi consultada em
// /openai/v1/models antes da escolha. `openai/gpt-oss-120b` foi o
// candidato com melhor qualidade e saída limpa; `qwen/qwen3.6-27b` foi
// descartado por vazar o raciocínio `<think>` dentro da resposta.
// ============================================================

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Modelo principal e alternativa, em ordem de preferência.
 *
 * Só entram aqui modelos da lista **Production** da Groq. Os de
 * **Preview** (qwen, minimax, orpheus) podem ser descontinuados sem
 * aviso — é justamente o tipo de coisa que derrubou o Finn.
 *
 *   openai/gpt-oss-120b  500 t/s · US$ 0,15 entrada / 0,60 saída por 1M
 *   openai/gpt-oss-20b   1000 t/s · US$ 0,075 / 0,30 — metade do preço,
 *                        o dobro da velocidade, qualidade um pouco menor
 *
 * `groq/compound-mini` foi removido da lista de propósito: é um
 * *sistema* agêntico com busca na web e execução de código embutidas.
 * Para um assistente financeiro que só pode falar sobre os dados do
 * próprio usuário, cair nele em silêncio traria resposta de fonte
 * externa — pior do que falhar.
 */
export const MODELOS_GROQ = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
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
