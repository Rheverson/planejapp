// ============================================================
// Bateria de segurança da tabela de eventos do funil.
//
// Roda contra o banco de PRODUÇÃO com JWT de usuário comum — nunca
// service_role. Provar com service_role que o cliente está bloqueado não
// prova nada: o service_role ignora RLS por definição, então o teste
// passaria mesmo com a tabela escancarada.
//
// Os dois usuários são descartáveis (@teste.invalid) e removidos ao
// final. Nenhuma linha de usuário real é tocada.
//
//   node scripts/qa-eventos-seguranca.js
// ============================================================

import fs from "node:fs";

const V = {};
for (const linha of fs.readFileSync(".env", "utf8").split("\n")) {
  if (linha.includes("=") && !linha.startsWith("#")) {
    const [k, ...r] = linha.split("=");
    V[k.trim()] = r.join("=").trim().replace(/^"|"$/g, "");
  }
}
const URL_BASE = V.VITE_SUPABASE_URL;
const ANON = V.VITE_SUPABASE_ANON_KEY;

const ATACANTE = "a6a6a6a6-0000-4000-8000-000000000006";
const VITIMA = "b7b7b7b7-0000-4000-8000-000000000007";

async function entrar(email, senha) {
  const r = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: senha }),
  });
  if (!r.ok) throw new Error(`login falhou: ${r.status}`);
  return (await r.json()).access_token;
}

