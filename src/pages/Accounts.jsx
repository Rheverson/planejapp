import React, { useState, useMemo, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useSharedProfile } from "@/lib/SharedProfileContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Building2, Wallet, Smartphone, TrendingUp, MoreHorizontal,
  Trash2, Edit2, X, ArrowUpRight, ArrowDownRight, ArrowLeftRight, PiggyBank
} from "lucide-react";
import { toast } from "sonner";
import { startOfMonth, endOfMonth, isWithinInterval, parseISO, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMonth } from "@/lib/MonthContext";

import AccountForm from "@/components/accounts/AccountForm";
import EmptyState from "@/components/common/EmptyState";
import MonthSelector from "@/components/common/MonthSelector";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const iconMap    = { bank: Building2, wallet: Wallet, digital: Smartphone, investment: TrendingUp, other: MoreHorizontal };
const typeLabels = { bank: "Conta Bancária", wallet: "Carteira", digital: "Conta Digital", investment: "Investimentos", other: "Outros" };
const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

// ── Tailwind class → hex (mesma tabela do Home.jsx) ──────────
const TAILWIND_TO_HEX = {
  "bg-slate-500":"#64748b","bg-slate-600":"#475569",
  "bg-red-400":"#f87171","bg-red-500":"#ef4444","bg-red-600":"#dc2626","bg-red-700":"#b91c1c",
  "bg-orange-400":"#fb923c","bg-orange-500":"#f97316","bg-orange-600":"#ea580c",
  "bg-amber-400":"#fbbf24","bg-amber-500":"#f59e0b","bg-amber-600":"#d97706",
  "bg-yellow-400":"#facc15","bg-yellow-500":"#eab308",
  "bg-green-400":"#4ade80","bg-green-500":"#22c55e","bg-green-600":"#16a34a","bg-green-700":"#15803d",
  "bg-emerald-400":"#34d399","bg-emerald-500":"#10b981","bg-emerald-600":"#059669",
  "bg-teal-500":"#14b8a6","bg-teal-600":"#0d9488",
  "bg-cyan-500":"#06b6d4","bg-cyan-600":"#0891b2",
  "bg-sky-500":"#0ea5e9","bg-sky-600":"#0284c7","bg-sky-700":"#0369a1",
  "bg-blue-400":"#60a5fa","bg-blue-500":"#3b82f6","bg-blue-600":"#2563eb","bg-blue-700":"#1d4ed8","bg-blue-800":"#1e40af",
  "bg-indigo-400":"#818cf8","bg-indigo-500":"#6366f1","bg-indigo-600":"#4f46e5",
  "bg-violet-400":"#a78bfa","bg-violet-500":"#8b5cf6","bg-violet-600":"#7c3aed","bg-violet-700":"#6d28d9",
  "bg-purple-400":"#c084fc","bg-purple-500":"#a855f7","bg-purple-600":"#9333ea","bg-purple-700":"#7e22ce",
  "bg-pink-400":"#f472b6","bg-pink-500":"#ec4899","bg-pink-600":"#db2777",
  "bg-rose-400":"#fb7185","bg-rose-500":"#f43f5e","bg-rose-600":"#e11d48",
  "bg-fuchsia-500":"#d946ef","bg-fuchsia-600":"#c026d3",
};
const FALLBACK_PALETTE = [
  "#1d4ed8","#7c3aed","#059669","#d97706","#dc2626",
  "#0891b2","#be185d","#15803d","#9333ea","#c2410c",
];
function getAccountColor(account) {
  const raw = account.color;
  if (raw && TAILWIND_TO_HEX[raw.trim()]) return TAILWIND_TO_HEX[raw.trim()];
  if (raw && /^#[0-9A-Fa-f]{6}$/.test(raw.trim())) return raw.trim();
  const name = account.name || "?";
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return FALLBACK_PALETTE[Math.abs(hash) % FALLBACK_PALETTE.length];
}
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return `${parseInt(h.substring(0,2),16)},${parseInt(h.substring(2,4),16)},${parseInt(h.substring(4,6),16)}`;
}

function useIsDark() {
  const [dark, setDark] = useState(() => localStorage.getItem("darkMode") === "true");
  useEffect(() => {
    const h = (e) => setDark(e.detail);
    window.addEventListener("darkModeChange", h);
    return () => window.removeEventListener("darkModeChange", h);
  }, []);
  return dark;
}

