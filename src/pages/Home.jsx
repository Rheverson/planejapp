import React, { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useSharedProfile } from "@/lib/SharedProfileContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, TrendingUp, TrendingDown, Wallet, ChevronRight,
  ArrowLeftRight, PiggyBank, BarChart2, Eye, EyeOff
} from "lucide-react";
import { startOfMonth, endOfMonth, isWithinInterval, parseISO, format } from "date-fns";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import { useMonth } from "@/lib/MonthContext";
import { usePrivacy } from "@/lib/PrivacyContext";
import ReferralBanner from "@/components/referral/ReferralBanner";
import ReferralInviteModal from "@/components/referral/ReferralInviteModal";
import TransactionItem from "@/components/transactions/TransactionItem";
import TransactionForm from "@/components/transactions/TransactionForm";
import TransferForm from "@/components/transactions/TransferForm";
import MonthSelector from "@/components/common/MonthSelector";
import EmptyState from "@/components/common/EmptyState";
import FinancialScore from "@/components/financial/FinancialScore";
import CashFlowProjection from "@/components/financial/CashFlowProjection";
import MonthComparison from "@/components/financial/MonthComparison";
import BudgetManager from "@/components/financial/BudgetManager";

const fmt = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function useIsDark() {
  const [dark, setDark] = useState(() => localStorage.getItem("darkMode") === "true");
  useEffect(() => {
    const h = (e) => setDark(e.detail);
    window.addEventListener("darkModeChange", h);
    return () => window.removeEventListener("darkModeChange", h);
  }, []);
  return dark;
}

// ── Tailwind class → hex (cobre as classes mais comuns de cores) ──
const TAILWIND_TO_HEX = {
  "bg-slate-500":"#64748b","bg-slate-600":"#475569","bg-slate-700":"#334155",
  "bg-gray-500":"#6b7280","bg-gray-600":"#4b5563","bg-gray-700":"#374151",
  "bg-zinc-500":"#71717a","bg-zinc-600":"#52525b",
  "bg-red-400":"#f87171","bg-red-500":"#ef4444","bg-red-600":"#dc2626","bg-red-700":"#b91c1c",
  "bg-orange-400":"#fb923c","bg-orange-500":"#f97316","bg-orange-600":"#ea580c",
  "bg-amber-400":"#fbbf24","bg-amber-500":"#f59e0b","bg-amber-600":"#d97706",
  "bg-yellow-400":"#facc15","bg-yellow-500":"#eab308","bg-yellow-600":"#ca8a04",
  "bg-lime-500":"#84cc16","bg-lime-600":"#65a30d",
  "bg-green-400":"#4ade80","bg-green-500":"#22c55e","bg-green-600":"#16a34a","bg-green-700":"#15803d",
  "bg-emerald-400":"#34d399","bg-emerald-500":"#10b981","bg-emerald-600":"#059669","bg-emerald-700":"#047857",
  "bg-teal-500":"#14b8a6","bg-teal-600":"#0d9488","bg-teal-700":"#0f766e",
  "bg-cyan-500":"#06b6d4","bg-cyan-600":"#0891b2",
  "bg-sky-500":"#0ea5e9","bg-sky-600":"#0284c7","bg-sky-700":"#0369a1",
  "bg-blue-400":"#60a5fa","bg-blue-500":"#3b82f6","bg-blue-600":"#2563eb","bg-blue-700":"#1d4ed8","bg-blue-800":"#1e40af",
  "bg-indigo-400":"#818cf8","bg-indigo-500":"#6366f1","bg-indigo-600":"#4f46e5","bg-indigo-700":"#4338ca",
  "bg-violet-400":"#a78bfa","bg-violet-500":"#8b5cf6","bg-violet-600":"#7c3aed","bg-violet-700":"#6d28d9",
  "bg-purple-400":"#c084fc","bg-purple-500":"#a855f7","bg-purple-600":"#9333ea","bg-purple-700":"#7e22ce",
  "bg-fuchsia-500":"#d946ef","bg-fuchsia-600":"#c026d3",
  "bg-pink-400":"#f472b6","bg-pink-500":"#ec4899","bg-pink-600":"#db2777","bg-pink-700":"#be185d",
  "bg-rose-400":"#fb7185","bg-rose-500":"#f43f5e","bg-rose-600":"#e11d48",
};

