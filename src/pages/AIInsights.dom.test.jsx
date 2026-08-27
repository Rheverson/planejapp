import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// ============================================================
// O card de confirmação do Finn e o registro que será alterado
// precisam ser a MESMA linha.
//
// O bug: o bloco que a IA devolve carrega só o id — nunca descrição,
// valor ou data. O card lia esses campos direto da ação e caía no
// `|| 0` do formatador, exibindo "Descrição: —" e "R$ 0,00" enquanto a
// exclusão acertava o registro certo. Confirmação e execução mostravam
// coisas diferentes.
//
// Presente desde o commit inicial: o prompt sempre pediu
// __DELETE_TX__{"id":"..."} e o card sempre leu action.description.
// ============================================================

vi.mock("@capacitor/app", () => ({ App: { addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })) } }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" } }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn(), functions: { invoke: vi.fn() } } }));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/SharedProfileContext", () => ({ useSharedProfile: () => ({ isViewingSharedProfile: false, activeOwnerId: "u1" }) }));
vi.mock("react-markdown", () => ({ default: ({ children }) => children }));

const { ActionCard, podeExecutar, ACOES_SOBRE_REGISTRO } = await import("./AIInsights.jsx");

const ID = "8f14e45f-ceea-467a-9575-1b1c1c1c1c1c";
const OUTRO_ID = "11111111-2222-3333-4444-555555555555";

const acaoExcluir = { _type: "delete_tx", id: ID };
const registroReal = {
  status: "ok",
  paraId: ID,
  dados: {
    id: ID,
    description: "Teste de exclusão Finn",
    amount: 347.89,
    date: "2026-08-27",
    category: "alimentação",
    is_realized: true,
    accounts: { name: "Nubank" },
  },
};

function montar(action, registro) {
  render(
    <ActionCard
      action={action}
      registro={registro}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
      confirmLoading={false}
      onSetAutoRealize={vi.fn()}
    />
  );
}

const botaoConfirmar = () =>
  screen.getAllByRole("button").find((b) => /confirmar|excluir|realizar/i.test(b.textContent));

afterEach(() => cleanup());

describe("card de exclusão — vem do registro real", () => {
  it("mostra descrição, valor, data e conta reais", () => {
    montar(acaoExcluir, registroReal);
    expect(screen.getByText("Teste de exclusão Finn")).toBeTruthy();
    expect(screen.getByText("R$ 347,89")).toBeTruthy();
    expect(screen.getByText("27/08/2026")).toBeTruthy();
    expect(screen.getByText("Nubank")).toBeTruthy();
  });

  it("nunca exibe R$ 0,00 quando o registro tem valor", () => {
    montar(acaoExcluir, registroReal);
    expect(screen.queryByText("R$ 0,00")).toBeNull();
  });

  it("não inventa dados quando a ação traz só o id", () => {
    // exatamente o payload que a IA devolve
    montar({ _type: "delete_tx", id: ID }, { status: "carregando", paraId: ID });
    expect(screen.queryByText("R$ 0,00")).toBeNull();
    expect(screen.getByText(/Carregando lançamento/i)).toBeTruthy();
  });

  it("bloqueia o confirmar enquanto o registro não chegou", () => {
    montar(acaoExcluir, { status: "carregando", paraId: ID });
    expect(botaoConfirmar().disabled).toBe(true);
  });

  it("avisa e bloqueia quando o registro não existe", () => {
    montar(acaoExcluir, { status: "ausente", paraId: ID });
    expect(screen.getByText(/Não foi possível localizar/i)).toBeTruthy();
    expect(botaoConfirmar().disabled).toBe(true);
  });

  it("libera o confirmar só com o registro carregado", () => {
    montar(acaoExcluir, registroReal);
    expect(botaoConfirmar().disabled).toBe(false);
  });
});

describe("valores exibidos batem com o registro", () => {
  const casos = [
    [0.01, "R$ 0,01"],
    [1, "R$ 1,00"],
    [99.99, "R$ 99,99"],
    [100, "R$ 100,00"],
    [347.89, "R$ 347,89"],
    [1000, "R$ 1.000,00"],
    [10000.5, "R$ 10.000,50"],
  ];
  for (const [valor, esperado] of casos) {
    it(`${valor} aparece como ${esperado}`, () => {
      montar(acaoExcluir, { ...registroReal, dados: { ...registroReal.dados, amount: valor } });
      // o espaço do pt-BR é o não separável (U+00A0)
      const achou = screen.getAllByText((_, el) =>
        el?.textContent?.replace(/ /g, " ") === esperado);
      expect(achou.length).toBeGreaterThan(0);
    });
  }
});

describe("garantia: o card confirmado é o registro executado", () => {
  it("libera quando os ids batem", () => {
    expect(podeExecutar(acaoExcluir, registroReal).ok).toBe(true);
  });

  it("bloqueia quando o registro é de outra linha", () => {
    const outro = { ...registroReal, dados: { ...registroReal.dados, id: OUTRO_ID } };
    const v = podeExecutar(acaoExcluir, outro);
    expect(v.ok).toBe(false);
    expect(v.motivo).toBe("id_divergente");
  });

  it("bloqueia sem registro carregado", () => {
    expect(podeExecutar(acaoExcluir, { status: "carregando" }).motivo).toBe("registro_ausente");
  });

  it("bloqueia quando o registro sumiu antes do clique", () => {
    expect(podeExecutar(acaoExcluir, { status: "ausente" }).motivo).toBe("registro_ausente");
  });

  it("bloqueia id que não é UUID", () => {
    expect(podeExecutar({ _type: "delete_tx", id: "8f14e45f" }, registroReal).motivo).toBe("id_invalido");
  });

  it("ações que não agem sobre registro seguem liberadas", () => {
    expect(podeExecutar({ _type: "tx", amount: 10 }, null).ok).toBe(true);
    expect(podeExecutar({ _type: "create_goal", name: "x" }, null).ok).toBe(true);
  });

  it("cobre as cinco ações que dependem de registro", () => {
    expect(Object.keys(ACOES_SOBRE_REGISTRO).sort()).toEqual(
      ["delete_account", "delete_goal", "delete_tx", "partial_realize", "realize"]
    );
  });
});

describe("meta e conta também vêm do registro real", () => {
  it("meta mostra nome e valor reais", () => {
    montar(
      { _type: "delete_goal", id: ID },
      { status: "ok", paraId: ID, dados: { id: ID, name: "Economizar férias", target_amount: 2500, category: "lazer" } }
    );
    expect(screen.getByText("Economizar férias")).toBeTruthy();
    expect(screen.queryByText("R$ 0,00")).toBeNull();
  });

  it("conta mostra nome e saldo reais", () => {
    montar(
      { _type: "delete_account", id: ID },
      { status: "ok", paraId: ID, dados: { id: ID, name: "Carteira", type: "wallet", initial_balance: 150.75 } }
    );
    expect(screen.getByText("Carteira")).toBeTruthy();
    expect(screen.queryByText("R$ 0,00")).toBeNull();
  });
});
