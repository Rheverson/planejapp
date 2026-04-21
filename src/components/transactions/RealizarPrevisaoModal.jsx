import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X, CheckCircle2, SplitSquareHorizontal, Calendar } from "lucide-react";

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function useIsDark() {
  const [dark, setDark] = useState(() =>
    localStorage.getItem("darkMode") === "true" ||
    document.documentElement.classList.contains("dark")
  );
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains("dark"))
    );
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    const h = (e) => setDark(e.detail);
    window.addEventListener("darkModeChange", h);
    return () => { obs.disconnect(); window.removeEventListener("darkModeChange", h); };
  }, []);
  return dark;
}

export default function RealizarPrevisaoModal({ transaction, onConfirm, onClose }) {
  const dark = useIsDark();
  const [modo, setModo]                     = useState(null);
  const [valorParcial, setValorParcial]     = useState("");
  const [dataRealizacao, setDataRealizacao] = useState(todayStr());

  const valorFinal = modo === "total" ? Number(transaction.amount) : parseFloat(valorParcial) || 0;
  const restante   = Number(transaction.amount) - valorFinal;

  const podeConfirmar = modo && valorFinal > 0 && valorFinal <= Number(transaction.amount) && dataRealizacao;

  const handleConfirmar = () => {
    if (!podeConfirmar) return;
    onConfirm({ transaction, valorRealizado: valorFinal, dataRealizacao });
  };

  // Tokens de cor por tema
  const modalBg   = dark ? "#0c0e13"                    : "#ffffff";
  const modalBrd  = dark ? "rgba(255,255,255,0.08)"     : "rgba(17,24,39,0.08)";
  const sepColor  = dark ? "rgba(255,255,255,0.06)"     : "rgba(17,24,39,0.06)";
  const text      = dark ? "#e8edf5"                    : "#0f172a";
  const muted     = dark ? "#6b7a96"                    : "#64748b";
  const inputBg   = dark ? "#12151c"                    : "#f8fafc";
  const inputBrd  = dark ? "rgba(255,255,255,0.1)"      : "rgba(17,24,39,0.1)";
  const inputText = dark ? "#e8edf5"                    : "#0f172a";
  const cardHover = dark ? "rgba(255,255,255,0.03)"     : "#fafafa";

  const btnConfirmBg = podeConfirmar
    ? `linear-gradient(135deg, ${modo === "parcial" ? "#2563eb, #3730a3" : "#10b981, #059669"})`
    : (dark ? "rgba(255,255,255,0.06)" : "#f1f5f9");
  const btnConfirmColor = podeConfirmar ? "#fff" : muted;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 64 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        style={{ background: modalBg, border: `0.5px solid ${modalBrd}`, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, boxShadow: "0 -8px 40px rgba(0,0,0,0.15)" }}
      >
        {/* Header */}
        <div style={{ padding: "18px 20px 14px", borderBottom: `0.5px solid ${sepColor}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontWeight: 800, fontSize: "1rem", color: text, letterSpacing: "-0.02em", margin: 0, marginBottom: 3 }}>
              Registrar realização
            </h2>
            <p style={{ fontSize: "0.75rem", color: muted, margin: 0 }}>
              {transaction.description} · previsto {fmt(Number(transaction.amount))}
            </p>
          </div>
          <button onClick={onClose} style={{ background: dark ? "rgba(255,255,255,0.06)" : "#f1f5f9", border: "none", borderRadius: 8, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            <X size={15} color={muted} />
          </button>
        </div>

        <div style={{ padding: "16px 20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Modo Total / Parcial */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { key: "total",   Icon: CheckCircle2,          label: "Total",   sub: fmt(Number(transaction.amount)), color: "#10b981" },
              { key: "parcial", Icon: SplitSquareHorizontal, label: "Parcial", sub: "Digitar valor",                  color: "#3b82f6" },
            ].map(({ key, Icon, label, sub, color }) => {
              const active = modo === key;
              return (
                <button key={key} onClick={() => setModo(key)} style={{
                  padding: "14px 10px", borderRadius: 14,
                  border: `1.5px solid ${active ? color : (dark ? "rgba(255,255,255,0.08)" : "#e2e8f0")}`,
                  background: active ? `${color}18` : cardHover,
                  cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                  transition: "all .2s",
                }}>
                  <Icon size={22} color={active ? color : muted} />
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontWeight: 700, fontSize: "0.85rem", color: active ? text : muted, margin: 0, marginBottom: 2 }}>{label}</p>
                    <p style={{ fontSize: "0.7rem", color: active ? color : muted, margin: 0, fontWeight: 600 }}>{sub}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Valor parcial */}
          {modo === "parcial" && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} style={{ overflow: "hidden" }}>
              <label style={{ fontSize: "0.65rem", fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>
                Valor pago (máx. {fmt(Number(transaction.amount))})
              </label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: "0.85rem", color: muted, fontWeight: 600 }}>R$</span>
                <input
                  type="number" step="0.01" placeholder="0,00"
                  value={valorParcial}
                  onChange={(e) => setValorParcial(e.target.value)}
                  max={transaction.amount}
                  autoFocus
                  style={{
                    width: "100%", paddingLeft: 40, paddingRight: 14, height: 48,
                    background: inputBg, border: `1px solid ${inputBrd}`,
                    borderRadius: 12, color: inputText, fontSize: "1.3rem", fontWeight: 800,
                    fontFamily: "'Cabinet Grotesk', sans-serif", letterSpacing: "-0.02em",
                    outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>
              {valorFinal > 0 && valorFinal <= Number(transaction.amount) && (
                <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 10 }}>
                  <p style={{ fontSize: "0.72rem", color: "#f59e0b", margin: 0 }}>
                    Restante na previsão: <strong>{fmt(restante)}</strong>
                    {restante > 0 && <span style={{ color: muted }}> — será mantido como previsto</span>}
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {/* Data da realização */}
          {modo && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} style={{ overflow: "hidden" }}>
              <label style={{ fontSize: "0.65rem", fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: "0.1em", display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
                <Calendar size={11} /> Data da realização
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="date"
                  value={dataRealizacao}
                  onChange={(e) => setDataRealizacao(e.target.value)}
                  max={todayStr()}
                  style={{
                    width: "100%", height: 42, padding: "0 80px 0 14px",
                    background: inputBg, border: `1px solid ${inputBrd}`,
                    borderRadius: 12, color: inputText, fontSize: "0.9rem",
                    fontFamily: "'Outfit', sans-serif", outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                  {dataRealizacao === todayStr()
                    ? <span style={{ fontSize: "0.62rem", color: "#10b981", fontWeight: 700, background: "rgba(16,185,129,0.1)", padding: "2px 7px", borderRadius: 6 }}>Hoje</span>
                    : <span style={{ fontSize: "0.62rem", color: "#f59e0b", fontWeight: 700, background: "rgba(245,158,11,0.1)", padding: "2px 7px", borderRadius: 6 }}>Editado</span>
                  }
                </div>
              </div>
            </motion.div>
          )}

          {/* Botão confirmar */}
          <button
            onClick={handleConfirmar}
            disabled={!podeConfirmar}
            style={{
              width: "100%", height: 48, borderRadius: 14, border: "none",
              background: btnConfirmBg,
              color: btnConfirmColor,
              fontFamily: "'Cabinet Grotesk', sans-serif",
              fontWeight: 800, fontSize: "0.95rem", letterSpacing: "-0.01em",
              cursor: podeConfirmar ? "pointer" : "not-allowed",
              boxShadow: podeConfirmar
                ? (modo === "parcial" ? "0 0 20px rgba(37,99,235,0.3)" : "0 0 20px rgba(16,185,129,0.3)")
                : "none",
              transition: "all .2s",
            }}
          >
            {!modo
              ? "Selecione o modo acima"
              : modo === "total"
                ? `✓ Confirmar — ${fmt(Number(transaction.amount))}`
                : valorFinal > 0
                  ? `✓ Confirmar — ${fmt(valorFinal)} pago`
                  : "Digite o valor pago"
            }
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}