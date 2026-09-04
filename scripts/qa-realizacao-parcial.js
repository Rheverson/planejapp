// ============================================================
// Realização parcial de uma previsão recorrente.
//
// O bug: `idx_recorrencia_sem_duplicata` cobria TODAS as linhas de uma
// série recorrente, inclusive as realizadas. Registrar uma realização
// parcial move a data da previsão para o dia do pagamento — e se já
// houvesse outro pagamento da mesma série naquele dia, o UPDATE batia
// no índice e voltava 409.
//
// Foi o que aconteceu em produção: "Mercado" de R$ 684 prevista para
// 30/09, realizada parcialmente em 03/09, onde já existia outro
// "Mercado" de R$ 22 da mesma série.
//
// Duas compras de mercado no mesmo dia são normais. Duas PREVISÕES da
// mesma série no mesmo dia é que não são — e é só isso que o motor de
// recorrência pode produzir por engano.
//
// Roda com JWT de usuário comum: é o mesmo caminho do app.
//
//   node scripts/qa-realizacao-parcial.js
// ============================================================

import fs from "node:fs";

const env = {};
for (const linha of fs.readFileSync(".env", "utf8").split("\n")) {
  if (linha.includes("=") && !linha.startsWith("#")) {
    const [k, ...r] = linha.split("=");
    env[k.trim()] = r.join("=").trim().replace(/^"|"$/g, "");
  }
}

const USUARIO = "a9a9a9a9-0000-4000-8000-000000000031";
const GRUPO = "bbbbbbbb-0000-4000-8000-000000000099";

let jwt = null;
async function entrar() {
  const r = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: "parcial-qa@teste.invalid", password: "Parcial!2026#qa" }),
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
  const r = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${caminho}`, {
    ...opcoes, headers: cab(),
  });
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

  // `account_id` e obrigatorio: ha um CHECK que barra transacao sem
  // conta nem cartao (a correcao do Furo 2). O app envia porque copia
  // da transacao original; o teste tem de fazer o mesmo.
  const contas = await api(`accounts?user_id=eq.${USUARIO}&select=id`);
  const CONTA = contas.corpo?.[0]?.id;

  // Estado de partida, montado por SQL: um pagamento realizado em 03/09
  // e a previsão de 30/09, ambos da mesma série.
  let r = await api(`transactions?user_id=eq.${USUARIO}&select=id,amount,date,is_realized&order=date`);
  const previsao = r.corpo.find((t) => t.is_realized === false);
  const jaPago = r.corpo.find((t) => t.is_realized === true);
  checar("cenário montado: 1 realizada em 03/09 e 1 prevista em 30/09",
    !!previsao && !!jaPago && jaPago.date === "2026-09-03" && previsao.date === "2026-09-30",
    `${r.corpo.length} lançamento(s)`);

  // ── O que o app faz ao registrar realização parcial ───────
  //
  // 1) a previsão vira o pagamento efetivo, na data em que ocorreu
  const valorPago = 40.16;
  r = await api(`transactions?id=eq.${previsao.id}`, {
    method: "PATCH",
    body: JSON.stringify({ is_realized: true, amount: valorPago, date: "2026-09-03" }),
  });
  checar("PATCH move a previsão para o dia do pagamento",
    r.status === 200 && Array.isArray(r.corpo) && r.corpo.length === 1,
    `HTTP ${r.status}`);

  // 2) o restante vira nova previsão, na data original
  const restante = Number((684 - valorPago).toFixed(2));
  r = await api("transactions", {
    method: "POST",
    body: JSON.stringify([{
      user_id: USUARIO,
      description: "Mercado",
      amount: restante,
      type: "expense",
      category: "mercado",
      date: "2026-09-30",
      is_realized: false,
      recurring_group_id: GRUPO,
      account_id: CONTA,
    }]),
  });
  checar("restante volta como previsão em 30/09",
    r.status === 201, `HTTP ${r.status}`);

  // ── Estado final ──────────────────────────────────────────
  r = await api(`transactions?user_id=eq.${USUARIO}&select=amount,date,is_realized&order=date,amount`);
  const pagosNoDia = r.corpo.filter((t) => t.date === "2026-09-03" && t.is_realized);
  checar("dois pagamentos da mesma série no mesmo dia convivem",
    pagosNoDia.length === 2, `${pagosNoDia.length} pagamento(s) em 03/09`);

  const soma = r.corpo.reduce((a, t) => a + Number(t.amount), 0);
  checar("nada de dinheiro se perdeu (22 + 40,16 + 643,84 = 706)",
    Math.abs(soma - 706) < 0.01, `total = ${soma.toFixed(2)}`);

  // ── A proteção original continua de pé ────────────────────
  //
  // O que o índice existe para barrar é o motor gerar duas PREVISÕES da
  // mesma série na mesma data. Isso tem de continuar falhando.
  r = await api("transactions", {
    method: "POST",
    body: JSON.stringify([{
      user_id: USUARIO,
      description: "Mercado",
      amount: 99,
      type: "expense",
      category: "mercado",
      date: "2026-09-30",
      is_realized: false,
      recurring_group_id: GRUPO,
      account_id: CONTA,
    }]),
  });
  checar("segunda PREVISÃO da série na mesma data continua barrada",
    r.status === 409, `HTTP ${r.status}`);

  console.log("");
  const falhas = linhas.filter((l) => !l.ok);
  console.log(`RESULTADO: ${linhas.length - falhas.length}/${linhas.length}`);
  if (falhas.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