// ── Modal de detalhes da conta ────────────────────────────────
function AccountDetailModal({ account, transactions, onClose, dark }) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const Icon      = iconMap[account.type] || Wallet;
  const accentHex = getAccountColor(account);
  const rgb       = hexToRgb(accentHex);

  const monthStart = startOfMonth(selectedDate);
  const monthEnd   = endOfMonth(selectedDate);

  const currentBalance = useMemo(() => {
    let bal = Number(account.initial_balance) || 0;
    transactions.forEach(t => {
      if (t.is_realized === false) return;
      if (t.type === "income"   && t.account_id === account.id) bal += Number(t.amount);
      else if (t.type === "expense" && t.account_id === account.id) bal -= Number(t.amount);
      else if (t.type === "transfer") {
        if (t.account_id === account.id) bal -= Number(t.amount);
        if (t.transfer_account_id === account.id) bal += Number(t.amount);
      }
    });
    return bal;
  }, [account, transactions]);

  const monthTx = useMemo(() =>
    transactions
      .filter(t => {
        const d = parseISO(t.date);
        if (!isWithinInterval(d, { start: monthStart, end: monthEnd })) return false;
        return t.account_id === account.id || t.transfer_account_id === account.id;
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date)),
    [transactions, monthStart, monthEnd, account.id]
  );

  const monthSummary = useMemo(() => {
    let income = 0, expense = 0;
    monthTx.forEach(t => {
      if (t.is_realized === false) return;
      if (t.type === "income" && t.account_id === account.id) income += t.amount;
      else if (t.type === "expense" && t.account_id === account.id) expense += t.amount;
      else if (t.type === "transfer") {
        if (t.transfer_account_id === account.id) income += t.amount;
        else if (t.account_id === account.id) expense += t.amount;
      }
    });
    return { income, expense, balance: income - expense };
  }, [monthTx, account.id]);

  const cardBg  = dark ? "#0c0e13" : "#ffffff";
  const cardBrd = dark ? "rgba(255,255,255,0.07)" : "rgba(17,24,39,0.06)";
  const text    = dark ? "#e8edf5" : "#0f172a";
  const muted   = dark ? "#6b7a96" : "#64748b";
  const rowBrd  = dark ? "rgba(255,255,255,0.05)" : "rgba(17,24,39,0.05)";

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 64 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        onClick={e => e.stopPropagation()}
        style={{ background: dark ? "#060709" : "#f1f4f9", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: 480, maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
      >
        {/* Header do modal — cor da conta */}
        <div style={{
          padding: "20px 20px 0",
          background: `
            radial-gradient(ellipse 80% 80% at 50% -20%, rgba(${rgb},0.5) 0%, transparent 70%),
            linear-gradient(160deg, ${accentHex} 0%, ${accentHex}cc 100%)
          `,
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 11, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon size={17} color="#fff" />
              </div>
              <div>
                <p style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 700, fontSize: "0.95rem", color: "#fff" }}>{account.name}</p>
                <p style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.65)" }}>{typeLabels[account.type]}</p>
              </div>
            </div>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <X size={15} color="#fff" />
            </button>
          </div>
          <p style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.6)", marginBottom: 3 }}>Saldo atual</p>
          <p style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 900, fontSize: "1.8rem", color: "#fff", letterSpacing: "-0.03em", marginBottom: 12 }}>{fmt(currentBalance)}</p>
          <MonthSelector selectedDate={selectedDate} onChange={setSelectedDate} />
          <div style={{ height: 14 }} />
        </div>

        {/* Resumo mês */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1px 1fr 1px 1fr", background: cardBg, borderBottom: `1px solid ${rowBrd}`, flexShrink: 0 }}>
          <div style={{ padding: "10px 6px", textAlign: "center" }}>
            <p style={{ fontSize: "0.58rem", fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>Entradas</p>
            <p style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 800, fontSize: "0.88rem", color: dark ? "#2ecc8a" : "#059669" }}>{fmt(monthSummary.income)}</p>
          </div>
          <div style={{ background: rowBrd }} />
          <div style={{ padding: "10px 6px", textAlign: "center" }}>
            <p style={{ fontSize: "0.58rem", fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>Saídas</p>
            <p style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 800, fontSize: "0.88rem", color: dark ? "#e85d5d" : "#dc2626" }}>{fmt(monthSummary.expense)}</p>
          </div>
          <div style={{ background: rowBrd }} />
          <div style={{ padding: "10px 6px", textAlign: "center" }}>
            <p style={{ fontSize: "0.58rem", fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>Saldo</p>
            <p style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 800, fontSize: "0.88rem", color: monthSummary.balance >= 0 ? (dark ? "#60a5fa" : "#1d4ed8") : (dark ? "#e85d5d" : "#dc2626") }}>{fmt(monthSummary.balance)}</p>
          </div>
        </div>

        {/* Lista de transações */}
        <div style={{ flex: 1, overflowY: "auto", background: cardBg }}>
          {monthTx.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 100 }}>
              <p style={{ fontSize: "0.85rem", color: muted }}>Nenhuma movimentação no período</p>
            </div>
          ) : (
            monthTx.map(t => {
              const isIn = t.type === "income" || (t.type === "transfer" && t.transfer_account_id === account.id);
              const TxIcon = t.type === "transfer" ? ArrowLeftRight : isIn ? ArrowUpRight : ArrowDownRight;
              const iconCol = t.type === "transfer" ? (dark ? "#60a5fa" : "#2563eb") : isIn ? (dark ? "#2ecc8a" : "#059669") : (dark ? "#e85d5d" : "#dc2626");
              const iconBg  = t.type === "transfer" ? "rgba(37,99,235,0.1)" : isIn ? "rgba(5,150,105,0.1)" : "rgba(220,38,38,0.1)";
              return (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: `1px solid ${rowBrd}` }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <TxIcon size={15} color={iconCol} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "0.85rem", fontWeight: 600, color: text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.description}</p>
                    <p style={{ fontSize: "0.7rem", color: muted }}>
                      {format(parseISO(t.date), "dd 'de' MMM", { locale: ptBR })}
                      {t.category && ` · ${t.category}`}
                      {t.is_realized === false && " · Previsto"}
                    </p>
                  </div>
                  <p style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontSize: "0.88rem", fontWeight: 700, color: isIn ? (dark ? "#2ecc8a" : "#059669") : (dark ? "#e85d5d" : "#dc2626"), flexShrink: 0 }}>
                    {isIn ? "+" : "-"}{fmt(t.amount)}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Página principal ──────────────────────────────────────────
