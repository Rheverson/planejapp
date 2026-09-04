// ============================================================
// A prova do isolamento TEST/LIVE no caminho do desconto.
//
// O cenário é o pior possível de propósito: uma indicação de TESTE
// apontando para um indicador cuja assinatura está marcada como
// PRODUÇÃO (`is_test = false`) e que tem `stripe_subscription_id`.
//
// Era exatamente por aí que o furo passava: `recalcularDescontoIndicador`
// buscava a assinatura do indicador SEM filtrar `is_test` e usava o
// cliente Stripe de produção. Um `invoice.payment_succeeded` de teste
// — que não custa nada para produzir — criava cupom REAL numa
// assinatura REAL.
//
// Aqui o alvo é uma linha descartável fazendo o papel de produção.
// Nenhuma assinatura real participa em momento algum.
//
//   node scripts/qa-isolamento-desconto.js
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

const WEBHOOK = `${env.VITE_SUPABASE_URL}/functions/v1/stripe-webhook`;
// Dois cenarios, cada um com o seu indicado (ha unicidade por indicado
// na tabela de indicacoes).
const CENARIOS = {
  // O ataque: indicacao de TESTE apontando para indicador cuja
  // assinatura esta marcada como PRODUCAO.
  negativo: { cliente: "cus_QA_INDICADO3", assinatura: "sub_QA_INDICADO3", codigo: "QALIVE02" },
  // O controle: indicador legitimo do modo de teste, com assinatura que
  // existe de verdade na conta Stripe de TESTE.
  positivo: { cliente: "cus_QA_INDICADO2", assinatura: "sub_QA_INDICADO2", codigo: "QATEST01" },
};
const RODADA = Date.now().toString(36);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

let jwt = null;
async function entrar() {
  const r = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: "indicado2-qa@teste.invalid", password: "Indicado2!2026#qa" }),
  });
  jwt = (await r.json()).access_token;
}

async function referral(codigo) {
  const r = await fetch(
    `${env.VITE_SUPABASE_URL}/rest/v1/referrals?referral_code=eq.${codigo}&select=status`,
    { headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${jwt}` } },
  );
  const d = await r.json();
  return Array.isArray(d) ? d[0]?.status ?? null : null;
}

let relogio = Math.floor(Date.now() / 1000);
async function entregar(evento) {
  const corpo = JSON.stringify(evento);
  const ts = Math.floor(Date.now() / 1000);
  const mac = createHmac("sha256", env.STRIPE_WEBHOOK_SECRET_TEST)
    .update(`${ts}.${corpo}`).digest("hex");
  const r = await fetch(WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Stripe-Signature": `t=${ts},v1=${mac}` },
    body: corpo,
  });
  const texto = await r.text();
  try { return { status: r.status, corpo: JSON.parse(texto) }; }
  catch { return { status: r.status, corpo: texto }; }
}

const fatura = (id, cenario, tipo = "invoice.payment_succeeded") => ({
  id: `evt_qa_iso_${RODADA}_${id}`,
  type: tipo,
  created: ++relogio,
  livemode: false,
  data: {
    object: {
      id: `in_qa_iso_${RODADA}_${id}`,
      customer: cenario.cliente,
      subscription: cenario.assinatura,
      billing_reason: "subscription_cycle",
      total: 1290,
    },
  },
});

/** Conta os objetos do Stripe nos dois modos, para comparar antes e depois. */
async function stripeInventario() {
  const ler = async (chave, caminho) => {
    const r = await fetch(`https://api.stripe.com/v1/${caminho}`, {
      headers: { Authorization: `Bearer ${chave}` },
    });
    const d = await r.json();
    return Array.isArray(d?.data) ? d.data.length : -1;
  };
  return {
    liveCupons: await ler(env.STRIPE_SECRET_KEY, "coupons?limit=100"),
    testCupons: await ler(env.STRIPE_SECRET_KEY_TEST, "coupons?limit=100"),
  };
}

const linhas = [];
function checar(rotulo, ok, evidencia) {
  linhas.push({ rotulo, ok });
  console.log(`  ${ok ? "PASS " : "FAIL "} | ${rotulo}${evidencia ? ` | ${evidencia}` : ""}`);
}

async function main() {
  await entrar();

  const inicial = await stripeInventario();
  console.log("Inventário de cupons ANTES");
  console.log(`  LIVE: ${inicial.liveCupons} · TEST: ${inicial.testCupons}`);
  console.log("");

  // ── 1. O ATAQUE ───────────────────────────────────────────
  //
  // Invoice de TESTE cuja indicação aponta para um indicador com
  // assinatura marcada como PRODUÇÃO. Antes da correção isto criava
  // cupom real numa assinatura real.
  console.log("1. Invoice de TESTE mirando indicador de PRODUÇÃO");
  const rA = await entregar(fatura("neg", CENARIOS.negativo));
  await dormir(3000);
  const aposAtaque = await stripeInventario();
  console.log(`  LIVE: ${aposAtaque.liveCupons} · TEST: ${aposAtaque.testCupons}`);

  checar("webhook processou o evento", rA.status === 200, `HTTP ${rA.status}`);
  checar("NENHUM cupom criado em LIVE",
    aposAtaque.liveCupons === inicial.liveCupons,
    `${inicial.liveCupons} -> ${aposAtaque.liveCupons}`);
  checar("NENHUM cupom criado em TEST (indicador é de produção: barrado)",
    aposAtaque.testCupons === inicial.testCupons,
    `${inicial.testCupons} -> ${aposAtaque.testCupons}`);

  // ── 2. O CONTROLE POSITIVO ────────────────────────────────
  //
  // "Nenhum cupom" também seria o resultado se o caminho inteiro
  // estivesse quebrado. Aqui o indicador é legítimo do modo de teste e
  // tem assinatura de verdade na conta de TESTE: o cupom TEM de sair.
  console.log("");
  console.log("2. Controle positivo: indicação legítima de TESTE");
  const rB = await entregar(fatura("pos", CENARIOS.positivo));
  await dormir(4000);
  const aposControle = await stripeInventario();
  console.log(`  LIVE: ${aposControle.liveCupons} · TEST: ${aposControle.testCupons}`);

  const st = await referral(CENARIOS.positivo.codigo);
  checar("indicação ativada", st === "active", `HTTP ${rB.status}, status=${st}`);
  checar("cupom CRIADO na conta de TESTE",
    aposControle.testCupons > aposAtaque.testCupons,
    `${aposAtaque.testCupons} -> ${aposControle.testCupons}`);
  checar("LIVE segue intocado do começo ao fim",
    aposControle.liveCupons === inicial.liveCupons,
    `${inicial.liveCupons} -> ${aposControle.liveCupons}`);

  // ── 3. Cobrança recusada ──────────────────────────────────
  console.log("");
  console.log("3. invoice.payment_failed agora é tratado");
  const rf = await entregar(fatura("fail", CENARIOS.positivo, "invoice.payment_failed"));
  await dormir(2500);
  checar("webhook aceitou o evento", rf.status === 200, `HTTP ${rf.status}`);

  console.log("");
  const falhas = linhas.filter((l) => !l.ok);
  console.log(`RESULTADO: ${linhas.length - falhas.length}/${linhas.length}`);
  if (falhas.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
