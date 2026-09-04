import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// ============================================================
// A telemetria do paywall, no único lugar onde ela existe.
//
// Os treze pontos que abrem paywall no app passam por este hook, então
// é aqui que o funil é medido — e é aqui que ele pode ser medido
// ERRADO. Dois erros custam caro e nenhum dos dois dá erro na tela:
//
//   contar demais  -> re-render vira "encontro com o limite" e o topo
//                     do funil incha, derrubando toda taxa de conversão
//                     contra um denominador inventado;
//   contar de menos-> o gatilho que mais vende parece não vender.
//
// E um terceiro, pior: a telemetria derrubar a tela. Medir não pode
// custar a experiência de quem está usando o app.
// ============================================================

const rpc = vi.fn(() => Promise.resolve({ data: null, error: null }));

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: (...a) => rpc(...a) } }));
vi.mock("@capacitor/app", () => ({ App: { addListener: () => ({ remove: () => {} }) } }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/design/useTheme", () => ({ useIsDark: () => false }));

import { usePaywall } from "./usePaywall";

const dialogo = (c) => c.querySelector('[role="dialog"]');
const chamadas = () => rpc.mock.calls.filter(([nome]) => nome === "registrar_paywall_visto");
const recursos = () => chamadas().map(([, args]) => args.p_recurso);

beforeEach(() => rpc.mockClear());
afterEach(cleanup);

function Tela({ erro, recurso = "contas" }) {
  const paywall = usePaywall();
  return (
    <div>
      <button onClick={() => paywall.abrir(recurso, 2, 2)}>abrir</button>
      <button onClick={() => paywall.tratarErro(erro)}>errar</button>
      <span data-testid="render">{Math.random()}</span>
      {paywall.paywall}
    </div>
  );
}

describe("o evento é registrado quando o paywall abre de verdade", () => {
  it("abrir pela tela registra o recurso", () => {
    render(<Tela />);
    fireEvent.click(screen.getByText("abrir"));
    expect(recursos()).toEqual(["contas"]);
  });

  it("o erro do trigger também registra, com o recurso que o banco disse", () => {
    // Este é o caminho de quem contornou a interface. Continua sendo um
    // encontro com o limite e precisa aparecer no funil.
    render(<Tela erro={{ message: "LIMITE_PLANO:transacoes_mes:100/100" }} />);
    fireEvent.click(screen.getByText("errar"));
    expect(recursos()).toEqual(["transacoes_mes"]);
  });

  it("erro comum não registra nada", () => {
    render(<Tela erro={{ message: "network error" }} />);
    fireEvent.click(screen.getByText("errar"));
    expect(chamadas()).toHaveLength(0);
  });
});

describe("não conta duas vezes o mesmo encontro", () => {
  it("re-render não gera evento", () => {
    const { rerender } = render(<Tela />);
    fireEvent.click(screen.getByText("abrir"));
    expect(chamadas()).toHaveLength(1);

    rerender(<Tela />);
    rerender(<Tela />);
    rerender(<Tela />);
    expect(chamadas()).toHaveLength(1);
  });

  it("cinco toques no mesmo botão contam um", () => {
    render(<Tela />);
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByText("abrir"));
    expect(chamadas()).toHaveLength(1);
  });

  it("a mutation errando de novo com o modal aberto conta um", () => {
    render(<Tela erro={{ message: "LIMITE_PLANO:metas:1/1" }} />);
    fireEvent.click(screen.getByText("errar"));
    fireEvent.click(screen.getByText("errar"));
    expect(chamadas()).toHaveLength(1);
  });

  it("fechar e esbarrar de novo é encontro novo", () => {
    // A janela de 5 minutos da RPC decide se isso vira linha no banco.
    // O hook não pode decidir por ela: encontro em outra hora é outro
    // encontro, e quem sabe disso é o banco, que enxerga o tempo.
    const { container } = render(<Tela />);
    fireEvent.click(screen.getByText("abrir"));
    fireEvent.click(screen.getByText("Agora não"));
    expect(dialogo(container)).toBeNull();

    fireEvent.click(screen.getByText("abrir"));
    expect(chamadas()).toHaveLength(2);
  });

  it("recurso diferente é evento diferente", () => {
    const { rerender } = render(<Tela recurso="contas" />);
    fireEvent.click(screen.getByText("abrir"));
    rerender(<Tela recurso="cartoes" />);
    fireEvent.click(screen.getByText("abrir"));
    expect(recursos()).toEqual(["contas", "cartoes"]);
  });
});

describe("medir nunca derruba a tela", () => {
  it("RPC que rejeita não quebra o paywall", async () => {
    rpc.mockImplementationOnce(() => Promise.reject(new Error("sem rede")));
    const { container } = render(<Tela />);
    fireEvent.click(screen.getByText("abrir"));
    // O convite abriu do mesmo jeito.
    expect(dialogo(container)).toBeTruthy();
    await Promise.resolve();
  });

  it("RPC que devolve erro não quebra o paywall", () => {
    rpc.mockImplementationOnce(() => Promise.resolve({ error: { message: "negado" } }));
    const { container } = render(<Tela />);
    fireEvent.click(screen.getByText("abrir"));
    expect(dialogo(container)).toBeTruthy();
  });

  it("o paywall abre ANTES de a chamada terminar", () => {
    // Nunca `await` na frente do usuário: a rede pode demorar e o
    // convite tem de aparecer no mesmo quadro.
    let resolver;
    rpc.mockImplementationOnce(() => new Promise((r) => { resolver = r; }));
    const { container } = render(<Tela />);
    fireEvent.click(screen.getByText("abrir"));
    expect(dialogo(container)).toBeTruthy();
    resolver?.({ error: null });
  });
});

describe("o que NÃO é evento", () => {
  it("montar a tela sem esbarrar em nada não registra", () => {
    render(<Tela />);
    expect(chamadas()).toHaveLength(0);
  });
});
