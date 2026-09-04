// ============================================================
// O funil visto pelo webhook.
//
// Prova três coisas que só o backend pode provar:
//
//   1. `checkout_concluido` nasce do Stripe, não do clique.
//   2. Entrega repetida NÃO duplica evento — e este projeto tem três
//      endpoints LIVE apontando para a mesma função, então repetição
//      não é hipótese, é o dia a dia.
//   3. Evento do modo TEST não entra na conversão LIVE.
//
// Os eventos são assinados com o segredo de TESTE. Nada aqui toca
// assinatura real: a linha alvo é de um usuário @teste.invalid.
//
//   node scripts/qa-eventos-webhook.js
// ============================================================

import fs from "node:fs";
import { createHmac } from "node:crypto";

const env = {};
for (const linha of fs.readFileSync(".env", "utf8").split("\n")) {
  if (linha.includes("=") && !linha.startsWith("#")) {
    const [k, ...r] = linha.split("=");
    env[k.trim()] = r.join("=").trim().replace(/^"|"$/g, "");
  }
}

const USUARIO = "a6a6a6a6-0000-4000-8000-000000000006";
const CLIENTE = "cus_QA_EVENTOS_TESTE";
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function enviar(evento) {
  const corpo = JSON.stringify(evento);
  const ts = Math.floor(Date.now() / 1000);
  const mac = createHmac("sha256", env.STRIPE_WEBHOOK_SECRET_TEST)
    .update(`${ts}.${corpo}`).digest("hex");
  const r = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/stripe-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Stripe-Signature": `t=${ts},v1=${mac}` },
    body: corpo,
  });
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { json = texto; }
  return { status: r.status, corpo: json };
}

// Nao ha service_role no .env local, e e melhor assim: a leitura usa o
// JWT do PROPRIO dono dos eventos, entao ela exercita a policy de
// leitura de verdade em vez de passar por cima dela.
let jwtDono = null;
async function entrar() {
  const r = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: "atacante-qa@teste.invalid", password: "Atacante!2026#qa" }),
  });
  jwtDono = (await r.json()).access_token;
}

async function eventos(filtro = "") {
  const r = await fetch(
    `${env.VITE_SUPABASE_URL}/rest/v1/eventos_plano?user_id=eq.${USUARIO}${filtro}&select=*&order=id`,
    { headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${jwtDono}` } },
  );
  const d = await r.json();
  return Array.isArray(d) ? d : [];
}

/** A view do funil NAO e do cliente — 404/403 aqui e o comportamento
 *  correto, e ja e metade da prova de que ela nao vaza. */
async function viewFechadaParaCliente() {
  const r = await fetch(
    `${env.VITE_SUPABASE_URL}/rest/v1/vw_eventos_funil?select=*`,
    { headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${jwtDono}` } },
  );
  return r.status;
}

const linhas = [];
function checar(rotulo, ok, detalhe) {
  linhas.push({ rotulo, ok });
  console.log(`  ${ok ? "PASS " : "FALHA"} | ${rotulo}${detalhe ? ` | ${detalhe}` : ""}`);
}

// Ids novos a cada execucao: `stripe_eventos_processados` guarda o
// `event.id` para sempre, entao reaproveitar id faria a segunda rodada
// inteira cair como "reentrega" e passar sem testar nada.
const RODADA = Date.now().toString(36);
const SESSAO_ID = `cs_qa_eventos_${RODADA}`;

const sessao = (id) => ({
  id: `evt_qa_${RODADA}_${id}`,
  type: "checkout.session.completed",
  created: Math.floor(Date.now() / 1000),
  livemode: false,
  data: {
    object: {
      id: SESSAO_ID,
      customer: CLIENTE,
      subscription: "sub_qa_eventos_001",
      metadata: { paywall_recurso: "contas" },
    },
  },
});

/** Molde de evento de assinatura. */
let relogio = Math.floor(Date.now() / 1000);
/**
 * Molde de evento de assinatura.
 *
 * `diasDePeriodo` importa: assinatura CANCELADA com periodo futuro
 * continua dando acesso ate o fim do mes ja pago — e a regra de
 * `temAcessoPro`, e esta certa. Para o cancelamento virar perda de Pro,
 * o periodo tem de ter acabado.
 */
const assinatura = (id, status, tipo = "customer.subscription.updated", diasDePeriodo = 20) => ({
  id: `evt_qa_${RODADA}_${id}`,
  type: tipo,
  created: ++relogio,
  livemode: false,
  data: {
    object: {
      id: "sub_qa_eventos_001",
      customer: CLIENTE,
      status,
      cancel_at_period_end: false,
      items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + 86400 * diasDePeriodo }] },
    },
  },
});

