// ============================================================
// O desempate com memória, contra o banco de produção.
//
// O caso real: o dono tem duas contas "Nubank" — a dele e a da
// Jeniffer — e três cartões. Uma notificação de `com.nu.production`
// casa com as duas contas, e o domínio corretamente se recusa a chutar.
// Até aqui isso era um beco sem saída: um toast, e a captura evaporava.
//
// O que esta bateria prova, e que só o banco de verdade prova:
//
//   - a pergunta nasce e NÃO se repete (unique + RLS);
//   - a regra não pode apontar para a conta de outra pessoa;
//   - o CHECK impede regra de conta apontando para cartão;
//   - o EFEITO DOMINÓ: pendente respondida horas depois ainda reencontra
//     o outro lado da transferência, porque a conciliação corre no
//     instante da NOTIFICAÇÃO e não no de agora;
//   - a regra apaga junto com a conta (ON DELETE CASCADE), em vez de
//     rotear para um fantasma.
//
// As decisões são as DE VERDADE: `montarLancamentoCapturado` e
// `conciliarCaptura` vêm de `src/domain/captura.js`. O que este script
// reescreve é só a ida à rede, transcrevendo `src/lib/captura.js` passo
// a passo — o app usa o cliente Supabase, aqui é PostgREST puro.
//
// Roda com JWT de usuário comum, nunca service_role.
//
//   node scripts/qa-captura-desempate.js
// ============================================================

import fs from "node:fs";
import {
  montarLancamentoCapturado, conciliarCaptura, campoDaEscolha,
  ESCOLHAS_MEMORIZAVEIS, JANELA_CONCILIACAO_MS,
} from "../src/domain/captura.js";

const env = {};
for (const linha of fs.readFileSync(".env", "utf8").split("\n")) {
  if (linha.includes("=") && !linha.startsWith("#")) {
    const [k, ...r] = linha.split("=");
    env[k.trim()] = r.join("=").trim().replace(/^"|"$/g, "");
  }
}

const DONO = "a1a1a1a1-0000-4000-8000-000000000081";
const INTRUSO = "b2b2b2b2-0000-4000-8000-000000000082";

const NUBANK = "11111111-0000-4000-8000-000000000001";
const NUBANK_JENI = "11111111-0000-4000-8000-000000000002";
const ITAU = "11111111-0000-4000-8000-000000000003";
const CARTAO_RHEVE = "22222222-0000-4000-8000-000000000001";
const CARTAO_ITAU = "22222222-0000-4000-8000-000000000003";

const PACOTE_NU = "com.nu.production";
const HOJE = new Date().toISOString().slice(0, 10);

// ── Sessões ──────────────────────────────────────────────────
const jwt = {};
async function entrar(rotulo, email, senha) {
  const r = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: senha }),
  });
  const corpo = await r.json();
  if (!corpo.access_token) throw new Error(`login ${rotulo} falhou: ${corpo.error_description || r.status}`);
  jwt[rotulo] = corpo.access_token;
}

