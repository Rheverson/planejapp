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

// ── KPI Card ─────────────────────────────────────────────────
// Light: white card + shadow + colored accent on left
// Dark:  tinted card + colored border
function KPICard({ title, value, color, subtitle, hidden, to, dark }) {
  const palettes = {
    green:  { val: dark ? "#2ecc8a" : "#059669", bar: dark ? "rgba(46,204,138,0.5)"  : "#10b981", tint: "rgba(46,204,138,0.06)"  },
    red:    { val: dark ? "#e85d5d" : "#dc2626", bar: dark ? "rgba(232,93,93,0.5)"   : "#ef4444", tint: "rgba(232,93,93,0.06)"   },
    blue:   { val: dark ? "#60a5fa" : "#1d4ed8", bar: dark ? "rgba(96,165,250,0.5)"  : "#2563eb", tint: "rgba(37,99,235,0.08)"   },
    violet: { val: dark ? "#a78bfa" : "#6d28d9", bar: dark ? "rgba(167,139,250,0.5)" : "#8b5cf6", tint: "rgba(124,58,237,0.08)"  },
  };
  const c = palettes[color] || palettes.blue;

  const inner = (
    <div style={{
      background: dark ? c.tint : "#ffffff",
      border: dark ? `1px solid ${c.bar.replace('0.5','0.2')}` : "1px solid rgba(17,24,39,0.04)",
      borderRadius: 16,
      padding: "14px 14px 14px 18px",
      position: "relative",
      overflow: "hidden",
      boxShadow: dark ? "none" : "0 1px 2px rgba(17,24,39,0.03), 0 4px 16px rgba(17,24,39,0.04)",
      transition: "transform .15s, box-shadow .2s",
    }}>
      {/* Accent bar vertical à esquerda — só modo claro */}
      {!dark && (
        <div style={{
          position: "absolute", left: 0, top: 12, bottom: 12, width: 3,
          background: c.bar, borderRadius: "0 2px 2px 0",
        }} />
      )}

      <p style={{
        fontSize: "0.62rem", fontWeight: 600,
        color: dark ? "#6b7a96" : "#9ca3af",
        textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6,
      }}>
        {title}
      </p>
      <p style={{
        fontFamily: "'Cabinet Grotesk', sans-serif",
        fontSize: "1.35rem", fontWeight: 800,
        color: hidden ? (dark ? "#3a4259" : "#d1d5db") : c.val,
        letterSpacing: "-0.025em", lineHeight: 1.1,
      }}>
        {hidden ? "R$ ••••" : fmt(value)}
      </p>
      {subtitle && (
        <p style={{ fontSize: "0.62rem", color: dark ? "#6b7a96" : "#9ca3af", marginTop: 4 }}>
          {subtitle}
        </p>
      )}
    </div>
  );
  if (to) return <Link to={to} style={{ textDecoration: "none" }}>{inner}</Link>;
  return inner;
}

