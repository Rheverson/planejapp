import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { startOfMonth, endOfMonth, subMonths, parseISO, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";

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

const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const fmtPct = (v) => (v > 0 ? "+" : "") + v.toFixed(0) + "%";

function DiffBadge({ current, prev }) {
  if (!prev || prev === 0) return null;
  const diff = ((current - prev) / Math.abs(prev)) * 100;
  const isExpense = true; // para despesas: subir é ruim
  const isPositive = diff < 0; // gastou menos = bom para despesa
  const color = isPositive ? "#22c55e" : "#ef4444";
  const Icon = diff === 0 ? Minus : diff < 0 ? TrendingDown : TrendingUp;
  return (
    <span style={{ fontSize: "0.58rem", fontWeight: 700, color, background: isPositive ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", borderRadius: 6, padding: "2px 5px", marginLeft: 4 }}>
      {fmtPct(diff)}
    </span>
  );
}

export default function MonthComparison({ transactions, accounts, selectedDate }) {
  const dark = useIsDark();

  const cardBg = dark ? "#0c0e13" : "#ffffff";
  const border = dark ? "rgba(255,255,255,0.07)" : "#e5e7eb";
  const text   = dark ? "#e8edf5" : "#111827";
  const muted  = dark ? "#6b7a96" : "#6b7280";
  const subBg  = dark ? "#12151c" : "#f9fafb";

  const { current, previous, topDiffs } = useMemo(() => {
    const investIds = new Set(accounts.filter(a => a.type === "investment").map(a => a.id));

    const currStart = startOfMonth(selectedDate);
    const currEnd   = endOfMonth(selectedDate);
    const prevStart = startOfMonth(subMonths(selectedDate, 1));
    const prevEnd   = endOfMonth(subMonths(selectedDate, 1));

    const inRange = (t, s, e) => {
      try { return isWithinInterval(parseISO(t.date), { start: s, end: e }); } catch { return false; }
    };

    const filter = (txs, s, e) => txs.filter(t =>
      inRange(t, s, e) &&
      t.type !== "transfer" &&
      t.is_realized !== false &&
      !investIds.has(t.account_id)
    );

    const currTxs = filter(transactions, currStart, currEnd);
    const prevTxs = filter(transactions, prevStart, prevEnd);

    const sum = (txs, type) => txs.filter(t => t.type === type).reduce((s,t) => s+Number(t.amount), 0);

    // Por categoria
    const byCat = (txs) => {
      const map = {};
      txs.filter(t => t.type === "expense").forEach(t => {
        const cat = t.category || "outros";
        map[cat] = (map[cat] || 0) + Number(t.amount);
      });
      return map;
    };

    const currCats = byCat(currTxs);
    const prevCats = byCat(prevTxs);
    const allCats  = [...new Set([...Object.keys(currCats), ...Object.keys(prevCats)])];

    const diffs = allCats.map(cat => ({
      cat,
      curr: currCats[cat] || 0,
      prev: prevCats[cat] || 0,
      diff: (currCats[cat] || 0) - (prevCats[cat] || 0),
    })).sort((a,b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 4);

    return {
      current:  { income: sum(currTxs, "income"), expense: sum(currTxs, "expense") },
      previous: { income: sum(prevTxs, "income"), expense: sum(prevTxs, "expense") },
      topDiffs: diffs,
    };
  }, [transactions, accounts, selectedDate]);

  const prevMonthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(subMonths(selectedDate, 1));
  const currMonthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(selectedDate);

  if (previous.income === 0 && previous.expense === 0) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
      style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 16, padding: "14px 16px" }}>

      <div style={{ marginBottom: 12 }}>
        <p style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontSize: "0.9rem", fontWeight: 700, color: text }}>
          Comparativo mensal
        </p>
        <p style={{ fontSize: "0.68rem", color: muted }}>{currMonthLabel} vs {prevMonthLabel}</p>
      </div>

      {/* Entradas e saídas lado a lado */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        {[
          { label: "Entradas", curr: current.income, prev: previous.income, color: "#22c55e", goodIfUp: true },
          { label: "Saídas",   curr: current.expense, prev: previous.expense, color: "#ef4444", goodIfUp: false },
        ].map(({ label, curr, prev, color, goodIfUp }) => {
          const diff = prev > 0 ? ((curr - prev) / prev) * 100 : 0;
          const isGood = goodIfUp ? diff >= 0 : diff <= 0;
          const badgeColor = diff === 0 ? muted : isGood ? "#22c55e" : "#ef4444";
          return (
            <div key={label} style={{ background: subBg, borderRadius: 10, padding: "10px 12px" }}>
              <p style={{ fontSize: "0.62rem", color: muted, marginBottom: 4 }}>{label}</p>
              <p style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontSize: "1rem", fontWeight: 800, color }}>{fmt(curr)}</p>
              {prev > 0 && (
                <p style={{ fontSize: "0.6rem", color: badgeColor, marginTop: 2, fontWeight: 600 }}>
                  {diff > 0 ? "▲" : diff < 0 ? "▼" : "—"} {Math.abs(diff).toFixed(0)}% vs {prevMonthLabel}
                </p>
              )}
              <p style={{ fontSize: "0.58rem", color: muted, marginTop: 1 }}>{prevMonthLabel}: {fmt(prev)}</p>
            </div>
          );
        })}
      </div>

      {/* Top variações por categoria */}
      {topDiffs.length > 0 && (
        <>
          <p style={{ fontSize: "0.68rem", fontWeight: 600, color: muted, marginBottom: 8 }}>Maiores variações por categoria</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {topDiffs.map(({ cat, curr, prev, diff }) => {
              const isUp = diff > 0;
              const color = isUp ? "#ef4444" : "#22c55e";
              const pct = prev > 0 ? ((curr - prev) / prev * 100) : null;
              return (
                <div key={cat} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "0.72rem", color: text, textTransform: "capitalize" }}>{cat}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        {pct !== null && (
                          <span style={{ fontSize: "0.6rem", fontWeight: 700, color, background: isUp ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)", borderRadius: 5, padding: "1px 5px" }}>
                            {isUp ? "+" : ""}{pct.toFixed(0)}%
                          </span>
                        )}
                        <span style={{ fontSize: "0.7rem", fontWeight: 700, color }}>{fmt(curr)}</span>
                      </div>
                    </div>
                    <div style={{ height: 3, background: dark ? "rgba(255,255,255,0.06)" : "#f3f4f6", borderRadius: 2, marginTop: 4, position: "relative" }}>
                      <div style={{ position: "absolute", height: 3, background: dark ? "rgba(255,255,255,0.15)" : "#d1d5db", borderRadius: 2, width: `${prev > 0 ? Math.min(100, (prev / Math.max(curr, prev)) * 100) : 0}%` }} />
                      <motion.div initial={{ width: 0 }} animate={{ width: `${curr > 0 ? Math.min(100, (curr / Math.max(curr, prev)) * 100) : 0}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        style={{ position: "absolute", height: 3, background: color, borderRadius: 2 }} />
                    </div>
                    <p style={{ fontSize: "0.58rem", color: muted, marginTop: 2 }}>{prevMonthLabel}: {fmt(prev)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </motion.div>
  );
}