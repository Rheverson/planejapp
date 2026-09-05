import { describe, it, expect } from "vitest";
import {
  OPERACAO, CONFIANCA, classificarOperacao, extrairParcela,
  escolherContaDaCaptura, escolherCartaoDaCaptura, identificarDestinoProprio,
  conciliarCaptura, montarLancamentoCapturado, campoDaEscolha,
  ESCOLHAS_MEMORIZAVEIS,
} from "./captura";
import {
  calcularSaldosPorConta, calcularKPIsMes, ehCompraNoCartao, ehPagamentoDeFatura,
} from "./financas";

// ============================================================
// A captura tem de falar a língua do domínio.
//
// O motor antigo escrevia sempre `expense` ou `income`, sempre numa
// conta, nunca num cartão, nunca transferência. Não era "quase certo":
// era uma segunda matemática financeira que contradizia a primeira.
//
// Estes testes existem para provar duas coisas:
//
//   1. cada operação bancária vira o lançamento CERTO;
//   2. o lançamento capturado produz os MESMOS números que o
//      lançamento manual equivalente, passando por `financas.js`.
//
// O segundo é o que impede a captura de virar um motor paralelo.
// ============================================================

const CONTA_A = { id: "cA", name: "Nubank", type: "bank", initial_balance: 1000 };
const CONTA_B = { id: "cB", name: "Inter", type: "bank", initial_balance: 500 };
const CAIXINHA = { id: "cI", name: "Caixinha", type: "investment", initial_balance: 9000 };
const CARTAO = { id: "k1", name: "Nubank", closing_day: 20, expense_date_mode: "purchase_date" };

const CONTAS = [CONTA_A, CONTA_B, CAIXINHA];
const NOME = "Rheverson Gois";

const montar = (texto, extra = {}) => montarLancamentoCapturado({
  banco: "Nubank", texto, valor: 1, data: "2026-09-05", chave: "k|1",
  contas: CONTAS, cartoes: [CARTAO], nomeUsuario: NOME, ...extra,
});

// ══ A ordem do vocabulário ═════════════════════════════════
describe("a ordem em que as palavras são testadas", () => {
  it("estorno ganha de “compra”", () => {
    // "Estorno de compra" contém "compra". O motor antigo criava uma
    // despesa nova para dinheiro que estava VOLTANDO.
    expect(classificarOperacao("Estorno de compra R$ 50").operacao).toBe(OPERACAO.ESTORNO);
  });

  it("“pagamento recebido” é entrada, não saída", () => {
    // Continha "pagamento" e virava despesa.
    expect(classificarOperacao("Pagamento recebido de João").operacao).toBe(OPERACAO.ENTRADA);
  });

  it("“pagamento de fatura” é fatura, não pagamento genérico", () => {
    expect(classificarOperacao("Pagamento de fatura realizado").operacao)
      .toBe(OPERACAO.PAGAMENTO_FATURA);
  });

  it("crédito e débito só com sinal explícito", () => {
    expect(classificarOperacao("Compra aprovada no crédito").operacao).toBe(OPERACAO.COMPRA_CREDITO);
    expect(classificarOperacao("Compra no débito").operacao).toBe(OPERACAO.COMPRA_DEBITO);
  });

  it("“creditado” é entrada, não cartão de crédito", () => {
    expect(classificarOperacao("Valor creditado na sua conta").operacao).toBe(OPERACAO.ENTRADA);
  });

  it("o feminino conta: “Transferência recebida” é entrada", () => {
    // É o texto que o Nubank manda de verdade. Com "recebido" na lista
    // e "recebida" fora dela, a notificação real caía em
    // `operacao_desconhecida` e ia inteira para revisão.
    expect(classificarOperacao("Transferência recebida").operacao).toBe(OPERACAO.ENTRADA);
    expect(classificarOperacao("Transferência enviada").operacao).toBe(OPERACAO.SAIDA);
    expect(classificarOperacao("Compra estornada").operacao).toBe(OPERACAO.ESTORNO);
  });

  it("texto sem padrão nenhum não vira despesa", () => {
    expect(classificarOperacao("Sua fatura fecha amanhã").operacao).not.toBe(OPERACAO.SAIDA);
  });
});

