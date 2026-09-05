// ============================================================
// A idempotência da captura, contra o banco de produção.
//
// A trava antiga era um Map em memória, com assinatura montada a partir
// do TEXTO da notificação. Dois furos:
//
//   1. o Android chama `onNotificationPosted` na postagem E em cada
//      atualização — e o banco atualiza a dele ("Pix processando" →
//      "Pix enviado para João"). Texto diferente, assinatura diferente,
//      dois lançamentos do mesmo dinheiro;
//   2. memória morre com o processo. Fila recolhida depois de reiniciar
//      não tinha com o que comparar.
//
// Agora a chave é `sbn.getKey()` do Android — estável entre as
// atualizações da MESMA notificação — mais o dia, e a trava definitiva
// é o índice único `transactions_captura_unica`, que sobrevive a
// reinício, reinstalação e reprocessamento de fila.
//
// Roda com JWT de usuário comum: mesmo caminho do app.
//
//   node scripts/qa-captura-idempotencia.js
// ============================================================

import fs from "node:fs";

const env = {};
for (const linha of fs.readFileSync(".env", "utf8").split("\n")) {
  if (linha.includes("=") && !linha.startsWith("#")) {
    const [k, ...r] = linha.split("=");
    env[k.trim()] = r.join("=").trim().replace(/^"|"$/g, "");
  }
}

const USUARIO = "e7e7e7e7-0000-4000-8000-000000000061";

let jwt = null;
async function entrar() {
  const r = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: "idem-qa@teste.invalid", password: "Idem!2026#qa" }),
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

const linhas = [];
function checar(rotulo, ok, evidencia) {
  linhas.push({ rotulo, ok });
  console.log(`  ${ok ? "PASS " : "FAIL "} | ${rotulo}${evidencia ? ` | ${evidencia}` : ""}`);
}

async function main() {
  await entrar();
  const conta = (await api(`accounts?user_id=eq.${USUARIO}&select=id`)).corpo[0].id;

  // A MESMA notificação, com o texto que o banco atualizou no caminho.
  const CHAVE = "0|com.nu.production|4242|null|10|2026-09-05";
  const lancamento = (descricao) => ({
    user_id: USUARIO,
    account_id: conta,
    description: descricao,
    amount: 1,
    type: "expense",
    category: "outros",
    date: "2026-09-05",
    is_realized: true,
    captura_chave: CHAVE,
    notes: "Capturado automaticamente via Nubank",
  });

  console.log("1. A notificação chega e vira lançamento");
  let r = await api("transactions", {
    method: "POST", body: JSON.stringify([lancamento("Pix processando")]),
  });
  checar("primeira gravação entra", r.status === 201, `HTTP ${r.status}`);

  console.log("");
  console.log("2. O Android ATUALIZA o texto da mesma notificação");
  r = await api("transactions", {
    method: "POST", body: JSON.stringify([lancamento("Pix enviado para João Silva")]),
  });
  const barrou = r.status === 409 || String(r.corpo?.code) === "23505";
  checar("texto diferente, mesma chave: barrado pelo índice único",
    barrou, `HTTP ${r.status} · ${String(r.corpo?.message ?? "").slice(0, 40)}`);

  console.log("");
  console.log("3. O app reinicia e reprocessa a fila");
  // A trava em memória some com o processo. Só o índice segura aqui.
  r = await api("transactions", {
    method: "POST", body: JSON.stringify([lancamento("Pix enviado para João Silva")]),
  });
  checar("reprocessamento depois do reinício também é barrado",
    r.status === 409 || String(r.corpo?.code) === "23505", `HTTP ${r.status}`);

  const tudo = (await api(`transactions?user_id=eq.${USUARIO}&select=id,description,amount`)).corpo;
  checar("uma única transação no fim", tudo.length === 1, `${tudo.length} linha(s)`);
  checar("com o valor certo", Number(tudo[0]?.amount) === 1, `R$ ${tudo[0]?.amount}`);

  console.log("");
  console.log("4. Outra notificação, de verdade, não é confundida");
  r = await api("transactions", {
    method: "POST",
    body: JSON.stringify([{ ...lancamento("Segunda compra"), captura_chave: `${CHAVE}|outra` }]),
  });
  checar("chave diferente entra normalmente", r.status === 201, `HTTP ${r.status}`);

  console.log("");
  console.log("5. Lançamento manual não é afetado");
  // `captura_chave` nula em lançamento manual, e o índice é parcial:
  // nulo não colide com nulo. Dois manuais idênticos devem entrar.
  const manual = { ...lancamento("Manual"), captura_chave: null };
  const m1 = await api("transactions", { method: "POST", body: JSON.stringify([manual]) });
  const m2 = await api("transactions", { method: "POST", body: JSON.stringify([manual]) });
  checar("dois lançamentos manuais idênticos convivem",
    m1.status === 201 && m2.status === 201, `${m1.status} e ${m2.status}`);

  console.log("");
  const falhas = linhas.filter((l) => !l.ok);
  console.log(`RESULTADO: ${linhas.length - falhas.length}/${linhas.length}`);
  if (falhas.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
