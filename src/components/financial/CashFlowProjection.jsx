import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { TrendingDown, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";
import { addDays, format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

function useIsDark() {
  const [dark, setDark] = useState(() => localStorage.getItem("darkMode") === "true");
  useEffect(() => {
    const h = (e) => setDark(e.detail);
    window.addEventListener("darkModeChange", h);
    return () => window.removeEventListener("darkModeChange", h);
  }, []);
  return dark;
}

const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function CashFlowProjection({ transactions, accounts, currentBalance }) {
  const dark = useIsDark();

  const cardBg = dark ? "#0c0e13" : "#ffffff";
  const border = dark ? "rgba(255,255,255,0.07)" : "#e5e7eb";
  const text   = dark ? "#e8edf5" : "#111827";
  const muted  = dark ? "#6b7a96" : "#6b7280";
  const subBg  = dark ? "#12151c"  : "#f9fafb";

  const projection = useMemo(() => {
    const today = new Date();
    const investmentIds = new Set(accounts.filter(a => a.type === "investment").map(a => a.id));

    // Pega previstos dos próximos 30 dias
    const next30 = [];
    for (let i = 1; i <= 30; i++) {
      const d = addDays(today, i);
      const ds = format(d, "yyyy-MM-dd");
      const dayTxs = transactions.filter(t =>
        t.date === ds &&
        t.is_realized === false &&
        t.type !== "transfer" &&
        !investmentIds.has(t.account_id)
      );
      if (dayTxs.length > 0) {
        const income  = dayTxs.filter(t => t.type === "income").reduce((s,t) => s+Number(t.amount), 0);
        const expense = dayTxs.filter(t => t.type === "expense").reduce((s,t) => s+Number(t.amount), 0);
        next30.push({ date: ds, dayLabel: format(d, "dd/MM", { locale: ptBR }), income, expense, txs: dayTxs });
      }
    }

    // Simula saldo dia a dia
    let runningBalance = currentBalance;
    let lowestBalance = currentBalance;
    let lowestDate = null;
    let willGoNegative = false;

    const timeline = next30.map(day => {
      runningBalance = runningBalance + day.income - day.expense;
      if (runningBalance < lowestBalance) {
        lowestBalance = runningBalance;
        lowestDate = day.date;
      }
      if (runningBalance < 0) willGoNegative = true;
      return { ...day, projectedBalance: runningBalance };
    });

    const totalIncoming = next30.reduce((s, d) => s + d.income, 0);
    const totalOutgoing = next30.reduce((s, d) => s + d.expense, 0);
    const finalBalance  = currentBalance + totalIncoming - totalOutgoing;

    return { timeline, totalIncoming, totalOutgoing, finalBalance, lowestBalance, lowestDate, willGoNegative };
  }, [transactions, accounts, currentBalance]);

  const { timeline, totalIncoming, totalOutgoing, finalBalance, lowestBalance, lowestDate, willGoNegative } = projection;

  if (timeline.length === 0) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
      style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 16, padding: "14px 16px" }}>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <p style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontSize: "0.9rem", fontWeight: 700, color: text }}>Projeção — 30 dias</p>
          <p style={{ fontSize: "0.68rem", color: muted }}>Com base nos lançamentos previstos</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: "0.62rem", color: muted }}>Saldo final projetado</p>
          <p style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontSize: "1rem", fontWeight: 800, color: finalBalance >= 0 ? "#22c55e" : "#ef4444" }}>
            {fmt(finalBalance)}
          </p>
        </div>
      </div>

      {/* Alerta se vai ficar negativo */}
      {willGoNegative && (
        <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "10px 12px", marginBottom: 12, display: "flex", gap: 8, alignItems: "flex-start" }}>
          <AlertTriangle size={14} color="#ef4444" style={{ marginTop: 1, flexShrink: 0 }} />
          <p style={{ fontSize: "0.72rem", color: "#ef4444", lineHeight: 1.5 }}>
            <strong>Atenção!</strong> Seu saldo pode ficar negativo em {format(parseISO(lowestDate), "dd/MM", { locale: ptBR })} — mínimo projetado: <strong>{fmt(lowestBalance)}</strong>
          </p>
        </div>
      )}

      {!willGoNegative && (
        <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 10, padding: "10px 12px", marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
          <CheckCircle size={14} color="#22c55e" style={{ flexShrink: 0 }} />
          <p style={{ fontSize: "0.72rem", color: "#22c55e" }}>Saldo positivo durante os próximos 30 dias 👍</p>
        </div>
      )}

      {/* Resumo entrada/saída */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        <div style={{ background: subBg, borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
            <TrendingUp size={11} color="#22c55e" />
            <span style={{ fontSize: "0.62rem", color: muted }}>Entradas previstas</span>
          </div>
          <p style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontSize: "0.95rem", fontWeight: 800, color: "#22c55e" }}>{fmt(totalIncoming)}</p>
        </div>
        <div style={{ background: subBg, borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
            <TrendingDown size={11} color="#ef4444" />
            <span style={{ fontSize: "0.62rem", color: muted }}>Saídas previstas</span>
          </div>
          <p style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontSize: "0.95rem", fontWeight: 800, color: "#ef4444" }}>{fmt(totalOutgoing)}</p>
        </div>
      </div>

      {/* Timeline */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {timeline.slice(0, 5).map((day, i) => (
          <div key={day.date} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: i < Math.min(timeline.length, 5) - 1 ? `1px solid ${dark ? "rgba(255,255,255,0.04)" : "#f3f4f6"}` : "none" }}>
            <span style={{ fontSize: "0.7rem", fontWeight: 600, color: muted, minWidth: 36 }}>{day.dayLabel}</span>
            <div style={{ flex: 1 }}>
              {day.txs.slice(0, 2).map((t, j) => (
                <p key={j} style={{ fontSize: "0.68rem", color: text, margin: 0 }}>{t.description}</p>
              ))}
              {day.txs.length > 2 && <p style={{ fontSize: "0.62rem", color: muted, margin: 0 }}>+{day.txs.length - 2} mais</p>}
            </div>
            <div style={{ textAlign: "right" }}>
              {day.expense > 0 && <p style={{ fontSize: "0.7rem", fontWeight: 700, color: "#ef4444", margin: 0 }}>-{fmt(day.expense)}</p>}
              {day.income > 0  && <p style={{ fontSize: "0.7rem", fontWeight: 700, color: "#22c55e", margin: 0 }}>+{fmt(day.income)}</p>}
              <p style={{ fontSize: "0.62rem", color: day.projectedBalance >= 0 ? muted : "#ef4444", margin: 0 }}>
                saldo: {fmt(day.projectedBalance)}
              </p>
            </div>
          </div>
        ))}
        {timeline.length > 5 && (
          <p style={{ fontSize: "0.68rem", color: muted, textAlign: "center", paddingTop: 4 }}>
            +{timeline.length - 5} evento(s) nos próximos 30 dias
          </p>
        )}
      </div>
    </motion.div>
  );
}