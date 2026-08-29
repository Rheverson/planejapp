import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { useFecharModal } from "./useFecharModal.js";

// ============================================================
// A trava de rolagem não pode sobrar depois que o modal fecha.
//
// `useFecharModal` congela o fundo com `document.body.style.position =
// "fixed"` e desfaz na limpeza, restaurando o que encontrou ao montar.
// Isso funciona com UM modal. Com dois ao mesmo tempo, não:
//
//   modal A monta  → guarda {position:""}      → trava
//   modal B monta  → guarda {position:"fixed"} → trava de novo
//   modal A fecha  → restaura ""               → destrava (cedo demais)
//   modal B fecha  → restaura "fixed"          → TRAVA PARA SEMPRE
//
// E a Home empilha dois de propósito: o convite "Indique e ganhe" abre
// sozinho 3s depois de montar e pode cair por cima do formulário de
// transação. Depois disso o `body` fica `position: fixed` e a página
// não rola mais — nem na Home, nem em Transações — até recarregar.
//
// O `body` é estado global; um gancho que o salva e restaura por
// instância precisa contar quantos estão de pé.
// ============================================================

vi.mock("@capacitor/app", () => ({ App: { addListener: () => ({ remove: () => {} }) } }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));

function Modal({ aoFechar = () => {} }) {
  useFecharModal(true, aoFechar);
  return <div>modal</div>;
}

const estadoDoBody = () => ({
  position: document.body.style.position,
  overflow: document.body.style.overflow,
  top: document.body.style.top,
  width: document.body.style.width,
});

const LIMPO = { position: "", overflow: "", top: "", width: "" };

beforeEach(() => {
  document.body.style.position = "";
  document.body.style.overflow = "";
  document.body.style.top = "";
  document.body.style.width = "";
});
afterEach(cleanup);

describe("um modal só", () => {
  it("trava ao abrir e destrava ao fechar", () => {
    const tela = render(<Modal />);
    expect(estadoDoBody().position).toBe("fixed");
    expect(estadoDoBody().overflow).toBe("hidden");
    tela.unmount();
    expect(estadoDoBody()).toEqual(LIMPO);
  });
});

describe("dois modais empilhados", () => {
  it("fechando na ordem inversa (B depois A), o fundo destrava", () => {
    const a = render(<Modal />);
    const b = render(<Modal />);
    expect(estadoDoBody().position).toBe("fixed");
    b.unmount();
    a.unmount();
    expect(estadoDoBody()).toEqual(LIMPO);
  });

  it("fechando na mesma ordem em que abriram (A depois B), o fundo TAMBÉM destrava", () => {
    // É este que quebrava: o B tinha guardado o estado já travado e o
    // devolvia ao fechar, deixando o body fixo para sempre.
    const a = render(<Modal />);
    const b = render(<Modal />);
    a.unmount();
    b.unmount();
    expect(estadoDoBody()).toEqual(LIMPO);
  });

  it("com o primeiro ainda aberto, o fundo continua travado", () => {
    const a = render(<Modal />);
    const b = render(<Modal />);
    b.unmount();
    expect(estadoDoBody().position).toBe("fixed");
    a.unmount();
    expect(estadoDoBody()).toEqual(LIMPO);
  });
});

describe("re-render não vaza", () => {
  it("trocar a função aoFechar não perde a posição de rolagem", () => {
    // Os chamadores passam `onClose` como arrow inline: identidade nova
    // a cada render do pai, então o efeito remonta. Se cada remonte
    // capturasse o estado já travado, o vazamento aconteceria sozinho.
    const tela = render(<Modal aoFechar={() => {}} />);
    tela.rerender(<Modal aoFechar={() => {}} />);
    tela.rerender(<Modal aoFechar={() => {}} />);
    expect(estadoDoBody().position).toBe("fixed");
    tela.unmount();
    expect(estadoDoBody()).toEqual(LIMPO);
  });
});