async function api(caminho, opcoes = {}, quem = "dono") {
  const r = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${caminho}`, {
    ...opcoes,
    headers: {
      apikey: env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${jwt[quem]}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
  });
  const texto = await r.text();
  let corpo = null;
  try { corpo = texto ? JSON.parse(texto) : null; } catch { corpo = texto; }
  return { status: r.status, corpo };
}

// ── O caminho do app, transcrito ─────────────────────────────

/** `carregarContextoCaptura` de src/lib/captura.js. */
async function contexto(pacote) {
  const [contas, cartoes, regras] = await Promise.all([
    api(`accounts?user_id=eq.${DONO}&select=id,name,type,is_active`),
    api(`credit_cards?user_id=eq.${DONO}&select=id,name,closing_day,expense_date_mode,is_active`),
    pacote
      ? api(`captura_roteamento?user_id=eq.${DONO}&pacote=eq.${pacote}`
            + "&select=tipo_destino,account_id,credit_card_id")
      : { corpo: [] },
  ]);
  const roteamento = { conta: null, cartao: null, pacote: pacote || null };
  for (const r of regras.corpo || []) {
    if (r.tipo_destino === "conta") roteamento.conta = r.account_id;
    if (r.tipo_destino === "cartao") roteamento.cartao = r.credit_card_id;
  }
  return { contas: contas.corpo || [], cartoes: cartoes.corpo || [], roteamento };
}

/** `gravarCaptura` de src/lib/captura.js. */
async function gravar(lancamento, instanteMs) {
  const desde = new Date(instanteMs - JANELA_CONCILIACAO_MS).toISOString();
  const ate = new Date(instanteMs + JANELA_CONCILIACAO_MS).toISOString();
  const { corpo: recentes } = await api(
    `transactions?user_id=eq.${DONO}&captura_chave=not.is.null`
    + `&captura_em=gte.${desde}&captura_em=lte.${ate}`
    + "&select=id,type,amount,account_id,transfer_account_id,credit_card_id,captura_em",
  );

  const d = conciliarCaptura(lancamento, recentes || [], instanteMs);
  if (d.acao === "descartar") return { acao: "descartar", transactionId: d.alvo };

  if (d.acao === "promover") {
    await api(`transactions?id=eq.${d.alvo}`, {
      method: "PATCH",
      body: JSON.stringify({
        type: "transfer", transfer_account_id: d.transfer_account_id, category: "transferencia",
      }),
    });
    return { acao: "promover", transactionId: d.alvo };
  }

  const corpo = d.acao === "transferir"
    ? { ...lancamento, type: "transfer", transfer_account_id: d.transfer_account_id, category: "transferencia" }
    : lancamento;

  const r = await api("transactions", {
    method: "POST",
    body: JSON.stringify([{
      user_id: DONO, captura_em: new Date(instanteMs).toISOString(), ...corpo,
    }]),
  });
  if (r.status === 409 || String(r.corpo?.code) === "23505") return { acao: "repetida" };
  if (r.status !== 201) return { erro: r.corpo };

  if (d.acao === "transferir" && d.remover) {
    await api(`transactions?id=eq.${d.remover}`, { method: "DELETE" });
  }
  return { acao: d.acao === "transferir" ? "transferir" : "gravar", transactionId: r.corpo?.[0]?.id };
}

/** O caminho inteiro de uma notificação: classifica, ou guarda a pergunta. */
async function capturar({ banco, pacote, texto, valor, chave, instanteMs }) {
  const ctx = await contexto(pacote);
  const resultado = montarLancamentoCapturado({
    banco, texto, valor, data: HOJE, chave,
    contas: ctx.contas, cartoes: ctx.cartoes, nomeUsuario: "QA Desempate",
    roteamento: ctx.roteamento,
  });

  if (resultado.revisao) {
    if (!campoDaEscolha(resultado.revisao.motivo)) {
      return { acao: "aviso", motivo: resultado.revisao.motivo };
    }
    const r = await api("capturas_pendentes", {
      method: "POST",
      body: JSON.stringify([{
        user_id: DONO, captura_chave: chave, pacote, banco, texto, valor, data: HOJE,
        capturada_em: new Date(instanteMs).toISOString(),
        motivo: resultado.revisao.motivo,
        detalhe: resultado.revisao.detalhe || null,
        opcoes: resultado.revisao.opcoes?.length ? resultado.revisao.opcoes : null,
      }]),
    });
    const repetida = r.status === 409 || String(r.corpo?.code) === "23505";
    return {
      acao: repetida ? "ja_perguntada" : "pendente",
      motivo: resultado.revisao.motivo,
      opcoes: resultado.revisao.opcoes,
      pendente: r.corpo?.[0],
    };
  }

  const g = await gravar(resultado.lancamento, instanteMs);
  return { ...g, lancamento: resultado.lancamento };
}

/** `resolverPendente` de src/lib/captura.js. */
async function resolver(pendente, escolha, memorizar = true) {
  const campo = campoDaEscolha(pendente.motivo);
  const ctx = await contexto(pendente.pacote);
  const resultado = montarLancamentoCapturado({
    banco: pendente.banco, texto: pendente.texto, valor: Number(pendente.valor),
    data: pendente.data, chave: pendente.captura_chave,
    contas: ctx.contas, cartoes: ctx.cartoes, nomeUsuario: "QA Desempate",
    roteamento: { ...ctx.roteamento, [campo]: escolha },
  });
  if (resultado.revisao) return { revisao: resultado.revisao.motivo };

  // O INSTANTE DA NOTIFICAÇÃO. É esta linha que faz o dominó funcionar.
  const instanteMs = new Date(pendente.capturada_em).getTime();
  const g = await gravar(resultado.lancamento, instanteMs);
  if (g.erro) return g;

  if (memorizar && ESCOLHAS_MEMORIZAVEIS.has(campo) && pendente.pacote) {
    await api("captura_roteamento", {
      method: "POST",
      body: JSON.stringify([{
        user_id: DONO, pacote: pendente.pacote, tipo_destino: campo,
        account_id: campo === "conta" ? escolha : null,
        credit_card_id: campo === "cartao" ? escolha : null,
        usada_em: new Date().toISOString(),
      }]),
    });
  }

  await api(`capturas_pendentes?id=eq.${pendente.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      resolucao: "lancada", resolvida_em: new Date().toISOString(),
      transaction_id: g.transactionId || null,
    }),
  });
  return g;
}