// ══ A–D · Pix ══════════════════════════════════════════════
describe("Pix", () => {
  it("A · entre contas próprias vira TRANSFERÊNCIA", () => {
    const { lancamento } = montar("Pix enviado para Inter");
    expect(lancamento.type).toBe("transfer");
    expect(lancamento.account_id).toBe("cA");
    expect(lancamento.transfer_account_id).toBe("cB");
  });

  it("B · no sentido inverso também", () => {
    const { lancamento } = montar("Pix enviado para Nubank", { banco: "Inter" });
    expect(lancamento.type).toBe("transfer");
    expect(lancamento.account_id).toBe("cB");
    expect(lancamento.transfer_account_id).toBe("cA");
  });

  it("Pix para si mesmo, com duas contas, resolve o destino", () => {
    const { lancamento } = montar("Pix enviado para RHEVERSON GOIS");
    expect(lancamento.type).toBe("transfer");
    expect(lancamento.transfer_account_id).toBe("cB");
  });

  it("interno sem destino identificável vai para revisão", () => {
    // Sabemos que é interno e não para onde. Uma transferência sem
    // destino sumiria com o dinheiro no cálculo do saldo.
    const contas = [CONTA_A, CONTA_B, { id: "cC", name: "Itau", type: "bank" }];
    const r = montar("Pix enviado para Rheverson Gois", { contas });
    expect(r.lancamento).toBeUndefined();
    expect(r.revisao.motivo).toBe("transferencia_sem_destino");
  });

  it("C · para terceiro é DESPESA", () => {
    const { lancamento } = montar("Pix enviado para Padaria do Zé");
    expect(lancamento.type).toBe("expense");
    expect(lancamento.transfer_account_id).toBeUndefined();
  });

  it("D · recebido é RECEITA", () => {
    const { lancamento } = montar("Pix recebido de Maria");
    expect(lancamento.type).toBe("income");
    expect(lancamento.account_id).toBe("cA");
  });
});

// ══ E–F · Cartão ═══════════════════════════════════════════
describe("cartão de crédito", () => {
  it("E · compra no crédito vai para o CARTÃO, não para a conta", () => {
    const { lancamento } = montar("Compra aprovada no crédito em Mercado");
    expect(lancamento.credit_card_id).toBe("k1");
    expect(lancamento.account_id).toBeNull();
    expect(lancamento.invoice_month).toBe("2026-09");
    // Igual ao formulário manual: prevista até a fatura ser paga.
    expect(lancamento.is_realized).toBe(false);
    expect(ehCompraNoCartao(lancamento)).toBe(true);
  });

  it("F · pagamento de fatura usa a categoria que o domínio procura", () => {
    const { lancamento } = montar("Pagamento de fatura no valor de R$ 1,00");
    expect(lancamento.type).toBe("expense");
    expect(lancamento.category).toBe("faturas");
    expect(lancamento.credit_card_id).toBeNull();
    expect(ehPagamentoDeFatura(lancamento)).toBe(true);
  });

  it("O · parcela entra quando a notificação diz", () => {
    const { lancamento } = montar("Compra no crédito parcela 2/3 em Loja");
    expect(lancamento.description).toContain("(2/3)");
  });

  it("O · e não é inventada quando não diz", () => {
    const { lancamento } = montar("Compra no crédito em Loja");
    expect(lancamento.description).not.toMatch(/\(\d+\/\d+\)/);
  });

  it("N · cartão ambíguo não é escolhido em silêncio", () => {
    // Ambiguidade DE VERDADE: dois cartões e nenhum identificável na
    // notificação nem pelo nome do banco.
    const dois = [{ id: "k1", name: "Principal" }, { id: "k2", name: "Adicional" }];
    const r = montar("Compra aprovada no crédito em Mercado", { cartoes: dois });
    expect(r.lancamento).toBeUndefined();
    expect(r.revisao.motivo).toBe("cartao_indefinido");
  });

  it("cartão com o nome do banco da notificação casa, e isso é correto", () => {
    // Dois cartões, mas um se chama "Nubank" e a notificação veio do
    // app do Nubank. Mandar para revisão aqui seria zelo inútil.
    const dois = [CARTAO, { id: "k2", name: "Itau Gold" }];
    const { lancamento } = montar("Compra aprovada no crédito", { cartoes: dois });
    expect(lancamento.credit_card_id).toBe("k1");
  });
});