export default function Accounts() {
  const dark = useIsDark();
  const { user } = useAuth();
  const { activeOwnerId, isViewingSharedProfile, sharedPermissions } = useSharedProfile();
  const canManage = !isViewingSharedProfile || sharedPermissions?.add_transactions;
  const queryClient = useQueryClient();
  const [showForm, setShowForm]               = useState(false);
  const [editAccount, setEditAccount]         = useState(null);
  const [deleteId, setDeleteId]               = useState(null);
  const [selectedAccount, setSelectedAccount] = useState(null);

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", activeOwnerId],
    queryFn: async () => { const { data, error } = await supabase.from("accounts").select("*").eq("user_id", activeOwnerId).order("name"); if (error) throw error; return data; },
    enabled: !!activeOwnerId,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions", activeOwnerId],
    queryFn: async () => { const { data, error } = await supabase.from("transactions").select("*").eq("user_id", activeOwnerId); if (error) throw error; return data; },
    enabled: !!activeOwnerId,
  });

  const createMutation = useMutation({
    mutationFn: async (newAccount) => { const { data, error } = await supabase.from("accounts").insert([{ ...newAccount, user_id: activeOwnerId, initial_balance: parseFloat(newAccount.initial_balance || 0) }]).select(); if (error) throw error; return data; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["accounts"] }); setShowForm(false); toast.success("Conta criada!"); },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => { const { error } = await supabase.from("accounts").update({ ...data, initial_balance: parseFloat(data.initial_balance || 0) }).eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["accounts"] }); setEditAccount(null); setShowForm(false); toast.success("Conta atualizada!"); },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => { const { error } = await supabase.from("accounts").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["accounts"] }); setDeleteId(null); toast.success("Conta removida!"); },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  const accountBalances = useMemo(() => {
    const b = {};
    accounts.forEach(a => { b[a.id] = Number(a.initial_balance) || 0; });
    transactions.forEach(t => {
      if (t.is_realized === false) return;
      if (t.type === "income" && t.account_id)           b[t.account_id]          = (b[t.account_id]||0) + Number(t.amount);
      else if (t.type === "expense" && t.account_id)     b[t.account_id]          = (b[t.account_id]||0) - Number(t.amount);
      else if (t.type === "transfer") {
        if (t.account_id)          b[t.account_id]          = (b[t.account_id]||0)          - Number(t.amount);
        if (t.transfer_account_id) b[t.transfer_account_id] = (b[t.transfer_account_id]||0) + Number(t.amount);
      }
    });
    return b;
  }, [accounts, transactions]);

  const regularAccounts    = accounts.filter(a => a.type !== "investment");
  const investmentAccounts = accounts.filter(a => a.type === "investment");
  const totalBalance  = regularAccounts.reduce((s,a) => s + (accountBalances[a.id]||0), 0);
  const totalInvested = investmentAccounts.reduce((s,a) => s + (accountBalances[a.id]||0), 0);

  const handleSubmit = (data) =>
    editAccount ? updateMutation.mutate({ id: editAccount.id, data }) : createMutation.mutate(data);

  // Tokens
  const bg      = dark ? "#060709" : "#f1f4f9";
  const cardBg  = dark ? "#0c0e13" : "#ffffff";
  const cardBrd = dark ? "rgba(255,255,255,0.07)" : "rgba(17,24,39,0.05)";
  const shadow  = dark ? "none" : "0 1px 3px rgba(17,24,39,0.04), 0 4px 12px rgba(17,24,39,0.05)";
  const text    = dark ? "#e8edf5" : "#0f172a";
  const muted   = dark ? "#6b7a96" : "#64748b";
  const linkCol = dark ? "#60a5fa" : "#1d4ed8";

  // Row de conta
  const AccountRow = ({ account, index }) => {
    const Icon      = iconMap[account.type] || Wallet;
    const balance   = accountBalances[account.id] || 0;
    const accentHex = getAccountColor(account);
    const rgb       = hexToRgb(accentHex);
    const letter    = (account.name || "?")[0].toUpperCase();
    const valColor  = balance < 0 ? (dark ? "#e85d5d" : "#dc2626") : (dark ? "#e8edf5" : "#0f172a");

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05 }}
        onClick={() => setSelectedAccount(account)}
        style={{ background: cardBg, border: `1px solid ${cardBrd}`, borderRadius: 16, padding: "12px 14px", boxShadow: shadow, cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}
      >
        {/* Ícone com inicial + cor da conta */}
        <div style={{ width: 44, height: 44, borderRadius: 13, background: accentHex, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: `0 4px 12px rgba(${rgb},0.35)`, fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 900, fontSize: "1.1rem", color: "#fff", letterSpacing: "-0.02em" }}>
          {letter}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 700, fontSize: "0.9rem", color: text, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{account.name}</p>
          <p style={{ fontSize: "0.68rem", color: muted }}>{typeLabels[account.type]}</p>
        </div>

        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <p style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 800, fontSize: "0.95rem", color: valColor, letterSpacing: "-0.02em" }}>
            {fmt(balance)}
          </p>
          {canManage && (
            <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", marginTop: 4 }} onClick={e => e.stopPropagation()}>
              <button onClick={() => { setEditAccount(account); setShowForm(true); }}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 4, borderRadius: 7, color: muted, display: "flex", alignItems: "center" }}
                onMouseEnter={e => e.currentTarget.style.background = dark ? "rgba(255,255,255,0.06)" : "#f1f5f9"}
                onMouseLeave={e => e.currentTarget.style.background = "none"}
              >
                <Edit2 size={13} />
              </button>
              <button onClick={() => setDeleteId(account.id)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 4, borderRadius: 7, color: "#e85d5d", display: "flex", alignItems: "center" }}
                onMouseEnter={e => e.currentTarget.style.background = dark ? "rgba(232,93,93,0.1)" : "#fef2f2"}
                onMouseLeave={e => e.currentTarget.style.background = "none"}
              >
                <Trash2 size={13} />
              </button>
            </div>
          )}
        </div>
      </motion.div>
    );
  };

  const SectionLabel = ({ label }) => (
    <p style={{ fontSize: "0.68rem", fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8, paddingLeft: 2 }}>
      {label}
    </p>
  );

  return (
    <div style={{ minHeight: "100vh", background: bg, paddingBottom: 96, fontFamily: "'Outfit',sans-serif" }}>

      {/* ══ HEADER — mesmo padrão, teal/ciano para diferenciar ══ */}
      <div style={{
        isolation: "isolate",
        overflow: "hidden",
        borderRadius: "0 0 28px 28px",
        boxShadow: dark
          ? "0 8px 32px rgba(0,0,0,0.5)"
          : "0 8px 32px rgba(8,145,178,0.2)",
        background: dark
          ? `
              radial-gradient(ellipse 70% 60% at 50% -10%, rgba(8,145,178,0.4) 0%, transparent 70%),
              radial-gradient(ellipse 40% 40% at 90% 110%, rgba(14,116,144,0.2) 0%, transparent 70%),
              linear-gradient(160deg, #06080f 0%, #060f14 40%, #081520 100%)
            `
          : `
              radial-gradient(ellipse 70% 60% at 50% -10%, rgba(103,232,249,0.4) 0%, transparent 70%),
              radial-gradient(ellipse 40% 40% at 90% 110%, rgba(34,211,238,0.2) 0%, transparent 70%),
              linear-gradient(165deg, #0891b2 0%, #0e7490 50%, #155e75 100%)
            `,
      }}>
        <div style={{ padding: "52px 20px 0" }}>

          {isViewingSharedProfile && (
            <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 8, padding: "4px 12px", marginBottom: 10, fontSize: "0.72rem", color: "rgba(255,255,255,0.85)", display: "inline-block", fontWeight: 500 }}>
              👁 Visualizando perfil compartilhado
            </div>
          )}

          <p style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 900, fontSize: "clamp(1.5rem,5vw,1.8rem)", color: "#ffffff", letterSpacing: "-0.03em", marginBottom: 4 }}>
            Minhas Contas
          </p>
          <p style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.55)", marginBottom: 12 }}>
            {accounts.length === 0 ? "Nenhuma conta cadastrada" : `${accounts.length} ${accounts.length === 1 ? "conta" : "contas"}`}
          </p>

          {/* Saldo consolidado */}
          <div style={{ display: "grid", gridTemplateColumns: totalInvested > 0 ? "1fr 1px 1fr" : "1fr", background: "rgba(255,255,255,0.1)", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "10px 10px", textAlign: totalInvested > 0 ? "center" : "left" }}>
              <p style={{ fontSize: "0.58rem", fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>Saldo disponível</p>
              <p style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 900, fontSize: "1.3rem", color: "#ffffff", letterSpacing: "-0.03em" }}>{fmt(totalBalance)}</p>
            </div>
            {totalInvested > 0 && (
              <>
                <div style={{ background: "rgba(255,255,255,0.15)" }} />
                <div style={{ padding: "10px 10px", textAlign: "center" }}>
                  <p style={{ fontSize: "0.58rem", fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>Investido</p>
                  <p style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 900, fontSize: "1.3rem", color: "#ffffff", letterSpacing: "-0.03em" }}>{fmt(totalInvested)}</p>
                </div>
              </>
            )}
          </div>
        </div>
        <div style={{ height: 20 }} />
      </div>

      {/* ══ CONTEÚDO ════════════════════════════════════════════ */}
      <div style={{ padding: "16px 14px 0", display: "flex", flexDirection: "column", gap: 20 }}>

        {accounts.length === 0 && (
          <div style={{ background: cardBg, border: `1px solid ${cardBrd}`, borderRadius: 16, padding: "24px", boxShadow: shadow }}>
            <EmptyState
              icon={Wallet}
              title="Nenhuma conta cadastrada"
              description="Adicione suas contas para começar a controlar suas finanças."
              action="Adicionar Conta"
              onAction={() => setShowForm(true)}
            />
          </div>
        )}

        {regularAccounts.length > 0 && (
          <div>
            <SectionLabel label="Contas" />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {regularAccounts.map((acc, i) => <AccountRow key={acc.id} account={acc} index={i} />)}
            </div>
          </div>
        )}

        {investmentAccounts.length > 0 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <PiggyBank size={12} color={muted} />
              <p style={{ fontSize: "0.68rem", fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: "0.12em" }}>Investimentos</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {investmentAccounts.map((acc, i) => <AccountRow key={acc.id} account={acc} index={i} />)}
            </div>
          </div>
        )}

      </div>

      {/* FAB — teal */}
      {canManage && (
        <motion.button
          whileTap={{ scale: 0.88 }}
          whileHover={{ scale: 1.06 }}
          onClick={() => { setEditAccount(null); setShowForm(true); }}
          style={{ position: "fixed", bottom: 88, right: 20, width: 52, height: 52, background: "linear-gradient(135deg,#0891b2,#0e7490)", border: "none", borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 24px rgba(8,145,178,0.5),0 4px 14px rgba(0,0,0,0.25)", zIndex: 40 }}
        >
          <Plus size={21} color="#fff" />
        </motion.button>
      )}

      <AnimatePresence>
        {showForm && (
          <AccountForm
            account={editAccount}
            onSubmit={handleSubmit}
            onClose={() => { setShowForm(false); setEditAccount(null); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedAccount && (
          <AccountDetailModal
            account={selectedAccount}
            transactions={transactions}
            onClose={() => setSelectedAccount(null)}
            dark={dark}
          />
        )}
      </AnimatePresence>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate(deleteId)} style={{ background: "#dc2626", color: "#fff", border: "none" }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}