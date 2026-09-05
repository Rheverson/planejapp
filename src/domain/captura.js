// Extensão explícita: o Vite resolve sem ela, o Node puro não. Os
// scripts de QA carregam este módulo direto, sem passar pelo bundler —
// e é assim que a regra testada é a MESMA que roda no app, em vez de
// uma cópia no script.
import { calcularMesFatura } from "./financas.js";

// ============================================================
// O que uma notificação bancária significa — em termos do domínio.
//
// A captura ESCREVIA DIRETO na tabela: sempre `expense` ou `income`,
// sempre numa conta, nunca num cartão, nunca transferência. Isso não é
// "quase certo": é uma segunda matemática financeira, e ela contradizia
// a primeira.
//
//   Pix entre contas próprias      virava despesa (e receita do outro
//                                  lado) — inflava os dois totais do mês
//   Compra no cartão               tirava dinheiro da conta na hora
//   Pagamento de fatura            virava despesa comum, dobrando o
//                                  gasto que a compra já havia contado
//   Estorno                        virava despesa nova
//   Operação desconhecida          virava despesa
//
// Este módulo não decide nada sozinho. Ele TRADUZ a notificação para o
// formato que `financas.js` já sabe interpretar, e as regras de lá
// continuam sendo a única fonte de verdade:
//
//   transferência        type "transfer" + transfer_account_id
//                        (calcularSaldosPorConta move entre as duas)
//   compra no cartão     credit_card_id, account_id NULO, is_realized
//                        false, invoice_month por calcularMesFatura
//                        (ehCompraNoCartao a tira do saldo)
//   pagamento de fatura  expense + category "faturas", na conta
//                        (ehPagamentoDeFatura a tira do fluxo do mês)
//
// E quando não dá para saber, ele NÃO INVENTA: devolve uma revisão com
// o motivo. Um gasto errado num app de dinheiro custa mais caro que um
// gasto que não entrou.
// ============================================================

export const OPERACAO = {
  ESTORNO: "estorno",
  PAGAMENTO_FATURA: "pagamento_fatura",
  ENTRADA: "entrada",
  COMPRA_CREDITO: "compra_credito",
  COMPRA_DEBITO: "compra_debito",
  SAIDA: "saida",
  DESCONHECIDA: "desconhecida",
};

export const CONFIANCA = { ALTA: "alta", MEDIA: "media", NENHUMA: "nenhuma" };

