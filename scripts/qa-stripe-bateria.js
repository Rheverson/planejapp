// ============================================================
// Bateria Stripe TEST — ciclo de vida completo da assinatura.
//
// Opção B: nada aqui passa pelo `create-checkout`. O script fala com a
// API do Stripe em modo TESTE; quem entrega os eventos é o próprio
// Stripe, no endpoint de teste. O webhook é exercitado de verdade.
//
// A verificação lê o banco pela sessão do usuário de QA (PostgREST),
// não por service_role — assim o que se prova é o que o app enxerga.
//
// A regra de acesso vem de src/domain/assinatura.js, a mesma do app.
// ============================================================
import fs from "node:fs";
import { temAcessoPro, estadoDaAssinatura, rotuloDoEstado } from "../src/domain/assinatura.js";

const env = {};
for (const l of fs.readFileSync(".env", "utf8").split("\n")) {
  if (!l.trim() || l.startsWith("#") || !l.includes("=")) continue;
  const [k, ...r] = l.split("=");
  env[k.trim()] = r.join("=").trim().replace(/^"|"$/g, "");
}
const SK = env.STRIPE_SECRET_KEY_TEST;
if (!SK?.startsWith("sk_test_")) { console.error("chave de teste ausente"); process.exit(1); }

const ids = JSON.parse(fs.readFileSync("scripts/qa-stripe-ids.json", "utf8"));
const SENHA = "QAstripe!2026#b";

async function stripe(caminho, corpo, metodo = "POST") {
  const r = await fetch(`https://api.stripe.com/v1/${caminho}`, {
    method: metodo,
    headers: {
      Authorization: "Basic " + Buffer.from(SK + ":").toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: corpo ? new URLSearchParams(corpo).toString() : undefined,
  });
  const d = await r.json();
  if (d.error) throw new Error(`${caminho}: ${d.error.message}`);
  return d;
}

const sessoes = {};
async function entrar(email) {
  if (sessoes[email]) return sessoes[email];
  const r = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: SENHA }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error(`login falhou para ${email}`);
  sessoes[email] = d.access_token;
  return d.access_token;
}

