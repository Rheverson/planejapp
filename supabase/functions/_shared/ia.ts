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
  /**
   * Quanto esperar antes de ceder a vez, em ms. Vem da latência medida
   * de cada um, não de um número redondo: com prazo único o provedor
   * rápido esperava pelo lento e o pior caso chegou a 8,3s.
   */
  prazo: number;
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
    // 120b leva 2 a 3s; 20b, 0,6s. Recusa por cota volta em ~30ms.
    prazo: 6000,
  },
  {
    nome: "gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    env: "GEMINI_API_KEY",
    // Os `gemini-2.5-*` respondem 404 "no longer available to new
    // users". Medidos com o prompt real: o flash-lite atende em ~1s,
    // enquanto `gemini-flash-lite-latest` levou 20s e `gemini-3.5-flash`
    // passou de 30s. Reserva que não chega a tempo não é reserva, e
    // ainda gasta o orçamento dos provedores seguintes.
    modelos: ["gemini-3.5-flash-lite"],
    // Bom, responde em ~1s, mas é instável. Os 4s são um meio-termo
    // deliberado: com o crédito do HF esgotado, este é o ÚNICO backup de
    // pé, e cortá-lo cedo troca uma resposta em 3s por uma falha em 3s.
    // Se o Cerebras voltar, dá para apertar de novo.
    prazo: 4000,
  },
  {
    nome: "huggingface",
    endpoint: "https://router.huggingface.co/v1/chat/completions",
    env: "HF_TOKEN",
    // Primeiro backup de verdade depois do Gemini. O `gpt-oss-20b` daqui
    // é o MESMO modelo que a Groq serve e responde em ~965ms medidos,
    // então a queda troca de casa sem mudar o feitio da resposta.
    //
    // Fica à frente de OpenRouter e Cerebras porque esses dois só sabem
    // recusar hoje (429 e 402): deixar o HF atrás deles seria proteger o
    // crédito no lugar errado — quando Groq e Gemini falham juntos, ou
    // este atende ou o Finn não responde.
    //
    // O plano gratuito dá US$ 0,10/mês, o que não sustenta o app como
    // principal. Acompanhar em huggingface.co/settings/billing.
    modelos: ["openai/gpt-oss-20b", "meta-llama/Llama-3.3-70B-Instruct"],
    // gpt-oss-20b em 965ms; o Llama, 2,5 a 3,6s.
    prazo: 5000,
  },
  {
    nome: "openrouter",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    env: "OPENROUTER_API_KEY",
    // Modelos com preço zero na lista pública deles. Instruct, não de
    // raciocínio: os de raciocínio vazam o `<think>` dentro da resposta,
    // que foi o motivo de o qwen ter sido descartado na Groq.
    modelos: ["google/gemma-4-31b-it:free", "z-ai/glm-5.2:free"],
    // Hoje só recusa (429), e a recusa volta em ~300ms.
    prazo: 3000,
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
    // 402 instantâneo enquanto o billing não for resolvido.
    prazo: 3000,
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
/**
 * O erro é da conta inteira? Aí não adianta tentar outro modelo da mesma
 * casa.
 *
 * 429 fica DE FORA de propósito. O limite costuma ser por modelo — a
 * Groq responde "Rate limit reached for model `openai/gpt-oss-120b`" e,
 * no mesmo instante, o gpt-oss-20b atende em 600ms. Tratar 429 como
 * provedor esgotado deixou o Finn sem IA tendo alternativa de pé.
 */
function contaBloqueada(status: number): boolean {
  return status === 401 ||        // chave inválida
         status === 403 ||        // chave sem permissão
         status === 402 ||        // billing pendente (o caso da Cerebras)
         status >= 500;           // provedor fora do ar
}

/**
 * Prazos. Sem eles a cascata chegou a levar 38 segundos para devolver
 * erro: o `fetch` espera indefinidamente, então um provedor lento
 * segurava os outros e o usuário ficava olhando para o nada.
 *
 * Medido com o prompt real (~1.700 tokens): Groq gpt-oss-20b 0,6s,
 * Gemini flash-lite ~1s, Groq gpt-oss-120b 2 a 3s. Os 6s cobrem os três
 * com folga larga.
 *
 * Quem passa de 6s está degradado, e esperar não melhora a resposta —
 * só atrasa o próximo da fila, que provavelmente atenderia antes. Os
 * provedores que recusam por cota ou billing respondem em menos de meio
 * segundo, então o pior caso real fica bem abaixo do orçamento total.
 *
 * O orçamento total fica muito abaixo dos 45s que a tela espera, para a
 * falha chegar como mensagem em vez de conexão pendurada.
 */
const PRAZO_TOTAL = 20000;

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
  | { tipo: "proximo_modelo"; detalhe: string; limite?: boolean }
  | { tipo: "proximo_provedor"; detalhe: string; limite: boolean }
> {
  let resposta: Response;
  // Cede a vez se o provedor não responder no prazo. O `finally` limpa
  // o relógio para o timer não segurar a função de pé à toa.
  const limite = new AbortController();
  const relogio = setTimeout(() => limite.abort(), provedor.prazo);
  try {
    resposta = await fetch(provedor.endpoint, {
      signal: limite.signal,
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}` },
      body: JSON.stringify({
        model: modelo,
        messages: mensagens,
        temperature: opcoes.temperature ?? 0.2,
        // As respostas do Finn medidas ficaram entre 46 e 202 tokens; o
        // teto antigo de 500 só alongava o pior caso e gastava cota.
        max_tokens: opcoes.maxTokens ?? 350,
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
      detalhe: abortou ? `não respondeu em ${provedor.prazo / 1000}s` : `falha de rede: ${(e as Error)?.message}`,
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

  if (contaBloqueada(resposta.status)) {
    return { tipo: "proximo_provedor", detalhe, limite: false };
  }
  // Cota estourada neste modelo: o vizinho pode ter cota própria.
  if (resposta.status === 429) {
    return { tipo: "proximo_modelo", detalhe, limite: true };
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
        bateuLimite = bateuLimite || !!r.limite;
        anotar(
          p.nome,
          modelo,
          r.limite ? "cota do modelo (429)"
            : r.detalhe.includes("vazia") ? "vazio"
            : "modelo indisponível",
        );
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
