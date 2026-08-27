import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import TransactionForm from "./TransactionForm.jsx";

// ============================================================
// O modal de transação precisa ser fechável. Sempre.
//
// Ele ficou intocável no celular: o convite de indicação abria sozinho
// por cima (z-index 999 contra 50) e engolia o toque no X e no botão de
// salvar. A correção mexeu em três coisas — camada de empilhamento,
// guarda do convite e saídas de teclado/voltar — e nenhuma delas pode
// regredir sem alguém perceber.
//
// Estes testes cobrem o que o navegador não conseguiu verificar: com o
// painel oculto o requestAnimationFrame fica congelado, o framer-motion
// não roda a animação de saída e o nó nunca sai do DOM.
// ============================================================

// O app roda dentro do Capacitor no APK; no teste ele não existe.
vi.mock("@capacitor/app", () => ({
  App: { addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })) },
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" },
}));

// O formulário busca categorias e cartões; aqui isso não importa.
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [] }),
}));
vi.mock("@/lib/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));
vi.mock("./useCategorySuggestion", () => ({
  useCategorySuggestion: () => ({ suggestion: null, confidence: 0, confirmCategory: vi.fn() }),
}));
vi.mock("./CategorySuggestion", () => ({ default: () => null }));

const CONTAS = [{ id: "cc", name: "Conta", type: "bank" }];

function montar(props = {}) {
  const aoFechar = vi.fn();
  const aoEnviar = vi.fn();
  render(
    <TransactionForm accounts={CONTAS} onClose={aoFechar} onSubmit={aoEnviar} {...props} />
  );
  return { aoFechar, aoEnviar };
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); });

describe("modal de transação — saídas", () => {
  it("o X chama onClose", () => {
    const { aoFechar } = montar();
    // o único botão do cabeçalho que não tem texto é o X
    const botoes = screen.getAllByRole("button");
    const x = botoes.find((b) => b.textContent.trim() === "" && b.type === "button");
    expect(x).toBeTruthy();
    fireEvent.click(x);
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it("a tecla Esc chama onClose", () => {
    const { aoFechar } = montar();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it("outra tecla não fecha", () => {
    const { aoFechar } = montar();
    fireEvent.keyDown(window, { key: "a" });
    expect(aoFechar).not.toHaveBeenCalled();
  });

  it("o modal fica acima da navegação inferior e do convite de indicação", () => {
    montar();
    const zIndices = [...document.querySelectorAll("*")]
      .map((el) => getComputedStyle(el))
      .filter((s) => s.position === "fixed")
      .map((s) => Number(s.zIndex))
      .filter(Number.isFinite);

    // a navegação do Layout está em 50; o convite de indicação em 999
    expect(Math.max(...zIndices)).toBeGreaterThan(999);
  });

  it("trava a rolagem do fundo enquanto está aberto e devolve ao fechar", () => {
    const { unmount } = render(
      <TransactionForm accounts={CONTAS} onClose={vi.fn()} onSubmit={vi.fn()} />
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});

describe("modal de transação — valor", () => {
  it("não envia com valor zero e mostra o aviso", () => {
    const { aoEnviar } = montar();
    const valor = document.querySelector('input[type="number"]');
    fireEvent.change(valor, { target: { value: "0" } });
    fireEvent.submit(document.querySelector("form"));
    expect(aoEnviar).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/maior que zero/i);
  });

  it("o campo de valor tem mínimo de um centavo", () => {
    montar();
    expect(document.querySelector('input[type="number"]').getAttribute("min")).toBe("0.01");
  });
});