// ── Account Card ─────────────────────────────────────────────
function AccountCard({ account, balance, hidden, dark }) {
  const types = {
    bank:       { emoji: "🏦", lightC: "#1d4ed8", darkC: "#60a5fa", tint: "rgba(37,99,235,0.08)"  },
    digital:    { emoji: "💳", lightC: "#7c3aed", darkC: "#a78bfa", tint: "rgba(124,58,237,0.08)" },
    wallet:     { emoji: "💵", lightC: "#16a34a", darkC: "#2ecc8a", tint: "rgba(22,163,74,0.08)"  },
    investment: { emoji: "📈", lightC: "#d97706", darkC: "#fbbf24", tint: "rgba(217,119,6,0.08)"  },
  };
  const s = types[account.type] || types.bank;
  const valColor = balance < 0 ? (dark ? "#e85d5d" : "#dc2626") : (dark ? s.darkC : s.lightC);

  return (
    <div style={{
      minWidth: 118, flexShrink: 0,
      background: dark ? "#12151c" : "#ffffff",
      border: `1px solid ${dark ? "rgba(255,255,255,0.05)" : "rgba(17,24,39,0.05)"}`,
      borderRadius: 12, padding: "10px 12px",
      boxShadow: dark ? "none" : "0 1px 2px rgba(17,24,39,0.03)",
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: 8,
        background: s.tint,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, marginBottom: 6,
      }}>
        {s.emoji}
      </div>
      <p style={{ fontSize: "0.62rem", color: dark ? "#6b7a96" : "#9ca3af", marginBottom: 2 }}>{account.name}</p>
      <p style={{
        fontFamily: "'Cabinet Grotesk', sans-serif",
        fontSize: "0.88rem", fontWeight: 700,
        color: hidden ? (dark ? "#3a4259" : "#d1d5db") : valColor,
      }}>
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

  // Calcula saldos das contas ANTES do kpis para poder usar totalBalance na previsão
  const accountBalances = useMemo(() => {
    const b = {};
    accounts.forEach(a => { b[a.id] = Number(a.initial_balance) || 0; });
    transactions.forEach(t => {
      if (t.is_realized === false) return;
      if (t.type === "income" && t.account_id)    b[t.account_id] = (b[t.account_id]||0) + Number(t.amount);
      else if (t.type === "expense" && t.account_id) b[t.account_id] = (b[t.account_id]||0) - Number(t.amount);
      else if (t.type === "transfer") {
        if (t.account_id)          b[t.account_id]          = (b[t.account_id]||0)          - Number(t.amount);
        if (t.transfer_account_id) b[t.transfer_account_id] = (b[t.transfer_account_id]||0) + Number(t.amount);
      }
    });
    return b;
  }, [accounts, transactions]);

  const regularAccounts    = accounts.filter(a => a.type !== "investment");
  const investmentAccounts = accounts.filter(a => a.type === "investment");
  // totalBalance = saldo real atual de todas as contas não-investimento
  const totalBalance  = regularAccounts.reduce((s,a)=>s+(accountBalances[a.id]||0),0);
  const totalInvested = investmentAccounts.reduce((s,a)=>s+(accountBalances[a.id]||0),0);

  const kpis = useMemo(() => {
    const invIds = new Set(accounts.filter(a => a.type === "investment").map(a => a.id));
    const tx = monthTransactions.filter(t => !invIds.has(t.account_id));
    const r  = tx.filter(t => t.is_realized !== false);
    const p  = tx.filter(t => t.is_realized === false);
    const ir = r.filter(t => t.type === "income").reduce((s,t)=>s+Number(t.amount),0);
    const ip = p.filter(t => t.type === "income").reduce((s,t)=>s+Number(t.amount),0);
    const er = r.filter(t => t.type === "expense").reduce((s,t)=>s+Number(t.amount),0);
    const ep = p.filter(t => t.type === "expense").reduce((s,t)=>s+Number(t.amount),0);

    // Mês atual: Previsão = saldo real das contas hoje + entradas previstas - despesas previstas
    // Outros meses: net do mês (realizado + planejado)
    const today = new Date();
    const isCurrentMonth = selectedDate.getMonth() === today.getMonth() &&
                           selectedDate.getFullYear() === today.getFullYear();

    const forecastBalance = isCurrentMonth
      ? totalBalance + ip - ep   // usa o totalBalance já calculado acima
      : (ir + ip) - (er + ep);

    return { totalIncome: ir+ip, totalExpense: er+ep, currentBalance: ir-er, forecastBalance };
  }, [monthTransactions, accounts, selectedDate, totalBalance]);
  const expenseCount  = monthTransactions.filter(t=>t.type==="expense"&&t.is_realized!==false).length;
  const recentTx = monthTransactions.slice(0, 5);

  // Tokens
  const bg       = dark ? "#060709" : "#f7f8fa";
  const cardBg   = dark ? "#0c0e13" : "#ffffff";
  const cardBrd  = dark ? "rgba(255,255,255,0.07)" : "rgba(17,24,39,0.05)";
  const shadow   = dark ? "none" : "0 1px 2px rgba(17,24,39,0.03), 0 4px 16px rgba(17,24,39,0.04)";
  const text     = dark ? "#e8edf5" : "#0f172a";
  const muted    = dark ? "#6b7a96" : "#64748b";
  const linkCol  = dark ? "#60a5fa" : "#2563eb";
  const subBg    = dark ? "#12151c" : "#f8fafc";

  return (
    <div style={{ minHeight: "100vh", background: bg, paddingBottom: 96, fontFamily: "'Outfit', sans-serif" }}>

      {/* ── HEADER ──────────────────────────────────────────── */}
      <div style={{ position: "relative", overflow: "hidden" }}>

        {/* Fundo do header */}
        <div style={{
          position: "absolute", inset: 0,
          background: dark
            ? "linear-gradient(160deg, #06080f 0%, #0a1628 40%, #0d1f3c 100%)"
            : "linear-gradient(165deg, #0f172a 0%, #1e3a8a 50%, #1e40af 100%)",
        }} />

        {/* Orb de luz azul — intensidade menor no claro */}
        <div style={{
          position: "absolute", width: 360, height: 220, borderRadius: "50%",
          background: dark ? "rgba(37,99,235,0.22)" : "rgba(96,165,250,0.18)",
          top: -70, left: "50%", transform: "translateX(-50%)",
          filter: "blur(80px)", pointerEvents: "none",
        }} />

        {/* Orb secundário */}
        <div style={{
          position: "absolute", width: 220, height: 220, borderRadius: "50%",
          background: dark ? "rgba(96,165,250,0.08)" : "rgba(167,139,250,0.12)",
          bottom: -70, right: -50, filter: "blur(60px)", pointerEvents: "none",
        }} />

        <div style={{ position: "relative", padding: "56px 20px 0" }}>
          {isViewingSharedProfile && (
            <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 8, padding: "5px 12px", marginBottom: 12, fontSize: "0.72rem", color: "rgba(255,255,255,0.85)", display: "inline-block" }}>
              👁 Visualizando perfil compartilhado
            </div>
          )}

          <div style={{ marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <p style={{ fontSize: "0.62rem", fontWeight: 600, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                Saldo em conta
              </p>
              <button onClick={toggle} style={{
                background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 6,
                padding: "3px 7px", cursor: "pointer", display: "flex", alignItems: "center",
              }}>
                {hidden ? <EyeOff size={11} color="rgba(255,255,255,0.55)" /> : <Eye size={11} color="rgba(255,255,255,0.55)" />}
              </button>
            </div>

            <motion.p key={String(hidden)} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              style={{
                fontFamily: "'Cabinet Grotesk', sans-serif",
                fontSize: "clamp(2.2rem, 8vw, 3rem)",
                fontWeight: 900, color: "#ffffff",
                letterSpacing: "-0.035em", lineHeight: 1,
              }}>
              {hidden ? "R$ ••••••" : fmt(totalBalance)}
            </motion.p>

            {totalInvested > 0 && (
              <p style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.5)", marginTop: 8, display: "flex", alignItems: "center", gap: 5 }}>
                <PiggyBank size={12} />
                {hidden ? "+ R$ •••••• guardado" : `+ ${fmt(totalInvested)} guardado`}
              </p>
            )}
          </div>

          <div style={{ height: "0.5px", background: "rgba(255,255,255,0.1)", margin: "14px 0 0" }} />

          <div style={{ padding: "8px 0 0" }}>
            <MonthSelector selectedDate={selectedDate} onChange={setSelectedDate} />
          </div>
        </div>

        {/* Botões de ação */}
        {canAdd && (
          <div style={{ display: "flex", gap: 8, padding: "10px 20px 20px" }}>
            {[
              { label: "Entrada",    icon: TrendingUp,     action: () => { setInitialType("income");  setShowTransactionForm(true); } },
              { label: "Saída",      icon: TrendingDown,   action: () => { setInitialType("expense"); setShowTransactionForm(true); } },
              { label: "Transferir", icon: ArrowLeftRight, action: () => setShowTransferForm(true) },
            ].map(btn => (
              <motion.button key={btn.label} whileTap={{ scale: 0.93 }} onClick={btn.action}
                style={{
                  flex: 1, background: "rgba(255,255,255,0.1)",
                  border: "0.5px solid rgba(255,255,255,0.15)",
                  borderRadius: 12, padding: "10px 4px",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                  cursor: "pointer", backdropFilter: "blur(8px)",
                }}>
                <btn.icon size={14} color="rgba(255,255,255,0.9)" />
                <span style={{ fontSize: "0.68rem", fontWeight: 600, color: "rgba(255,255,255,0.9)", fontFamily: "'Cabinet Grotesk', sans-serif" }}>
                  {btn.label}
                </span>
              </motion.button>
            ))}
          </div>
        )}
      </div>

      {/* ── CONTEÚDO ──────────────────────────────────────── */}
      <div style={{ padding: "14px 14px 0", display: "flex", flexDirection: "column", gap: 10 }}>

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <KPICard title="Entradas"    value={kpis.totalIncome}    color="green"  hidden={hidden} dark={dark} to={`/Transactions?filter=income&month=${format(selectedDate,"yyyy-MM")}`} />
          <KPICard title="Saídas"      value={kpis.totalExpense}   color="red"    hidden={hidden} dark={dark} to={`/Transactions?filter=expense&month=${format(selectedDate,"yyyy-MM")}`} />
          <KPICard title="Resultado do Mês" value={kpis.currentBalance} color={kpis.currentBalance>=0?"blue":"red"}   subtitle="Mês atual"     hidden={hidden} dark={dark} to={`/Transactions?filter=realized&month=${format(selectedDate,"yyyy-MM")}`} />
          <KPICard title="Projeção Final do Mês"    value={kpis.forecastBalance} color={kpis.forecastBalance>=0?"violet":"red"} subtitle="Mês completo" hidden={hidden} dark={dark} to={`/Transactions?filter=planned&month=${format(selectedDate,"yyyy-MM")}`} />
        </div>

        {/* Score financeiro */}
        <FinancialScore userId={activeOwnerId} selectedDate={selectedDate} />

        {/* Projeção */}
        <CashFlowProjection transactions={transactions} accounts={accounts} currentBalance={totalBalance} />

        {/* Comparativo */}
        <MonthComparison transactions={transactions} accounts={accounts} selectedDate={selectedDate} />

        {/* Orçamentos */}
        <BudgetManager transactions={transactions} accounts={accounts} selectedDate={selectedDate} />

        {/* Banner referral */}
        {showReferralBanner && !isViewingSharedProfile && (
          <ReferralBanner onOpen={() => setShowReferralModal(true)}
            onDismiss={() => { setShowReferralBanner(false); localStorage.setItem("referral_banner_dismissed","true"); }} />
        )}

        {/* Relatórios */}
        <motion.div initial={{ opacity:0,y:8 }} animate={{ opacity:1,y:0 }} transition={{ delay:0.1 }}>
          <Link to={createPageUrl("Reports")} style={{ textDecoration:"none" }}>
            <div style={{
              background: cardBg, border: `1px solid ${cardBrd}`,
              borderRadius: 16, padding: "13px 16px",
              boxShadow: shadow,
              display: "flex", alignItems: "center", gap: 12,
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 11,
                background: dark ? "rgba(37,99,235,0.12)" : "rgba(37,99,235,0.08)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <BarChart2 size={16} color={linkCol} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontSize: "0.88rem", fontWeight: 700, color: text, marginBottom: 2 }}>Ver Relatórios</p>
                <p style={{ fontSize: "0.7rem", color: muted }}>
                  {expenseCount > 0 ? `${expenseCount} gastos este mês` : "Análise de gastos e metas"}
                </p>
              </div>
              <ChevronRight size={14} color={muted} />
            </div>
          </Link>
        </motion.div>

        {/* Contas */}
        {accounts.length > 0 && (
          <motion.div initial={{ opacity:0,y:8 }} animate={{ opacity:1,y:0 }} transition={{ delay:0.15 }}
            style={{ background: cardBg, border: `1px solid ${cardBrd}`, borderRadius: 16, padding: "14px 16px", boxShadow: shadow }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: 12 }}>
              <p style={{ fontFamily:"'Cabinet Grotesk',sans-serif", fontSize:"0.88rem", fontWeight:700, color:text }}>Minhas contas</p>
              <Link to={createPageUrl("Accounts")} style={{ fontSize:"0.7rem", color:linkCol, fontWeight:600, textDecoration:"none", display:"flex", alignItems:"center", gap:2 }}>
                Ver todas <ChevronRight size={12} />
              </Link>
            </div>
            <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4 }}>
              {regularAccounts.map(acc => <AccountCard key={acc.id} account={acc} balance={accountBalances[acc.id]||0} hidden={hidden} dark={dark} />)}
            </div>
            {investmentAccounts.length > 0 && (
              <div style={{ marginTop:12 }}>
                <p style={{ fontSize:"0.62rem", fontWeight:600, color:muted, marginBottom:8, display:"flex", alignItems:"center", gap:5 }}>
                  <PiggyBank size={11} /> Guardado / Investimentos
                </p>
                <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4 }}>
                  {investmentAccounts.map(acc => <AccountCard key={acc.id} account={acc} balance={accountBalances[acc.id]||0} hidden={hidden} dark={dark} />)}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Transações recentes */}
        <motion.div initial={{ opacity:0,y:8 }} animate={{ opacity:1,y:0 }} transition={{ delay:0.2 }}
          style={{ background: cardBg, border: `1px solid ${cardBrd}`, borderRadius: 16, padding: "14px 16px", boxShadow: shadow }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
            <p style={{ fontFamily:"'Cabinet Grotesk',sans-serif", fontSize:"0.88rem", fontWeight:700, color:text }}>Transações recentes</p>
            <Link to={createPageUrl("Transactions")} style={{ fontSize:"0.7rem", color:linkCol, fontWeight:600, textDecoration:"none", display:"flex", alignItems:"center", gap:2 }}>
              Ver todas <ChevronRight size={12} />
            </Link>
          </div>
          {recentTx.length > 0 ? (
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              {recentTx.map((t,i) => <TransactionItem key={t.id} transaction={t} delay={i*0.04} compact />)}
            </div>
          ) : (
            <EmptyState icon={Wallet} title="Nenhuma transação" description="Adicione sua primeira entrada ou saída." action="Adicionar" onAction={() => setShowTransactionForm(true)} />
          )}
        </motion.div>
      </div>

      {/* FAB */}
      {canAdd && (
        <motion.button whileTap={{ scale:0.88 }} whileHover={{ scale:1.06 }}
          onClick={() => setShowTransactionForm(true)}
          style={{
            position:"fixed", bottom:88, right:20,
            width:52, height:52,
            background:"linear-gradient(135deg,#1d4ed8,#3730a3)",
            border:"none", borderRadius:"50%", cursor:"pointer",
            display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow:"0 0 28px rgba(29,78,216,0.5), 0 4px 16px rgba(0,0,0,0.3)",
            zIndex:40,
          }}>
          <Plus size={20} color="#fff" />
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