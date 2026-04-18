import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { Plus, X, AlertTriangle, CheckCircle, Edit2 } from "lucide-react";
import { toast } from "sonner";
import { startOfMonth, endOfMonth, parseISO, isWithinInterval } from "date-fns";

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

const CATEGORY_OPTIONS = [
  { value: "alimentação", emoji: "🍔" }, { value: "transporte", emoji: "🚗" },
  { value: "moradia", emoji: "🏠" },    { value: "saúde", emoji: "❤️" },
  { value: "educação", emoji: "📚" },   { value: "lazer", emoji: "🎉" },
  { value: "compras", emoji: "🛍️" },   { value: "assinaturas", emoji: "📱" },
  { value: "doação", emoji: "🙏" },     { value: "beleza", emoji: "💅" },
  { value: "pet", emoji: "🐾" },        { value: "imprevistos", emoji: "⚡" },
  { value: "outros", emoji: "📦" },
];

export default function BudgetManager({ transactions, accounts, selectedDate }) {
  const { user } = useAuth();
  const dark = useIsDark();
  const [budgets, setBudgets] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ category: "alimentação", amount: "", alert_at: 80 });
  const [saving, setSaving] = useState(false);

  const cardBg = dark ? "#0c0e13" : "#ffffff";
  const border = dark ? "rgba(255,255,255,0.07)" : "#e5e7eb";
  const text   = dark ? "#e8edf5" : "#111827";
  const muted  = dark ? "#6b7a96" : "#6b7280";
  const subBg  = dark ? "#12151c" : "#f9fafb";
  const inputBg= dark ? "#12151c" : "#f9fafb";

  useEffect(() => {
    if (!user) return;
    supabase.from("budgets").select("*").eq("user_id", user.id).eq("is_active", true)
      .then(({ data }) => { if (data) setBudgets(data); });
  }, [user]);

  // Calcula gasto atual por categoria no mês
  const spentByCategory = useMemo(() => {
    const investIds = new Set(accounts.filter(a => a.type === "investment").map(a => a.id));
    const start = startOfMonth(selectedDate);
    const end   = endOfMonth(selectedDate);
    const map = {};
    transactions.filter(t =>
      t.type === "expense" &&
      t.is_realized !== false &&
      !investIds.has(t.account_id)
    ).forEach(t => {
      try {
        if (isWithinInterval(parseISO(t.date), { start, end })) {
          const cat = t.category || "outros";
          map[cat] = (map[cat] || 0) + Number(t.amount);
        }
      } catch {}
    });
    return map;
  }, [transactions, accounts, selectedDate]);

  async function saveBudget() {
    if (!form.amount || Number(form.amount) <= 0) { toast.error("Digite um valor válido"); return; }
    setSaving(true);
    const { error } = await supabase.from("budgets").upsert({
      user_id: user.id,
      category: form.category,
      amount: Number(form.amount),
      alert_at: Number(form.alert_at),
      period: "monthly",
      emoji: CATEGORY_OPTIONS.find(c => c.value === form.category)?.emoji || "📦",
    }, { onConflict: "user_id,category,period" });
    if (error) { toast.error("Erro ao salvar"); }
    else {
      toast.success("Orçamento salvo!");
      const { data } = await supabase.from("budgets").select("*").eq("user_id", user.id).eq("is_active", true);
      if (data) setBudgets(data);
      setShowForm(false);
      setForm({ category: "alimentação", amount: "", alert_at: 80 });
    }
    setSaving(false);
  }

  async function deleteBudget(id) {
    await supabase.from("budgets").update({ is_active: false }).eq("id", id);
    setBudgets(prev => prev.filter(b => b.id !== id));
    toast.success("Orçamento removido");
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
      style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 16, padding: "14px 16px" }}>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <p style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontSize: "0.9rem", fontWeight: 700, color: text }}>Orçamentos</p>
          <p style={{ fontSize: "0.68rem", color: muted }}>Limite de gasto por categoria</p>
        </div>
        <button onClick={() => setShowForm(true)} style={{
          display: "flex", alignItems: "center", gap: 4,
          background: "rgba(29,78,216,0.12)", border: "1px solid rgba(29,78,216,0.25)",
          borderRadius: 8, padding: "5px 10px", cursor: "pointer",
          fontSize: "0.68rem", fontWeight: 600, color: "#60a5fa",
        }}>
          <Plus size={12} /> Novo
        </button>
      </div>

      {budgets.length === 0 && !showForm && (
        <div style={{ textAlign: "center", padding: "16px 0" }}>
          <p style={{ fontSize: "0.75rem", color: muted }}>Nenhum orçamento criado.</p>
          <p style={{ fontSize: "0.68rem", color: muted }}>Defina limites por categoria para controlar melhor seus gastos.</p>
        </div>
      )}

      {/* Lista de orçamentos */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {budgets.map(budget => {
          const spent = spentByCategory[budget.category] || 0;
          const pct   = Math.min(100, (spent / budget.amount) * 100);
          const alertPct = budget.alert_at || 80;
          const isAlert = pct >= alertPct && pct < 100;
          const isOver  = pct >= 100;
          const barColor = isOver ? "#ef4444" : isAlert ? "#f59e0b" : "#22c55e";
          const emoji   = budget.emoji || CATEGORY_OPTIONS.find(c => c.value === budget.category)?.emoji || "📦";

          return (
            <div key={budget.id} style={{ background: subBg, borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 14 }}>{emoji}</span>
                  <span style={{ fontSize: "0.78rem", fontWeight: 600, color: text, textTransform: "capitalize" }}>{budget.category}</span>
                  {isOver  && <AlertTriangle size={11} color="#ef4444" />}
                  {isAlert && !isOver && <AlertTriangle size={11} color="#f59e0b" />}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, color: isOver ? "#ef4444" : text }}>
                    {fmt(spent)} <span style={{ color: muted, fontWeight: 400 }}>/ {fmt(budget.amount)}</span>
                  </span>
                  <button onClick={() => deleteBudget(budget.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
                    <X size={12} color={muted} />
                  </button>
                </div>
              </div>
              <div style={{ height: 4, background: dark ? "rgba(255,255,255,0.06)" : "#e5e7eb", borderRadius: 2 }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: "easeOut" }}
                  style={{ height: 4, background: barColor, borderRadius: 2 }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                <span style={{ fontSize: "0.58rem", color: isOver ? "#ef4444" : isAlert ? "#f59e0b" : muted }}>
                  {isOver ? "🚨 Limite ultrapassado!" : isAlert ? `⚠️ ${pct.toFixed(0)}% utilizado` : `${pct.toFixed(0)}% utilizado`}
                </span>
                <span style={{ fontSize: "0.58rem", color: muted }}>Restam {fmt(Math.max(0, budget.amount - spent))}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Form novo orçamento */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            style={{ overflow: "hidden", marginTop: 12 }}>
            <div style={{ background: subBg, borderRadius: 12, padding: "12px" }}>
              <p style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontSize: "0.8rem", fontWeight: 700, color: text, marginBottom: 10 }}>Novo orçamento</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                  style={{ background: dark ? "#0c0e13" : "#fff", border: `1px solid ${border}`, borderRadius: 8, padding: "8px 10px", color: text, fontSize: "0.8rem", outline: "none" }}>
                  {CATEGORY_OPTIONS.map(c => (
                    <option key={c.value} value={c.value}>{c.emoji} {c.value}</option>
                  ))}
                </select>
                <input type="number" placeholder="Limite (R$)" value={form.amount}
                  onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                  style={{ background: dark ? "#0c0e13" : "#fff", border: `1px solid ${border}`, borderRadius: 8, padding: "8px 10px", color: text, fontSize: "0.8rem", outline: "none" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: "0.7rem", color: muted, whiteSpace: "nowrap" }}>Alertar em {form.alert_at}%</span>
                  <input type="range" min={50} max={95} step={5} value={form.alert_at}
                    onChange={e => setForm(p => ({ ...p, alert_at: e.target.value }))}
                    style={{ flex: 1, accentColor: "#1d4ed8" }} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setShowForm(false)} style={{ flex: 1, background: "transparent", border: `1px solid ${border}`, borderRadius: 8, padding: "8px", cursor: "pointer", fontSize: "0.78rem", color: muted }}>
                    Cancelar
                  </button>
                  <button onClick={saveBudget} disabled={saving} style={{ flex: 2, background: "#1d4ed8", border: "none", borderRadius: 8, padding: "8px", cursor: "pointer", fontSize: "0.78rem", fontWeight: 700, color: "#fff" }}>
                    {saving ? "Salvando..." : "Salvar orçamento"}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}