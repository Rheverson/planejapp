import { supabase } from "@/lib/supabase";
import {
  montarLancamentoCapturado, conciliarCaptura, campoDaEscolha,
  ESCOLHAS_MEMORIZAVEIS, JANELA_CONCILIACAO_MS,
} from "@/domain/captura";

// ============================================================
// A ponte entre a notificação e o banco.
//
// Existe por um motivo só: HAVER UM CAMINHO SÓ. Uma captura pode virar
// lançamento por dois caminhos — a notificação chegando ao vivo, e o
// usuário respondendo um empate na caixa de pendentes horas depois. Se
// cada um montasse o lançamento e conciliasse do seu jeito, teríamos
// duas matemáticas de novo, que é exatamente o erro que a Fase 7
// consertou.
//
// Aqui a resolução manual NÃO monta lançamento: ela roda
// `montarLancamentoCapturado` outra vez, inteira, com o empate desfeito.
// Efeito colateral bom: uma pendente parada de ontem se beneficia de
// qualquer melhoria que o classificador receber amanhã.
// ============================================================

const COLUNAS_JANELA =
  "id, type, amount, account_id, transfer_account_id, credit_card_id, captura_em";

/**
 * Tudo que o domínio precisa para decidir: contas, cartões, o nome do
 * titular e a memória de roteamento deste pacote.
 *
 * As quatro consultas vão juntas — é uma ida à rede, não quatro.
 */
export async function carregarContextoCaptura(userId, pacote) {
  const [contas, cartoes, perfil, regras] = await Promise.all([
    supabase.from("accounts").select("id, name, type, is_active").eq("user_id", userId),
    supabase.from("credit_cards")
      .select("id, name, closing_day, expense_date_mode, is_active").eq("user_id", userId),
    supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    pacote
      ? supabase.from("captura_roteamento")
        .select("tipo_destino, account_id, credit_card_id")
        .eq("user_id", userId).eq("pacote", pacote)
      : Promise.resolve({ data: [] }),
  ]);

  const roteamento = { conta: null, cartao: null, pacote: pacote || null };
  for (const r of regras.data || []) {
    if (r.tipo_destino === "conta") roteamento.conta = r.account_id;
    if (r.tipo_destino === "cartao") roteamento.cartao = r.credit_card_id;
  }

  return {
    contas: contas.data || [],
    cartoes: cartoes.data || [],
    nomeUsuario: perfil.data?.full_name,
    roteamento,
  };
}

/**
 * Grava um lançamento capturado, conciliando com o outro lado.
 *
 * `instanteMs` é o instante da NOTIFICAÇÃO, nunca `Date.now()`. Numa
 * resolução manual as duas coisas estão a horas de distância, e a janela
 * de conciliação calculada sobre a hora errada não acha o outro lado —
 * o destino seria creditado duas vezes, que é o bug que a conciliação
 * existe para impedir.
 *
 * Devolve `{ acao, transactionId, erro }`.
 */
export async function gravarCaptura({ userId, lancamento, instanteMs, roteamento }) {
  const desde = new Date(instanteMs - JANELA_CONCILIACAO_MS).toISOString();
  const ate = new Date(instanteMs + JANELA_CONCILIACAO_MS).toISOString();

  // Janela indexada sobre `transactions_captura_janela`, que é PARCIAL:
  // só linhas capturadas. As manuais ficam de fora.
  const { data: recentes } = await supabase
    .from("transactions")
    .select(COLUNAS_JANELA)
    .eq("user_id", userId)
    .not("captura_chave", "is", null)
    .gte("captura_em", desde)
    .lte("captura_em", ate);

  const d = conciliarCaptura(lancamento, recentes || [], instanteMs);

  if (d.acao === "descartar") {
    // O mesmo dinheiro já está contabilizado pelo outro lado.
    return { acao: "descartar", transactionId: d.alvo, motivo: d.motivo };
  }

  if (d.acao === "promover") {
    const { error } = await supabase.from("transactions")
      .update({
        type: "transfer",
        transfer_account_id: d.transfer_account_id,
        category: "transferencia",
      })
      .eq("id", d.alvo).eq("user_id", userId);
    if (error) return { acao: "promover", erro: error };
    return { acao: "promover", transactionId: d.alvo, motivo: d.motivo };
  }

  const corpo = d.acao === "transferir"
    ? {
      ...lancamento,
      type: "transfer",
      transfer_account_id: d.transfer_account_id,
      category: "transferencia",
    }
    : lancamento;

  const { data: criada, error } = await supabase.from("transactions")
    .insert([{ user_id: userId, captura_em: new Date(instanteMs).toISOString(), ...corpo }])
    .select("id").maybeSingle();

  if (error) {
    // 23505 = o índice único barrou: esta notificação já virou
    // lançamento numa sessão anterior. Esperado, não é falha.
    if (error.code === "23505") return { acao: "repetida" };
    return { acao: d.acao, erro: error };
  }

  // O espelho sai só DEPOIS do insert. Se o insert falhasse, apagar
  // antes perderia o lançamento.
  if (d.acao === "transferir" && d.remover) {
    await supabase.from("transactions")
      .delete().eq("id", d.remover).eq("user_id", userId);
  }

  await marcarRegraUsada(userId, lancamento, roteamento);
  return { acao: d.acao === "transferir" ? "transferir" : "gravar", transactionId: criada?.id };
}