// ══ G–I · As inversões ═════════════════════════════════════
describe("estorno e desconhecido", () => {
  it("G · estorno em conta é dinheiro VOLTANDO", () => {
    const { lancamento } = montar("Estorno recebido de compra cancelada", { texto: "Estorno de R$ 1,00 em conta" });
    expect(lancamento.type).toBe("income");
  });

  it("G · estorno no cartão vai para revisão, não vira despesa", () => {
    const r = montar("Estorno de compra no cartão de crédito");
    expect(r.lancamento).toBeUndefined();
    expect(r.revisao.motivo).toBe("estorno_em_cartao");
  });

  it("I · operação desconhecida NÃO vira despesa", () => {
    // Era o viés mais perigoso: qualquer coisa não reconhecida virava
    // um gasto que nunca aconteceu.
    const r = montar("Sua fatura fecha amanhã");
    expect(r.lancamento).toBeUndefined();
    expect(r.revisao.motivo).toBe("operacao_desconhecida");
  });

  it("valor zero ou negativo não entra", () => {
    expect(montar("Pix enviado", { valor: 0 }).revisao.motivo).toBe("valor_invalido");
  });
});

// ══ M · Conta ══════════════════════════════════════════════
describe("escolha da conta", () => {
  it("casa pelo nome do banco", () => {
    expect(escolherContaDaCaptura(CONTAS, "Nubank").conta.id).toBe("cA");
  });

  it("M · sem correspondência NÃO cai na mais antiga", () => {
    // Era o comportamento antigo: compra do Itaú entrava na "Carteira"
    // porque foi a primeira conta cadastrada, sem avisar ninguém.
    const r = escolherContaDaCaptura(CONTAS, "Bradesco");
    expect(r.conta).toBe(null);
    expect(r.confianca).toBe(CONFIANCA.NENHUMA);
  });

  it("conta única não tem para onde errar", () => {
    const r = escolherContaDaCaptura([CONTA_A], "Bradesco");
    expect(r.conta.id).toBe("cA");
    expect(r.confianca).toBe(CONFIANCA.MEDIA);
  });

  it("conta de investimento nunca recebe captura", () => {
    expect(escolherContaDaCaptura([CAIXINHA], "Caixinha").conta).toBe(null);
  });

  it("conta encerrada também não", () => {
    const encerrada = { ...CONTA_A, is_active: false };
    expect(escolherContaDaCaptura([encerrada], "Nubank").conta).toBe(null);
  });
});

