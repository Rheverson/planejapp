import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Edit2, ArrowRight, List, AlertTriangle, ChevronLeft } from "lucide-react";

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

const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

export default function RecurringEditModal({ mode = "edit", transaction, transactions = [], onSelect, onClose }) {
  const dark = useIsDark();
  const [selectedScope, setSelectedScope] = useState(null); // scope aguardando confirmação
  
  const bg    = dark ? "#0c0e13" : "#ffffff";
  const sep   = dark ? "rgba(255,255,255,0.06)" : "rgba(17,24,39,0.06)";
  const text  = dark ? "#e8edf5" : "#0f172a";
  const muted = dark ? "#6b7a96" : "#64748b";
  const hover = dark ? "rgba(255,255,255,0.04)" : "#f8fafc";
  const brd   = dark ? "rgba(255,255,255,0.07)" : "rgba(17,24,39,0.06)";
  const isDelete = mode === "delete";

  // Calcula lançamentos realizados no passado que serão afetados
  const getRealizedCount = (scope) => {
    if (!transaction?.recurring_group_id || !transactions?.length) return 0;
    const today = new Date().toISOString().split("T")[0];
    return transactions.filter(t => {
      if (t.recurring_group_id !== transaction.recurring_group_id) return false;
      if (t.is_realized !== true) return false;
      if (t.date > today) return false;
      if (scope === "future") return t.date >= transaction.date;
      if (scope === "all") return true;
      return false;
    }).length;
  };

  const handleScopeClick = (scope) => {
    const count = getRealizedCount(scope);
    if (count > 0) {
      setSelectedScope({ key: scope, realizedCount: count });
    } else {
      onSelect(scope);
    }
  };

  const options = [
    { key: "only",   icon: Edit2,      label: "Apenas este",          desc: "Altera somente esta ocorrência",            color: "#3b82f6" },
    { key: "future", icon: ArrowRight, label: "Este e os seguintes",   desc: "Altera esta e todas as ocorrências futuras", color: "#f59e0b" },
    { key: "all",    icon: List,       label: "Todos",                 desc: "Altera todas as ocorrências da série",       color: isDelete ? "#ef4444" : "#8b5cf6" },
  ];

  // Tela de confirmação
  if (selectedScope) {
    const opt = options.find(o => o.key === selectedScope.key);
    const { realizedCount, key } = selectedScope;
    const isFuture = key === "future";
    
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
          <div style={{ padding: "16px 20px 12px", borderBottom: `0.5px solid ${sep}`, display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => setSelectedScope(null)} style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: dark ? "rgba(255,255,255,0.06)" : "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
              <ChevronLeft size={15} color={muted} />
            </button>
            <div>
              <h2 style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontWeight: 800, fontSize: "0.95rem", color: text, margin: 0, marginBottom: 2 }}>
                Confirmar alteração
              </h2>
              <p style={{ fontSize: "0.7rem", color: muted, margin: 0 }}>
                {opt?.label} — {isDelete ? "excluir" : "editar"}
              </p>
            </div>
          </div>

          {/* Aviso */}
          <div style={{ padding: "16px 20px" }}>
            <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 12, padding: "14px 16px", marginBottom: 16, display: "flex", gap: 12, alignItems: "flex-start" }}>
              <AlertTriangle size={20} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontWeight: 700, fontSize: "0.85rem", color: "#f59e0b", marginBottom: 4 }}>
                  Atenção!
                </p>
                <p style={{ fontSize: "0.78rem", color: dark ? "#e8edf5" : "#374151", lineHeight: 1.5 }}>
                  {realizedCount === 1
                    ? "1 lançamento já foi realizado (pago)"
                    : `${realizedCount} lançamentos já foram realizados (pagos)`
                  }
                  {isFuture ? " neste período" : " nesta série"} e também {isDelete ? "será excluído" : "será alterado"}.
                </p>
                <p style={{ fontSize: "0.72rem", color: muted, marginTop: 6, lineHeight: 1.4 }}>
                  {isDelete
                    ? "Isso pode afetar o saldo das contas já calculado."
                    : "Alterar lançamentos realizados pode afetar o histórico financeiro já contabilizado."}
                </p>
              </div>
            </div>

            <p style={{ fontSize: "0.82rem", color: text, fontWeight: 600, marginBottom: 4 }}>
              Tem certeza que deseja continuar?
            </p>
            <p style={{ fontSize: "0.72rem", color: muted, marginBottom: 16 }}>
              Esta ação não pode ser desfeita.
            </p>

            {/* Botões */}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setSelectedScope(null)}
                style={{ flex: 1, height: 44, borderRadius: 12, border: `1px solid ${brd}`, background: "transparent", color: muted, fontFamily: "'Cabinet Grotesk', sans-serif", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer" }}>
                Voltar
              </button>
              <button onClick={() => onSelect(key)}
                style={{
                  flex: 2, height: 44, borderRadius: 12, border: "none",
                  background: isDelete ? "linear-gradient(135deg,#dc2626,#b91c1c)" : "linear-gradient(135deg,#f59e0b,#d97706)",
                  color: "#fff", fontFamily: "'Cabinet Grotesk', sans-serif",
                  fontWeight: 800, fontSize: "0.88rem", cursor: "pointer",
                  boxShadow: isDelete ? "0 0 16px rgba(220,38,38,0.3)" : "0 0 16px rgba(245,158,11,0.3)",
                }}>
                {isDelete ? "Sim, excluir mesmo assim" : "Sim, alterar mesmo assim"}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  // Tela principal de seleção de escopo
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
          {options.map(({ key, icon: Icon, label, desc, color }) => {
            const count = getRealizedCount(key);
            return (
              <button key={key} onClick={() => handleScopeClick(key)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 14,
                  padding: "12px 20px", background: "transparent", border: "none", cursor: "pointer",
                  textAlign: "left", transition: "background .15s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = hover}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <div style={{ width: 36, height: 36, borderRadius: 10, background: color + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={17} color={color} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontWeight: 700, fontSize: "0.88rem", color: text, margin: 0, marginBottom: 2 }}>{label}</p>
                  <p style={{ fontSize: "0.7rem", color: muted, margin: 0 }}>{desc}</p>
                </div>
                {/* Badge de aviso se há realizados */}
                {count > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 999, padding: "3px 8px", flexShrink: 0 }}>
                    <AlertTriangle size={11} color="#f59e0b" />
                    <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "#f59e0b" }}>{count} pago{count > 1 ? "s" : ""}</span>
                  </div>
                )}
              </button>
            );
          })}
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