async function main() {
  await entrar();
  console.log("");

  // ── 1. checkout_concluido nasce do webhook ────────────────
  console.log("1. O Stripe confirma, o evento aparece");
  let r = await enviar(sessao("a1"));
  await dormir(1200);
  const desta = `&evento=eq.checkout_concluido&checkout_session_id=eq.${SESSAO_ID}`;
  let todos = await eventos(desta);
  checar("checkout_concluido gravado pelo webhook", todos.length === 1,
    `HTTP ${r.status}, ${todos.length} linha(s)`);
  checar("carrega o recurso vindo da metadata",
    todos[0]?.recurso === "contas", `recurso=${todos[0]?.recurso}`);
  checar("carrega o checkout_session_id",
    todos[0]?.checkout_session_id === SESSAO_ID,
    todos[0]?.checkout_session_id);
  checar("marcado como is_test", todos[0]?.is_test === true, `is_test=${todos[0]?.is_test}`);

  // ── 2. Reentrega do MESMO evento ──────────────────────────
  console.log("2. O mesmo evento chega de novo (o Stripe reentrega por design)");
  r = await enviar(sessao("a1"));
  await dormir(1200);
  todos = await eventos(desta);
  checar("reentrega barrada pela idempotência do event.id",
    r.corpo?.repetido === true && todos.length === 1,
    `repetido=${r.corpo?.repetido}, ${todos.length} linha(s)`);

  // ── 3. Evento DIFERENTE, mesma sessão ─────────────────────
  console.log("3. Outro event.id, mesma sessão (dois endpoints, entregas distintas)");
  r = await enviar(sessao("a2"));
  await dormir(1200);
  todos = await eventos(desta);
  checar("índice único barra a segunda gravação da mesma sessão",
    todos.length === 1, `${todos.length} linha(s)`);

  // ── 4. TEST não contamina LIVE ────────────────────────────
  console.log("4. O que é de TESTE fica fora da conversão");
  todos = await eventos(desta);
  checar("o evento existe e está marcado como teste",
    todos.length === 1 && todos[0]?.is_test === true, `is_test=${todos[0]?.is_test}`);
  const st = await viewFechadaParaCliente();
  checar("a view do funil não é legível pelo cliente", st >= 400 || st === 404,
    `HTTP ${st}`);

  // ── 5. plano_mudou: free -> pro ───────────────────────────
  //
  // O plano vem de `plano_do_usuario`, a mesma funcao dos triggers.
  // Nao ha aqui uma quarta implementacao da regra: o webhook pergunta
  // ao banco antes e depois, e so grava se a resposta mudou.
  console.log("5. O plano muda de verdade");
  // O estado anda pelo proprio webhook, como na vida real. Comeca em
  // `trialing` (pro), cai para `past_due` (free) e volta.
  r = await enviar(assinatura("b1", "past_due"));
  await dormir(1500);
  let mudancas = await eventos("&evento=eq.plano_mudou");
  const caiu = mudancas.find((m) => m.plano_anterior === "pro" && m.plano_novo === "free");
  checar("pro -> free por cobranca recusada", !!caiu,
    caiu ? `motivo=${caiu.motivo}` : `${mudancas.length} mudanca(s)`);
  checar("motivo e pagamento_falhou", caiu?.motivo === "pagamento_falhou",
    `motivo=${caiu?.motivo}`);

  r = await enviar(assinatura("b2", "active"));
  await dormir(1500);
  mudancas = await eventos("&evento=eq.plano_mudou");
  const subiu = mudancas.find((m) => m.plano_anterior === "free" && m.plano_novo === "pro");
  checar("free -> pro registrado", !!subiu,
    subiu ? `motivo=${subiu.motivo}` : `${mudancas.length} mudanca(s)`);

  // ── 6. Cancelamento ───────────────────────────────────────
  // Periodo ja vencido: e aqui que o acesso realmente acaba.
  r = await enviar(assinatura("b3", "canceled", "customer.subscription.deleted", -1));
  await dormir(1500);
  mudancas = await eventos("&evento=eq.plano_mudou");
  const cancelou = mudancas.filter(
    (m) => m.plano_anterior === "pro" && m.plano_novo === "free" && m.motivo === "cancelamento");
  checar("pro -> free por cancelamento", cancelou.length === 1,
    `${cancelou.length} evento(s) de cancelamento`);

  // ── 7. Recarregar a tela nao inventa evento ───────────────
  //
  // O mesmo estado chegando outra vez: o plano nao mudou, entao nao ha
  // evento. E o que garante que "plano_mudou" conte mudanca, e nao
  // entrega de webhook.
  console.log("6. Estado repetido nao vira mudanca");
  const antesDaRepeticao = mudancas.length;
  r = await enviar(assinatura("b4", "canceled", "customer.subscription.deleted", -1));
  await dormir(1500);
  mudancas = await eventos("&evento=eq.plano_mudou");
  checar("mesmo estado de novo nao gera evento",
    mudancas.length === antesDaRepeticao,
    `${antesDaRepeticao} -> ${mudancas.length}`);

  console.log("");
  const falhas = linhas.filter((l) => !l.ok);
  console.log(`RESULTADO: ${linhas.length - falhas.length}/${linhas.length}`);
  if (falhas.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