// ══ 17 · Capturado = manual ════════════════════════════════
describe("o lançamento capturado produz os mesmos números que o manual", () => {
  // Esta é a prova de que não existe uma segunda matemática. Cada caso
  // monta o par (capturado, manual) e passa os DOIS por `financas.js`.

  it("transferência: sai de uma conta e entra na outra, sem virar despesa", () => {
    const { lancamento: capturado } = montar("Pix enviado para Inter");
    const manual = {
      type: "transfer", amount: 1, date: "2026-09-05", is_realized: true,
      account_id: "cA", transfer_account_id: "cB", category: "transferencia",
    };

    const sCap = calcularSaldosPorConta(CONTAS, [capturado]);
    const sMan = calcularSaldosPorConta(CONTAS, [manual]);
    expect(sCap).toEqual(sMan);
    expect(sCap.cA).toBe(999);
    expect(sCap.cB).toBe(501);

    const kCap = calcularKPIsMes([capturado], CONTAS, new Date("2026-09-05T12:00:00"));
    const kMan = calcularKPIsMes([manual], CONTAS, new Date("2026-09-05T12:00:00"));
    expect(kCap).toEqual(kMan);
    // O que mais importa: transferência não é receita nem despesa.
    expect(kCap.saidas).toBe(0);
    expect(kCap.entradas).toBe(0);
  });

  it("compra no cartão: não tira da conta, nem no capturado nem no manual", () => {
    const { lancamento: capturado } = montar("Compra aprovada no crédito em Mercado");
    const manual = {
      type: "expense", amount: 1, date: "2026-09-05", is_realized: false,
      credit_card_id: "k1", account_id: null, invoice_month: "2026-09",
    };
    const sCap = calcularSaldosPorConta(CONTAS, [capturado]);
    expect(sCap).toEqual(calcularSaldosPorConta(CONTAS, [manual]));
    expect(sCap.cA).toBe(1000);
  });

  it("compra + pagamento da fatura NÃO dobram a despesa do mês", () => {
    // Era o Furo 1 voltando pela porta da captura: a compra conta o
    // gasto e o pagamento contava de novo.
    const { lancamento: compra } = montar("Compra aprovada no crédito em Mercado");
    const { lancamento: pagamento } = montar("Pagamento de fatura R$ 1,00");

    const k = calcularKPIsMes([compra, pagamento], CONTAS, new Date("2026-09-05T12:00:00"));
    const kSoCompra = calcularKPIsMes([compra], CONTAS, new Date("2026-09-05T12:00:00"));
    expect(k.saidas).toBe(kSoCompra.saidas);

    // Mas o dinheiro SAI da conta quando a fatura é paga.
    expect(calcularSaldosPorConta(CONTAS, [compra, pagamento]).cA).toBe(999);
  });

  it("despesa comum: capturada e manual são idênticas para o domínio", () => {
    const { lancamento: capturado } = montar("Pix enviado para Padaria do Zé");
    const manual = {
      type: "expense", amount: 1, date: "2026-09-05", is_realized: true,
      account_id: "cA", credit_card_id: null, category: "outros",
    };
    expect(calcularSaldosPorConta(CONTAS, [capturado]))
      .toEqual(calcularSaldosPorConta(CONTAS, [manual]));
    expect(calcularKPIsMes([capturado], CONTAS, new Date("2026-09-05T12:00:00")))
      .toEqual(calcularKPIsMes([manual], CONTAS, new Date("2026-09-05T12:00:00")));
  });
});

describe("parcelamento", () => {
  it("lê 2/3 e “parcela 2 de 3”", () => {
    expect(extrairParcela("parcela 2/3")).toEqual({ parcela: 2, total: 3 });
    expect(extrairParcela("Parcela 2 de 3")).toEqual({ parcela: 2, total: 3 });
  });

  it("não inventa quando não há", () => {
    expect(extrairParcela("Compra em Mercado")).toBe(null);
    expect(extrairParcela("compra 5/2")).toBe(null);
  });
});

describe("destino próprio", () => {
  it("não confunde terceiro com conta própria", () => {
    expect(identificarDestinoProprio("Pix para Padaria", CONTAS, CONTA_A, NOME).interno).toBe(false);
  });

  it("nome de conta curto demais não casa por acidente", () => {
    const curtas = [CONTA_A, { id: "cX", name: "BB", type: "bank" }];
    expect(identificarDestinoProprio("Pix para Bob", curtas, CONTA_A, NOME).interno).toBe(false);
  });
});

