// ============================================================
// Autenticação compartilhada das Edge Functions
//
// Contexto (auditoria de 26/08/2026): 15 das 18 funções estavam
// publicadas com verify_jwt = false e liam o `userId` do corpo da
// requisição enquanto operavam com service_role. Qualquer pessoa
// podia ler ou escrever dados de qualquer usuário.
//
// Regra a partir daqui: a identidade NUNCA vem do corpo da
// requisição. Ou vem do JWT do usuário, ou a chamada é interna.
//
// Atenção: `verify_jwt = true` no gateway apenas valida a assinatura
// do token — e a chave anônima também é um JWT válido. Por isso toda
// função de usuário precisa chamar getAuthenticatedUser(), que exige
// um usuário real.
// ============================================================

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "https://app.planejapp.com.br",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};

/** Origens autorizadas a chamar as funções pelo navegador. */
const ORIGENS_PERMITIDAS = [
  "https://app.planejapp.com.br",
  "https://planejapp.com.br",
  "https://www.planejapp.com.br",
  "http://localhost:5173",
  "http://localhost:4173",
  // WebView do APK Android (Capacitor)
  "https://localhost",
  "capacitor://localhost",
];

/** Devolve os cabeçalhos de CORS já resolvidos para a origem da requisição. */
export function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const permitida = ORIGENS_PERMITIDAS.includes(origin);
  return {
    ...corsHeaders,
    "Access-Control-Allow-Origin": permitida ? origin : ORIGENS_PERMITIDAS[0],
  };
}

export function json(req: Request, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  });
}

export function preflight(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  return null;
}

/** Cliente com service_role — ignora RLS. Use só depois de autorizar. */
export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function bearer(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice(7).trim();
}

/**
 * Identidade do usuário a partir do JWT.
 * Devolve null se não houver token, se ele for inválido, ou se for a
 * chave anônima (que é um JWT válido, mas não representa um usuário).
 */
export async function getAuthenticatedUser(
  req: Request,
): Promise<{ id: string; email?: string } | null> {
  const token = bearer(req);
  if (!token) return null;

  // A chave anônima passa na validação do gateway; aqui ela não serve.
  if (token === Deno.env.get("SUPABASE_ANON_KEY")) return null;

  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email ?? undefined };
}

/** A chamada veio de dentro (cron, trigger ou outra Edge Function)? */
export function isInternalCall(req: Request): boolean {
  const token = bearer(req);
  if (!token) return false;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return !!serviceKey && token === serviceKey;
}

/**
 * Exige um usuário autenticado. Devolve `{ user }` ou `{ response }`
 * com o 401 pronto para ser retornado.
 */
export async function requireUser(
  req: Request,
): Promise<{ user: { id: string; email?: string }; response?: never } | { user?: never; response: Response }> {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return { response: json(req, { error: "Não autorizado" }, 401) };
  }
  return { user };
}

/** Exige que a chamada seja interna (service_role). */
export function requireInternal(req: Request): Response | null {
  if (!isInternalCall(req)) {
    return json(req, { error: "Não autorizado" }, 401);
  }
  return null;
}

/**
 * A chamada veio de um cron job do Postgres?
 *
 * O pg_cron não tem como assinar um JWT, então usa um token
 * compartilhado guardado em `internal_config` — uma tabela sem policy
 * alguma, visível apenas para service_role. Assim o segredo não
 * precisa existir como variável de ambiente nem entrar no Git.
 */
export async function isCronCall(req: Request): Promise<boolean> {
  const enviado = req.headers.get("x-cron-key");
  if (!enviado) return false;

  const { data, error } = await adminClient()
    .from("internal_config")
    .select("value")
    .eq("key", "cron_auth_token")
    .single();

  if (error || !data?.value) return false;

  // Comparação de tempo constante, para não vazar o token por timing.
  const esperado = data.value;
  if (enviado.length !== esperado.length) return false;
  let diferenca = 0;
  for (let i = 0; i < esperado.length; i++) {
    diferenca |= enviado.charCodeAt(i) ^ esperado.charCodeAt(i);
  }
  return diferenca === 0;
}

/** Exige chamada interna: service_role OU cron job autenticado. */
export async function requireInternalOrCron(req: Request): Promise<Response | null> {
  if (isInternalCall(req)) return null;
  if (await isCronCall(req)) return null;
  return json(req, { error: "Não autorizado" }, 401);
}

// ── Webhook do Twilio ───────────────────────────────────────

/**
 * Valida a assinatura `X-Twilio-Signature`.
 *
 * O algoritmo do Twilio: concatena a URL exata que ele chamou com
 * cada par chave+valor do POST, ordenados por chave; faz HMAC-SHA1
 * com o auth token da conta; compara em base64.
 *
 * Sem isso, a identidade do remetente vinha do campo `From` do corpo —
 * qualquer pessoa podia se passar por qualquer usuário cadastrado.
 *
 * Falha fechada: sem `TWILIO_AUTH_TOKEN` configurado, nada passa.
 */
export async function validarAssinaturaTwilio(
  req: Request,
  params: Record<string, string>,
): Promise<{ ok: true } | { ok: false; motivo: string; status: number }> {
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  if (!token) {
    return {
      ok: false,
      status: 503,
      motivo: "TWILIO_AUTH_TOKEN não configurado — webhook desabilitado por segurança",
    };
  }

  const assinatura = req.headers.get("X-Twilio-Signature");
  if (!assinatura) return { ok: false, status: 403, motivo: "sem assinatura" };

  // A URL precisa ser exatamente a que está configurada no console do
  // Twilio. Atrás de proxy, `req.url` pode não bater — por isso é
  // possível fixá-la por variável de ambiente.
  const url = Deno.env.get("TWILIO_WEBHOOK_URL") ?? req.url;

  const base = url + Object.keys(params).sort()
    .map((k) => k + params[k])
    .join("");

  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(token),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const bytes = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(base));
  const esperada = btoa(String.fromCharCode(...new Uint8Array(bytes)));

  // Comparação de tempo constante.
  if (esperada.length !== assinatura.length) {
    return { ok: false, status: 403, motivo: "assinatura inválida" };
  }
  let diff = 0;
  for (let i = 0; i < esperada.length; i++) {
    diff |= esperada.charCodeAt(i) ^ assinatura.charCodeAt(i);
  }
  if (diff !== 0) return { ok: false, status: 403, motivo: "assinatura inválida" };

  return { ok: true };
}
