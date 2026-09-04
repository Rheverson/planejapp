// ============================================================
// O ciclo de vida da assinatura no modelo PLG.
//
//   cadastro (free, sem cartão)
//     -> paywall
//       -> checkout com cartão e 7 dias de trial
//         -> trial (PRO, sem ter pago nada)
//           -> primeira cobrança real  → trial_convertido
//           -> ou cancelamento no trial → volta a free NA HORA
//
// Tudo em TEST MODE, com usuários @teste.invalid removidos ao final.
// Os eventos são assinados com o segredo de teste; nenhuma assinatura
// real participa.
//
//   node scripts/qa-ciclo-plg.js
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
const RODADA = Date.now().toString(36);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const A = {
  user: "f1f1f1f1-0000-4000-8000-000000000021",
  email: "plg-trial-qa@teste.invalid",
  senha: "Plg!2026#qa",
  cliente: `cus_PLG_A_${RODADA}`,
  assinatura: `sub_PLG_A_${RODADA}`,
  sessao: `cs_PLG_A_${RODADA}`,
};
const B = {
  user: "f2f2f2f2-0000-4000-8000-000000000022",
  email: "plg-cancela-qa@teste.invalid",
  senha: "Plg2!2026#qa",
  cliente: `cus_PLG_B_${RODADA}`,
  assinatura: `sub_PLG_B_${RODADA}`,
};

const jwts = {};
async function entrar(p) {
  const r = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: p.email, password: p.senha }),
  });
  jwts[p.user] = (await r.json()).access_token;
}