// ══ Conciliação · os dois lados de um movimento só ═════════
describe("conciliação entre os dois bancos", () => {
  // O caso real: Pix de R$ 1,00 do Itaú para o Nubank gera DUAS
  // notificações, de dois apps. Sem conciliar, o Nubank é creditado
  // duas vezes e o mês ganha uma receita que não existiu.
  const T = new Date("2026-09-05T14:02:00Z").getTime();
  const emT = (delta) => new Date(T + delta).toISOString();

  const saidaItau = {
    id: "t1", type: "expense", amount: 1, account_id: "cItau",
    captura_em: emT(0), captura_chave: "itau|1",
  };
  const entradaNubank = {
    id: "t2", type: "income", amount: 1, account_id: "cNu",
    captura_em: emT(0), captura_chave: "nu|1",
  };

  it("a saída chega primeiro: a entrada PROMOVE aquela linha a transferência", () => {
    // O par revela o que o texto não revelava. "Rheverson" não bate com
    // nome de conta nenhuma, mas saída de R$ 1 num banco e entrada de
    // R$ 1 em outro, no mesmo minuto, é evidência muito mais forte.
    const r = conciliarCaptura(
      { type: "income", amount: 1, account_id: "cNu" },
      [saidaItau], T + 30_000,
    );
    expect(r.acao).toBe("promover");
    expect(r.alvo).toBe("t1");
    expect(r.transfer_account_id).toBe("cNu");
  });

  it("a entrada chega primeiro: a saída vira transferência e o espelho sai", () => {
    const r = conciliarCaptura(
      { type: "expense", amount: 1, account_id: "cItau" },
      [entradaNubank], T + 30_000,
    );
    expect(r.acao).toBe("transferir");
    expect(r.transfer_account_id).toBe("cNu");
    expect(r.remover).toBe("t2");
  });

  it("transferência já registrada: a entrada é descartada", () => {
    // Aqui o nome casou e a saída já virou transfer. A notificação do
    // outro banco é o MESMO dinheiro — creditar de novo dobraria.
    const jaTransferido = {
      id: "t3", type: "transfer", amount: 1,
      account_id: "cItau", transfer_account_id: "cNu", captura_em: emT(0),
    };
    const r = conciliarCaptura(
      { type: "income", amount: 1, account_id: "cNu" },
      [jaTransferido], T + 20_000,
    );
    expect(r.acao).toBe("descartar");
    expect(r.motivo).toBe("espelho_de_transferencia");
  });

  it("fora da janela NÃO concilia", () => {
    // Mandar R$ 50 de manhã e receber R$ 50 à tarde são dois fatos
    // independentes. Casar por dia criaria transferência fantasma.
    const r = conciliarCaptura(
      { type: "income", amount: 1, account_id: "cNu" },
      [saidaItau], T + 40 * 60_000,
    );
    expect(r.acao).toBe("gravar");
  });

  it("valor diferente não concilia", () => {
    const r = conciliarCaptura(
      { type: "income", amount: 2, account_id: "cNu" },
      [saidaItau], T + 30_000,
    );
    expect(r.acao).toBe("gravar");
  });

  it("mesma conta não é transferência", () => {
    // Receber e gastar o mesmo valor na MESMA conta não é movimentação
    // interna — são dois fatos.
    const r = conciliarCaptura(
      { type: "income", amount: 1, account_id: "cItau" },
      [saidaItau], T + 30_000,
    );
    expect(r.acao).toBe("gravar");
  });

  it("compra no cartão nunca vira transferência", () => {
    const compra = {
      id: "t9", type: "expense", amount: 1, account_id: null,
      credit_card_id: "k1", captura_em: emT(0),
    };
    const r = conciliarCaptura(
      { type: "income", amount: 1, account_id: "cNu" },
      [compra], T + 30_000,
    );
    expect(r.acao).toBe("gravar");
  });

  it("sem nada recente, grava normalmente", () => {
    expect(conciliarCaptura({ type: "expense", amount: 1, account_id: "cItau" }, [], T).acao)
      .toBe("gravar");
  });
});

