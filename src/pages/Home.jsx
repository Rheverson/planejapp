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

const fmt = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

// ── Mini barra de progresso ──────────────────────────────────
function ProgressBar({ value, max, color }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const bgMap = { green: "#dcfce7", red: "#fee2e2", blue: "#dbeafe", violet: "#ede9fe" };
  const fgMap = { green: "#16a34a", red: "#dc2626", blue: "#1d4ed8", violet: "#7c3aed" };
  return (
    <div style={{ height: 3, background: bgMap[color] || "#f1f5f9", borderRadius: 2, marginTop: 8 }}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        style={{ height: 3, background: fgMap[color] || "#64748b", borderRadius: 2 }}
      />
    </div>
  );
}

// ── Card KPI compacto ─────────────────────────────────────────
function KPICardNew({ title, value, color, subtitle, bar, barMax, navigateTo, hidden }) {
  const textColors = {
    green: "#16a34a", red: "#dc2626", blue: "#1d4ed8", violet: "#7c3aed"
  };
  const content = (
    <div style={{
      background: "white",
      borderRadius: 14,
      padding: "12px 14px",
      border: "0.5px solid #e2e8f0",
    }} className="dark:bg-gray-800 dark:border-gray-700">
      <p style={{ fontSize: 10, fontWeight: 500, color: "#94a3b8", margin: "0 0 4px", letterSpacing: "0.3px" }}>
        {title.toUpperCase()}
      </p>
      <p style={{ fontSize: 18, fontWeight: 500, color: textColors[color] || "#1e293b", margin: 0 }}>
        {hidden ? "R$ ••••" : fmt(value)}
      </p>
      {subtitle && (
        <p style={{ fontSize: 10, color: "#94a3b8", margin: "2px 0 0" }}>{subtitle}</p>
      )}
      {bar && <ProgressBar value={value} max={barMax} color={color} />}
    </div>
  );
  if (navigateTo) return <Link to={navigateTo} style={{ textDecoration: "none" }}>{content}</Link>;
  return content;
}

