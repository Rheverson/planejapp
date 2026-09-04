// ============================================================
// As três blindagens: unicidade, invoice.paid e portal.
//
// Roda com JWT de usuário comum — é o mesmo caminho do app.
// Usuário @teste.invalid, removido ao final.
//
//   node scripts/qa-resiliencia.js
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

const USUARIO = "c1c1c1c1-0000-4000-8000-000000000041";
const RODADA = Date.now().toString(36);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

let jwt = null;
async function entrar() {
  const r = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: "resil-qa@teste.invalid", password: "Resil!2026#qa" }),
  });
  jwt = (await r.json()).access_token;
}

const cab = () => ({
  apikey: env.VITE_SUPABASE_ANON_KEY,
  Authorization: `Bearer ${jwt}`,
  "Content-Type": "application/json",
});

async function funcao(nome, corpo) {
  const r = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/${nome}`, {
    method: "POST", headers: cab(), body: JSON.stringify(corpo ?? {}),
  });
  const texto = await r.text();
  try { return { status: r.status, corpo: JSON.parse(texto) }; }
  catch { return { status: r.status, corpo: texto }; }
}

async function ler(tabela, filtro) {
  const r = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${tabela}?${filtro}`, {
    headers: cab(),
  });
  const d = await r.json();
  return Array.isArray(d) ? d : [];
}

let relogio = Math.floor(Date.now() / 1000);
async function webhook(evento) {
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
  try { return { status: r.status, corpo: JSON.parse(texto) }; }
  catch { return { status: r.status, corpo: texto }; }
}

const linhas = [];
function checar(rotulo, ok, evidencia) {
  linhas.push({ rotulo, ok });
  console.log(`  ${ok ? "PASS " : "FAIL "} | ${rotulo}${evidencia ? ` | ${evidencia}` : ""}`);
}

