// ============================================================
// Conciliação dos dois lados, contra o banco de produção.
//
// Reproduz o caso real: Pix de R$ 1,00 do Itaú para o Nubank, que gera
// DUAS notificações de dois apps diferentes para UM movimento.
//
//   Itaú    "Feito. Pix enviado · Você enviou R$ 1,00 para Rheverson"
//   Nubank  "Transferência recebida · Recebemos sua transferência"
//
// Sem conciliar, o Nubank é creditado duas vezes — uma pela
// transferência e outra pela entrada — e o mês ganha uma receita que
// nunca existiu.
//
// Roda com JWT de usuário comum, no mesmo caminho do app.
//
//   node scripts/qa-captura-conciliacao.js
// ============================================================

import fs from "node:fs";
import { conciliarCaptura } from "../src/domain/captura.js";

const env = {};
for (const linha of fs.readFileSync(".env", "utf8").split("\n")) {
  if (linha.includes("=") && !linha.startsWith("#")) {
    const [k, ...r] = linha.split("=");
    env[k.trim()] = r.join("=").trim().replace(/^"|"$/g, "");
  }
}

const USUARIO = "f8f8f8f8-0000-4000-8000-000000000071";
const JANELA = 5 * 60 * 1000;

let jwt = null;
async function entrar() {
  const r = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: "concilia-qa@teste.invalid", password: "Concilia!2026#qa" }),
  });
  jwt = (await r.json()).access_token;
}

const cab = () => ({
  apikey: env.VITE_SUPABASE_ANON_KEY,
  Authorization: `Bearer ${jwt}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
});

async function api(caminho, opcoes = {}) {
  const r = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${caminho}`, { ...opcoes, headers: cab() });
  const texto = await r.text();
  let corpo = null;
  try { corpo = texto ? JSON.parse(texto) : null; } catch { corpo = texto; }
  return { status: r.status, corpo };
}

/** O mesmo caminho do hook: lê a janela, decide, aplica. */
async function capturar(lancamento, instante) {
  const desde = new Date(instante - JANELA).toISOString();
  const ate = new Date(instante + JANELA).toISOString();
  const { corpo: recentes } = await api(
    `transactions?user_id=eq.${USUARIO}&captura_chave=not.is.null`
    + `&captura_em=gte.${desde}&captura_em=lte.${ate}`
    + "&select=id,type,amount,account_id,transfer_account_id,credit_card_id,captura_em",
  );

  const d = conciliarCaptura(lancamento, recentes || [], instante);

  if (d.acao === "descartar") return { acao: d.acao, motivo: d.motivo };

  if (d.acao === "promover") {
    await api(`transactions?id=eq.${d.alvo}`, {
      method: "PATCH",
      body: JSON.stringify({
        type: "transfer", transfer_account_id: d.transfer_account_id, category: "transferencia",
      }),
    });
    return { acao: d.acao, alvo: d.alvo };
  }

  const corpo = d.acao === "transferir"
    ? { ...lancamento, type: "transfer", transfer_account_id: d.transfer_account_id, category: "transferencia" }
    : lancamento;

  const r = await api("transactions", {
    method: "POST",
    body: JSON.stringify([{ user_id: USUARIO, captura_em: new Date(instante).toISOString(), ...corpo }]),
  });

  if (d.acao === "transferir" && d.remover) {
    await api(`transactions?id=eq.${d.remover}`, { method: "DELETE" });
  }
  return { acao: d.acao, status: r.status };
}

const linhas = [];
function checar(rotulo, ok, evidencia) {
  linhas.push({ rotulo, ok });
  console.log(`  ${ok ? "PASS " : "FAIL "} | ${rotulo}${evidencia ? ` | ${evidencia}` : ""}`);
}

