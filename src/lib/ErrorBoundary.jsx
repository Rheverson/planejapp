import React from "react";

/**
 * Sem isto, qualquer erro de render derrubava o app para uma tela em
 * branco — sem mensagem, sem caminho de volta.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { erro: null };
  }

  static getDerivedStateFromError(erro) {
    return { erro };
  }

  componentDidCatch(erro, info) {
    console.error("Erro de render:", erro, info?.componentStack);
  }

  render() {
    if (!this.state.erro) return this.props.children;

    const dark =
      typeof localStorage !== "undefined" && localStorage.getItem("darkMode") === "true";
    const bg = dark ? "#060709" : "#f7f8fa";
    const card = dark ? "#0c0e13" : "#ffffff";
    const texto = dark ? "#e8edf5" : "#0f172a";
    const muted = dark ? "#6b7a96" : "#64748b";
    const borda = dark ? "rgba(255,255,255,0.07)" : "rgba(17,24,39,0.06)";

    return (
      <div
        style={{
          minHeight: "100vh", background: bg, display: "flex",
          alignItems: "center", justifyContent: "center", padding: 20,
          fontFamily: "'Outfit', sans-serif",
        }}
      >
        <div
          style={{
            background: card, border: `1px solid ${borda}`, borderRadius: 16,
            padding: "28px 24px", maxWidth: 380, width: "100%", textAlign: "center",
          }}
        >
          <div style={{ fontSize: 34, marginBottom: 12 }} aria-hidden="true">🔌</div>
          <h1
            style={{
              fontFamily: "'Cabinet Grotesk', sans-serif", fontWeight: 800,
              fontSize: "1.15rem", color: texto, margin: "0 0 8px",
              letterSpacing: "-0.02em",
            }}
          >
            Essa tela travou
          </h1>
          <p style={{ fontSize: "0.85rem", color: muted, margin: "0 0 20px", lineHeight: 1.5 }}>
            Seus dados estão salvos. Recarregue para continuar de onde parou.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              width: "100%", height: 44, borderRadius: 12, border: "none",
              background: "linear-gradient(135deg,#1d4ed8,#3730a3)", color: "#fff",
              fontFamily: "'Cabinet Grotesk', sans-serif", fontWeight: 700,
              fontSize: "0.9rem", cursor: "pointer",
            }}
          >
            Recarregar
          </button>
          <button
            onClick={() => { window.location.href = "/"; }}
            style={{
              width: "100%", height: 40, marginTop: 8, borderRadius: 12,
              border: `1px solid ${borda}`, background: "transparent", color: muted,
              fontFamily: "'Outfit', sans-serif", fontWeight: 600,
              fontSize: "0.85rem", cursor: "pointer",
            }}
          >
            Voltar ao início
          </button>
        </div>
      </div>
    );
  }
}
