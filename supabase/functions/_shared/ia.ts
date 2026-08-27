// ============================================================
// IA do Finn — provedores em cascata
//
// O Finn dependia só da Groq. Em 27/08/2026 a cota diária dela acabou
// (200.000 tokens/dia somando todos os usuários) e o app ficou sem IA
// até o dia virar. Um provedor só é ponto único de falha, e o plano
// gratuito de qualquer um deles é apertado demais para segurar sozinho.
//
// Aqui os provedores são tentados em ordem. Todos falam o mesmo
// protocolo (OpenAI chat/completions), então trocar de um para outro é
// só mudar endpoint, chave e nome do modelo — o prompt e o parser do
// app continuam iguais.
//
// Cada provedor é opcional: sem a chave no ambiente, ele é pulado. Dá
// para rodar com um, dois ou três configurados.
// ============================================================

type Provedor = {
  /** Aparece no log e na resposta, para saber quem atendeu. */
  nome: string;
  endpoint: string;
  /** Nome do secret. Ausente = provedor pulado. */
  env: string;
  /** Em ordem de preferência dentro do provedor. */
  modelos: string[];
};

/**
 * Ordem de tentativa.
 *
 * 1. **Groq** — é onde o prompt do Finn foi afinado e medido.
 *    Cota gratuita: 8.000 tokens/min e 200.000/dia.
 * 2. **Cerebras** — serve o MESMO `gpt-oss-120b`. Trocar para cá muda a
 *    infraestrutura, não o modelo, então a resposta continua com o
 *    mesmo feitio. Cota gratuita bem maior (~1M tokens/dia), mas com
 *    limite baixo por minuto (~5 req/min) e janela de contexto menor —
 *    boa para absorver o estouro diário da Groq, não para pico.
 * 3. **Gemini** — modelo diferente, último recurso. A cota é contada em
 *    requisições por dia (~1.000 no Flash-Lite), não em tokens, o que
 *    complementa bem os dois primeiros.
 *
 * Os limites de plano gratuito mudam sem aviso; os números acima são
 * referência do momento em que isto foi escrito, não contrato. O que o
 * código garante é que, seja qual for o limite, o próximo da fila
 * assume.
 */
export const PROVEDORES: Provedor[] = [
  {
    nome: "groq",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    env: "GROQ_API_KEY",
    modelos: ["openai/gpt-oss-120b", "openai/gpt-oss-20b"],
  },
  {
    nome: "cerebras",
    endpoint: "https://api.cerebras.ai/v1/chat/completions",
    env: "CEREBRAS_API_KEY",
    modelos: ["gpt-oss-120b"],
  },
  {
    nome: "gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    env: "GEMINI_API_KEY",
    modelos: ["gemini-2.5-flash-lite", "gemini-2.5-flash"],
  },
];

/**
 * Compatibilidade: `MODELOS_GROQ[0]` ainda é usado pelo whatsapp-bot.
 * @deprecated Use `chamarIA`, que tem o fallback entre provedores.
 */
export const MODELOS_GROQ = PROVEDORES[0].modelos;

/** O erro diz que ESTE modelo saiu do ar? Vale tentar o próximo modelo. */
function modeloIndisponivel(mensagem: string): boolean {
  const m = (mensagem || "").toLowerCase();
  return m.includes("does not exist") ||
         m.includes("decommissioned") ||
         m.includes("has been deprecated") ||
         m.includes("model_not_found") ||
         m.includes("not found");
}

/**
 * O erro é do provedor inteiro, não deste modelo? Aí não adianta tentar
 * outro modelo da mesma casa: cota, chave e indisponibilidade valem
 * para a conta toda.
 */
function provedorEsgotado(status: number): boolean {
  return status === 429 ||        // cota / limite de taxa
         status === 401 ||        // chave inválida
         status === 403 ||        // chave sem permissão
         status >= 500;           // fora do ar
}

export type RespostaIA =
  | { ok: true; texto: string; modelo: string; provedor: string; uso?: { entrada: number; saida: number } }
  | { ok: false; motivo: "sem_chave" | "limite" | "indisponivel" | "vazio" | "erro"; detalhe: string };

async function tentar(
  provedor: Provedor,
  chave: string,
  modelo: string,
  mensagens: Array<{ role: string; content: string }>,
  opcoes: { temperature?: number; maxTokens?: number },
): Promise<
  | { tipo: "ok"; texto: string; uso: { entrada: number; saida: number } }
  | { tipo: "proximo_modelo"; detalhe: string }
  | { tipo: "proximo_provedor"; detalhe: string; limite: boolean }