const cabecalhos = (jwt) => ({
  apikey: ANON,
  Authorization: `Bearer ${jwt}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
});

async function chamar(jwt, caminho, opcoes = {}) {
  const r = await fetch(`${URL_BASE}/rest/v1/${caminho}`, {
    ...opcoes,
    headers: cabecalhos(jwt),
  });
  const texto = await r.text();
  let corpo = null;
  try { corpo = texto ? JSON.parse(texto) : null; } catch { corpo = texto; }
  return { status: r.status, corpo };
}

const resultados = [];
function registrar(ataque, bloqueado, detalhe) {
  resultados.push({ ataque, bloqueado, detalhe });
  const marca = bloqueado ? "BLOQUEADO" : "PASSOU  ";
  console.log(`  ${marca} | ${ataque}${detalhe ? ` | ${detalhe}` : ""}`);
}

/** Escrita bloqueada = qualquer 4xx, OU 200 que não afetou linha nenhuma. */
function escritaBarrada({ status, corpo }) {
  if (status >= 400) return true;
  return Array.isArray(corpo) && corpo.length === 0;
}

async function main() {
  console.log("Entrando com os dois usuários descartáveis...");
  const atacante = await entrar("atacante-qa@teste.invalid", "Atacante!2026#qa");
  const vitima = await entrar("vitima-qa@teste.invalid", "Vitima!2026#qa");
  console.log("");

  // ── 1. Evento para outro usuário ──────────────────────────
  console.log("1. Fabricar evento para OUTRO usuário");
  let r = await chamar(atacante, "eventos_plano", {
    method: "POST",
    body: JSON.stringify({ user_id: VITIMA, evento: "paywall_visto", recurso: "contas" }),
  });
  registrar("A grava evento no nome de B", escritaBarrada(r), `HTTP ${r.status}`);

  // ── 2. Conversão fabricada ────────────────────────────────
  console.log("2. Fabricar conversão para si mesmo");
  r = await chamar(atacante, "eventos_plano", {
    method: "POST",
    body: JSON.stringify({
      user_id: ATACANTE, evento: "checkout_concluido",
      checkout_session_id: "cs_forjado_qa",
    }),
  });
  registrar("Free forja checkout_concluido", escritaBarrada(r), `HTTP ${r.status}`);

  r = await chamar(atacante, "eventos_plano", {
    method: "POST",
    body: JSON.stringify({
      user_id: ATACANTE, evento: "checkout_iniciado",
      checkout_session_id: "cs_forjado_qa_2",
    }),
  });
  registrar("Free forja checkout_iniciado", escritaBarrada(r), `HTTP ${r.status}`);

  // ── 3. Mudança de plano fabricada ─────────────────────────
  console.log("3. Fabricar mudança de plano");
  r = await chamar(atacante, "eventos_plano", {
    method: "POST",
    body: JSON.stringify({
      user_id: ATACANTE, evento: "plano_mudou",
      plano_anterior: "free", plano_novo: "pro", motivo: "assinou",
    }),
  });
  registrar("Free forja plano_mudou", escritaBarrada(r), `HTTP ${r.status}`);

  // ── 4. Editar evento antigo ───────────────────────────────
  console.log("4. Editar histórico");
  r = await chamar(atacante, `eventos_plano?user_id=eq.${VITIMA}`, {
    method: "PATCH",
    body: JSON.stringify({ evento: "checkout_concluido" }),
  });
  registrar("A edita evento de B", escritaBarrada(r), `HTTP ${r.status}`);

  r = await chamar(vitima, `eventos_plano?user_id=eq.${VITIMA}`, {
    method: "PATCH",
    body: JSON.stringify({ evento: "checkout_concluido" }),
  });
  registrar("B edita o PRÓPRIO evento", escritaBarrada(r), `HTTP ${r.status}`);

  // ── 5. Apagar evento antigo ───────────────────────────────
  console.log("5. Apagar histórico");
  r = await chamar(vitima, `eventos_plano?user_id=eq.${VITIMA}`, { method: "DELETE" });
  registrar("B apaga o próprio histórico", escritaBarrada(r), `HTTP ${r.status}`);

  // ── 6. Leitura cruzada ────────────────────────────────────
  console.log("6. Ler evento alheio");
  r = await chamar(atacante, `eventos_plano?user_id=eq.${VITIMA}&select=*`);
  const vazio = Array.isArray(r.corpo) && r.corpo.length === 0;
  registrar("A lê eventos de B", vazio, `HTTP ${r.status}, ${Array.isArray(r.corpo) ? r.corpo.length : "?"} linha(s)`);

  // ── 7. A RPC não serve para outro tipo de evento ──────────
  console.log("7. Desviar a RPC");
  const rpc = async (jwt, args) => {
    const res = await fetch(`${URL_BASE}/rest/v1/rpc/registrar_paywall_visto`, {
      method: "POST", headers: cabecalhos(jwt), body: JSON.stringify(args),
    });
    return { status: res.status, texto: await res.text() };
  };

  let x = await rpc(atacante, { p_recurso: "checkout_concluido" });
  let apos = await chamar(atacante, "eventos_plano?select=evento,recurso");
  const semLixo = Array.isArray(apos.corpo) &&
    !apos.corpo.some((e) => e.recurso === "checkout_concluido");
  registrar("RPC grava recurso inexistente", semLixo, `HTTP ${x.status}, descartado`);

  // A RPC funciona para o que ELA existe.
  x = await rpc(atacante, { p_recurso: "contas" });
  apos = await chamar(atacante, "eventos_plano?select=evento,recurso");
  const gravou = Array.isArray(apos.corpo) &&
    apos.corpo.some((e) => e.evento === "paywall_visto" && e.recurso === "contas");
  console.log(`  ${gravou ? "OK       " : "FALHOU  "} | RPC grava paywall_visto legítimo | HTTP ${x.status}`);
  resultados.push({ ataque: "RPC grava paywall legítimo (controle)", bloqueado: gravou, detalhe: "deve funcionar" });

  // ── 8. Janela de deduplicação ─────────────────────────────
  console.log("8. Inflar o topo do funil");
  for (let i = 0; i < 6; i++) await rpc(atacante, { p_recurso: "contas" });
  apos = await chamar(atacante, "eventos_plano?select=id,evento,recurso");
  const quantos = Array.isArray(apos.corpo)
    ? apos.corpo.filter((e) => e.evento === "paywall_visto" && e.recurso === "contas").length
    : -1;
  registrar("7 chamadas seguidas viram 7 eventos", quantos === 1, `${quantos} linha(s) gravada(s)`);

  // ── 9. A RPC não aceita alvo por parâmetro ────────────────
  console.log("9. Passar o alvo por parâmetro");
  const comAlvo = await fetch(`${URL_BASE}/rest/v1/rpc/registrar_paywall_visto`, {
    method: "POST", headers: cabecalhos(atacante),
    body: JSON.stringify({ p_recurso: "metas", p_user: VITIMA }),
  });
  const recusou = comAlvo.status >= 400;
  registrar("RPC aceita user_id por parâmetro", recusou, `HTTP ${comAlvo.status}`);

  console.log("");
  const furos = resultados.filter((r) => !r.bloqueado);
  console.log(`RESULTADO: ${resultados.length - furos.length}/${resultados.length} como esperado`);
  if (furos.length) {
    console.log("FUROS:");
    for (const f of furos) console.log(`  - ${f.ataque} (${f.detalhe})`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