/** Carimba a regra que roteou este lançamento — para o usuário poder auditá-la depois. */
async function marcarRegraUsada(userId, lancamento, roteamento) {
  if (!roteamento?.pacote) return;
  const tipo = lancamento.credit_card_id && lancamento.credit_card_id === roteamento.cartao
    ? "cartao"
    : (lancamento.account_id && lancamento.account_id === roteamento.conta ? "conta" : null);
  if (!tipo) return;
  await supabase.from("captura_roteamento")
    .update({ usada_em: new Date().toISOString() })
    .eq("user_id", userId).eq("pacote", roteamento.pacote).eq("tipo_destino", tipo);
}

/**
 * Guarda a pergunta que o domínio não soube responder.
 *
 * Guarda a NOTIFICAÇÃO, não um lançamento pela metade — nada entra em
 * `transactions` antes de haver certeza. Um gasto sem conta, ou com
 * conta chutada, entra em saldo, KPI, projeção e taxa de poupança na
 * mesma hora.
 */
export async function registrarPendente({
  userId, chave, pacote, banco, texto, valor, data, instanteMs, revisao,
}) {
  const { error } = await supabase.from("capturas_pendentes").insert([{
    user_id: userId,
    captura_chave: chave,
    pacote: pacote || null,
    banco: banco || null,
    texto: texto || null,
    valor,
    data,
    capturada_em: new Date(instanteMs).toISOString(),
    motivo: revisao.motivo,
    detalhe: revisao.detalhe || null,
    opcoes: revisao.opcoes?.length ? revisao.opcoes : null,
  }]);

  // 23505 = a mesma notificação já está na caixa (o Android reemite a
  // cada atualização do texto), ou já foi respondida antes. Nos dois
  // casos, não perguntar de novo é o comportamento certo.
  if (error && error.code !== "23505") return { erro: error };
  return { repetida: !!error };
}

/**
 * A resposta do usuário vira lançamento.
 *
 * Três coisas acontecem aqui, nesta ordem:
 *
 *   1. o classificador roda DE NOVO, com o empate desfeito;
 *   2. a conciliação roda no instante da NOTIFICAÇÃO, não no de agora —
 *      é assim que o Pix que ficou parado na caixa reencontra o outro
 *      lado e vira transferência em vez de duplicar o dinheiro;
 *   3. a escolha vira regra, e a pergunta não se repete.
 */
export async function resolverPendente({ userId, pendente, escolha, memorizar = true }) {
  const campo = campoDaEscolha(pendente.motivo);
  if (!campo) return { erro: new Error(`motivo sem escolha possível: ${pendente.motivo}`) };

  const ctx = await carregarContextoCaptura(userId, pendente.pacote);
  const resultado = montarLancamentoCapturado({
    banco: pendente.banco,
    texto: pendente.texto,
    valor: Number(pendente.valor),
    data: pendente.data,
    chave: pendente.captura_chave,
    contas: ctx.contas,
    cartoes: ctx.cartoes,
    nomeUsuario: ctx.nomeUsuario,
    roteamento: { ...ctx.roteamento, [campo]: escolha },
  });

  // Uma resposta pode revelar a PRÓXIMA pergunta: escolhida a conta de
  // origem, uma saída pode se revelar transferência interna sem destino
  // conhecido. A pendente muda de pergunta em vez de virar erro.
  if (resultado.revisao) {
    const proximo = campoDaEscolha(resultado.revisao.motivo);
    if (proximo && proximo !== campo) {
      await supabase.from("capturas_pendentes").update({
        motivo: resultado.revisao.motivo,
        detalhe: resultado.revisao.detalhe || null,
        opcoes: resultado.revisao.opcoes?.length ? resultado.revisao.opcoes : null,
      }).eq("id", pendente.id).eq("user_id", userId);
      return { acao: "outra_pergunta", motivo: resultado.revisao.motivo };
    }
    return { erro: new Error(resultado.revisao.detalhe || resultado.revisao.motivo) };
  }

  const instanteMs = new Date(pendente.capturada_em).getTime();
  const gravacao = await gravarCaptura({
    userId, lancamento: resultado.lancamento, instanteMs,
  });
  if (gravacao.erro) return { erro: gravacao.erro };

  if (memorizar && ESCOLHAS_MEMORIZAVEIS.has(campo) && pendente.pacote) {
    await supabase.from("captura_roteamento").upsert({
      user_id: userId,
      pacote: pendente.pacote,
      tipo_destino: campo,
      account_id: campo === "conta" ? escolha : null,
      credit_card_id: campo === "cartao" ? escolha : null,
      usada_em: new Date().toISOString(),
    }, { onConflict: "user_id,pacote,tipo_destino" });
  }

  await supabase.from("capturas_pendentes").update({
    resolucao: "lancada",
    resolvida_em: new Date().toISOString(),
    // Na conciliação o dinheiro está na linha do OUTRO lado. O ponteiro
    // aponta para a transação que representa esta notificação, seja ela
    // a recém-criada ou a que foi promovida.
    transaction_id: gravacao.transactionId || null,
  }).eq("id", pendente.id).eq("user_id", userId);

  return { acao: gravacao.acao, transactionId: gravacao.transactionId };
}

/** "Isso não é meu": sai da caixa sem virar dinheiro nenhum. */
export async function descartarPendente({ userId, pendente }) {
  const { error } = await supabase.from("capturas_pendentes").update({
    resolucao: "descartada",
    resolvida_em: new Date().toISOString(),
  }).eq("id", pendente.id).eq("user_id", userId);
  return { erro: error };
}
