// ============================================================
// Bateria Stripe TEST — Fase 1: cria os recursos no Stripe.
//
// Opção B: o `create-checkout` de produção NÃO é tocado. Este script
// fala direto com a API do Stripe usando a chave de TESTE, e quem
// entrega os eventos é o próprio Stripe, no endpoint de teste — ou
// seja, o webhook é exercitado de verdade, não simulado.
//
// Usa um TEST CLOCK para o ciclo de vida: é o único jeito honesto de
// provar renovação sem esperar um mês. O cliente precisa nascer preso
// ao relógio, por isso ele vem primeiro.
//
// Só cria; a limpeza é do qa-stripe-limpar.js.
// ============================================================
import fs from "node:fs";

const env = {};
for (const linha of fs.readFileSync(".env", "utf8").split("\n")) {
  if (!linha.trim() || linha.startsWith("#") || !linha.includes("=")) continue;
  const [k, ...resto] = linha.split("=");
  env[k.trim()] = resto.join("=").trim().replace(/^"|"$/g, "");
}

const SK = env.STRIPE_SECRET_KEY_TEST;
if (!SK || !SK.startsWith("sk_test_")) {
  console.error("STRIPE_SECRET_KEY_TEST ausente ou não é chave de teste. Abortado.");
  process.exit(1);
}

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

const saida = { criado_em: new Date().toISOString(), clock: null, clientes: {} };

// ── Relógio de teste ────────────────────────────────────────
const agora = Math.floor(Date.now() / 1000);
const clock = await stripe("test_helpers/test_clocks", {
  frozen_time: String(agora),
  name: "QA PlanejeApp — bateria de assinatura",
});
saida.clock = clock.id;
console.log("test clock            :", clock.id, "| livemode:", clock.livemode);

// ── Clientes ────────────────────────────────────────────────
// qa-ciclo   : testes 1, 2, 4, 5 (preso ao relógio)
// qa-falha   : teste 3 (cartão que recusa)
// qa-indicado: teste 6
const definicoes = [
  { chave: "ciclo",   email: "qa-ciclo@teste.invalid",   cartao: "pm_card_visa",              clock: true },
  { chave: "falha",   email: "qa-falha@teste.invalid",   cartao: "pm_card_chargeCustomerFail", clock: false },
  { chave: "indicado", email: "qa-indicado@teste.invalid", cartao: "pm_card_visa",             clock: false },
];

for (const d of definicoes) {
  const cliente = await stripe("customers", {
    email: d.email,
    ...(d.clock ? { test_clock: clock.id } : {}),
    "metadata[qa]": "planejapp-bateria",
  });
  const pm = await stripe(`payment_methods/${d.cartao}/attach`, { customer: cliente.id });
  await stripe(`customers/${cliente.id}`, {
    "invoice_settings[default_payment_method]": pm.id,
  });
  saida.clientes[d.chave] = { id: cliente.id, email: d.email, pm: pm.id };
  console.log(`cliente ${d.chave.padEnd(9)}:`, cliente.id, "|", d.email);
}

fs.writeFileSync("scripts/qa-stripe-ids.json", JSON.stringify(saida, null, 2));
console.log("\nids gravados em scripts/qa-stripe-ids.json");

// ── SQL para as linhas descartáveis no banco ────────────────
// O `create-checkout` é quem cria essa linha no fluxo real. Como ele
// fica de fora (opção B), a bateria cria o equivalente à mão — sempre
// com is_test = true, que é o que impede qualquer evento de teste de
// alcançar assinatura de gente de verdade.
const uuids = {
  ciclo:    "f1000000-0000-4000-8000-000000000001",
  falha:    "f1000000-0000-4000-8000-000000000002",
  indicado: "f1000000-0000-4000-8000-000000000003",
  indicador: "f1000000-0000-4000-8000-000000000004",
};
saida.uuids = uuids;
fs.writeFileSync("scripts/qa-stripe-ids.json", JSON.stringify(saida, null, 2));

console.log("\n--- SQL para criar os usuários descartáveis ---");
for (const [chave, uuid] of Object.entries(uuids)) {
  const email = chave === "indicador" ? "qa-indicador@teste.invalid" : saida.clientes[chave]?.email;
  const cus = saida.clientes[chave]?.id ?? null;
  console.log(`${uuid} | ${email} | ${cus ?? "(sem customer)"}`);
}