// ── Card de conta compacto ───────────────────────────────────
function AccountCardNew({ account, balance, hidden }) {
  const iconColors = {
    bank: { bg: "#dbeafe", stroke: "#1d4ed8" },
    digital: { bg: "#ede9fe", stroke: "#7c3aed" },
    wallet: { bg: "#dcfce7", stroke: "#16a34a" },
    investment: { bg: "#fef3c7", stroke: "#d97706" },
  };
  const ic = iconColors[account.type] || { bg: "#f1f5f9", stroke: "#64748b" };
  return (
    <div style={{
      minWidth: 130, background: "#f8fafc", borderRadius: 10,
      padding: "10px 12px", border: "0.5px solid #e2e8f0", flexShrink: 0
    }} className="dark:bg-gray-700 dark:border-gray-600">
      <div style={{
        width: 28, height: 28, background: ic.bg, borderRadius: 7,
        display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 6
      }}>
        <Wallet style={{ width: 13, height: 13, color: ic.stroke }} />
      </div>
      <p style={{ fontSize: 10, color: "#94a3b8", margin: "0 0 2px" }}>{account.name}</p>
      <p style={{ fontSize: 13, fontWeight: 500, color: balance < 0 ? "#dc2626" : "#1e293b", margin: 0 }}
         className="dark:text-white">
        {hidden ? "R$ ••••" : fmt(balance)}
      </p>
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const { activeOwnerId, isViewingSharedProfile, sharedPermissions } = useSharedProfile();
  const canAdd = !isViewingSharedProfile || sharedPermissions?.add_transactions;
  const { selectedDate, setSelectedDate } = useMonth();
  const { hidden, toggle } = usePrivacy();
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [initialType, setInitialType] = useState("expense");
  const queryClient = useQueryClient();
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [showReferralBanner, setShowReferralBanner] = useState(
    () => localStorage.getItem("referral_banner_dismissed") !== "true"
  );

  useEffect(() => {
    if (isViewingSharedProfile) return;
    const INACTIVITY_KEY = "last_referral_shown";
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    const lastShown = localStorage.getItem(INACTIVITY_KEY);
    const now = Date.now();
    if (!lastShown || now - parseInt(lastShown) > TWO_HOURS) {
      const timer = setTimeout(() => {
        setShowReferralModal(true);
        localStorage.setItem(INACTIVITY_KEY, now.toString());
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isViewingSharedProfile]);

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", activeOwnerId],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("*").eq("user_id", activeOwnerId).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!activeOwnerId,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions", activeOwnerId],
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions").select("*").eq("user_id", activeOwnerId).order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!activeOwnerId,
  });

  const createTransactionMutation = useMutation({
    mutationFn: async (newTransaction) => {
      const { data, error } = await supabase.from("transactions").insert([{
        ...newTransaction, user_id: activeOwnerId, amount: parseFloat(newTransaction.amount),
      }]).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setShowTransactionForm(false);
      toast.success("Transação adicionada!");
    },
    onError: (err) => toast.error("Erro ao salvar: " + err.message),
  });

  const createTransferMutation = useMutation({
    mutationFn: async ({ fromAccountId, toAccountId, amount, date, description }) => {
      const { error } = await supabase.from("transactions").insert([{
        description: description || "Transferência",
        amount: parseFloat(amount),
        type: "transfer",
        account_id: fromAccountId,
        transfer_account_id: toAccountId,
        date,
        is_realized: true,
        user_id: activeOwnerId,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setShowTransferForm(false);
      toast.success("Transferência realizada!");
    },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);

  const monthTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (t.type === "transfer") return false;
      return isWithinInterval(parseISO(t.date), { start: monthStart, end: monthEnd });
    });
  }, [transactions, monthStart, monthEnd]);

  const kpis = useMemo(() => {
    const investmentAccountIds = new Set(accounts.filter((a) => a.type === "investment").map((a) => a.id));
    const nonInvestmentTx = monthTransactions.filter((t) => !investmentAccountIds.has(t.account_id));
    const realized = nonInvestmentTx.filter((t) => t.is_realized !== false);
    const planned = nonInvestmentTx.filter((t) => t.is_realized === false);
    const totalIncomeRealized  = realized.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
    const totalIncomePlanned   = planned.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
    const totalExpenseRealized = realized.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
    const totalExpensePlanned  = planned.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
    return {
      totalIncome:     totalIncomeRealized + totalIncomePlanned,
      totalExpense:    totalExpenseRealized + totalExpensePlanned,
      currentBalance:  totalIncomeRealized - totalExpenseRealized,
      forecastBalance: (totalIncomeRealized + totalIncomePlanned) - (totalExpenseRealized + totalExpensePlanned),
    };
  }, [monthTransactions, accounts]);

  const accountBalances = useMemo(() => {
    const balances = {};
    accounts.forEach((acc) => { balances[acc.id] = Number(acc.initial_balance) || 0; });
    transactions.forEach((t) => {
      if (t.is_realized === false) return;
      if (t.type === "income" && t.account_id) balances[t.account_id] = (balances[t.account_id] || 0) + Number(t.amount);
      else if (t.type === "expense" && t.account_id) balances[t.account_id] = (balances[t.account_id] || 0) - Number(t.amount);
      else if (t.type === "transfer") {
        if (t.account_id) balances[t.account_id] = (balances[t.account_id] || 0) - Number(t.amount);
        if (t.transfer_account_id) balances[t.transfer_account_id] = (balances[t.transfer_account_id] || 0) + Number(t.amount);
      }
    });
    return balances;
  }, [accounts, transactions]);

  const regularAccounts    = accounts.filter((a) => a.type !== "investment");
  const investmentAccounts = accounts.filter((a) => a.type === "investment");
  const totalBalance  = regularAccounts.reduce((s, a) => s + (accountBalances[a.id] || 0), 0);
  const totalInvested = investmentAccounts.reduce((s, a) => s + (accountBalances[a.id] || 0), 0);
  const expenseCount  = monthTransactions.filter((t) => t.type === "expense" && t.is_realized !== false).length;
  const savingsRate   = kpis.totalIncome > 0
    ? Math.max(0, (((kpis.totalIncome - kpis.totalExpense) / kpis.totalIncome) * 100)).toFixed(0)
    : null;
  const recentTransactions = monthTransactions.slice(0, 5);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24 transition-colors duration-200">

      {/* ── HEADER COMPACTO ─────────────────────────────────── */}
      <div className="bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 text-white">
        <div className="px-5 pt-12 pb-3">
          {isViewingSharedProfile && (
            <p className="text-blue-300 text-xs font-medium mb-2">👁 Visualizando perfil compartilhado</p>
          )}

          {/* Saldo + olho + perfil */}
          <div className="flex items-start justify-between mb-1">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <p className="text-blue-300 text-xs font-medium tracking-wide uppercase">Saldo disponível</p>
                <button onClick={toggle} className="p-0.5 rounded-full hover:bg-white/10 transition-colors">
                  {hidden
                    ? <EyeOff className="w-3 h-3 text-blue-300" />
                    : <Eye className="w-3 h-3 text-blue-300" />}
                </button>
              </div>
              <motion.p
                key={String(hidden)}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-3xl font-medium tracking-tight"
              >
                {hidden ? "R$ ••••••" : fmt(totalBalance)}
              </motion.p>
              {totalInvested > 0 && (
                <p className="text-blue-300 text-xs mt-1 flex items-center gap-1">
                  <PiggyBank className="w-3 h-3" />
                  {hidden ? "+ R$ •••••• investido" : `+ ${fmt(totalInvested)} investido`}
                </p>
              )}
            </div>
          </div>

          {/* Seletor de mês compacto */}
          <div className="mt-3">
            <MonthSelector selectedDate={selectedDate} onChange={setSelectedDate} />
          </div>
        </div>

        {/* Botões de ação */}
        {canAdd && (
          <div className="flex gap-2 px-5 py-3">
            {[
              { label: "Entrada", icon: TrendingUp, type: "income", action: () => { setInitialType("income"); setShowTransactionForm(true); } },
              { label: "Saída",   icon: TrendingDown, type: "expense", action: () => { setInitialType("expense"); setShowTransactionForm(true); } },
              { label: "Transferir", icon: ArrowLeftRight, type: "transfer", action: () => setShowTransferForm(true) },
            ].map((btn) => (
              <motion.button
                key={btn.label}
                whileTap={{ scale: 0.94 }}
                onClick={btn.action}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-white/10 hover:bg-white/15 backdrop-blur-sm rounded-xl text-white text-xs font-medium border border-white/15 transition-colors"
              >
                <btn.icon className="w-3.5 h-3.5" />
                {btn.label}
              </motion.button>
            ))}
          </div>
        )}
      </div>

      {/* ── CONTEÚDO ─────────────────────────────────────────── */}
      <div className="px-4 pt-4 space-y-3">

        {/* KPIs 2x2 */}
        <div className="grid grid-cols-2 gap-2.5">
          <KPICardNew
            title="Entradas" value={kpis.totalIncome} color="green"
            bar barMax={kpis.totalIncome} hidden={hidden}
            navigateTo={`/Transactions?filter=income&month=${format(selectedDate, "yyyy-MM")}`}
          />
          <KPICardNew
            title="Saídas" value={kpis.totalExpense} color="red"
            bar barMax={kpis.totalIncome} hidden={hidden}
            navigateTo={`/Transactions?filter=expense&month=${format(selectedDate, "yyyy-MM")}`}
          />
          <KPICardNew
            title="Saldo Atual" value={kpis.currentBalance}
            color={kpis.currentBalance >= 0 ? "blue" : "red"}
            subtitle="Realizado" hidden={hidden}
            navigateTo={`/Transactions?filter=realized&month=${format(selectedDate, "yyyy-MM")}`}
          />
          <KPICardNew
            title="Previsão" value={kpis.forecastBalance}
            color={kpis.forecastBalance >= 0 ? "violet" : "red"}
            subtitle="Com planejado" hidden={hidden}
            navigateTo={`/Transactions?filter=planned&month=${format(selectedDate, "yyyy-MM")}`}
          />
        </div>

        {/* Banner indicação */}
        {showReferralBanner && !isViewingSharedProfile && (
          <ReferralBanner
            onOpen={() => setShowReferralModal(true)}
            onDismiss={() => {
              setShowReferralBanner(false);
              localStorage.setItem("referral_banner_dismissed", "true");
            }}
          />
        )}

        {/* Relatórios */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Link to={createPageUrl("Reports")} style={{ textDecoration: "none" }}>
            <div className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-2xl px-4 py-3 border border-gray-100 dark:border-gray-700">
              <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                <BarChart2 className="w-4 h-4 text-slate-500 dark:text-slate-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white">Ver Relatórios</p>
                <p className="text-xs text-gray-400 truncate">
                  {expenseCount > 0
                    ? `${expenseCount} gastos${savingsRate !== null ? ` · ${savingsRate}% poupado` : ""} este mês`
                    : "Análise de gastos e metas"}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
            </div>
          </Link>
        </motion.div>

        {/* Contas */}
        {accounts.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="bg-white dark:bg-gray-800 rounded-2xl px-4 py-3 border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-gray-900 dark:text-white">Minhas contas</p>
              <Link to={createPageUrl("Accounts")} className="text-xs text-blue-600 font-medium flex items-center gap-0.5">
                Ver todas <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {regularAccounts.map((acc) => (
                <AccountCardNew key={acc.id} account={acc} balance={accountBalances[acc.id] || 0} hidden={hidden} />
              ))}
            </div>
            {investmentAccounts.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-2 flex items-center gap-1">
                  <PiggyBank className="w-3 h-3" /> Investimentos
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                  {investmentAccounts.map((acc) => (
                    <AccountCardNew key={acc.id} account={acc} balance={accountBalances[acc.id] || 0} hidden={hidden} />
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Transações recentes */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="bg-white dark:bg-gray-800 rounded-2xl px-4 py-3 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-900 dark:text-white">Transações recentes</p>
            <Link to={createPageUrl("Transactions")} className="text-xs text-blue-600 font-medium flex items-center gap-0.5">
              Ver todas <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {recentTransactions.length > 0 ? (
            <div className="space-y-1">
              {recentTransactions.map((transaction, index) => (
                <TransactionItem key={transaction.id} transaction={transaction} delay={index * 0.04} compact />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Wallet}
              title="Nenhuma transação"
              description="Adicione sua primeira entrada ou saída."
              action="Adicionar"
              onAction={() => setShowTransactionForm(true)}
            />
          )}
        </motion.div>

      </div>

      {/* FAB */}
      {canAdd && (
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowTransactionForm(true)}
          className="fixed bottom-24 right-5 w-13 h-13 bg-blue-700 text-white rounded-full shadow-lg shadow-blue-700/30 flex items-center justify-center z-40"
          style={{ width: 52, height: 52 }}
        >
          <Plus className="w-5 h-5" />
        </motion.button>
      )}

      <AnimatePresence>
        {showTransactionForm && (
          <TransactionForm
            accounts={accounts}
            initialType={initialType}
            onSubmit={(data) => createTransactionMutation.mutate(data)}
            onClose={() => setShowTransactionForm(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTransferForm && (
          <TransferForm
            accounts={accounts}
            onSubmit={(data) => createTransferMutation.mutate(data)}
            onClose={() => setShowTransferForm(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showReferralModal && (
          <ReferralInviteModal onClose={() => setShowReferralModal(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}