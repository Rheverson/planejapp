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
  const bgClass = { green: "bg-green-100 dark:bg-green-900/30", red: "bg-red-100 dark:bg-red-900/30", blue: "bg-blue-100 dark:bg-blue-900/30", violet: "bg-violet-100 dark:bg-violet-900/30" };
  const fgClass = { green: "bg-green-500", red: "bg-red-500", blue: "bg-blue-600", violet: "bg-violet-500" };
  return (
    <div className={`h-0.5 rounded-full mt-2 ${bgClass[color] || "bg-gray-100 dark:bg-gray-700"}`}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className={`h-0.5 rounded-full ${fgClass[color] || "bg-gray-400"}`}
      />
    </div>
  );
}

// ── Card KPI compacto ─────────────────────────────────────────
function KPICardNew({ title, value, color, subtitle, bar, barMax, navigateTo, hidden }) {
  const textClass = {
    green: "text-green-600 dark:text-green-400",
    red: "text-red-600 dark:text-red-400",
    blue: "text-blue-700 dark:text-blue-400",
    violet: "text-violet-600 dark:text-violet-400"
  };
  const content = (
    <div className="bg-white dark:bg-gray-800 rounded-2xl px-3.5 py-3 border border-gray-100 dark:border-gray-700">
      <p className="text-[10px] font-medium text-gray-400 dark:text-gray-500 mb-1 tracking-wide">
        {title.toUpperCase()}
      </p>
      <p className={`text-lg font-medium ${textClass[color] || "text-gray-900 dark:text-white"}`}>
        {hidden ? "R$ ••••" : fmt(value)}
      </p>
      {subtitle && (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{subtitle}</p>
      )}
      {bar && <ProgressBar value={value} max={barMax} color={color} />}
    </div>
  );
  if (navigateTo) return <Link to={navigateTo} className="no-underline">{content}</Link>;
  return content;
}

// ── Card de conta compacto ───────────────────────────────────
function AccountCardNew({ account, balance, hidden }) {
  const iconColors = {
    bank:       { bg: "bg-blue-100 dark:bg-blue-900/30",   icon: "text-blue-600 dark:text-blue-400"   },
    digital:    { bg: "bg-violet-100 dark:bg-violet-900/30", icon: "text-violet-600 dark:text-violet-400" },
    wallet:     { bg: "bg-green-100 dark:bg-green-900/30", icon: "text-green-600 dark:text-green-400" },
    investment: { bg: "bg-amber-100 dark:bg-amber-900/30", icon: "text-amber-600 dark:text-amber-400" },
  };
  const ic = iconColors[account.type] || { bg: "bg-gray-100 dark:bg-gray-700", icon: "text-gray-500" };
  return (
    <div className="min-w-[130px] flex-shrink-0 bg-gray-50 dark:bg-gray-700/60 rounded-xl px-3 py-2.5 border border-gray-100 dark:border-gray-600">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center mb-1.5 ${ic.bg}`}>
        <Wallet className={`w-3.5 h-3.5 ${ic.icon}`} />
      </div>
      <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-0.5">{account.name}</p>
      <p className={`text-sm font-medium ${balance < 0 ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white"}`}>
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