// ── Verificação ──────────────────────────────────────────────
const linhas = [];
function checar(rotulo, ok, evidencia) {
  linhas.push({ rotulo, ok });
  console.log(`  ${ok ? "PASS " : "FAIL "} | ${rotulo}${evidencia ? ` | ${evidencia}` : ""}`);
}

async function saldos() {
  const { corpo: contas } = await api(`accounts?user_id=eq.${DONO}&select=id,name,initial_balance`);
  const { corpo: tx } = await api(
    `transactions?user_id=eq.${DONO}&select=type,amount,account_id,transfer_account_id,credit_card_id`,
  );
  const s = {};
  for (const c of contas) s[c.name] = Number(c.initial_balance);
  const nome = (id) => contas.find((c) => c.id === id)?.name;
  for (const t of tx) {
    const v = Number(t.amount);
    if (t.type === "transfer") {
      if (t.account_id) s[nome(t.account_id)] -= v;
      if (t.transfer_account_id) s[nome(t.transfer_account_id)] += v;
    } else if (t.credit_card_id) continue;
    else if (t.type === "income") s[nome(t.account_id)] += v;
    else if (t.type === "expense") s[nome(t.account_id)] -= v;
  }
  return s;
}

async function limpar() {
  await api(`transactions?user_id=eq.${DONO}`, { method: "DELETE" });
  await api(`capturas_pendentes?user_id=eq.${DONO}`, { method: "DELETE" });
  await api(`captura_roteamento?user_id=eq.${DONO}`, { method: "DELETE" });
}

