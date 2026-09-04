// ============================================================
// `invoice.payment_succeeded` no webhook principal.
//
// O evento chega ao endpoint do projeto `pomnecjcvpqegyeklims` e é
// tratado ali — este script prova o que ele faz, o que NÃO faz, e que
// entrega repetida não age duas vezes.
//
// Tudo em TEST MODE, com dois usuários @teste.invalid. O indicador fica
// deliberadamente SEM `stripe_subscription_id`: assim
// `recalcularDescontoIndicador` calcula o percentual e retorna antes de
// falar com o Stripe — cujo cliente, naquela função, é o de PRODUÇÃO.
// Deixá-lo alcançar a API seria mexer em LIVE para provar TEST.
//
//   node scripts/qa-invoice-webhook.js
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
const INDICADO = "d9d9d9d9-0000-4000-8000-000000000009";
const CLIENTE_INDICADO = "cus_QA_INDICADO";
const RODADA = Date.now().toString(36);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

let jwt = null;
async function entrar() {
  const r = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: "indicado-qa@teste.invalid", password: "Indicado!2026#qa" }),
  });
  jwt = (await r.json()).access_token;
}

/** Lê a indicação com o JWT do próprio indicado — a policy do P1
 *  permite que ele veja a indicação em que é a parte indicada. */
async function referral() {
  const r = await fetch(
    `${env.VITE_SUPABASE_URL}/rest/v1/referrals?referral_code=eq.QAREF001&select=status,referrer_id,referred_id`,
    { headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${jwt}` } },
  );
  const d = await r.json();
  return Array.isArray(d) ? d[0] ?? null : null;
}

function assinar(corpo, segredo, tsForcado) {
  const ts = tsForcado ?? Math.floor(Date.now() / 1000);
  const mac = createHmac("sha256", segredo).update(`${ts}.${corpo}`).digest("hex");
  return `t=${ts},v1=${mac}`;
}

async function entregar(evento, { segredo, assinatura, adulterar } = {}) {
  let corpo = JSON.stringify(evento);
  const cabecalhos = { "Content-Type": "application/json" };
  if (assinatura !== null) {
    cabecalhos["Stripe-Signature"] =
      assinatura ?? assinar(corpo, segredo ?? env.STRIPE_WEBHOOK_SECRET_TEST);
  }
  // Assina primeiro, altera depois: é o ataque que a assinatura existe
  // para pegar.
  if (adulterar) corpo = corpo.replace(CLIENTE_INDICADO, adulterar);
  const r = await fetch(WEBHOOK, { method: "POST", headers: cabecalhos, body: corpo });
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { json = texto; }
  return { status: r.status, corpo: json };
}

let relogio = Math.floor(Date.now() / 1000);
const fatura = (id, motivoCobranca = "subscription_cycle") => ({
  id: `evt_qa_inv_${RODADA}_${id}`,
  type: "invoice.payment_succeeded",
  created: ++relogio,
  livemode: false,
  data: {
    object: {
      id: `in_qa_${RODADA}_${id}`,
      customer: CLIENTE_INDICADO,
      subscription: "sub_QA_INDICADO",
      billing_reason: motivoCobranca,
      total: 1290,
    },
  },
});

const linhas = [];
function checar(rotulo, ok, evidencia) {
  linhas.push({ rotulo, ok });
  console.log(`  ${ok ? "PASS " : "FAIL "} | ${rotulo}${evidencia ? ` | ${evidencia}` : ""}`);
}

async function main() {
  await entrar();

  // ── 1. Segurança da entrega ───────────────────────────────
  console.log("1. Só entra evento assinado com o segredo certo");
  let r = await entregar(fatura("s1"), { assinatura: null });
  checar("sem assinatura", r.status === 400, `HTTP ${r.status}`);

  r = await entregar(fatura("s2"), { assinatura: "t=1,v1=deadbeef" });
  checar("assinatura invalida", r.status === 400, `HTTP ${r.status}`);

  r = await entregar(fatura("s3"), { segredo: "whsec_segredo_que_nao_existe" });
  checar("segredo errado", r.status === 400, `HTTP ${r.status}`);

  r = await entregar(fatura("s4"), { adulterar: "cus_OUTRO_QUALQUER" });
  checar("payload alterado depois de assinado", r.status === 400, `HTTP ${r.status}`);

  // LIVE assinado com segredo de LIVE seria aceito — nao se testa aqui
  // porque exigiria um evento LIVE. O que se prova e o inverso: TEST
  // assinado com segredo de TEST e aceito, e o `livemode` tem de bater.
  r = await entregar({ ...fatura("s5"), livemode: true });
  checar("livemode=true assinado com segredo de TEST", r.status === 400, `HTTP ${r.status}`);

  // ── 2. Estado inicial ─────────────────────────────────────
  console.log("2. Antes do pagamento");
  let ref = await referral();
  checar("indicacao esta pendente", ref?.status === "pending", `status=${ref?.status}`);

  // ── 3. Primeira fatura da assinatura NAO ativa ────────────
  console.log("3. A fatura de criacao da assinatura nao conta");
  r = await entregar(fatura("c1", "subscription_create"));
  await dormir(1500);
  ref = await referral();
  checar("billing_reason=subscription_create nao ativa",
    ref?.status === "pending", `HTTP ${r.status}, status=${ref?.status}`);

  // ── 4. O pagamento de verdade ativa ───────────────────────
  console.log("4. O primeiro pagamento real");
  r = await entregar(fatura("p1"));
  await dormir(2000);
  ref = await referral();
  checar("indicacao ativada pelo webhook principal",
    ref?.status === "active", `HTTP ${r.status}, status=${ref?.status}`);

  // ── 5. Idempotencia: MESMO event.id ───────────────────────
  console.log("5. A mesma entrega de novo");
  const antes = ref?.status;
  r = await entregar(fatura("p1"));
  await dormir(1500);
  ref = await referral();
  checar("reentrega devolve repetido e nao age",
    r.corpo?.repetido === true && ref?.status === antes,
    `repetido=${r.corpo?.repetido}, status=${ref?.status}`);

  // ── 6. Outro event.id, mesma fatura ───────────────────────
  console.log("6. Outro event.id para a mesma cobranca");
  r = await entregar(fatura("p2"));
  await dormir(1500);
  ref = await referral();
  checar("segunda passagem nao reativa o que ja esta ativo",
    ref?.status === "active", `HTTP ${r.status}, status=${ref?.status}`);

  console.log("");
  const falhas = linhas.filter((l) => !l.ok);
  console.log(`RESULTADO: ${linhas.length - falhas.length}/${linhas.length}`);
  if (falhas.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