/** Sem acento e em minúsculas: "Itaú" e "itau" são a mesma palavra. */
export function normalizar(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

const contem = (texto, termos) => termos.some((t) => texto.includes(t));

// ── Vocabulário, na ORDEM em que precisa ser testado ────────
//
// A ordem é a regra. O motor antigo perguntava "é despesa?" primeiro, e
// `EXPENSE_KEYWORDS` continha "pagamento" e "compra". Resultado:
// "Pagamento recebido" virava despesa, e "Estorno de compra" também.
const ESTORNO   = ["estorno", "estornado", "reembolso", "devolucao", "devolvido", "cancelamento"];
const FATURA    = ["fatura", "invoice"];
const PAGAR     = ["pagamento", "pagou", "pago", "paga "];
const ENTRADA   = ["recebido", "recebeu", "recebemos", "creditado", "deposito",
                   "depositado", "entrou", "entrada de"];
const CREDITO   = ["credito", "cartao", "cartão"];
const DEBITO    = ["debito", "na funcao debito"];
const SAIDA     = ["enviado", "enviou", "transferencia enviada", "pix enviado",
                   "compra", "saque", "debitado", "cobranca", "pagamento de"];

/**
 * O que a notificação diz que aconteceu.
 *
 * `estorno` vem primeiro de propósito, e `entrada` vem antes de
 * qualquer regra de saída: são as duas inversões que o motor antigo
 * cometia.
 */
export function classificarOperacao(textoBruto) {
  const t = normalizar(textoBruto);
  if (!t) return { operacao: OPERACAO.DESCONHECIDA, motivo: "notificação sem texto" };

  // 1. Estorno ganha de tudo. "Estorno de compra" tem a palavra
  //    "compra" dentro e virava despesa nova — dinheiro voltando
  //    registrado como dinheiro saindo.
  if (contem(t, ESTORNO)) return { operacao: OPERACAO.ESTORNO };

  // 2. Fatura antes de pagamento genérico: "Pagamento de fatura" casa
  //    com os dois, e só um deles está certo.
  if (contem(t, FATURA) && contem(t, PAGAR)) {
    return { operacao: OPERACAO.PAGAMENTO_FATURA };
  }

  // 3. Entrada antes de saída. "Pagamento recebido" tem "pagamento".
  if (contem(t, ENTRADA)) return { operacao: OPERACAO.ENTRADA };

  // 4. Cartão só com sinal EXPLÍCITO. "Compra aprovada", sozinha, não
  //    diz se foi crédito ou débito — e chutar erra o saldo ou a
  //    fatura. Os bancos brasileiros dizem ("no crédito", "no débito").
  if (contem(t, DEBITO)) return { operacao: OPERACAO.COMPRA_DEBITO };
  if (contem(t, CREDITO)) return { operacao: OPERACAO.COMPRA_CREDITO };

  // 5. Saída genérica: Pix enviado, transferência, saque.
  if (contem(t, SAIDA)) return { operacao: OPERACAO.SAIDA };

  return { operacao: OPERACAO.DESCONHECIDA, motivo: "nenhum padrão reconhecido" };
}

/**
 * "Parcela 2/3" quando a notificação diz. Nunca inventa.
 */
export function extrairParcela(textoBruto) {
  const t = normalizar(textoBruto);
  const m = t.match(/(?:parcela\s*)?(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})/);
  if (!m) return null;
  const parcela = Number(m[1]);
  const total = Number(m[2]);
  if (!parcela || !total || parcela > total || total > 36) return null;
  return { parcela, total };
}

/** Só contas que podem receber lançamento: ativas e não investimento. */
export function contasElegiveis(contas) {
  return (contas || []).filter((c) => c.is_active !== false && c.type !== "investment");
}

/**
 * A conta que corresponde ao banco da notificação.
 *
 * ANTES caía na conta mais antiga quando nada casava — em silêncio. Uma
 * compra do Itaú entrava na "Carteira" e ninguém ficava sabendo.
 *
 * Agora só devolve conta quando o nome casa. Uma conta só também vale:
 * não há para onde errar.
 */
export function escolherContaDaCaptura(contas, banco) {
  const elegiveis = contasElegiveis(contas);
  if (!elegiveis.length) return { conta: null, confianca: CONFIANCA.NENHUMA, motivo: "sem conta cadastrada" };

  if (banco) {
    const alvo = normalizar(banco);
    const casadas = elegiveis.filter((c) => {
      const nome = normalizar(c.name);
      return nome.includes(alvo) || alvo.includes(nome);
    });
    if (casadas.length === 1) return { conta: casadas[0], confianca: CONFIANCA.ALTA };
    if (casadas.length > 1) {
      return { conta: null, confianca: CONFIANCA.NENHUMA, motivo: `${casadas.length} contas com o nome do banco` };
    }
  }

  if (elegiveis.length === 1) return { conta: elegiveis[0], confianca: CONFIANCA.MEDIA };

  return {
    conta: null,
    confianca: CONFIANCA.NENHUMA,
    motivo: `nenhuma conta com o nome "${banco || "?"}" entre ${elegiveis.length}`,
  };
}