// Paleta de fallback determinístico pelo nome
const FALLBACK_PALETTE = [
  "#1d4ed8","#7c3aed","#059669","#d97706","#dc2626",
  "#0891b2","#be185d","#15803d","#9333ea","#c2410c",
];

function getAccountColor(account) {
  const raw = account.color;

  // 1. Classe Tailwind (ex: "bg-pink-500")
  if (raw && TAILWIND_TO_HEX[raw.trim()]) return TAILWIND_TO_HEX[raw.trim()];

  // 2. Hex direto (ex: "#ec4899")
  if (raw && /^#[0-9A-Fa-f]{6}$/.test(raw.trim())) return raw.trim();

  // 3. Fallback determinístico pelo nome
  const name = account.name || "?";
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return FALLBACK_PALETTE[Math.abs(hash) % FALLBACK_PALETTE.length];
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return `${parseInt(h.substring(0,2),16)},${parseInt(h.substring(2,4),16)},${parseInt(h.substring(4,6),16)}`;
}

// ── KPI Card compacto ─────────────────────────────────────────
function KPICard({ title, value, color, subtitle, icon: Icon, hidden, to, dark }) {
  const palettes = {
    green:  { val: dark ? "#2ecc8a" : "#059669", tint: dark ? "rgba(46,204,138,0.12)"  : "rgba(5,150,105,0.09)"  },
    red:    { val: dark ? "#e85d5d" : "#dc2626", tint: dark ? "rgba(232,93,93,0.12)"   : "rgba(220,38,38,0.09)"  },
    blue:   { val: dark ? "#60a5fa" : "#1d4ed8", tint: dark ? "rgba(96,165,250,0.12)"  : "rgba(29,78,216,0.09)"  },
    violet: { val: dark ? "#a78bfa" : "#6d28d9", tint: dark ? "rgba(167,139,250,0.12)" : "rgba(109,40,217,0.09)" },
  };
  const c       = palettes[color] || palettes.blue;
  const cardBg  = dark ? "#0c0e13" : "#ffffff";
  const cardBrd = dark ? "rgba(255,255,255,0.07)" : "rgba(17,24,39,0.06)";
  const shadow  = dark ? "none" : "0 1px 3px rgba(17,24,39,0.04), 0 4px 12px rgba(17,24,39,0.05)";
  const muted   = dark ? "#6b7a96" : "#64748b";

  const inner = (
    <div style={{ background: cardBg, border: `1px solid ${cardBrd}`, borderRadius: 14, padding: "11px 12px", boxShadow: shadow, display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 32, height: 32, borderRadius: 9, background: c.tint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={15} color={c.val} />
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: "0.62rem", fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{title}</p>
        <p style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontSize: "1.05rem", fontWeight: 800, color: hidden ? (dark ? "#3a4259" : "#d1d5db") : c.val, letterSpacing: "-0.02em", lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {hidden ? "R$ ••••" : fmt(value)}
        </p>
        {subtitle && <p style={{ fontSize: "0.6rem", color: muted, marginTop: 1 }}>{subtitle}</p>}
      </div>
    </div>
  );
  if (to) return <Link to={to} style={{ textDecoration: "none" }}>{inner}</Link>;
  return inner;
}

// ── Account Card — inicial + cor exata do Tailwind salvo ──────
function AccountCard({ account, balance, hidden, dark }) {
  const userColor = getAccountColor(account);
  const rgb       = hexToRgb(userColor);
  const muted     = dark ? "#6b7a96" : "#64748b";
  const cardBg    = dark ? "#12151c" : "#ffffff";
  const cardBrd   = dark ? "rgba(255,255,255,0.05)" : "rgba(17,24,39,0.05)";
  const valColor  = balance < 0 ? (dark ? "#e85d5d" : "#dc2626") : (dark ? "#e8edf5" : "#0f172a");
  const letter    = (account.name || "?")[0].toUpperCase();

  return (
    <div style={{ minWidth: 100, flexShrink: 0, background: cardBg, border: `1px solid ${cardBrd}`, borderRadius: 12, padding: "10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, boxShadow: dark ? "none" : "0 1px 3px rgba(17,24,39,0.04)" }}>
      <div style={{ width: 38, height: 38, borderRadius: 11, background: userColor, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 10px rgba(${rgb},0.4)`, fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 900, fontSize: "1.05rem", color: "#ffffff", letterSpacing: "-0.02em" }}>
        {letter}
      </div>
      <p style={{ fontSize: "0.65rem", color: muted, textAlign: "center", lineHeight: 1.3 }}>{account.name}</p>
      <p style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontSize: "0.82rem", fontWeight: 700, color: hidden ? (dark ? "#3a4259" : "#d1d5db") : valColor }}>
        {hidden ? "••••" : fmt(balance)}
      </p>
    </div>
  );
}

export default function Home() {
  const dark = useIsDark();
  const { user } = useAuth();
  const { activeOwnerId, isViewingSharedProfile, sharedPermissions } = useSharedProfile();
  const canAdd = !isViewingSharedProfile || sharedPermissions?.add_transactions;
  const { selectedDate, setSelectedDate } = useMonth();
  const { hidden, toggle } = usePrivacy();
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [showTransferForm, setShowTransferForm]       = useState(false);
  const [initialType, setInitialType]                 = useState("expense");
  const queryClient = useQueryClient();
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [showReferralBanner, setShowReferralBanner] = useState(
    () => localStorage.getItem("referral_banner_dismissed") !== "true"
  );

  useEffect(() => {
    if (isViewingSharedProfile) return;
    const KEY = "last_referral_shown";
    const last = localStorage.getItem(KEY);
    const now = Date.now();
    if (!last || now - parseInt(last) > 2 * 60 * 60 * 1000) {
      const t = setTimeout(() => { setShowReferralModal(true); localStorage.setItem(KEY, now.toString()); }, 3000);
      return () => clearTimeout(t);
    }
  }, [isViewingSharedProfile]);

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", activeOwnerId],
    queryFn: async () => { const { data, error } = await supabase.from("accounts").select("*").eq("user_id", activeOwnerId).order("name"); if (error) throw error; return data; },
    enabled: !!activeOwnerId,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions", activeOwnerId],
    queryFn: async () => { const { data, error } = await supabase.from("transactions").select("*").eq("user_id", activeOwnerId).order("date", { ascending: false }); if (error) throw error; return data; },
    enabled: !!activeOwnerId,
  });

  const createTransactionMutation = useMutation({
    mutationFn: async (newTx) => { const { data, error } = await supabase.from("transactions").insert([{ ...newTx, user_id: activeOwnerId, amount: parseFloat(newTx.amount) }]).select(); if (error) throw error; return data; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["transactions"] }); queryClient.invalidateQueries({ queryKey: ["accounts"] }); setShowTransactionForm(false); toast.success("Transação adicionada!"); },
    onError: (err) => toast.error("Erro ao salvar: " + err.message),
  });

  const createTransferMutation = useMutation({
    mutationFn: async ({ fromAccountId, toAccountId, amount, date, description }) => { const { error } = await supabase.from("transactions").insert([{ description: description || "Transferência", amount: parseFloat(amount), type: "transfer", account_id: fromAccountId, transfer_account_id: toAccountId, date, is_realized: true, user_id: activeOwnerId }]); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["transactions"] }); setShowTransferForm(false); toast.success("Transferência realizada!"); },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  const monthStart = startOfMonth(selectedDate);
  const monthEnd   = endOfMonth(selectedDate);

  const monthTransactions = useMemo(() =>
    transactions.filter(t => t.type !== "transfer" && isWithinInterval(parseISO(t.date), { start: monthStart, end: monthEnd })),
    [transactions, monthStart, monthEnd]
  );

  const kpis = useMemo(() => {
    const invIds = new Set(accounts.filter(a => a.type === "investment").map(a => a.id));
    const tx = monthTransactions.filter(t => !invIds.has(t.account_id));
    const r  = tx.filter(t => t.is_realized !== false);
    const p  = tx.filter(t => t.is_realized === false);
    const ir = r.filter(t => t.type === "income").reduce((s,t)=>s+Number(t.amount),0);
    const ip = p.filter(t => t.type === "income").reduce((s,t)=>s+Number(t.amount),0);
    const er = r.filter(t => t.type === "expense").reduce((s,t)=>s+Number(t.amount),0);
    const ep = p.filter(t => t.type === "expense").reduce((s,t)=>s+Number(t.amount),0);
    return { totalIncome: ir+ip, totalExpense: er+ep, currentBalance: ir-er, forecastBalance: (ir+ip)-(er+ep) };
  }, [monthTransactions, accounts]);

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
  const totalBalance  = regularAccounts.reduce((s,a)=>s+(accountBalances[a.id]||0),0);
  const totalInvested = investmentAccounts.reduce((s,a)=>s+(accountBalances[a.id]||0),0);
  const expenseCount  = monthTransactions.filter(t=>t.type==="expense"&&t.is_realized!==false).length;
  const recentTx = monthTransactions.slice(0, 5);

  const bg      = dark ? "#060709" : "#f1f4f9";
  const cardBg  = dark ? "#0c0e13" : "#ffffff";
  const cardBrd = dark ? "rgba(255,255,255,0.07)" : "rgba(17,24,39,0.05)";
  const shadow  = dark ? "none" : "0 1px 3px rgba(17,24,39,0.04), 0 4px 12px rgba(17,24,39,0.05)";
  const text    = dark ? "#e8edf5" : "#0f172a";
  const muted   = dark ? "#6b7a96" : "#64748b";
  const linkCol = dark ? "#60a5fa" : "#1d4ed8";

  return (
    <div style={{ minHeight: "100vh", background: bg, paddingBottom: 96, fontFamily: "'Outfit',sans-serif" }}>

      {/* ══ HEADER ══════════════════════════════════════════════ */}
      <div style={{ position: "relative", isolation: "isolate", overflow: "hidden", borderRadius: "0 0 28px 28px", boxShadow: dark ? "0 8px 32px rgba(0,0,0,0.45)" : "0 8px 32px rgba(29,78,216,0.18)" }}>
        <div style={{ position: "absolute", inset: 0, background: dark ? "linear-gradient(160deg,#06080f 0%,#0a1425 40%,#0d1e3a 100%)" : "linear-gradient(165deg,#1d4ed8 0%,#1e3a8a 55%,#312e81 100%)" }} />
        <div style={{ position: "absolute", width: 380, height: 240, borderRadius: "50%", background: "rgba(96,165,250,0.16)", top: -80, left: "50%", transform: "translateX(-50%)", filter: "blur(60px)", pointerEvents: "none", zIndex: 0 }} />
        <div style={{ position: "absolute", width: 130, height: 130, borderRadius: "50%", background: "rgba(167,139,250,0.12)", bottom: 24, right: -10, filter: "blur(40px)", pointerEvents: "none", zIndex: 0 }} />

        <div style={{ position: "relative", zIndex: 1, padding: "52px 20px 0" }}>
          {isViewingSharedProfile && (
            <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 8, padding: "4px 12px", marginBottom: 12, fontSize: "0.72rem", color: "rgba(255,255,255,0.85)", display: "inline-block", fontWeight: 500 }}>
              👁 Visualizando perfil compartilhado
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
            <p style={{ fontSize: "0.62rem", fontWeight: 600, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.12em" }}>Saldo disponível</p>
            <button onClick={toggle} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 6, padding: "3px 7px", cursor: "pointer", display: "flex", alignItems: "center" }}>
              {hidden ? <EyeOff size={11} color="rgba(255,255,255,0.55)" /> : <Eye size={11} color="rgba(255,255,255,0.55)" />}
            </button>
          </div>
          <motion.p key={String(hidden)} initial={{ opacity:0,y:-4 }} animate={{ opacity:1,y:0 }}
            style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontSize: "clamp(2.1rem,8vw,3rem)", fontWeight: 900, color: "#ffffff", letterSpacing: "-0.04em", lineHeight: 1 }}>
            {hidden ? "R$ ••••••" : fmt(totalBalance)}
          </motion.p>
          {totalInvested > 0 && (
            <p style={{ fontSize: "0.73rem", color: "rgba(255,255,255,0.5)", marginTop: 7, display: "flex", alignItems: "center", gap: 5 }}>
              <PiggyBank size={13} />
              {hidden ? "+ R$ •••••• investido" : `+ ${fmt(totalInvested)} investido`}
            </p>
          )}
          <div style={{ height: "0.5px", background: "rgba(255,255,255,0.1)", margin: "14px 0 0" }} />
          <div style={{ padding: "6px 0" }}>
            <MonthSelector selectedDate={selectedDate} onChange={setSelectedDate} />
          </div>
        </div>

        {canAdd && (
          <div style={{ position: "relative", zIndex: 1, display: "flex", gap: 8, padding: "2px 20px 22px" }}>
            {[
              { label: "Entrada",    icon: TrendingUp,     action: () => { setInitialType("income");  setShowTransactionForm(true); } },
              { label: "Saída",      icon: TrendingDown,   action: () => { setInitialType("expense"); setShowTransactionForm(true); } },
              { label: "Transferir", icon: ArrowLeftRight, action: () => setShowTransferForm(true) },
            ].map(btn => (
              <motion.button key={btn.label} whileTap={{ scale:0.93 }} onClick={btn.action}
                style={{ flex: 1, background: "rgba(255,255,255,0.13)", border: "0.5px solid rgba(255,255,255,0.18)", borderRadius: 12, padding: "9px 4px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer", backdropFilter: "blur(8px)" }}>
                <btn.icon size={14} color="rgba(255,255,255,0.95)" />
                <span style={{ fontSize: "0.76rem", fontWeight: 600, color: "rgba(255,255,255,0.95)", fontFamily: "'Cabinet Grotesk',sans-serif", letterSpacing: "-0.01em" }}>{btn.label}</span>
              </motion.button>
            ))}
          </div>
        )}
      </div>

      {/* ══ CONTEÚDO ═══════════════════════════════════════════ */}
      <div style={{ padding: "14px 14px 0", display: "flex", flexDirection: "column", gap: 12 }}>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <KPICard title="Entradas"    value={kpis.totalIncome}     color="green"  icon={TrendingUp}   hidden={hidden} dark={dark} to={`/Transactions?filter=income&month=${format(selectedDate,"yyyy-MM")}`} />
          <KPICard title="Saídas"      value={kpis.totalExpense}    color="red"    icon={TrendingDown} hidden={hidden} dark={dark} to={`/Transactions?filter=expense&month=${format(selectedDate,"yyyy-MM")}`} />
          <KPICard title="Saldo Atual" value={kpis.currentBalance}  color={kpis.currentBalance  >= 0 ? "blue"   : "red"} icon={Wallet}    subtitle="Realizado"     hidden={hidden} dark={dark} to={`/Transactions?filter=realized&month=${format(selectedDate,"yyyy-MM")}`} />
          <KPICard title="Previsão"    value={kpis.forecastBalance} color={kpis.forecastBalance >= 0 ? "violet" : "red"} icon={PiggyBank} subtitle="Com planejado" hidden={hidden} dark={dark} to={`/Transactions?filter=planned&month=${format(selectedDate,"yyyy-MM")}`} />
        </div>

        <FinancialScore userId={activeOwnerId} selectedDate={selectedDate} />
        <CashFlowProjection transactions={transactions} accounts={accounts} currentBalance={totalBalance} />
        <MonthComparison transactions={transactions} accounts={accounts} selectedDate={selectedDate} />
        <BudgetManager transactions={transactions} accounts={accounts} selectedDate={selectedDate} />

        {showReferralBanner && !isViewingSharedProfile && (
          <ReferralBanner onOpen={() => setShowReferralModal(true)} onDismiss={() => { setShowReferralBanner(false); localStorage.setItem("referral_banner_dismissed","true"); }} />
        )}

        <motion.div initial={{ opacity:0,y:8 }} animate={{ opacity:1,y:0 }} transition={{ delay:0.1 }}>
          <Link to={createPageUrl("Reports")} style={{ textDecoration:"none" }}>
            <div style={{ background: cardBg, border: `1px solid ${cardBrd}`, borderRadius: 14, padding: "11px 14px", boxShadow: shadow, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: dark ? "rgba(37,99,235,0.12)" : "rgba(29,78,216,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <BarChart2 size={16} color={linkCol} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontSize: "0.88rem", fontWeight: 700, color: text, marginBottom: 1 }}>Ver Relatórios</p>
                <p style={{ fontSize: "0.68rem", color: muted }}>{expenseCount > 0 ? `${expenseCount} gastos este mês` : "Análise de gastos e metas"}</p>
              </div>
              <ChevronRight size={14} color={muted} />
            </div>
          </Link>
        </motion.div>

        {accounts.length > 0 && (
          <motion.div initial={{ opacity:0,y:8 }} animate={{ opacity:1,y:0 }} transition={{ delay:0.15 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
              <p style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontSize: "0.95rem", fontWeight: 800, color: text, letterSpacing: "-0.02em" }}>Minhas Contas</p>
              <Link to={createPageUrl("Accounts")} style={{ fontSize: "0.75rem", color: linkCol, fontWeight: 600, textDecoration: "none", display: "flex", alignItems: "center", gap: 2 }}>Ver todas <ChevronRight size={12} /></Link>
            </div>
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
              {regularAccounts.map(acc => <AccountCard key={acc.id} account={acc} balance={accountBalances[acc.id]||0} hidden={hidden} dark={dark} />)}
            </div>
            {investmentAccounts.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <p style={{ fontSize: "0.67rem", fontWeight: 600, color: muted, marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}><PiggyBank size={11} /> Investimentos</p>
                <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                  {investmentAccounts.map(acc => <AccountCard key={acc.id} account={acc} balance={accountBalances[acc.id]||0} hidden={hidden} dark={dark} />)}
                </div>
              </div>
            )}
          </motion.div>
        )}

        <motion.div initial={{ opacity:0,y:8 }} animate={{ opacity:1,y:0 }} transition={{ delay:0.2 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
            <p style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontSize: "0.95rem", fontWeight: 800, color: text, letterSpacing: "-0.02em" }}>Transações Recentes</p>
            <Link to={createPageUrl("Transactions")} style={{ fontSize: "0.75rem", color: linkCol, fontWeight: 600, textDecoration: "none", display: "flex", alignItems: "center", gap: 2 }}>Ver todas <ChevronRight size={12} /></Link>
          </div>
          <div style={{ background: cardBg, border: `1px solid ${cardBrd}`, borderRadius: 14, padding: "4px 14px", boxShadow: shadow }}>
            {recentTx.length > 0
              ? recentTx.map((t,i) => <TransactionItem key={t.id} transaction={t} delay={i*0.04} compact />)
              : <div style={{ padding:"8px 0" }}><EmptyState icon={Wallet} title="Nenhuma transação" description="Adicione sua primeira entrada ou saída." action="Adicionar" onAction={() => setShowTransactionForm(true)} /></div>
            }
          </div>
        </motion.div>

      </div>

      {canAdd && (
        <motion.button whileTap={{ scale:0.88 }} whileHover={{ scale:1.06 }} onClick={() => setShowTransactionForm(true)}
          style={{ position:"fixed", bottom:88, right:20, width:52, height:52, background:"linear-gradient(135deg,#1d4ed8,#3730a3)", border:"none", borderRadius:"50%", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 0 24px rgba(29,78,216,0.5),0 4px 14px rgba(0,0,0,0.25)", zIndex:40 }}>
          <Plus size={21} color="#fff" />
        </motion.button>
      )}

      <AnimatePresence>
        {showTransactionForm && <TransactionForm accounts={accounts} initialType={initialType} onSubmit={d=>createTransactionMutation.mutate(d)} onClose={()=>setShowTransactionForm(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {showTransferForm && <TransferForm accounts={accounts} onSubmit={d=>createTransferMutation.mutate(d)} onClose={()=>setShowTransferForm(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {showReferralModal && <ReferralInviteModal onClose={()=>setShowReferralModal(false)} />}
      </AnimatePresence>
    </div>
  );
}