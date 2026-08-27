import { describe, it, expect, vi } from "vitest";

// ============================================================
// Nenhum marcador de ação pode chegar à tela.
//
// O caso real: o Finn respondeu com quatro blocos numa mensagem só, e
// escreveu os marcadores SEM os underscores ("REALIZE_TX{…}END_REALIZE").
// O limpador usava regex sem a flag `g` e exigia os `__`, então nada foi
// removido — o usuário viu JSON cru com UUID no meio do conselho.
// ============================================================

vi.mock("@capacitor/app", () => ({ App: { addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })) } }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" } }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn(), functions: { invoke: vi.fn() } } }));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/SharedProfileContext", () => ({ useSharedProfile: () => ({ isViewingSharedProfile: false, activeOwnerId: "u1" }) }));
vi.mock("react-markdown", () => ({ default: ({ children }) => children }));

const { cleanContent } = await import("./AIInsights.jsx");

// Transcrito da tela do usuário, com os marcadores sem underscore.
const RESPOSTA_REAL = `1 **Priorize receitas previstas** – realize hoje os recebimentos freelance (R$ 812,75 + 250 + 230 + 1.000).
2 **Corte nas categorias críticas** – reduza "outros" (R$ 1.432) em 20%.
Ações:
REALIZE_TX{"id":"a745587f-228b-473a-933c-059271a1b1c1","date":"2026-08-27"}END_REALIZE
REALIZE_TX{"id":"de7606dc-11fa-4931-bf36-df3da5c1c1c1","date":"2026-08-27"}END_REALIZE
REALIZE_TX{"id":"fea9db9c-480f-431c-a3f4-7a08a1c1c1c1","date":"2026-08-27"}END_REALIZE
PARTIAL_REALIZE{"id":"3c885591-fea0-4c59-9c09-2f2c66dc8403","paid_amount":0,"remaining_amount":429,"date":"2026-08-27"}END_PARTIAL`;

const MARCADORES = [
  "REALIZE_TX", "END_REALIZE", "PARTIAL_REALIZE", "END_PARTIAL",
  "DELETE_TX", "END_DELETE", "PENDING_TX", "END_TX",
  "CREATE_GOAL", "DELETE_ACCOUNT", "SEND_INVITE",
];

const limpo = (t) => cleanContent(t);

describe("nada de bloco de ação na tela", () => {
  it("remove os quatro blocos da resposta real", () => {
    const t = limpo(RESPOSTA_REAL);
    for (const m of MARCADORES) expect(t).not.toContain(m);
    expect(t).not.toMatch(/"id"\s*:/);
    expect(t).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });

  it("preserva o conselho em volta", () => {
    const t = limpo(RESPOSTA_REAL);
    expect(t).toContain("Priorize receitas previstas");
    expect(t).toContain("R$ 1.432");
  });

  it('não deixa o "Ações:" pendurado', () => {
    expect(limpo(RESPOSTA_REAL)).not.toMatch(/Ações:\s*$/);
  });

  it("remove com underscores também", () => {
    const t = limpo('texto __DELETE_TX__{"id":"abc"}__END_DELETE__');
    expect(t).toBe("texto");
  });

  it("remove quando o markdown deixa o marcador em negrito", () => {
    const t = limpo('texto **REALIZE_TX**{"id":"abc"}**END_REALIZE**');
    for (const m of MARCADORES) expect(t).not.toContain(m);
  });

  it("remove vários blocos do mesmo tipo", () => {
    const t = limpo('a __DELETE_TX__{"id":"1"}__END_DELETE__ b __DELETE_TX__{"id":"2"}__END_DELETE__ c');
    expect(t).not.toContain("DELETE_TX");
    expect(t).toContain("a");
    expect(t).toContain("c");
  });

  it("corta bloco truncado pelo limite de tokens", () => {
    // A resposta acabou no meio: o fecha nunca chegou.
    const t = limpo('Conselho aqui.\n__PARTIAL_REALIZE__{"id":"abc","paid_amo');
    expect(t).toBe("Conselho aqui.");
  });

  it("texto sem ação nenhuma passa intacto", () => {
    const t = "Seus gastos somam R$ 7.995 contra R$ 7.655 de renda.";
    expect(limpo(t)).toBe(t);
  });

  it("não engole texto legítimo que cite valores", () => {
    const t = "Você tem 3 previstas: R$ 250, R$ 230 e R$ 1.000.";
    expect(limpo(t)).toBe(t);
  });

  it("aguenta vazio e nulo", () => {
    expect(limpo("")).toBe("");
    expect(limpo(null)).toBe("");
    expect(limpo(undefined)).toBe("");
  });
});