describe("a conciliação produz o saldo certo", () => {
  it("um Pix entre bancos move o dinheiro UMA vez", () => {
    const CONTA_ITAU = { id: "cItau", name: "Itaú", type: "bank", initial_balance: 100 };
    const CONTA_NU = { id: "cNu", name: "Nubank", type: "bank", initial_balance: 50 };
    const contas = [CONTA_ITAU, CONTA_NU];

    // O que o sistema grava DEPOIS da conciliação: uma transferência só.
    const conciliado = [{
      type: "transfer", amount: 1, date: "2026-09-05", is_realized: true,
      account_id: "cItau", transfer_account_id: "cNu",
    }];

    // O que gravaria SEM conciliar: transferência + entrada espelho.
    const semConciliar = [
      ...conciliado,
      { type: "income", amount: 1, date: "2026-09-05", is_realized: true, account_id: "cNu" },
    ];

    const certo = calcularSaldosPorConta(contas, conciliado);
    const errado = calcularSaldosPorConta(contas, semConciliar);

    expect(certo.cItau).toBe(99);
    expect(certo.cNu).toBe(51);
    // Sem conciliar, o Nubank recebia duas vezes.
    expect(errado.cNu).toBe(52);

    const k = calcularKPIsMes(conciliado, contas, new Date("2026-09-05T12:00:00"));
    expect(k.entradas).toBe(0);
    expect(k.saidas).toBe(0);
  });
});

// ══ O desempate com memória ════════════════════════════════
//
// O caso real: o dono tem "Nubank" (dele) e "Nubank Jeni" (da
// Jeniffer). Uma notificação de `com.nu.production` casa com as duas, o
// domínio se recusa a chutar — e até aqui isso era um beco sem saída.
//
// A regra que o usuário responde uma vez desfaz o empate para sempre. E
// ela vem ANTES do casamento por nome de propósito: é o único sinal que
// saiu de alguém que SABE a resposta, e é por ID, então sobrevive a
// renomear a conta.

const NU_MEU = { id: "nuMeu", name: "Nubank", type: "bank", initial_balance: 100 };
const NU_JENI = { id: "nuJeni", name: "Nubank Jeni", type: "bank", initial_balance: 200 };
const ITAU = { id: "itau", name: "Itaú", type: "bank", initial_balance: 300 };
const DOIS_NUBANK = [NU_MEU, NU_JENI, ITAU];

describe("empate entre contas com o nome do banco", () => {
  it("sem regra, NÃO escolhe e devolve os dois candidatos", () => {
    const r = escolherContaDaCaptura(DOIS_NUBANK, "Nubank");
    expect(r.conta).toBeNull();
    expect(r.opcoes).toEqual(["nuMeu", "nuJeni"]);
  });

  it("a regra desfaz o empate", () => {
    const r = escolherContaDaCaptura(DOIS_NUBANK, "Nubank", "nuJeni");
    expect(r.conta.id).toBe("nuJeni");
    expect(r.confianca).toBe(CONFIANCA.ALTA);
    expect(r.lembrada).toBe(true);
  });

  it("a regra é por ID: continua certa depois de renomear a conta", () => {
    // Tirar "Nubank" do nome da própria conta faz o casamento por nome
    // escolher "Nubank Jeni" sozinho, com confiança alta e errado — o
    // dinheiro dele indo para a conta dela.
    const renomeada = [{ ...NU_MEU, name: "Conta principal" }, NU_JENI, ITAU];
    expect(escolherContaDaCaptura(renomeada, "Nubank").conta?.id).toBe("nuJeni");
    expect(escolherContaDaCaptura(renomeada, "Nubank", "nuMeu").conta.id).toBe("nuMeu");
  });

  it("regra apontando para conta apagada não se aplica — a pergunta volta", () => {
    const r = escolherContaDaCaptura(DOIS_NUBANK, "Nubank", "fantasma");
    expect(r.conta).toBeNull();
    expect(r.opcoes).toEqual(["nuMeu", "nuJeni"]);
  });

  it("regra apontando para conta desativada também não", () => {
    const contas = [{ ...NU_MEU, is_active: false }, NU_JENI, ITAU];
    expect(escolherContaDaCaptura(contas, "Nubank", "nuMeu").conta.id).toBe("nuJeni");
  });

  it("Banco é rótulo de banco desconhecido, não nome de banco", () => {
    // Sem esta guarda, uma conta "Banco do Brasil" contém "banco" e
    // seria escolhida com confiança ALTA para qualquer notificação de
    // pacote não reconhecido.
    const contas = [{ id: "bb", name: "Banco do Brasil", type: "bank" }, ITAU];
    const r = escolherContaDaCaptura(contas, "Banco");
    expect(r.conta).toBeNull();
    expect(r.opcoes).toEqual(["bb", "itau"]);
  });
});

