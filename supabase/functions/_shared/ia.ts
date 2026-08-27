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
 * Ordem de tentativa. Cada provedor foi conferido contra a conta real
 * em 27/08/2026 (função `diag-ia`, removida depois): a lista de modelos
 * de cada um foi lida do próprio /models, não suposta.
 *
 * 1. **Groq** — onde o prompt do Finn foi afinado e medido. Os dois
 *    modelos respondem. Cota: 8.000 tokens/min e 200.000/dia.
 * 2. **Gemini** — cota contada em requisições por dia (~1.000 no
 *    flash-lite), o que complementa bem um limite de tokens.
 * 3. **Cerebras** — serve o mesmo gpt-oss-120b da Groq, mas hoje
 *    responde 402 nesta conta.
 *
 * Limites de plano gratuito mudam sem aviso, e nomes de modelo saem de
 * linha — foi o que derrubou os `gemini-2.5-*`. O que o código garante
 * é que, seja qual for o motivo, o próximo da fila assume.
 */
export const PROVEDORES: Provedor[] = [
  {
    nome: "groq",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    env: "GROQ_API_KEY",
    modelos: ["openai/gpt-oss-120b", "openai/gpt-oss-20b"],
  },
  {
    nome: "gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    env: "GEMINI_API_KEY",
    // Os `gemini-2.5-*` respondem 404 "no longer available to new
    // users". O primeiro nome é a versão corrente; o `-latest` fica
    // atrás dele para o dia em que a corrente também sair de linha.
    modelos: ["gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-3.5-flash"],
  },
  {
    nome: "openrouter",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    env: "OPENROUTER_API_KEY",
    // Modelos com preço zero na lista pública deles. Instruct, não de
    // raciocínio: os de raciocínio vazam o `<think>` dentro da resposta,
    // que foi o motivo de o qwen ter sido descartado na Groq.
    modelos: ["google/gemma-4-31b-it:free", "z-ai/glm-5.2:free"],
  },
  {
    nome: "cerebras",
    endpoint: "https://api.cerebras.ai/v1/chat/completions",
    env: "CEREBRAS_API_KEY",
    // Serve o MESMO gpt-oss-120b da Groq, então seria a troca mais
    // suave — mas em 27/08/2026 esta conta recebe 402 "Payment
    // required": o tal free tier não vale para ela. Fica em último,
    // sem atrapalhar: 402 apenas pula para o próximo. Se o billing for
    // resolvido, volta a funcionar sem mexer no código.
    modelos: ["gpt-oss-120b"],
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
         status === 402 ||        // billing pendente (o caso da Cerebras)
         status >= 500;           // fora do ar
}

/**
 * Prazos. Sem eles a cascata chegou a levar 38 segundos para devolver
 * erro: o `fetch` espera indefinidamente, então um provedor lento
 * segurava os outros e o usuário ficava olhando para o nada.
 *
 * O caminho feliz (Groq com cota) responde em 2 a 4 segundos. Os 15s
 * por tentativa são para o provedor lento: com o prompt real, de ~1.700
 * tokens, o Gemini não cabia em 9s e era cortado sempre — prazo curto
 * demais transforma um backup que funciona em espera jogada fora.
 *
 * O orçamento total fica abaixo dos 45s que a tela do app espera, para
 * a falha chegar como mensagem em vez de conexão pendurada.
 */
const PRAZO_POR_TENTATIVA = 15000;
const PRAZO_TOTAL = 38000;

/** Rótulo curto do que aconteceu numa tentativa. Seguro para sair da função. */
export type Tentativa = { provedor: string; modelo: string; resultado: string; ms: number };

export type RespostaIA =
  | { ok: true; texto: string; modelo: string; provedor: string; uso?: { entrada: number; saida: number } }
  | {
      ok: false;
      motivo: "sem_chave" | "limite" | "indisponivel" | "vazio" | "erro";
      detalhe: string;
      /** Trilha da cascata, sem mensagem de provedor. */
      tentativas: Tentativa[];
    };

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
  // Cede a vez se o provedor não responder no prazo. O `finally` limpa
  // o relógio para o timer não segurar a função de pé à toa.
  const limite = new AbortController();
  const relogio = setTimeout(() => limite.abort(), PRAZO_POR_TENTATIVA);
  try {
    resposta = await fetch(provedor.endpoint, {
      signal: limite.signal,
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
    // Rede caiu, ou estourou o prazo: o próximo pode estar de pé.
    const abortou = (e as Error)?.name === "AbortError";
    return {
      tipo: "proximo_provedor",
      detalhe: abortou ? `não respondeu em ${PRAZO_POR_TENTATIVA / 1000}s` : `falha de rede: ${(e as Error)?.message}`,
      limite: false,
    };
  } finally {
    clearTimeout(relogio);
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
    // O status já diz o suficiente; a mensagem fica no detalhe interno.
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
      tentativas: [],
    };
  }

  let ultimoDetalhe = "";
  let bateuLimite = false;
  const comecou = Date.now();
  const tentativas: Tentativa[] = [];
  const anotar = (provedor: string, modelo: string, resultado: string) =>
    tentativas.push({ provedor, modelo, resultado, ms: Date.now() - comecou });

  for (const { p, chave } of configurados) {
    for (const modelo of p.modelos) {
      // Não vale começar uma tentativa que já nasceria fora do prazo.
      if (Date.now() - comecou > PRAZO_TOTAL) {
        console.warn(`IA: orçamento de ${PRAZO_TOTAL / 1000}s esgotado antes de ${p.nome}/${modelo}`);
        return {
          ok: false,
          motivo: bateuLimite ? "limite" : "indisponivel",
          detalhe: `tempo esgotado. Último erro: ${ultimoDetalhe}`,
          tentativas,
        };
      }

      const r = await tentar(p, chave, modelo, mensagens, opcoes);

      if (r.tipo === "ok") {
        // Sai no log para dar para acompanhar consumo, quem está
        // segurando o tranco e quanto cada um demora — foi a falta do
        // tempo aqui que escondeu a cascata levando 38s.
        console.log(
          `IA ${p.nome}/${modelo}: ${r.uso.entrada} entrada + ${r.uso.saida} saida` +
          ` em ${Date.now() - comecou}ms`,
        );
        return { ok: true, texto: r.texto, modelo, provedor: p.nome, uso: r.uso };
      }

      ultimoDetalhe = `${p.nome}/${modelo}: ${r.detalhe}`;

      if (r.tipo === "proximo_modelo") {
        anotar(p.nome, modelo, r.detalhe.includes("vazia") ? "vazio" : "modelo indisponível");
        console.warn(`IA ${p.nome}/${modelo} (${Date.now() - comecou}ms): ${r.detalhe}`);
        continue;
      }

      // Problema do provedor inteiro: não adianta insistir nos irmãos.
      bateuLimite = bateuLimite || r.limite;
      anotar(
        p.nome,
        modelo,
        r.limite ? "cota/limite (429)"
          : r.detalhe.includes("não respondeu em") ? "tempo esgotado"
          : r.detalhe.includes("402") || r.detalhe.toLowerCase().includes("payment") ? "billing (402)"
          : "recusou",
      );
      console.warn(`IA ${p.nome} indisponível em ${Date.now() - comecou}ms (${r.detalhe}); tentando o próximo.`);
      break;
    }
  }

  console.warn("IA: nenhum provedor respondeu —", JSON.stringify(tentativas));
  return {
    ok: false,
    motivo: bateuLimite ? "limite" : "indisponivel",
    detalhe: `nenhum provedor respondeu. Último erro: ${ultimoDetalhe}`,
    tentativas,
  };
}

/**
 * @deprecated Nome antigo, de quando só existia a Groq. Mantido para os
 * chamadores que ainda não migraram.
 */
export const chamarGroq = chamarIA;
