// ============================================================
// Bateria Stripe TEST — limpeza.
//
// Remove tudo que a bateria criou no Stripe em modo TESTE: assinaturas,
// cupons, clientes e o relógio de teste. Não toca em nada do LIVE — a
// chave usada é `sk_test_`, e ela não enxerga o outro mundo.
//
// A limpeza do banco é feita à parte, por SQL, com
// `delete ... where is_test` e pelos e-mails @teste.invalid.
// ============================================================
import fs from "node:fs";

const env = {};
for (const l of fs.readFileSync(".env", "utf8").split("\n")) {
  if (!l.trim() || l.startsWith("#") || !l.includes("=")) continue;
  const [k, ...r] = l.split("=");
  env[k.trim()] = r.join("=").trim().replace(/^"|"$/g, "");
}
const SK = env.STRIPE_SECRET_KEY_TEST;
if (!SK?.startsWith("sk_test_")) { console.error("sem chave de teste; abortado"); process.exit(1); }

async function stripe(caminho, corpo, metodo = "POST") {
  const r = await fetch(`https://api.stripe.com/v1/${caminho}`, {
    method: metodo,
    headers: {
      Authorization: "Basic " + Buffer.from(SK + ":").toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: corpo ? new URLSearchParams(corpo).toString() : undefined,
  });
  return r.json();
}

const ids = JSON.parse(fs.readFileSync("scripts/qa-stripe-ids.json", "utf8"));

for (const [chave, c] of Object.entries(ids.clientes)) {
  const assinaturas = await stripe(`subscriptions?customer=${c.id}&status=all&limit=20`, null, "GET");
  for (const a of assinaturas.data ?? []) {
    if (a.status !== "canceled") await stripe(`subscriptions/${a.id}`, null, "DELETE");
    console.log(`  assinatura removida: ${a.id} (${chave})`);
  }
  const d = await stripe(`customers/${c.id}`, null, "DELETE");
  console.log(`  cliente removido   : ${c.id} (${chave}) · deleted=${d.deleted}`);
}

const cupons = await stripe("coupons?limit=50", null, "GET");
for (const cp of cupons.data ?? []) {
  if ((cp.name ?? "").startsWith("QA ")) {
    await stripe(`coupons/${cp.id}`, null, "DELETE");
    console.log(`  cupom removido     : ${cp.id} (${cp.name})`);
  }
}

if (ids.clock) {
  const d = await stripe(`test_helpers/test_clocks/${ids.clock}`, null, "DELETE");
  console.log(`  test clock removido: ${ids.clock} · deleted=${d.deleted}`);
}

const restantes = await stripe("customers?limit=50", null, "GET");
const sobrando = (restantes.data ?? []).filter((c) => (c.email ?? "").endsWith("@teste.invalid"));
console.log(`\nclientes @teste.invalid restantes no Stripe TEST: ${sobrando.length}`);
