import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

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

function ScoreArc({ score }) {
  // SVG semicircle arc
  const r = 54;
  const cx = 64;
  const cy = 64;
  const startAngle = -180;
  const endAngle = startAngle + (score / 100) * 180;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startAngle));
  const y1 = cy + r * Math.sin(toRad(startAngle));
  const x2 = cx + r * Math.cos(toRad(endAngle));
  const y2 = cy + r * Math.sin(toRad(endAngle));
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#f59e0b" : score >= 25 ? "#f97316" : "#ef4444";
  const label = score >= 75 ? "Ótimo" : score >= 50 ? "Bom" : score >= 25 ? "Atenção" : "Crítico";

  return (
    <div style={{ position: "relative", width: 128, height: 72, margin: "0 auto" }}>
      <svg width="128" height="80" viewBox="0 0 128 80">
        {/* Track */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" strokeLinecap="round"
        />
        {/* Score arc */}
        {score > 0 && (
          <motion.path
            d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
            fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          />
        )}
      </svg>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, textAlign: "center" }}>
        <p style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontSize: "1.8rem", fontWeight: 900, color, lineHeight: 1, letterSpacing: "-0.03em" }}>{score}</p>
        <p style={{ fontSize: "0.6rem", fontWeight: 600, color, textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</p>
      </div>
    </div>
  );
}

export default function FinancialScore({ userId, selectedDate }) {
  const dark = useIsDark();
  const [data, setData] = useState(null);
  const [prev, setPrev] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    async function load() {
      setLoading(true);
      const month = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-01`;
      const prevDate = new Date(selectedDate);
      prevDate.setMonth(prevDate.getMonth() - 1);
      const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}-01`;

      const [{ data: curr }, { data: previous }] = await Promise.all([
        supabase.rpc("calculate_financial_score", { p_user_id: userId, p_month: month }),
        supabase.rpc("calculate_financial_score", { p_user_id: userId, p_month: prevMonth }),
      ]);
      setData(curr);
      setPrev(previous);
      setLoading(false);
    }
    load();
  }, [userId, selectedDate]);

  const cardBg = dark ? "#0c0e13" : "#ffffff";
  const border = dark ? "rgba(255,255,255,0.07)" : "#e5e7eb";
  const text   = dark ? "#e8edf5" : "#111827";
  const muted  = dark ? "#6b7a96" : "#6b7280";

  if (loading) return (
    <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 16, padding: "16px", height: 140, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 20, height: 20, border: `2px solid ${dark ? "#1d4ed8" : "#1d4ed8"}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (!data) return null;

  const diff = prev ? data.score - prev.score : null;
  const breakdown = data.breakdown || {};

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 16, padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <p style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontSize: "0.9rem", fontWeight: 700, color: text }}>Score Financeiro</p>
          <p style={{ fontSize: "0.68rem", color: muted }}>Saúde do seu mês</p>
        </div>
        {diff !== null && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, background: diff > 0 ? "rgba(34,197,94,0.1)" : diff < 0 ? "rgba(239,68,68,0.1)" : "rgba(107,122,150,0.1)", borderRadius: 8, padding: "4px 8px" }}>
            {diff > 0 ? <TrendingUp size={12} color="#22c55e" /> : diff < 0 ? <TrendingDown size={12} color="#ef4444" /> : <Minus size={12} color={muted} />}
            <span style={{ fontSize: "0.68rem", fontWeight: 700, color: diff > 0 ? "#22c55e" : diff < 0 ? "#ef4444" : muted }}>
              {diff > 0 ? "+" : ""}{diff} vs mês anterior
            </span>
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <ScoreArc score={data.score} />

        {/* Breakdown */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { label: "Poupança", key: "poupança", max: 40, color: "#22c55e" },
            { label: "Controle", key: "controle", max: 30, color: "#3b82f6" },
            { label: "Planejamento", key: "planejamento", max: 30, color: "#a78bfa" },
          ].map(({ label, key, max, color }) => {
            const val = breakdown[key] || 0;
            const pct = (val / max) * 100;
            return (
              <div key={key}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: "0.62rem", color: muted }}>{label}</span>
                  <span style={{ fontSize: "0.62rem", fontWeight: 600, color }}>{val}/{max}</span>
                </div>
                <div style={{ height: 3, background: dark ? "rgba(255,255,255,0.06)" : "#f3f4f6", borderRadius: 2 }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: "easeOut" }}
                    style={{ height: 3, background: color, borderRadius: 2 }} />
                </div>
              </div>
            );
          })}

          {/* Taxa de poupança */}
          {data.savings_rate !== undefined && (
            <p style={{ fontSize: "0.62rem", color: muted, marginTop: 2 }}>
              Taxa de poupança: <strong style={{ color: data.savings_rate >= 10 ? "#22c55e" : "#ef4444" }}>
                {data.savings_rate}%
              </strong>
              <span style={{ color: muted }}> (meta: 10%+)</span>
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}