describe("empate entre cartões", () => {
  // Os cartões reais do app: o texto do banco nunca contém o apelido
  // que o usuário deu ao cartão aqui dentro.
  const NU_RHEVE = { id: "kR", name: "Nubank Rheve", closing_day: 13 };
  const NU_J = { id: "kJ", name: "Nubank Jeni", closing_day: 15 };
  const ITAU_CARD = { id: "kI", name: "Crédito Itaú Rheverson ", closing_day: 3 };
  const TRES = [NU_RHEVE, NU_J, ITAU_CARD];
  const TEXTO = "Compra aprovada no crédito de R$ 50,00 em PADARIA";

  it("o nome do cartão carregando o nome do banco resolve sozinho", () => {
    const r = escolherCartaoDaCaptura(TRES, TEXTO, "Itau");
    expect(r.cartao.id).toBe("kI");
    expect(r.confianca).toBe(CONFIANCA.ALTA);
  });

  it("dois cartões do mesmo banco empatam, e os candidatos são só eles", () => {
    const r = escolherCartaoDaCaptura(TRES, TEXTO, "Nubank");
    expect(r.cartao).toBeNull();
    expect(r.opcoes).toEqual(["kR", "kJ"]);
  });

  it("a regra desfaz o empate do cartão", () => {
    expect(escolherCartaoDaCaptura(TRES, TEXTO, "Nubank", "kR").cartao.id).toBe("kR");
  });

  it("o texto nomeando o cartão ganha da varredura por banco", () => {
    const r = escolherCartaoDaCaptura(TRES, "Compra no Nubank Jeni", "Nubank");
    expect(r.cartao.id).toBe("kJ");
  });
});

describe("o roteamento atravessa montarLancamentoCapturado", () => {
  const montarNu = (texto, roteamento) => montarLancamentoCapturado({
    banco: "Nubank", texto, valor: 30, data: "2026-09-05", chave: "k|9",
    contas: DOIS_NUBANK, cartoes: [], nomeUsuario: NOME, roteamento,
  });

  it("sem regra, a entrada do Nubank vira revisão com as opções", () => {
    const r = montarNu("Transferência recebida");
    expect(r.lancamento).toBeUndefined();
    expect(r.revisao.motivo).toBe("conta_indefinida");
    expect(r.revisao.opcoes).toEqual(["nuMeu", "nuJeni"]);
  });

  it("com regra, a mesma notificação vira receita na conta certa", () => {
    const r = montarNu("Transferência recebida", { conta: "nuMeu" });
    expect(r.revisao).toBeUndefined();
    expect(r.lancamento.type).toBe("income");
    expect(r.lancamento.account_id).toBe("nuMeu");
  });

  it("a regra de CARTÃO não roteia uma operação de CONTA", () => {
    // Por isso `tipo_destino` entra na chave da regra: o mesmo pacote
    // fala dos dois assuntos.
    const r = montarNu("Transferência recebida", { cartao: "kR" });
    expect(r.revisao.motivo).toBe("conta_indefinida");
  });

  it("a regra escolhe a conta e a transferência interna segue funcionando", () => {
    const r = montarNu("Pix enviado para Itaú", { conta: "nuMeu" });
    expect(r.lancamento.type).toBe("transfer");
    expect(r.lancamento.account_id).toBe("nuMeu");
    expect(r.lancamento.transfer_account_id).toBe("itau");
  });
});