async function saldos(contas) {
  const { corpo: tx } = await api(
    `transactions?user_id=eq.${USUARIO}&select=type,amount,account_id,transfer_account_id,credit_card_id`,
  );
  const s = {};
  for (const c of contas) s[c.name] = Number(c.initial_balance);
  for (const t of tx) {
    const v = Number(t.amount);
    const nome = (id) => contas.find((c) => c.id === id)?.name;
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
  await api(`transactions?user_id=eq.${USUARIO}`, { method: "DELETE" });
}

async function main() {
  await entrar();
  const { corpo: contas } = await api(`accounts?user_id=eq.${USUARIO}&select=id,name,initial_balance`);
  const ITAU = contas.find((c) => c.name === "Itau").id;
  const NUBANK = contas.find((c) => c.name === "Nubank").id;
  const T = Date.now();

  const saida = (chave) => ({
    account_id: ITAU, description: "Pix enviado para Rheverson", amount: 1,
    type: "expense", category: "outros", date: "2026-09-05", is_realized: true,
    captura_chave: chave, notes: "Capturado automaticamente via Itau",
  });
  const entrada = (chave) => ({
    account_id: NUBANK, description: "Transferência recebida", amount: 1,
    type: "income", category: "outros", date: "2026-09-05", is_realized: true,
    captura_chave: chave, notes: "Capturado automaticamente via Nubank",
  });

  // ── Cenário 1: a saída chega primeiro ────────────────────
  console.log("1. Itaú primeiro, Nubank depois (ordem mais comum)");
  await limpar();
  let r = await capturar(saida("itau|a"), T);
  checar("saída do Itaú entra como despesa", r.acao === "gravar" && r.status === 201, `${r.acao}`);

  r = await capturar(entrada("nu|a"), T + 30_000);
  checar("entrada do Nubank PROMOVE a saída a transferência",
    r.acao === "promover", `${r.acao}`);

  let tx = (await api(`transactions?user_id=eq.${USUARIO}&select=type,transfer_account_id`)).corpo;
  checar("sobra UMA linha, do tipo transfer",
    tx.length === 1 && tx[0].type === "transfer", `${tx.length} linha(s), tipo ${tx[0]?.type}`);
  checar("com o destino certo", tx[0]?.transfer_account_id === NUBANK, "Nubank");

  let s = await saldos(contas);
  checar("Itaú 100 → 99", s.Itau === 99, `R$ ${s.Itau}`);
  checar("Nubank 50 → 51 (creditado UMA vez)", s.Nubank === 51, `R$ ${s.Nubank}`);

  // ── Cenário 2: a entrada chega primeiro ──────────────────
  console.log("");
  console.log("2. Nubank primeiro, Itaú depois (ordem invertida)");
  await limpar();
  r = await capturar(entrada("nu|b"), T);
  checar("entrada do Nubank entra como receita", r.acao === "gravar", `${r.acao}`);

  r = await capturar(saida("itau|b"), T + 30_000);
  checar("saída vira transferência e remove o espelho",
    r.acao === "transferir", `${r.acao}`);

  tx = (await api(`transactions?user_id=eq.${USUARIO}&select=type,transfer_account_id`)).corpo;
  checar("sobra UMA linha, do tipo transfer",
    tx.length === 1 && tx[0].type === "transfer", `${tx.length} linha(s)`);

  s = await saldos(contas);
  checar("saldos iguais aos do cenário 1",
    s.Itau === 99 && s.Nubank === 51, `Itaú ${s.Itau} · Nubank ${s.Nubank}`);

  // ── Cenário 3: fora da janela ────────────────────────────
  console.log("");
  console.log("3. Mandar R$ 1 de manhã e receber R$ 1 à tarde NÃO é transferência");
  await limpar();
  await capturar(saida("itau|c"), T);
  r = await capturar(entrada("nu|c"), T + 40 * 60_000);
  checar("fora da janela, os dois são fatos independentes",
    r.acao === "gravar", `${r.acao}`);

  tx = (await api(`transactions?user_id=eq.${USUARIO}&select=type`)).corpo;
  checar("duas linhas, uma despesa e uma receita",
    tx.length === 2 && tx.some((t) => t.type === "expense") && tx.some((t) => t.type === "income"),
    `${tx.length} linha(s)`);

  await limpar();
  console.log("");
  const falhas = linhas.filter((l) => !l.ok);
  console.log(`RESULTADO: ${linhas.length - falhas.length}/${linhas.length}`);
  if (falhas.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