> {
  let resposta: Response;
  try {
    resposta = await fetch(provedor.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}` },
      body: JSON.stringify({
        model: modelo,
        messages: mensagens,
        temperature: opcoes.temperature ?? 0.2,
        max_tokens: opcoes.maxTokens ?? 500,
        // Os gpt-oss são modelos de raciocínio: por padrão gastam parte
        // do orçamento de saída "pensando" antes de escrever, e com o
        // teto baixo do plano gratuito a resposta voltava vazia. O Finn
        // comenta dados já calculados; não precisa de cadeia longa.
        // O parâmetro é específico deles — os outros recusariam.
        ...(modelo.includes("gpt-oss") ? { reasoning_effort: "low" } : {}),
      }),
    });
  } catch (e) {
    // Rede caiu ou o host não respondeu: o próximo provedor pode estar de pé.
    return { tipo: "proximo_provedor", detalhe: `falha de rede: ${(e as Error)?.message}`, limite: false };
  }

  const dados = await resposta.json().catch(() => ({}));

  if (resposta.ok) {
    const texto = dados?.choices?.[0]?.message?.content;
    if (typeof texto === "string" && texto.trim()) {
      return {
        tipo: "ok",
        texto,
        uso: {
          entrada: dados?.usage?.prompt_tokens ?? 0,
          saida: dados?.usage?.completion_tokens ?? 0,
        },
      };
    }
    // Vazio não é erro definitivo: pode ter sido o raciocínio comendo o
    // orçamento de saída. Outro modelo costuma resolver.
    return { tipo: "proximo_modelo", detalhe: `${provedor.nome}/${modelo} devolveu resposta vazia` };
  }

  const detalhe = dados?.error?.message ?? `HTTP ${resposta.status}`;

  if (provedorEsgotado(resposta.status)) {
    return { tipo: "proximo_provedor", detalhe, limite: resposta.status === 429 };
  }
  if (modeloIndisponivel(detalhe)) {
    return { tipo: "proximo_modelo", detalhe };
  }
  // Erro de requisição (400 e afins): trocar de modelo não resolve, mas
  // outro provedor pode ser mais tolerante com o mesmo corpo.
  return { tipo: "proximo_provedor", detalhe, limite: false };
}

/**
 * Pede uma resposta à IA, percorrendo provedores e modelos até alguém
 * atender.
 *
 * Só devolve `ok: false` quando TODOS falharam. O motivo `limite`
 * aparece quando o último obstáculo foi cota — é o caso que o app
 * traduz para a mensagem neutra ao usuário.
 */
export async function chamarIA(
  mensagens: Array<{ role: string; content: string }>,
  opcoes: { temperature?: number; maxTokens?: number } = {},
): Promise<RespostaIA> {
  const configurados = PROVEDORES
    .map((p) => ({ p, chave: Deno.env.get(p.env) }))
    .filter((x): x is { p: Provedor; chave: string } => !!x.chave);

  if (!configurados.length) {
    return {
      ok: false,
      motivo: "sem_chave",
      detalhe: `nenhuma chave configurada (${PROVEDORES.map((p) => p.env).join(", ")})`,
    };
  }

  let ultimoDetalhe = "";
  let bateuLimite = false;

  for (const { p, chave } of configurados) {
    for (const modelo of p.modelos) {
      const r = await tentar(p, chave, modelo, mensagens, opcoes);

      if (r.tipo === "ok") {
        // Sai no log para dar para acompanhar consumo e qual provedor
        // está segurando o tranco, sem instrumentação extra.
        console.log(`IA ${p.nome}/${modelo}: ${r.uso.entrada} entrada + ${r.uso.saida} saida`);
        return { ok: true, texto: r.texto, modelo, provedor: p.nome, uso: r.uso };
      }

      ultimoDetalhe = r.detalhe;

      if (r.tipo === "proximo_modelo") {
        console.warn(`IA ${p.nome}/${modelo}: ${r.detalhe}`);
        continue;
      }

      // Problema do provedor inteiro: não adianta insistir nos irmãos.
      bateuLimite = bateuLimite || r.limite;
      console.warn(`IA ${p.nome} indisponível (${r.detalhe}); tentando o próximo provedor.`);
      break;
    }
  }

  return {
    ok: false,
    motivo: bateuLimite ? "limite" : "indisponivel",
    detalhe: `nenhum provedor respondeu. Último erro: ${ultimoDetalhe}`,
  };
}

/**
 * @deprecated Nome antigo, de quando só existia a Groq. Mantido para os
 * chamadores que ainda não migraram.
 */
export const chamarGroq = chamarIA;