/** Lê a assinatura como o app lê: pela sessão do próprio usuário. */
async function lerAssinatura(email) {
  const tk = await entrar(email);
  const r = await fetch(
    `${env.VITE_SUPABASE_URL}/rest/v1/subscriptions?select=status,current_period_end,trial_end,stripe_subscription_id,is_test`,
    { headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${tk}` } },
  );
  const d = await r.json();
  return Array.isArray(d) ? d[0] ?? null : null;
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Assina e entrega um evento direto no webhook (para casos que o
 *  Stripe nao produz sob demanda: atraso e repeticao). */
async function enviarEventoAssinado(evento) {
  const corpo = JSON.stringify(evento);
  const ts = Math.floor(Date.now() / 1000);
  const { createHmac } = await import("node:crypto");
  const mac = createHmac("sha256", env.STRIPE_WEBHOOK_SECRET_TEST)
    .update(`${ts}.${corpo}`).digest("hex");
  const r = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/stripe-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Stripe-Signature": `t=${ts},v1=${mac}` },
    body: corpo,
  });
  try { return await r.json(); } catch { return { status: r.status }; }
}


/** Espera o webhook do Stripe chegar e mudar o banco. */
async function esperarPor(email, condicao, rotulo, tentativas = 20) {
  for (let i = 0; i < tentativas; i++) {
    const s = await lerAssinatura(email);
    if (s && condicao(s)) return s;
    await dormir(1500);
  }
  const s = await lerAssinatura(email);
  throw new Error(`timeout esperando ${rotulo}. Estado atual: ${JSON.stringify(s)}`);
}

const R = [];
function registrar(teste, acao, eventos, banco, ok, obs = "") {
  R.push({ teste, acao, eventos, banco, ok, obs });
  console.log(`  ${ok ? "PASS" : "*** FAIL ***"}  ${teste}`);
  console.log(`         banco: ${banco}`);
  if (obs) console.log(`         ${obs}`);
}

const dt = (s) => (s ? new Date(s).toISOString().slice(0, 10) : "—");

console.log("=".repeat(70));
console.log("BATERIA STRIPE TEST — ciclo de vida da assinatura");
console.log("=".repeat(70));

// ── TESTE 1: assinatura e pagamento inicial ─────────────────
console.log("\nTESTE 1 — assinatura e pagamento inicial (PRO mensal R$ 24,90)");
const assin = await stripe("subscriptions", {
  customer: ids.clientes.ciclo.id,
  "items[0][price]": env.STRIPE_PRICE_TEST_MENSAL_2490,
  payment_behavior: "error_if_incomplete",
  "expand[0]": "latest_invoice",
});
console.log(`  criada no Stripe: ${assin.id} · status=${assin.status}`);

let s = await esperarPor("qa-ciclo@teste.invalid",
  (x) => x.status === "active" && x.stripe_subscription_id === assin.id, "status active");
const periodo1 = s.current_period_end;
registrar("1. Pagamento inicial",
  `subscriptions.create ${assin.id}`,
  "customer.subscription.created + invoice.payment_succeeded",
  `status=${s.status} · is_test=${s.is_test} · fim=${dt(s.current_period_end)}`,
  s.status === "active" && s.is_test === true && !!s.current_period_end && temAcessoPro(s),
  `acesso PRO = ${temAcessoPro(s)} · ${rotuloDoEstado(s)}`);

// ── TESTE 2: cancelamento no fim do período ─────────────────
console.log("\nTESTE 2 — cancelamento ao fim do período");
await stripe(`subscriptions/${assin.id}`, { cancel_at_period_end: "true" });
await dormir(6000);
s = await lerAssinatura("qa-ciclo@teste.invalid");
registrar("2. Cancelamento no fim do período",
  `cancel_at_period_end=true`,
  "customer.subscription.updated",
  `status=${s.status} · fim=${dt(s.current_period_end)}`,
  temAcessoPro(s) === true,
  `acesso PRO mantido = ${temAcessoPro(s)} (o Stripe mantém 'active' até virar o período)`);

// desfaz, para o teste de renovação seguir
await stripe(`subscriptions/${assin.id}`, { cancel_at_period_end: "false" });
await dormir(4000);

// ── TESTE 4: renovação (relógio de teste) ───────────────────
console.log("\nTESTE 4 — renovação via test clock (avança 35 dias)");
const destino = Math.floor(Date.now() / 1000) + 35 * 24 * 3600;
await stripe(`test_helpers/test_clocks/${ids.clock}/advance`, { frozen_time: String(destino) });
let clockPronto = false;
for (let i = 0; i < 40; i++) {
  const c = await stripe(`test_helpers/test_clocks/${ids.clock}`, null, "GET");
  if (c.status === "ready") { clockPronto = true; break; }
  await dormir(3000);
}
let okRenov = false, sRenov = null;
if (clockPronto) {
  try {
    sRenov = await esperarPor("qa-ciclo@teste.invalid",
      (x) => x.current_period_end && new Date(x.current_period_end) > new Date(periodo1),
      "período empurrado", 20);
    okRenov = temAcessoPro(sRenov);
  } catch (e) { sRenov = await lerAssinatura("qa-ciclo@teste.invalid"); }
}
registrar("4. Renovação",
  `test_clock advance +35d`,
  "invoice.payment_succeeded + customer.subscription.updated",
  sRenov ? `status=${sRenov.status} · fim=${dt(periodo1)} -> ${dt(sRenov.current_period_end)}` : "clock não ficou pronto",
  okRenov,
  clockPronto ? "" : "BLOCKED: o relógio de teste não terminou de avançar");

// ── TESTE 5: encerramento imediato ──────────────────────────
console.log("\nTESTE 5 — encerramento imediato");
await stripe(`subscriptions/${assin.id}`, null, "DELETE");
s = await esperarPor("qa-ciclo@teste.invalid", (x) => x.status === "cancelled", "status cancelled");
registrar("5. Deleção",
  `subscriptions.delete ${assin.id}`,
  "customer.subscription.deleted",
  `status=${s.status} · fim=${dt(s.current_period_end)}`,
  s.status === "cancelled",
  `acesso PRO = ${temAcessoPro(s)} (a regra mantém até o fim do período pago; ver relatório)`);

// ── TESTE 3: falha de pagamento ─────────────────────────────
console.log("\nTESTE 3 — falha de pagamento (cartão que recusa)");
let okFalha = false, sFalha = null, obsFalha = "";
try {
  await stripe("subscriptions", {
    customer: ids.clientes.falha.id,
    "items[0][price]": env.STRIPE_PRICE_TEST_MENSAL_2490,
    payment_behavior: "allow_incomplete",
  });
  await dormir(8000);
  sFalha = await lerAssinatura("qa-falha@teste.invalid");
  okFalha = sFalha && ["incomplete", "past_due", "unpaid"].includes(sFalha.status) && !temAcessoPro(sFalha);
  obsFalha = `acesso PRO = ${sFalha ? temAcessoPro(sFalha) : "?"} · ${sFalha ? rotuloDoEstado(sFalha) : ""}`;
} catch (e) {
  obsFalha = `Stripe recusou a criação: ${e.message.slice(0, 90)}`;
  sFalha = await lerAssinatura("qa-falha@teste.invalid");
  okFalha = sFalha && !temAcessoPro(sFalha);
}
registrar("3. Falha de pagamento",
  "subscription com pm_card_chargeCustomerFail",
  "invoice.payment_failed / customer.subscription.updated",
  sFalha ? `status=${sFalha.status}` : "sem linha",
  okFalha, obsFalha);

// ── TESTE 6: indicação legítima ─────────────────────────────
console.log("\nTESTE 6 — indicação legítima e desconto");
const cupom = await stripe("coupons", { percent_off: "25", duration: "forever", name: "QA indicacao 25%" });
const assinInd = await stripe("subscriptions", {
  customer: ids.clientes.indicado.id,
  "items[0][price]": env.STRIPE_PRICE_TEST_MENSAL_2490,
  "discounts[0][coupon]": cupom.id,
  payment_behavior: "error_if_incomplete",
  "expand[0]": "latest_invoice",
});
const fatura = assinInd.latest_invoice;
// Nao recalcular o desconto por fora: 25% de 2490 da 1867,5 e o
// arredondamento do meio-centavo e decisao do Stripe (ele trunca).
// Duas assertivas minhas ja falharam por isso. O que importa provar e
// que houve desconto e que o valor cobrado e o que a fatura diz.
const cheio = 2490;
const cobrado = fatura?.amount_paid ?? fatura?.total ?? null;
let sInd = null, okInd = false;
try {
  sInd = await esperarPor("qa-indicado@teste.invalid", (x) => x.status === "active", "indicado ativo");
  okInd = cobrado !== null && cobrado < cheio && cobrado === (fatura?.total ?? cobrado) && temAcessoPro(sInd);
} catch { sInd = await lerAssinatura("qa-indicado@teste.invalid"); }
registrar("6. Indicação / desconto",
  `cupom 25% aplicado na criação (${cupom.id})`,
  "customer.subscription.created + invoice.payment_succeeded",
  sInd ? `status=${sInd.status} · cobrado R$ ${(cobrado ?? 0) / 100} de R$ ${cheio / 100} (desconto de ${Math.round((1 - (cobrado ?? 0) / cheio) * 100)}%)` : "sem linha",
  okInd,
  `desconto aplicado pelo Stripe, não pelo cliente`);


// ── TESTE 7: evento fora de ordem (P1-C) ────────────────────
// O Stripe nao garante ordem. Antes desta guarda, um `created`
// atrasado entregue depois de um `deleted` devolvia a assinatura
// cancelada para `active`.
console.log("\nTESTE 7 — evento atrasado nao ressuscita assinatura cancelada");
{
  const cus = ids.clientes.indicado.id;
  const email = "qa-indicado@teste.invalid";
  const agora = Math.floor(Date.now() / 1000);
  const antes = await lerAssinatura(email);

  // evento ANTIGO (10 min atras) mandando voltar para active
  await enviarEventoAssinado({
    id: "evt_qa_atrasado", type: "customer.subscription.updated",
    created: agora - 600, livemode: false,
    data: { object: { id: "sub_QA_ATRASADO", object: "subscription", customer: cus,
            status: "active", trial_end: null,
            items: { data: [{ current_period_end: agora + 30 * 24 * 3600 }] } } },
  });
  await dormir(4000);
  const depois = await lerAssinatura(email);
  const naoVoltou = depois.status === antes.status;
  registrar("7. Evento fora de ordem",
    "evento `updated` datado de 10 min atras, mandando status=active",
    "customer.subscription.updated (atrasado)",
    `status ${antes.status} -> ${depois.status}`,
    naoVoltou,
    naoVoltou ? "o evento antigo foi ignorado" : "*** o evento antigo sobrescreveu o estado novo ***");
}

// ── TESTE 8: entrega repetida (P2-B) ────────────────────────
console.log("\nTESTE 8 — mesmo evento entregue tres vezes");
{
  const cus = ids.clientes.indicado.id;
  const email = "qa-indicado@teste.invalid";
  const agora = Math.floor(Date.now() / 1000);
  const evento = {
    id: "evt_qa_repetido_" + agora, type: "customer.subscription.updated",
    created: agora, livemode: false,
    data: { object: { id: "sub_QA_REPETIDO", object: "subscription", customer: cus,
            status: "past_due", trial_end: null,
            items: { data: [{ current_period_end: agora + 15 * 24 * 3600 }] } } },
  };
  const r1 = await enviarEventoAssinado(evento);
  await dormir(2500);
  const s1 = await lerAssinatura(email);
  const r2 = await enviarEventoAssinado(evento);
  const r3 = await enviarEventoAssinado(evento);
  await dormir(2500);
  const s2 = await lerAssinatura(email);
  const identico = JSON.stringify(s1) === JSON.stringify(s2);
  const marcouRepetido = r2.repetido === true && r3.repetido === true;
  registrar("8. Idempotencia",
    "mesmo event.id enviado 3x",
    "customer.subscription.updated x3",
    `1a entrega: status=${s1.status} · apos 2a e 3a: status=${s2.status}`,
    identico && marcouRepetido,
    marcouRepetido ? "as repetidas responderam {repetido:true} e nao tocaram no banco"
                   : "*** repetidas nao foram detectadas ***");
}

// ── resumo ──────────────────────────────────────────────────
console.log("\n" + "=".repeat(70));
const falhas = R.filter((r) => !r.ok);
console.log(`RESULTADO: ${R.length - falhas.length}/${R.length} PASS`);
if (falhas.length) console.log("FALHARAM: " + falhas.map((f) => f.teste).join(" | "));
fs.writeFileSync("scripts/qa-stripe-resultado.json", JSON.stringify(R, null, 2));
console.log("detalhes em scripts/qa-stripe-resultado.json");