/** Mesmo critério para cartão: casa pelo nome ou é o único. */
export function escolherCartaoDaCaptura(cartoes, texto, banco) {
  const ativos = (cartoes || []).filter((c) => c.is_active !== false);
  if (!ativos.length) return { cartao: null, confianca: CONFIANCA.NENHUMA, motivo: "sem cartão cadastrado" };

  const t = normalizar(`${texto || ""} ${banco || ""}`);
  const casados = ativos.filter((c) => {
    const nome = normalizar(c.name);
    return nome && t.includes(nome);
  });
  if (casados.length === 1) return { cartao: casados[0], confianca: CONFIANCA.ALTA };
  if (ativos.length === 1) return { cartao: ativos[0], confianca: CONFIANCA.MEDIA };

  return {
    cartao: null,
    confianca: CONFIANCA.NENHUMA,
    motivo: `${ativos.length} cartões e nenhum identificado na notificação`,
  };
}

/**
 * O destino do Pix é uma conta MINHA?
 *
 * O sinal disponível é o nome. Se o texto cita o nome de outra conta do
 * usuário, ou o próprio nome dele (Pix para si mesmo), é movimentação
 * interna — patrimônio que troca de lugar, não despesa.
 *
 * Quando dá para saber que é interno mas NÃO para onde, devolve
 * `interno: true` sem destino: quem chama manda para revisão. Uma
 * transferência sem `transfer_account_id` sumiria com o dinheiro no
 * `calcularSaldosPorConta`.
 */
export function identificarDestinoProprio(texto, contas, origem, nomeUsuario) {
  const t = normalizar(texto);
  const candidatas = contasElegiveis(contas).filter((c) => c.id !== origem?.id);

  const porNome = candidatas.filter((c) => {
    const nome = normalizar(c.name);
    return nome.length >= 3 && t.includes(nome);
  });
  if (porNome.length === 1) return { interno: true, destino: porNome[0] };

  // Pix para si mesmo: o nome do titular aparece no lugar do favorecido.
  const meuNome = normalizar(nomeUsuario);
  const primeiroNome = meuNome.split(" ")[0];
  const pareceEuMesmo = meuNome.length >= 5 && (t.includes(meuNome)
    || (primeiroNome.length >= 4 && t.includes(primeiroNome)));

  if (pareceEuMesmo) {
    if (candidatas.length === 1) return { interno: true, destino: candidatas[0] };
    return { interno: true, destino: null, motivo: "transferência interna sem destino identificável" };
  }

  return { interno: false };
}

/**
 * Traduz a notificação num lançamento que o domínio entende.
 *
 * Devolve `{ lancamento }` ou `{ revisao: { motivo, detalhe } }`.
 * Nunca devolve um palpite.
 */
