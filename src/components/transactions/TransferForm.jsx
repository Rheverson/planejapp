import { useIsDark } from "@/design/useTheme";
import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X, ArrowLeftRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const today = new Date().toISOString().split("T")[0];

export default function TransferForm({ accounts, onSubmit, onClose }) {
  const dark = useIsDark();

  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId,   setToAccountId]   = useState("");
  const [amount,        setAmount]         = useState("");
  const [date,          setDate]           = useState(today);
  const [description,   setDescription]   = useState("Transferência");

  // ── Tokens ────────────────────────────────────────────────
  const modalBg  = dark ? "#0c0e13" : "#ffffff";
  const headBrd  = dark ? "rgba(255,255,255,0.07)" : "rgba(17,24,39,0.06)";
  const text     = dark ? "#e8edf5" : "#0f172a";
  const muted    = dark ? "#6b7a96" : "#64748b";
  const inputBg  = dark ? "#12151c" : "#f8fafc";
  const inputBrd = dark ? "rgba(255,255,255,0.08)" : "rgba(17,24,39,0.1)";
  const rowBrd   = dark ? "rgba(255,255,255,0.06)" : "rgba(17,24,39,0.07)";

  const inputStyle = {
    width: "100%", height: 40, padding: "0 12px",
    background: inputBg, border: `1px solid ${inputBrd}`,
    borderRadius: 12, color: text, fontSize: "0.85rem",
    fontFamily: "'Outfit',sans-serif", outline: "none",
    transition: "border-color .2s", boxSizing: "border-box",
  };
  const labelStyle = {
    fontSize: "0.65rem", fontWeight: 600, color: muted,
    textTransform: "uppercase", letterSpacing: "0.08em",
    display: "block", marginBottom: 5,
  };
  const selectStyle = {
    height: 40, borderRadius: 12,
    background: inputBg, border: `1px solid ${inputBrd}`,
    fontSize: "0.82rem", color: text, fontFamily: "'Outfit',sans-serif",
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!fromAccountId || !toAccountId || !amount) return;
    if (fromAccountId === toAccountId) return;
    onSubmit({ fromAccountId, toAccountId, amount: parseFloat(amount), date, description });
  };

  // Filtra contas disponíveis para destino (exclui a de origem)
  const toAccounts = accounts.filter(a => a.id !== fromAccountId);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 64 }}
    >
      <motion.div
        initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        onClick={e => e.stopPropagation()}
        style={{ background: modalBg, borderRadius: "24px 24px 0 0", width: "100%", maxWidth: 480, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "'Outfit',sans-serif" }}
      >
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, paddingBottom: 2 }}>
          <div style={{ width: 36, height: 4, borderRadius: 999, background: dark ? "rgba(255,255,255,0.1)" : "rgba(17,24,39,0.1)" }} />
        </div>

        {/* Header */}
        <div style={{ padding: "10px 20px 12px", borderBottom: `1px solid ${headBrd}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(37,99,235,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ArrowLeftRight size={15} color="#60a5fa" />
            </div>
            <p style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 800, fontSize: "1rem", color: text, letterSpacing: "-0.02em", margin: 0 }}>
              Transferência
            </p>
          </div>
          <button type="button" onClick={onClose}
            style={{ width: 30, height: 30, borderRadius: "50%", background: dark ? "rgba(255,255,255,0.06)" : "#f1f4f9", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={15} color={muted} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: "20px 20px 96px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Valor */}
          <div>
            <label style={labelStyle}>Valor</label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: "0.9rem", fontWeight: 600, color: muted }}>R$</span>
              <input
                type="number" step="0.01" placeholder="0,00" value={amount}
                onChange={e => setAmount(e.target.value)}
                onFocus={e => e.target.style.borderColor = "#1d4ed8"}
                onBlur={e => e.target.style.borderColor = inputBrd}
                required
                style={{ ...inputStyle, height: 56, paddingLeft: 42, fontSize: "1.5rem", fontWeight: 800, fontFamily: "'Cabinet Grotesk',sans-serif", color: "#60a5fa", letterSpacing: "-0.02em" }}
              />
            </div>
          </div>

          {/* De → Para */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 32px 1fr", gap: 8, alignItems: "end" }}>
            <div>
              <label style={labelStyle}>De</label>
              <Select value={fromAccountId} onValueChange={v => { setFromAccountId(v); if(v === toAccountId) setToAccountId(""); }}>
                <SelectTrigger style={selectStyle}>
                  <SelectValue placeholder="Origem" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map(acc => <SelectItem key={acc.id} value={acc.id}>🏦 {acc.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Seta central */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 40, color: "#60a5fa" }}>
              <ArrowLeftRight size={16} />
            </div>

            <div>
              <label style={labelStyle}>Para</label>
              <Select value={toAccountId} onValueChange={setToAccountId} disabled={!fromAccountId}>
                <SelectTrigger style={{ ...selectStyle, opacity: fromAccountId ? 1 : 0.5 }}>
                  <SelectValue placeholder="Destino" />
                </SelectTrigger>
                <SelectContent>
                  {toAccounts.map(acc => <SelectItem key={acc.id} value={acc.id}>🏦 {acc.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Descrição */}
          <div>
            <label style={labelStyle}>Descrição</label>
            <input
              placeholder="Transferência"
              value={description}
              onChange={e => setDescription(e.target.value)}
              onFocus={e => e.target.style.borderColor = "#1d4ed8"}
              onBlur={e => e.target.style.borderColor = inputBrd}
              style={inputStyle}
            />
          </div>

          {/* Data */}
          <div>
            <label style={labelStyle}>Data</label>
            <input
              type="date" value={date}
              onChange={e => setDate(e.target.value)}
              required
              style={{ ...inputStyle, colorScheme: dark ? "dark" : "light" }}
            />
          </div>

          {/* Resumo */}
          {fromAccountId && toAccountId && amount && (
            <div style={{ background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)", borderRadius: 12, padding: "12px 16px", fontSize: "0.82rem", color: muted, lineHeight: 1.6 }}>
              💸 Transferindo <strong style={{ color: "#60a5fa" }}>R$ {parseFloat(amount||0).toFixed(2).replace(".",",")}</strong> de <strong style={{ color: text }}>{accounts.find(a=>a.id===fromAccountId)?.name}</strong> para <strong style={{ color: text }}>{accounts.find(a=>a.id===toAccountId)?.name}</strong>
            </div>
          )}

          {/* Submit */}
          <motion.button type="submit" whileTap={{ scale: 0.97 }}
            disabled={!fromAccountId || !toAccountId || !amount || fromAccountId === toAccountId}
            style={{
              width: "100%", height: 52, borderRadius: 14, border: "none", cursor: "pointer",
              background: "linear-gradient(135deg,#1d4ed8,#3730a3)",
              color: "#ffffff", fontFamily: "'Cabinet Grotesk',sans-serif",
              fontWeight: 800, fontSize: "0.95rem", letterSpacing: "-0.01em",
              boxShadow: "0 4px 16px rgba(29,78,216,0.35)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              opacity: (!fromAccountId || !toAccountId || !amount) ? 0.5 : 1,
              marginTop: 4,
            }}>
            <ArrowLeftRight size={16} /> Confirmar transferência
          </motion.button>

        </form>
      </motion.div>
    </motion.div>
  );
}
