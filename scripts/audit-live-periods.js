// ============================================================
// Levantamento de danos: assinaturas LIVE sem `current_period_end`.
//
// SOMENTE LEITURA. Nenhum UPDATE, nenhum DELETE, nem no banco nem no
// Stripe. O objetivo é enxergar o estrago que o bug de versionamento da
// API deixou, para uma correção manual e controlada depois.
//
// O BUG: o webhook lia `subscription.current_period_end`, campo que a
// versão de API desta conta (2026-03-25.dahlia) removeu do objeto — ele
// vive em `subscription.items.data[].current_period_end`. Resultado:
// NULL gravado para todo mundo desde a mudança.
//
// POR QUE IMPORTA: a regra de acesso mantém PRO até o fim do período
// pago quando a assinatura está cancelada. Sem a data, `temAcessoPro`
// devolve false — quem pagou o mês e cancelou perdeu o acesso na hora.
//
// Uso: node scripts/audit-live-periods.js
// ============================================================
import fs from "node:fs";

const env = {};
for (const l of fs.readFileSync(".env", "utf8").split("\n")) {
  if (!l.trim() || l.startsWith("#") || !l.includes("=")) continue;
  const [k, ...r] = l.split("=");
  env[k.trim()] = r.join("=").trim().replace(/^"|"$/g, "");
}

const SK = env.STRIPE_SECRET_KEY;          // LIVE, só para GET
const URL = env.VITE_SUPABASE_URL;
const CHAVE = env.SUPABASE_SERVICE_ROLE_KEY ?? env.VITE_SUPABASE_ANON_KEY;

if (!SK?.startsWith("sk_live_")) {
  console.error("STRIPE_SECRET_KEY (live) ausente. Abortado.");
  process.exit(1);
}

async function stripeGet(caminho) {
  const r = await fetch(`https://api.stripe.com/v1/${caminho}`, {
    headers: { Authorization: "Basic " + Buffer.from(SK + ":").toString("base64") },
  });
  return r.json();
}

/**
 * As linhas afetadas. Se houver service_role no ambiente, lê pelo
 * PostgREST; senão, o operador passa o JSON por `--dados arquivo.json`
 * (a tabela é somente leitura para o cliente desde o P0, e a chave
 * anônima não enxerga linha de ninguém).
 */
async function carregarAssinaturas() {
  const arg = process.argv.indexOf("--dados");
  if (arg !== -1 && process.argv[arg + 1]) {
    return JSON.parse(fs.readFileSync(process.argv[arg + 1], "utf8"));
  }
  const r = await fetch(
    `${URL}/rest/v1/subscriptions?select=user_id,status,stripe_customer_id,stripe_subscription_id,current_period_end,is_test` +
      `&is_test=eq.false&current_period_end=is.null`,
    { headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}` } },
  );
  const d = await r.json();
  if (!Array.isArray(d)) {
    throw new Error(
      "não consegui ler subscriptions com esta chave. Rode com --dados <arquivo.json> " +
      "contendo o resultado da consulta.",
    );
  }
  return d;
}

const iso = (seg) =>
  typeof seg === "number" && Number.isFinite(seg)
    ? new Date(seg * 1000).toISOString().slice(0, 10)
    : null;

const linhas = await carregarAssinaturas();

console.log("=".repeat(78));
console.log("ASSINATURAS LIVE SEM current_period_end — levantamento (somente leitura)");
console.log("=".repeat(78));
console.log(`linhas afetadas no banco: ${linhas.length}\n`);

const relatorio = [];
for (const s of linhas) {
  let dataReal = null;
  let obs = "";

  if (!s.stripe_subscription_id) {
    obs = "sem stripe_subscription_id — nada a recuperar do Stripe (concessão manual ou checkout não concluído)";
  } else {
    const assin = await stripeGet(`subscriptions/${s.stripe_subscription_id}`);
    if (assin.error) {
      obs = `Stripe: ${assin.error.message}`;
    } else {
      const doItem = assin.items?.data?.[0]?.current_period_end;
      const doObjeto = assin.current_period_end;
      dataReal = iso(doItem ?? doObjeto);
      obs = `status no Stripe: ${assin.status}` +
        (assin.cancel_at_period_end ? " (cancel_at_period_end)" : "") +
        (doItem ? " · data veio do item" : doObjeto ? " · data veio do objeto" : " · sem data em lugar nenhum");
    }
  }

  relatorio.push({ ...s, data_real_no_stripe: dataReal, obs });
  console.log(`user_id      : ${s.user_id}`);
  console.log(`  status банco: ${s.status}`);
  console.log(`  subscription: ${s.stripe_subscription_id ?? "—"}`);
  console.log(`  DATA CORRETA: ${dataReal ?? "—"}`);
  console.log(`  ${obs}\n`);
}

const recuperaveis = relatorio.filter((r) => r.data_real_no_stripe);
console.log("-".repeat(78));
console.log(`recuperáveis do Stripe : ${recuperaveis.length}`);
console.log(`sem dado no Stripe     : ${relatorio.length - recuperaveis.length}`);
console.log("\nNenhum UPDATE foi executado. A correção dessas linhas é decisão sua.");

fs.writeFileSync("scripts/audit-live-periods-resultado.json", JSON.stringify(relatorio, null, 2));
console.log("relatório em scripts/audit-live-periods-resultado.json");