export function montarLancamentoCapturado({
  banco, texto, valor, data, chave, contas, cartoes, nomeUsuario,
}) {
  if (!(Number(valor) > 0)) {
    return { revisao: { motivo: "valor_invalido", detalhe: String(valor) } };
  }

  const { operacao, motivo } = classificarOperacao(texto);
  const base = {
    amount: Number(valor),
    date: data,
    captura_chave: chave,
    notes: `Capturado automaticamente via ${banco || "banco"}`,
  };

  if (operacao === OPERACAO.DESCONHECIDA) {
    // O motor antigo virava despesa aqui. Criar um gasto que não
    // aconteceu é pior do que não criar o que aconteceu: um a pessoa
    // percebe pelo extrato, o outro ela acredita.
    return { revisao: { motivo: "operacao_desconhecida", detalhe: motivo } };
  }

  // ── Cartão de crédito ───────────────────────────────────
  if (operacao === OPERACAO.COMPRA_CREDITO) {
    const { cartao, confianca, motivo: porQue } = escolherCartaoDaCaptura(cartoes, texto, banco);
    if (!cartao) return { revisao: { motivo: "cartao_indefinido", detalhe: porQue } };

    const parcela = extrairParcela(texto);
    return {
      lancamento: {
        ...base,
        type: "expense",
        credit_card_id: cartao.id,
        // NULO de propósito: compra no cartão não sai da conta agora.
        // É o que `ehCompraNoCartao` usa para tirá-la do saldo.
        account_id: null,
        invoice_month: calcularMesFatura(data, cartao),
        // Igual ao formulário manual: a compra fica prevista até a
        // fatura ser paga.
        is_realized: false,
        category: "outros",
        description: parcela
          ? `${descricaoDe(texto, banco)} (${parcela.parcela}/${parcela.total})`
          : descricaoDe(texto, banco),
      },
      confianca,
      operacao,
    };
  }

  // Daqui para baixo tudo mexe em conta.
  const { conta, confianca, motivo: porQue } = escolherContaDaCaptura(contas, banco);
  if (!conta) return { revisao: { motivo: "conta_indefinida", detalhe: porQue } };

  const comum = {
    ...base,
    account_id: conta.id,
    credit_card_id: null,
    is_realized: true,
    description: descricaoDe(texto, banco),
  };

  // ── Pagamento de fatura ─────────────────────────────────
  if (operacao === OPERACAO.PAGAMENTO_FATURA) {
    // `category: "faturas"` é o que `ehPagamentoDeFatura` procura. Sem
    // isso o pagamento entra como gasto comum e DOBRA a despesa do mês:
    // a compra já foi contada quando entrou no cartão.
    return {
      lancamento: { ...comum, type: "expense", category: "faturas" },
      confianca, operacao,
    };
  }

  // ── Entrada e estorno ───────────────────────────────────
  if (operacao === OPERACAO.ENTRADA || operacao === OPERACAO.ESTORNO) {
    // Estorno em conta É dinheiro voltando. Estorno de compra no cartão
    // não tem representação (não existe despesa negativa no cartão) —
    // esse vai para revisão.
    if (operacao === OPERACAO.ESTORNO && contem(normalizar(texto), CREDITO)) {
      return { revisao: { motivo: "estorno_em_cartao", detalhe: "reverter na fatura exige revisão" } };
    }
    return {
      lancamento: { ...comum, type: "income", category: "outros" },
      confianca, operacao,
    };
  }

  // ── Saída: pode ser transferência interna ───────────────
  if (operacao === OPERACAO.SAIDA || operacao === OPERACAO.COMPRA_DEBITO) {
    const destino = operacao === OPERACAO.SAIDA
      ? identificarDestinoProprio(texto, contas, conta, nomeUsuario)
      : { interno: false };

    if (destino.interno && destino.destino) {
      // Patrimônio trocando de lugar. `calcularSaldosPorConta` tira da
      // origem e põe no destino; nenhum dos dois entra em receita ou
      // despesa do mês, e a taxa de poupança não se mexe.
      return {
        lancamento: {
          ...comum,
          type: "transfer",
          transfer_account_id: destino.destino.id,
          category: "transferencia",
        },
        confianca, operacao: "transferencia_interna",
      };
    }

    if (destino.interno) {
      // Sabemos que é interno e não para onde. Uma transferência sem
      // destino sumiria com o dinheiro no cálculo do saldo.
      return { revisao: { motivo: "transferencia_sem_destino", detalhe: destino.motivo } };
    }

    return {
      lancamento: { ...comum, type: "expense", category: "outros" },
      confianca, operacao,
    };
  }

  return { revisao: { motivo: "operacao_nao_tratada", detalhe: operacao } };
}

/** Descrição legível; cai no nome do banco só quando não há nada melhor. */
function descricaoDe(texto, banco) {
  const bruto = String(texto || "").trim();
  if (!bruto) return banco || "Transação";
  const aposPreposicao = bruto.match(/(?:para|em|no|na|de)\s+([A-Za-zÀ-ÿ0-9][\wÀ-ÿ\s.&-]{2,40})/);
  const escolhido = (aposPreposicao ? aposPreposicao[1] : bruto).trim();
  return escolhido.slice(0, 60) || banco || "Transação";
}