/** Lê com o JWT do próprio dono: exercita a policy em vez de contorná-la. */
async function ler(p, tabela, filtro) {
  const r = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${tabela}?${filtro}`, {
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${jwts[p.user]}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d : [];
}

const eventos = (p, evento, extra = "") =>
  ler(p, "eventos_plano",
      `user_id=eq.${p.user}${evento ? `&evento=eq.${evento}` : ""}${extra}&select=*&order=id`);
const assinatura = (p) =>
  ler(p, "subscriptions", `user_id=eq.${p.user}&select=*`).then((l) => l[0] ?? null);

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

const evt = (id, type, object) => ({
  id: `evt_qa_plg_${RODADA}_${id}`,
  type,
  created: ++relogio,
  livemode: false,
  data: { object },
});

const linhas = [];
function checar(rotulo, ok, evidencia) {
  linhas.push({ rotulo, ok });
  console.log(`  ${ok ? "PASS " : "FAIL "} | ${rotulo}${evidencia ? ` | ${evidencia}` : ""}`);
}

const DIA = 86400;
const agora = () => Math.floor(Date.now() / 1000);

async function main() {
  await entrar(A);
  await entrar(B);

  // ══ CENÁRIO A — o caminho feliz ═════════════════════════
  console.log("A. Do paywall ao pagamento");

  // 1) Checkout concluído: a pessoa entrou no trial.
  //    `client_reference_id` é a via que não depende de nada ter sido
  //    gravado antes.
  let r = await entregar(evt("a1", "checkout.session.completed", {
    id: A.sessao,
    customer: A.cliente,
    subscription: A.assinatura,
    client_reference_id: A.user,
    metadata: { paywall_recurso: "transacoes_mes" },
  }));
  await dormir(2500);

  let sub = await assinatura(A);
  checar("stripe_customer_id gravado pelo webhook",
    sub?.stripe_customer_id === A.cliente, `${sub?.stripe_customer_id}`);
  checar("stripe_subscription_id gravado pelo webhook",
    sub?.stripe_subscription_id === A.assinatura, `${sub?.stripe_subscription_id}`);

  let evs = await eventos(A, "checkout_concluido", `&checkout_session_id=eq.${A.sessao}`);
  checar("checkout_concluido registrado", evs.length === 1,
    `HTTP ${r.status}, ${evs.length} linha(s)`);

  // 2) A assinatura nasce em trial: PRO sem ter pago nada.
  r = await entregar(evt("a2", "customer.subscription.created", {
    id: A.assinatura,
    customer: A.cliente,
    status: "trialing",
    cancel_at_period_end: false,
    trial_end: agora() + 7 * DIA,
    items: { data: [{ current_period_end: agora() + 7 * DIA }] },
  }));
  await dormir(2500);

  sub = await assinatura(A);
  checar("status trialing no banco", sub?.status === "trialing", `status=${sub?.status}`);

  let mudancas = await eventos(A, "plano_mudou");
  const subiu = mudancas.find((m) => m.plano_novo === "pro");
  checar("plano_mudou free -> pro", !!subiu, subiu ? `motivo=${subiu.motivo}` : "nenhum");
  checar("trialing dá acesso PRO", subiu?.plano_novo === "pro", `${subiu?.plano_anterior} -> ${subiu?.plano_novo}`);

  // 3) A fatura do trial é de R$ 0 e NÃO é conversão.
  r = await entregar(evt("a3", "invoice.payment_succeeded", {
    id: `in_trial_${RODADA}`,
    customer: A.cliente,
    subscription: A.assinatura,
    billing_reason: "subscription_create",
    amount_paid: 0,
    total: 0,
  }));
  await dormir(2000);
  evs = await eventos(A, "trial_convertido", `&stripe_subscription_id=eq.${A.assinatura}`);
  checar("fatura de R$ 0 do trial NÃO conta como conversão",
    evs.length === 0, `${evs.length} linha(s)`);

  // 4) A primeira cobrança real, 7 dias depois.
  r = await entregar(evt("a4", "invoice.payment_succeeded", {
    id: `in_real_${RODADA}`,
    customer: A.cliente,
    subscription: A.assinatura,
    billing_reason: "subscription_cycle",
    amount_paid: 1290,
    total: 1290,
  }));
  await dormir(2500);
  evs = await eventos(A, "trial_convertido", `&stripe_subscription_id=eq.${A.assinatura}`);
  checar("primeira cobrança real vira trial_convertido",
    evs.length === 1, `HTTP ${r.status}, ${evs.length} linha(s)`);
  checar("carrega a assinatura que converteu",
    evs[0]?.stripe_subscription_id === A.assinatura, `${evs[0]?.stripe_subscription_id}`);

  // 5) O mês 2 é receita, mas não é uma conversão nova.
  r = await entregar(evt("a5", "invoice.payment_succeeded", {
    id: `in_mes2_${RODADA}`,
    customer: A.cliente,
    subscription: A.assinatura,
    billing_reason: "subscription_cycle",
    amount_paid: 1290,
    total: 1290,
  }));
  await dormir(2000);
  evs = await eventos(A, "trial_convertido", `&stripe_subscription_id=eq.${A.assinatura}`);
  checar("renovação do mês seguinte NÃO conta de novo",
    evs.length === 1, `${evs.length} linha(s)`);

  // ══ CENÁRIO B — desistiu no meio do trial ═══════════════
  console.log("");
  console.log("B. Cancelamento durante o trial");

  // B percorre o mesmo caminho: paywall -> checkout -> trial. Sem o
  // checkout nao existe linha, e `subscription.created` de um cliente
  // desconhecido nao cria nada — de proposito, senao o evento de outro
  // produto na mesma conta Stripe injetaria linhas aqui.
  await entregar(evt("b0", "checkout.session.completed", {
    id: `cs_PLG_B_${RODADA}`,
    customer: B.cliente,
    subscription: B.assinatura,
    client_reference_id: B.user,
  }));
  await dormir(2000);

  r = await entregar(evt("b1", "customer.subscription.created", {
    id: B.assinatura,
    customer: B.cliente,
    status: "trialing",
    cancel_at_period_end: false,
    trial_end: agora() + 7 * DIA,
    items: { data: [{ current_period_end: agora() + 7 * DIA }] },
  }));
  await dormir(2500);
  sub = await assinatura(B);
  checar("entrou no trial", sub?.status === "trialing", `status=${sub?.status}`);

  // Cancela no dia 2: `trial_end` ainda no futuro.
  r = await entregar(evt("b2", "customer.subscription.deleted", {
    id: B.assinatura,
    customer: B.cliente,
    status: "canceled",
    trial_end: agora() + 5 * DIA,
    items: { data: [{ current_period_end: agora() + 5 * DIA }] },
  }));
  await dormir(2500);

  sub = await assinatura(B);
  checar("cancelou: current_period_end zerado",
    sub?.current_period_end === null, `periodo=${sub?.current_period_end}`);

  mudancas = await eventos(B, "plano_mudou");
  const desceu = mudancas.find((m) => m.plano_anterior === "pro" && m.plano_novo === "free");
  checar("downgrade para free NA HORA", !!desceu,
    desceu ? `motivo=${desceu.motivo}` : `${mudancas.length} mudança(s)`);
  checar("motivo é cancelamento, não trial_expirou",
    desceu?.motivo === "cancelamento", `motivo=${desceu?.motivo}`);

  console.log("");
  const falhas = linhas.filter((l) => !l.ok);
  console.log(`RESULTADO: ${linhas.length - falhas.length}/${linhas.length}`);
  if (falhas.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