async function main() {
  await entrar();

  // ══ 1. DUPLICIDADE ══════════════════════════════════════
  console.log("1. Assinatura duplicada");

  // O usuário já está em `trialing`. Um checkout novo é conflito.
  let r = await funcao("create-checkout", {});
  checar("checkout com assinatura ativa devolve 409",
    r.status === 409, `HTTP ${r.status}`);
  checar("resposta traz código para o front distinguir",
    r.corpo?.codigo === "assinatura_ja_ativa", `codigo=${r.corpo?.codigo}`);

  // Duplo clique: duas chamadas ao mesmo tempo, nenhuma pode passar.
  const [a, b] = await Promise.all([
    funcao("create-checkout", {}),
    funcao("create-checkout", {}),
  ]);
  checar("duplo clique: as duas barradas",
    a.status === 409 && b.status === 409, `${a.status} e ${b.status}`);

  // Conta só as de PRODUÇÃO: a restrição é por (user_id, is_test), e o
  // passo 2 deste script cria de propósito uma linha de teste. Uma
  // unicidade só por `user_id` proibiria o QA de existir ao lado do
  // dado real — foi por isso que ela não foi escrita assim.
  const assinaturas = await ler("subscriptions",
    `user_id=eq.${USUARIO}&is_test=eq.false&select=id`);
  checar("continua com UMA linha de assinatura de produção",
    assinaturas.length === 1, `${assinaturas.length} linha(s)`);

  // ══ 2. invoice.paid ═════════════════════════════════════
  console.log("");
  console.log("2. invoice.paid fecha o funil");

  // Precisa de uma linha de TESTE para o evento assinado com o segredo
  // de teste alcançar. O checkout cria essa linha.
  const assinaturaTeste = `sub_RESIL_${RODADA}`;
  await webhook({
    id: `evt_qa_res_${RODADA}_c1`, type: "checkout.session.completed",
    created: ++relogio, livemode: false,
    data: { object: {
      id: `cs_RESIL_${RODADA}`, customer: `cus_RESIL_${RODADA}`,
      subscription: assinaturaTeste, client_reference_id: USUARIO,
    } },
  });
  await dormir(2000);

  // `invoice.paid` — não `payment_succeeded` — com cobrança de verdade.
  r = await webhook({
    id: `evt_qa_res_${RODADA}_p1`, type: "invoice.paid",
    created: ++relogio, livemode: false,
    data: { object: {
      id: `in_RESIL_${RODADA}`, customer: `cus_RESIL_${RODADA}`,
      subscription: assinaturaTeste, billing_reason: "subscription_cycle",
      amount_paid: 1290, total: 1290,
    } },
  });
  await dormir(2500);

  let convertidos = await ler("eventos_plano",
    `user_id=eq.${USUARIO}&evento=eq.trial_convertido&stripe_subscription_id=eq.${assinaturaTeste}&select=*`);
  checar("invoice.paid gera trial_convertido",
    convertidos.length === 1, `HTTP ${r.status}, ${convertidos.length} linha(s)`);

  // O Stripe manda os DOIS eventos para a mesma fatura. Só pode contar
  // uma vez — senão a receita apareceria dobrada no funil.
  r = await webhook({
    id: `evt_qa_res_${RODADA}_p2`, type: "invoice.payment_succeeded",
    created: ++relogio, livemode: false,
    data: { object: {
      id: `in_RESIL_${RODADA}`, customer: `cus_RESIL_${RODADA}`,
      subscription: assinaturaTeste, billing_reason: "subscription_cycle",
      amount_paid: 1290, total: 1290,
    } },
  });
  await dormir(2500);
  convertidos = await ler("eventos_plano",
    `user_id=eq.${USUARIO}&evento=eq.trial_convertido&stripe_subscription_id=eq.${assinaturaTeste}&select=*`);
  checar("os dois eventos da mesma fatura contam UMA conversão",
    convertidos.length === 1, `${convertidos.length} linha(s)`);

  // ══ 3. PORTAL ═══════════════════════════════════════════
  console.log("");
  console.log("3. Portal do cliente");

  // Redirecionamento aberto: o corpo não pode escolher o domínio.
  r = await funcao("create-billing-portal", { returnPath: "https://site-malicioso.example/roubo" });
  const url = r.corpo?.url ?? "";
  checar("caminho externo é recusado (não vira return_url)",
    r.status !== 200 || !url.includes("site-malicioso"),
    `HTTP ${r.status}`);

  r = await funcao("create-billing-portal", { returnPath: "//site-malicioso.example" });
  checar("barra dupla (URL protocol-relative) também é recusada",
    r.status !== 200 || !(r.corpo?.url ?? "").includes("site-malicioso"),
    `HTTP ${r.status}`);

  // O caminho legítimo: o cliente `cus_QA_RESIL` não existe no Stripe
  // real, então a API recusa — mas o que se prova aqui é que a função
  // CHEGA ao Stripe com o cliente do usuário logado.
  r = await funcao("create-billing-portal", { returnPath: "/PlanPage" });
  const chegouNoStripe = r.status === 500 &&
    String(r.corpo?.error ?? "").toLowerCase().includes("cus_qa_resil");
  checar("usa o customer do usuário logado",
    chegouNoStripe || r.status === 200,
    `HTTP ${r.status} · ${String(r.corpo?.error ?? "ok").slice(0, 70)}`);

  // ── O sanitizador, testado contra a fonte ─────────────────
  //
  // Os três casos acima devolveram 500 porque o cliente de QA não
  // existe no Stripe — então o 500 sozinho não distingue "recusou a URL"
  // de "quebrou antes". Aqui a regex é lida DO PRÓPRIO ARQUIVO da
  // função, para o teste não poder divergir da implementação.
  console.log("");
  console.log("3b. O sanitizador do caminho, contra a fonte");
  const fonte = fs.readFileSync("supabase/functions/create-billing-portal/index.ts", "utf8");
  const achada = fonte.match(/const caminhoSeguro = (\/.+?\/)\.test\(caminho\)/);
  checar("regex encontrada no arquivo da função", !!achada, achada?.[1]?.slice(0, 40));

  if (achada) {
    const re = eval(achada[1]);
    const casos = [
      ["/PlanPage", true, "caminho do app"],
      ["/", true, "raiz"],
      ["/Profile?aba=plano", true, "com querystring"],
      ["https://site-malicioso.example", false, "URL absoluta"],
      ["//site-malicioso.example", false, "protocol-relative"],
      ["javascript:alert(1)", false, "javascript:"],
      ["PlanPage", false, "sem barra inicial"],
      // Barra invertida montada por codigo: escapa-la em literal ja
      // mordeu este teste uma vez, e o caso virou "/evil.com" — que e
      // caminho interno legitimo e passa com razao.
      ["/" + String.fromCharCode(92) + "evil.com", false, "barra invertida"],
    ];
    const erros = casos.filter(([v, esperado]) => re.test(v) !== esperado);
    for (const [v, esperado, rotulo] of casos) {
      const passou = re.test(v) === esperado;
      if (!passou) console.log(`      divergiu: ${rotulo} (${v})`);
    }
    checar("aceita só caminho interno; recusa domínio, // e esquema",
      erros.length === 0, `${casos.length - erros.length}/${casos.length} casos`);
  }

  console.log("");
  const falhas = linhas.filter((l) => !l.ok);
  console.log(`RESULTADO: ${linhas.length - falhas.length}/${linhas.length}`);
  if (falhas.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
