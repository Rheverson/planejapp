// ============================================================
// A captura automática, contra o banco de produção.
//
// O diferencial do produto — ler a notificação do banco e lançar
// sozinho — estava QUEBRADO em silêncio. O `insert` do hook não mandava
// `account_id` nem `credit_card_id`, e o CHECK
// `transactions_precisa_de_origem` recusava toda captura. Como o código
// só olhava o caminho de sucesso (`if (!error)` sem `else`), não havia
// lançamento, nem banner, nem aviso.
//
// Este script reproduz exatamente os dois inserts — o de antes e o de
// agora — com JWT de usuário comum, no mesmo caminho que o app usa.
//
//   node scripts/qa-captura-notificacao.js
// ============================================================

import fs from "node:fs";

const env = {};
for (const linha of fs.readFileSync(".env", "utf8").split("\n")) {
  if (linha.includes("=") && !linha.startsWith("#")) {
    const [k, ...r] = linha.split("=");
    env[k.trim()] = r.join("=").trim().replace(/^"|"$/g, "");
  }
}

const USUARIO = "d1d1d1d1-0000-4000-8000-000000000051";
const hoje = new Date().toISOString().split("T")[0];

let jwt = null;
async function entrar() {
  const r = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: "captura-qa@teste.invalid", password: "Captura!2026#qa" }),
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

/** O mesmo lançamento que o hook monta, com e sem conta. */
const lancamento = (contaId) => ({
  user_id: USUARIO,
  ...(contaId ? { account_id: contaId } : {}),
  description: "Mercado Extra",
  amount: 87.4,
  type: "expense",
  category: "outros",
  date: hoje,
  is_realized: true,
  notes: "Capturado automaticamente via Nubank",
});

const linhas = [];
function checar(rotulo, ok, evidencia) {
  linhas.push({ rotulo, ok });
  console.log(`  ${ok ? "PASS " : "FAIL "} | ${rotulo}${evidencia ? ` | ${evidencia}` : ""}`);
}

async function main() {
  await entrar();

  const contas = (await api(`accounts?user_id=eq.${USUARIO}&select=id,name,type&order=created_at`)).corpo;
  const investimento = contas.find((c) => c.type === "investment");
  const banco = contas.find((c) => c.name === "Nubank");

  console.log("1. O insert de ANTES da correção");
  let r = await api("transactions", { method: "POST", body: JSON.stringify([lancamento(null)]) });
  const recusou = r.status >= 400 &&
    String(r.corpo?.message ?? "").includes("transactions_precisa_de_origem");
  checar("sem account_id o banco recusa (era a falha silenciosa)",
    recusou, `HTTP ${r.status} · ${String(r.corpo?.message ?? "").slice(0, 46)}`);

  console.log("");
  console.log("2. O insert de AGORA");
  r = await api("transactions", { method: "POST", body: JSON.stringify([lancamento(banco.id)]) });
  checar("com a conta escolhida, o lançamento entra",
    r.status === 201, `HTTP ${r.status}`);
  checar("caiu na conta que casa com o banco da notificação",
    r.corpo?.[0]?.account_id === banco.id, `${banco.name}`);

  console.log("");
  console.log("3. A conta de investimento fica fora");
  // A Caixinha é a conta MAIS ANTIGA. Se o fallback não filtrasse por
  // tipo, um gasto de mercado cairia nela — e o cálculo de aporte do
  // Score financeiro passaria a mentir.
  checar("a mais antiga é a de investimento (o caso perigoso)",
    contas[0].id === investimento.id, `${contas[0].name} (${contas[0].type})`);
  checar("mas quem recebeu foi a conta comum",
    r.corpo?.[0]?.account_id !== investimento.id, "Caixinha intocada");

  console.log("");
  console.log("4. O saldo bate");
  const tx = (await api(`transactions?user_id=eq.${USUARIO}&select=amount,account_id`)).corpo;
  const naConta = tx.filter((t) => t.account_id === banco.id)
    .reduce((a, t) => a + Number(t.amount), 0);
  checar("um único lançamento, com o valor da notificação",
    tx.length === 1 && Math.abs(naConta - 87.4) < 0.01, `R$ ${naConta.toFixed(2)}`);

  console.log("");
  const falhas = linhas.filter((l) => !l.ok);
  console.log(`RESULTADO: ${linhas.length - falhas.length}/${linhas.length}`);
  if (falhas.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