async function main() {
  await entrar("dono", "desempate-qa@teste.invalid", "Desempate!2026#qa");
  await entrar("intruso", "intruso-qa@teste.invalid", "Intruso!2026#qa");
  await limpar();

  const AGORA = Date.now();
  const SEIS_HORAS_ATRAS = AGORA - 6 * 60 * 60 * 1000;

  // ── 1. A pergunta nasce ──────────────────────────────────
  console.log("1. Duas contas Nubank: o domínio não chuta, ele pergunta");
  let r = await capturar({
    banco: "Nubank", pacote: PACOTE_NU, texto: "Transferência recebida",
    valor: 1, chave: `nu|${AGORA}|a`, instanteMs: SEIS_HORAS_ATRAS + 30000,
  });
  checar("vira pendência, não lançamento", r.acao === "pendente", r.acao);
  checar("com o motivo certo", r.motivo === "conta_indefinida", r.motivo);
  checar("oferecendo só as duas contas Nubank",
    r.opcoes?.length === 2 && r.opcoes.includes(NUBANK) && r.opcoes.includes(NUBANK_JENI),
    `${r.opcoes?.length} opções`);

  let tx = (await api(`transactions?user_id=eq.${DONO}&select=id`)).corpo;
  checar("NADA entrou em transactions", tx.length === 0, `${tx.length} linha(s)`);

  const pendente = r.pendente;

  // ── 2. A mesma notificação não pergunta duas vezes ───────
  console.log("");
  console.log("2. O Android reemite a notificação a cada atualização do texto");
  const r2 = await capturar({
    banco: "Nubank", pacote: PACOTE_NU, texto: "Transferência recebida de João",
    valor: 1, chave: `nu|${AGORA}|a`, instanteMs: SEIS_HORAS_ATRAS + 40000,
  });
  checar("texto diferente, mesma chave: não vira segunda pergunta",
    r2.acao === "ja_perguntada", r2.acao);
  const abertas = (await api(`capturas_pendentes?user_id=eq.${DONO}&resolvida_em=is.null&select=id`)).corpo;
  checar("uma pergunta só na caixa", abertas.length === 1, `${abertas.length}`);

  // ── 3. Ninguém mais vê nem escreve ───────────────────────
  console.log("");
  console.log("3. Isolamento — JWT de outro usuário comum, sem service_role");
  const alheias = await api(`capturas_pendentes?select=id`, {}, "intruso");
  checar("o intruso não enxerga a pendência", (alheias.corpo || []).length === 0,
    `${(alheias.corpo || []).length} linha(s)`);

  const regraAlheia = await api("captura_roteamento", {
    method: "POST",
    body: JSON.stringify([{
      user_id: INTRUSO, pacote: PACOTE_NU, tipo_destino: "conta", account_id: NUBANK,
    }]),
  }, "intruso");
  checar("o intruso não cria regra apontando para conta minha",
    regraAlheia.status >= 400, `HTTP ${regraAlheia.status}`);

  const roubo = await api("captura_roteamento", {
    method: "POST",
    body: JSON.stringify([{
      user_id: DONO, pacote: PACOTE_NU, tipo_destino: "conta", account_id: NUBANK,
    }]),
  }, "intruso");
  checar("nem regra em nome de outro usuário", roubo.status >= 400, `HTTP ${roubo.status}`);

  // ── 4. O CHECK do destino ────────────────────────────────
  console.log("");
  console.log("4. Regra de conta apontando para cartão é impossível");
  const incoerente = await api("captura_roteamento", {
    method: "POST",
    body: JSON.stringify([{
      user_id: DONO, pacote: "x.y.z", tipo_destino: "conta", credit_card_id: CARTAO_RHEVE,
    }]),
  });
  checar("o banco recusa o destino incoerente", incoerente.status >= 400,
    `HTTP ${incoerente.status}`);

  // ── 5. O efeito dominó ───────────────────────────────────
  console.log("");
  console.log("5. O EFEITO DOMINÓ — a resposta reencontra o outro lado, 6h depois");
  // O Itaú notificou na hora e virou despesa; foi o Nubank que empatou.
  await api("transactions", {
    method: "POST",
    body: JSON.stringify([{
      user_id: DONO, account_id: ITAU, description: "Pix enviado", amount: 1,
      type: "expense", category: "outros", date: HOJE, is_realized: true,
      captura_chave: `itau|${AGORA}|a`,
      captura_em: new Date(SEIS_HORAS_ATRAS).toISOString(),
    }]),
  });

  const resolvido = await resolver(pendente, NUBANK);
  checar("a resposta PROMOVE a saída do Itaú a transferência",
    resolvido.acao === "promover", resolvido.acao);

  tx = (await api(`transactions?user_id=eq.${DONO}&select=type,account_id,transfer_account_id`)).corpo;
  checar("sobra UMA linha, do tipo transfer",
    tx.length === 1 && tx[0].type === "transfer", `${tx.length} linha(s), ${tx[0]?.type}`);
  checar("saindo do Itaú e entrando no Nubank certo",
    tx[0]?.account_id === ITAU && tx[0]?.transfer_account_id === NUBANK);

  let s = await saldos();
  checar("Itaú 300 → 299", s.Itau === 299, `R$ ${s.Itau}`);
  checar("Nubank 100 → 101, creditado UMA vez", s.Nubank === 101, `R$ ${s.Nubank}`);
  checar("Nubank Jeni intocado", s["Nubank Jeni"] === 200, `R$ ${s["Nubank Jeni"]}`);

  const fechada = (await api(`capturas_pendentes?id=eq.${pendente.id}&select=resolucao,transaction_id`)).corpo[0];
  checar("a pendência fica marcada como lançada", fechada?.resolucao === "lancada");
  checar("apontando para a transação que representa esse dinheiro",
    !!fechada?.transaction_id, fechada?.transaction_id ? "ok" : "nulo");

  // ── 6. A memória ─────────────────────────────────────────
  console.log("");
  console.log("6. A memória — a próxima notificação do Nubank não pergunta nada");
  const regra = (await api(`captura_roteamento?user_id=eq.${DONO}&pacote=eq.${PACOTE_NU}&select=*`)).corpo;
  checar("a escolha virou regra", regra.length === 1 && regra[0].account_id === NUBANK,
    `${regra.length} regra(s)`);

  r = await capturar({
    banco: "Nubank", pacote: PACOTE_NU, texto: "Pix recebido de Maria",
    valor: 25, chave: `nu|${AGORA}|b`, instanteMs: AGORA,
  });
  checar("entra direto, sem pergunta", r.acao === "gravar", r.acao);
  checar("na conta que o usuário escolheu", r.lancamento?.account_id === NUBANK);
  checar("como receita", r.lancamento?.type === "income", r.lancamento?.type);

  // ── 7. Regra de conta não roteia cartão ──────────────────
  console.log("");
  console.log("7. O mesmo pacote fala de conta E de cartão — são regras diferentes");
  r = await capturar({
    banco: "Nubank", pacote: PACOTE_NU, texto: "Compra aprovada no crédito em Mercado",
    valor: 80, chave: `nu|${AGORA}|c`, instanteMs: AGORA,
  });
  checar("a regra de conta NÃO decide o cartão", r.acao === "pendente", r.acao);
  checar("e o empate é entre os dois cartões Nubank", r.opcoes?.length === 2,
    `${r.opcoes?.length} opções`);

  const pendenteCartao = r.pendente;
  const doCartao = await resolver(pendenteCartao, CARTAO_RHEVE);
  checar("respondido, vira compra no cartão", doCartao.acao === "gravar", doCartao.acao);

  const compra = (await api(
    `transactions?user_id=eq.${DONO}&credit_card_id=eq.${CARTAO_RHEVE}&select=account_id,is_realized,invoice_month`,
  )).corpo[0];
  checar("sem conta e prevista, igual ao formulário manual",
    compra?.account_id === null && compra?.is_realized === false,
    `conta ${compra?.account_id} · realizada ${compra?.is_realized}`);

  s = await saldos();
  checar("a compra no cartão NÃO mexeu no saldo da conta", s.Nubank === 126, `R$ ${s.Nubank}`);

  const regras = (await api(`captura_roteamento?user_id=eq.${DONO}&select=tipo_destino`)).corpo;
  checar("agora são duas regras, uma por assunto", regras.length === 2,
    regras.map((x) => x.tipo_destino).join(" + "));

  // ── 8. Cartão do Itaú resolve sozinho ────────────────────
  console.log("");
  console.log("8. Três cartões, e o do Itaú se identifica sem pergunta nenhuma");
  r = await capturar({
    banco: "Itau", pacote: "com.itau", texto: "Compra aprovada no crédito em Posto",
    valor: 40, chave: `itau|${AGORA}|c`, instanteMs: AGORA,
  });
  checar("o nome do cartão carrega o nome do banco: resolve sozinho",
    r.acao === "gravar" && r.lancamento?.credit_card_id === CARTAO_ITAU, r.acao);

  // ── 9. Descartar ─────────────────────────────────────────
  console.log("");
  console.log("9. “Não é meu” — sai da caixa sem virar dinheiro");
  r = await capturar({
    banco: "Nubank", pacote: "com.outro.banco", texto: "Compra aprovada no crédito",
    valor: 9, chave: `outro|${AGORA}|d`, instanteMs: AGORA,
  });
  const antes = (await api(`transactions?user_id=eq.${DONO}&select=id`)).corpo.length;
  await api(`capturas_pendentes?id=eq.${r.pendente.id}`, {
    method: "PATCH",
    body: JSON.stringify({ resolucao: "descartada", resolvida_em: new Date().toISOString() }),
  });
  const depois = (await api(`transactions?user_id=eq.${DONO}&select=id`)).corpo.length;
  checar("nenhuma transação criada", antes === depois, `${antes} → ${depois}`);
  const naCaixa = (await api(`capturas_pendentes?user_id=eq.${DONO}&resolvida_em=is.null&select=id`)).corpo;
  checar("a caixa fica vazia", naCaixa.length === 0, `${naCaixa.length}`);

  const revolta = await capturar({
    banco: "Nubank", pacote: "com.outro.banco", texto: "Compra aprovada no crédito",
    valor: 9, chave: `outro|${AGORA}|d`, instanteMs: AGORA,
  });
  checar("e a mesma notificação não ressuscita a pergunta",
    revolta.acao === "ja_perguntada", revolta.acao);

  // ── 10. Conta apagada mata a regra ───────────────────────
  console.log("");
  console.log("10. Conta apagada leva a regra junto, em vez de rotear para fantasma");
  const efemera = (await api("accounts", {
    method: "POST",
    body: JSON.stringify([{ user_id: DONO, name: "Efemera QA", type: "bank", initial_balance: 0 }]),
  })).corpo[0];
  await api("captura_roteamento", {
    method: "POST",
    body: JSON.stringify([{
      user_id: DONO, pacote: "com.efemera", tipo_destino: "conta", account_id: efemera.id,
    }]),
  });
  const criada = (await api(`captura_roteamento?pacote=eq.com.efemera&select=pacote`)).corpo;
  checar("regra criada", criada.length === 1);

  await api(`accounts?id=eq.${efemera.id}`, { method: "DELETE" });
  const sobrou = (await api(`captura_roteamento?pacote=eq.com.efemera&select=pacote`)).corpo;
  checar("apagada a conta, a regra some sozinha", sobrou.length === 0, `${sobrou.length} regra(s)`);

  // ── Limpeza ──────────────────────────────────────────────
  await limpar();
  const resto = (await api(`transactions?user_id=eq.${DONO}&select=id`)).corpo;
  console.log("");
  console.log(`limpeza: ${resto.length} transação(ões) de QA restantes`);

  const falhas = linhas.filter((l) => !l.ok);
  console.log("");
  console.log(`RESULTADO: ${linhas.length - falhas.length}/${linhas.length}`);
  if (falhas.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
