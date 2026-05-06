import React from "react";
import { motion } from "framer-motion";
import { X, Edit2, ArrowRight, List } from "lucide-react";

function useIsDark() {
  const [dark, setDark] = React.useState(() =>
    localStorage.getItem("darkMode") === "true" ||
    document.documentElement.classList.contains("dark")
  );
  React.useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    const h = (e) => setDark(e.detail);
    window.addEventListener("darkModeChange", h);
    return () => { obs.disconnect(); window.removeEventListener("darkModeChange", h); };
  }, []);
  return dark;
}

export default function RecurringEditModal({ mode = "edit", onSelect, onClose }) {
  const dark = useIsDark();

  const bg    = dark ? "#0c0e13" : "#ffffff";
  const sep   = dark ? "rgba(255,255,255,0.06)" : "rgba(17,24,39,0.06)";
  const text  = dark ? "#e8edf5" : "#0f172a";
  const muted = dark ? "#6b7a96" : "#64748b";
  const hover = dark ? "rgba(255,255,255,0.04)" : "#f8fafc";
  const brd   = dark ? "rgba(255,255,255,0.07)" : "rgba(17,24,39,0.06)";

  const isDelete = mode === "delete";

  const options = [
    {
      key: "only",
      icon: Edit2,
      label: "Apenas este",
      desc: "Altera somente esta ocorrência",
      color: "#3b82f6",
    },
    {
      key: "future",
      icon: ArrowRight,
      label: "Este e os seguintes",
      desc: "Altera esta e todas as ocorrências futuras",
      color: "#f59e0b",
    },
    {
      key: "all",
      icon: List,
      label: "Todos",
      desc: "Altera todas as ocorrências da série",
      color: isDelete ? "#ef4444" : "#8b5cf6",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        onClick={e => e.stopPropagation()}
        style={{ background: bg, border: `0.5px solid ${sep}`, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, boxShadow: "0 -8px 40px rgba(0,0,0,0.2)", overflow: "hidden" }}
      >
        {/* Header */}
        <div style={{ padding: "16px 20px 12px", borderBottom: `0.5px solid ${sep}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontWeight: 800, fontSize: "0.95rem", color: text, margin: 0, marginBottom: 2 }}>
              {isDelete ? "Excluir transação recorrente" : "Editar transação recorrente"}
            </h2>
            <p style={{ fontSize: "0.7rem", color: muted, margin: 0 }}>
              Selecione quais ocorrências serão afetadas
            </p>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: dark ? "rgba(255,255,255,0.06)" : "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={15} color={muted} />
          </button>
        </div>

        {/* Opções */}
        <div style={{ padding: "8px 0 12px" }}>
          {options.map(({ key, icon: Icon, label, desc, color }) => (
            <button key={key} onClick={() => onSelect(key)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 14,
                padding: "13px 20px", background: "transparent", border: "none", cursor: "pointer",
                textAlign: "left", transition: "background .15s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = hover}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <div style={{ width: 36, height: 36, borderRadius: 10, background: color + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon size={17} color={color} />
              </div>
              <div>
                <p style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontWeight: 700, fontSize: "0.88rem", color: text, margin: 0, marginBottom: 2 }}>{label}</p>
                <p style={{ fontSize: "0.7rem", color: muted, margin: 0 }}>{desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Cancelar */}
        <div style={{ padding: "0 20px 28px" }}>
          <button onClick={onClose} style={{ width: "100%", height: 42, borderRadius: 12, border: `1px solid ${brd}`, background: "transparent", color: muted, fontFamily: "'Cabinet Grotesk', sans-serif", fontWeight: 700, fontSize: "0.88rem", cursor: "pointer" }}>
            Cancelar
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}