import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// O framer-motion entra com `opacity: 0`, e as queries por ROLE do
// Testing Library nao alcancam o no nesse estado. O elemento esta no
// DOM — e o que interessa provar — entao a busca e pelo seletor.
const dialogo = (c) => c.querySelector('[role="dialog"]');
import { usePaywall, AvisoDeLimite } from "./usePaywall";

// ============================================================
// O caminho de quem contorna a interface.
//
// A trava de verdade está no banco, de propósito — as tabelas aceitam
// escrita do dono, então validar só no React não vale nada. A
// consequência disso é que a mensagem `LIMITE_PLANO:contas:2/2` VAI
// chegar ao frontend sempre que a tela e o banco discordarem: DevTools,
// Postman, uma aba antiga com contagem velha, duas abas criando ao
// mesmo tempo.
//
// Sem interceptar, o usuário veria a mensagem crua do Postgres num
// toast. Estes testes garantem que ela vira convite.
// ============================================================

vi.mock("@capacitor/app", () => ({ App: { addListener: () => ({ remove: () => {} }) } }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/design/useTheme", () => ({ useIsDark: () => false }));

afterEach(cleanup);

/** Um componente que simula a tela chamando uma mutation que falhou. */
function TelaFalsa({ erro, aoTratar }) {
  const paywall = usePaywall();
  return (
    <div>
      {/* Cuidado: `aoTratar?.(paywall.tratarErro(erro))` NAO funcionaria.
          A chamada opcional curto-circuita e nem avalia os argumentos
          quando `aoTratar` e indefinido — `tratarErro` nunca rodaria. */}
      <button onClick={() => {
        const tratou = paywall.tratarErro(erro);
        if (aoTratar) aoTratar(tratou);
      }}>disparar</button>
      {paywall.paywall}
    </div>
  );
}

describe("o erro do banco vira convite", () => {
  it("reconhece o limite e abre o paywall", () => {
    const { container } = render(<TelaFalsa erro={{ message: "LIMITE_PLANO:contas:2/2" }} />);
    expect(dialogo(container)).toBeNull();

    fireEvent.click(screen.getByText("disparar"));

    const modal = dialogo(container);
    expect(modal).toBeTruthy();
    // A frase fala do que a pessoa tentou fazer, não de "upgrade".
    expect(modal.textContent).toContain("contas do plano gratuito");
    expect(modal.textContent).toContain("2 de 2");
  });

  it("devolve true, para a tela não mostrar o toast por cima", () => {
    const aoTratar = vi.fn();
    render(<TelaFalsa erro={{ message: "LIMITE_PLANO:metas:1/1" }} aoTratar={aoTratar} />);
    fireEvent.click(screen.getByText("disparar"));
    expect(aoTratar).toHaveBeenCalledWith(true);
  });

  it("erro comum não abre paywall e devolve false", () => {
    const aoTratar = vi.fn();
    const { container } = render(<TelaFalsa erro={{ message: "network error" }} aoTratar={aoTratar} />);
    fireEvent.click(screen.getByText("disparar"));
    expect(aoTratar).toHaveBeenCalledWith(false);
    expect(dialogo(container)).toBeNull();
  });

  it("o limite mensal de lançamentos tem texto próprio", () => {
    const { container } = render(<TelaFalsa erro={{ message: "LIMITE_PLANO:transacoes_mes:100/100" }} />);
    fireEvent.click(screen.getByText("disparar"));
    const modal = dialogo(container);
    expect(modal.textContent).toContain("100 lançamentos por mês");
    // Precisa dizer que a cota volta — senão parece punição permanente.
    expect(modal.textContent).toContain("No mês que vem sua cota volta ao normal.");
  });

  it("recurso desconhecido não quebra a tela", () => {
    const { container } = render(<TelaFalsa erro={{ message: "LIMITE_PLANO:coisa_nova:3/3" }} />);
    fireEvent.click(screen.getByText("disparar"));
    expect(dialogo(container).textContent).toContain("plano Pro");
  });
});

describe("o paywall sempre tem saída", () => {
  // O plano gratuito precisa dar conta de entender o que entra, o que
  // sai e quanto sobra. Um paywall sem saída quebraria isso.
  it("fecha pelo 'Agora não'", () => {
    const { container } = render(<TelaFalsa erro={{ message: "LIMITE_PLANO:contas:2/2" }} />);
    fireEvent.click(screen.getByText("disparar"));
    expect(dialogo(container)).toBeTruthy();
    fireEvent.click(screen.getByText("Agora não"));
    expect(dialogo(container)).toBeNull();
  });

  it("fecha pelo X", () => {
    const { container } = render(<TelaFalsa erro={{ message: "LIMITE_PLANO:cartoes:1/1" }} />);
    fireEvent.click(screen.getByText("disparar"));
    fireEvent.click(screen.getByLabelText("Fechar"));
    expect(dialogo(container)).toBeNull();
  });

  it("oferece o caminho do Pro", () => {
    render(<TelaFalsa erro={{ message: "LIMITE_PLANO:contas:2/2" }} />);
    fireEvent.click(screen.getByText("disparar"));
    expect(screen.getByText("Ver o plano Pro")).toBeTruthy();
  });
});

describe("o aviso discreto", () => {
  it("aparece só no último antes do teto", () => {
    const { container } = render(
      <AvisoDeLimite situacao={{ ultimo: true, atual: 1, limite: 2 }} />,
    );
    expect(container.textContent).toContain("Último do plano gratuito");
  });

  it("não aparece quando ainda há folga", () => {
    const { container } = render(
      <AvisoDeLimite situacao={{ ultimo: false, atual: 0, limite: 2 }} />,
    );
    expect(container.textContent).toBe("");
  });

  it("não aparece para quem é Pro", () => {
    const { container } = render(
      <AvisoDeLimite situacao={{ ultimo: false, ilimitado: true }} />,
    );
    expect(container.textContent).toBe("");
  });
});