// ============================================================
// Conciliação: os dois lados de um movimento só.
//
// Uma transferência entre bancos gera DUAS notificações, de dois apps,
// para um único movimento:
//
//   Itaú    "Pix enviado ... R$ 1,00"          → saída
//   Nubank  "Transferência recebida ... R$ 1,00" → entrada
//
// Sem conciliar, o Nubank é creditado DUAS vezes — uma pela
// transferência e outra pela entrada — e o mês ganha uma receita que
// não existiu.
//
// E há uma segunda coisa aqui, que vale mais que a primeira: O PAR É O
// SINAL. A notificação do Itaú sozinha não consegue dizer que é
// interna — o favorecido é "Rheverson", que não bate com nome de conta
// nenhuma. Mas saída de R$ 1,00 num banco e entrada de R$ 1,00 em outro,
// trinta segundos depois, é evidência muito mais forte do que qualquer
// leitura de texto.
//
// Então a conciliação não é só anti-duplicidade: é o melhor detector de
// transferência interna que existe neste sistema.
// ============================================================

/** Dois lados do mesmo Pix chegam praticamente juntos. */
export const JANELA_CONCILIACAO_MS = 5 * 60 * 1000;

const emCentavos = (v) => Math.round(Number(v || 0) * 100);

/**
 * O que fazer com um lançamento capturado, à luz do que já existe.
 *
 * `recentes` são as linhas CAPTURADAS do mesmo usuário dentro da janela
 * — quem chama já filtrou por índice. Devolve uma das quatro ações:
 *
 *   gravar      insere como está
 *   descartar   é o espelho de algo já contabilizado
 *   promover    uma linha existente vira a transferência; nada é inserido
 *   transferir  insere como transferência e remove o espelho
 */
export function conciliarCaptura(candidato, recentes, agoraMs) {
  const nada = { acao: "gravar" };
  if (!candidato || candidato.type === "transfer") return nada;

  const valor = emCentavos(candidato.amount);
  if (!valor) return nada;

  const dentroDaJanela = (linha) => {
    const t = new Date(linha.captura_em).getTime();
    return Number.isFinite(t) && Math.abs(agoraMs - t) <= JANELA_CONCILIACAO_MS;
  };

  const candidatas = (recentes || [])
    .filter((l) => emCentavos(l.amount) === valor)
    .filter(dentroDaJanela);

  // ── Entrada ──────────────────────────────────────────────
  if (candidato.type === "income") {
    // 1. A transferência já foi registrada e já creditou esta conta.
    //    Esta notificação é o mesmo dinheiro visto pelo outro app.
    const jaCreditou = candidatas.find(
      (l) => l.type === "transfer" && l.transfer_account_id === candidato.account_id,
    );
    if (jaCreditou) {
      return { acao: "descartar", motivo: "espelho_de_transferencia", alvo: jaCreditou.id };
    }

    // 2. Existe uma saída capturada de mesmo valor, em OUTRA conta. É o
    //    outro lado — e o par revela o que o texto não revelava.
    const saida = candidatas.find(
      (l) => l.type === "expense"
        && l.account_id
        && l.account_id !== candidato.account_id
        && !l.credit_card_id,
    );
    if (saida) {
      return {
        acao: "promover",
        alvo: saida.id,
        transfer_account_id: candidato.account_id,
        motivo: "par_saida_entrada",
      };
    }
    return nada;
  }

  // ── Saída ────────────────────────────────────────────────
  if (candidato.type === "expense" && !candidato.credit_card_id) {
    const entrada = candidatas.find(
      (l) => l.type === "income"
        && l.account_id
        && l.account_id !== candidato.account_id,
    );
    if (entrada) {
      // A entrada chegou primeiro. Este lançamento vira a transferência
      // completa, e o espelho sai — senão o destino ficaria creditado
      // duas vezes.
      return {
        acao: "transferir",
        transfer_account_id: entrada.account_id,
        remover: entrada.id,
        motivo: "par_entrada_saida",
      };
    }

    // Uma transferência já registrada com origem nesta conta e mesmo
    // valor: esta saída é o espelho dela.
    const jaDebitou = candidatas.find(
      (l) => l.type === "transfer" && l.account_id === candidato.account_id,
    );
    if (jaDebitou) {
      return { acao: "descartar", motivo: "espelho_de_transferencia", alvo: jaDebitou.id };
    }
  }

  return nada;
}