describe("destino da transferência interna", () => {
  it("a escolha do usuário fecha a transferência sem destino", () => {
    const r = identificarDestinoProprio(
      "Pix enviado para Rheverson Gois", DOIS_NUBANK, NU_MEU, NOME, "itau",
    );
    expect(r.interno).toBe(true);
    expect(r.destino.id).toBe("itau");
  });

  it("sem escolha, sabe que é interno mas devolve os candidatos", () => {
    const r = identificarDestinoProprio(
      "Pix enviado para Rheverson Gois", DOIS_NUBANK, NU_MEU, NOME,
    );
    expect(r.interno).toBe(true);
    expect(r.destino).toBeNull();
    expect(r.opcoes).toEqual(["nuJeni", "itau"]);
  });

  it("destino escolhido NÃO é memorizável — muda a cada Pix", () => {
    expect(ESCOLHAS_MEMORIZAVEIS.has("conta")).toBe(true);
    expect(ESCOLHAS_MEMORIZAVEIS.has("cartao")).toBe(true);
    expect(ESCOLHAS_MEMORIZAVEIS.has("destino")).toBe(false);
  });
});

describe("quais empates viram pergunta", () => {
  it("os três motivos de destino têm campo de resposta", () => {
    expect(campoDaEscolha("conta_indefinida")).toBe("conta");
    expect(campoDaEscolha("cartao_indefinido")).toBe("cartao");
    expect(campoDaEscolha("transferencia_sem_destino")).toBe("destino");
  });

  it("nao entendi a notificacao NÃO vira pergunta", () => {
    // Nenhuma lista de contas responde isso. Oferecer uma pergunta sem
    // resposta possível é pior do que não perguntar.
    expect(campoDaEscolha("operacao_desconhecida")).toBeNull();
    expect(campoDaEscolha("valor_invalido")).toBeNull();
    expect(campoDaEscolha("estorno_em_cartao")).toBeNull();
  });
});

describe("o efeito dominó: resolver o empate reencontra o outro lado", () => {
  // O caso que motivou tudo. O Itaú notifica na hora e vira despesa. O
  // Nubank notifica trinta segundos depois, empata entre duas contas e
  // fica esperando. O usuário responde HORAS DEPOIS.
  //
  // A conciliação da resposta tem de correr no instante da NOTIFICAÇÃO,
  // não no de agora — senão a janela de 5 minutos cai num deserto, o
  // par não é encontrado, e o Nubank é creditado duas vezes.
  const T = new Date("2026-09-05T14:00:00Z").getTime();
  const HORAS_DEPOIS = T + 6 * 60 * 60 * 1000;

  const saidaItau = {
    id: "tx1", type: "expense", amount: 1, account_id: "itau",
    credit_card_id: null, captura_em: new Date(T).toISOString(),
  };
  const entradaNubank = {
    type: "income", amount: 1, account_id: "nuMeu", date: "2026-09-05",
  };

  it("no instante da notificação, o par é encontrado e promovido", () => {
    const d = conciliarCaptura(entradaNubank, [saidaItau], T + 30000);
    expect(d.acao).toBe("promover");
    expect(d.alvo).toBe("tx1");
    expect(d.transfer_account_id).toBe("nuMeu");
  });

  it("no instante de AGORA, o par se perde e o dinheiro dobraria", () => {
    const d = conciliarCaptura(entradaNubank, [saidaItau], HORAS_DEPOIS);
    expect(d.acao).toBe("gravar");
  });
});
