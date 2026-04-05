import React, { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useSharedProfile } from "@/lib/SharedProfileContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, TrendingUp, TrendingDown, Wallet, ChevronRight, ArrowLeftRight, PiggyBank, BarChart2, Eye, EyeOff } from "lucide-react";
import { startOfMonth, endOfMonth, isWithinInterval, parseISO, format } from "date-fns";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import { useMonth } from "@/lib/MonthContext";
import { usePrivacy } from "@/lib/PrivacyContext";
import ReferralBanner from "@/components/referral/ReferralBanner";
import ReferralInviteModal from "@/components/referral/ReferralInviteModal";

import KPICard from "@/components/dashboard/KPICard";
import AccountCard from "@/components/dashboard/AccountCard";
import TransactionItem from "@/components/transactions/TransactionItem";
import TransactionForm from "@/components/transactions/TransactionForm";
import TransferForm from "@/components/transactions/TransferForm";
import MonthSelector from "@/components/common/MonthSelector";
import EmptyState from "@/components/common/EmptyState";

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
    () => localStorage.getItem('referral_banner_dismissed') !== 'true'
  );

  // Modal de inatividade — aparece 3s após abrir o app se passou 2h
  useEffect(() => {
    if (isViewingSharedProfile) return;
    const INACTIVITY_KEY = 'last_referral_shown';
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
    queryKey: ['accounts', activeOwnerId],
    queryFn: async () => {
      const { data, error } = await supabase.from('accounts').select('*').eq('user_id', activeOwnerId).order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!activeOwnerId
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions', activeOwnerId],
    queryFn: async () => {
      const { data, error } = await supabase.from('transactions').select('*').eq('user_id', activeOwnerId).order('date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!activeOwnerId
  });

  const createTransactionMutation = useMutation({
    mutationFn: async (newTransaction) => {
      const { data, error } = await supabase.from('transactions').insert([{
        ...newTransaction, user_id: activeOwnerId, amount: parseFloat(newTransaction.amount)
      }]).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setShowTransactionForm(false);
      toast.success('Transação adicionada!');
    },
    onError: (err) => toast.error('Erro ao salvar: ' + err.message)
  });

  const createTransferMutation = useMutation({
    mutationFn: async ({ fromAccountId, toAccountId, amount, date, description }) => {
      const pairId = crypto.randomUUID();
      const { error } = await supabase.from('transactions').insert([
        { description: description || 'Transferência', amount: parseFloat(amount), type: 'transfer', account_id: fromAccountId, transfer_account_id: toAccountId, transfer_pair_id: pairId, date, is_realized: true, user_id: activeOwnerId },
        { description: description || 'Transferência', amount: parseFloat(amount), type: 'transfer', account_id: toAccountId, transfer_account_id: fromAccountId, transfer_pair_id: pairId, date, is_realized: true, user_id: activeOwnerId }
      ]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setShowTransferForm(false);
      toast.success('Transferência realizada!');
    },
    onError: (err) => toast.error('Erro: ' + err.message)
  });

  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);

  const monthTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (t.type === 'transfer') return false;
      return isWithinInterval(parseISO(t.date), { start: monthStart, end: monthEnd });
    });
  }, [transactions, monthStart, monthEnd]);

  const kpis = useMemo(() => {
    const realized = monthTransactions.filter(t => t.is_realized !== false);
    const planned = monthTransactions.filter(t => t.is_realized === false);
    const totalIncomeRealized = realized.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalIncomePlanned = planned.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalExpenseRealized = realized.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const totalExpensePlanned = planned.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    return {
      totalIncome: totalIncomeRealized + totalIncomePlanned,
      totalExpense: totalExpenseRealized + totalExpensePlanned,
      currentBalance: totalIncomeRealized - totalExpenseRealized,
      forecastBalance: (totalIncomeRealized + totalIncomePlanned) - (totalExpenseRealized + totalExpensePlanned)
    };
  }, [monthTransactions]);

  const accountBalances = useMemo(() => {
    const balances = {};
    accounts.forEach(acc => { balances[acc.id] = acc.initial_balance || 0; });
    transactions.forEach(t => {
      if (!t.account_id || t.is_realized === false) return;
      if (t.type === 'income') balances[t.account_id] = (balances[t.account_id] || 0) + t.amount;
      else if (t.type === 'expense') balances[t.account_id] = (balances[t.account_id] || 0) - t.amount;
      else if (t.type === 'transfer') {
        balances[t.account_id] = (balances[t.account_id] || 0) - t.amount;
        if (t.transfer_account_id) balances[t.transfer_account_id] = (balances[t.transfer_account_id] || 0) + t.amount;
      }
    });
    return balances;
  }, [accounts, transactions]);

  const regularAccounts = accounts.filter(a => a.type !== 'investment');
  const investmentAccounts = accounts.filter(a => a.type === 'investment');
  const totalBalance = regularAccounts.reduce((sum, acc) => sum + (accountBalances[acc.id] || 0), 0);
  const totalInvested = investmentAccounts.reduce((sum, acc) => sum + (accountBalances[acc.id] || 0), 0);
  const expenseCount = monthTransactions.filter(t => t.type === 'expense' && t.is_realized !== false).length;
  const savingsRate = kpis.totalIncome > 0
    ? Math.max(0, (((kpis.totalIncome - kpis.totalExpense) / kpis.totalIncome) * 100)).toFixed(0)
    : null;
  const recentTransactions = monthTransactions.slice(0, 5);
  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24 transition-colors duration-200">
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 dark:from-blue-700 dark:via-blue-800 dark:to-indigo-900 text-white">
        <div className="px-5 pt-12 pb-4">
          {isViewingSharedProfile && (
            <p className="text-blue-200 text-xs font-medium mb-2">👁 Visualizando perfil compartilhado</p>
          )}
          <div className="flex items-center gap-2 mb-1">
            <p className="text-blue-200 text-sm font-medium">Saldo disponível</p>
            <button onClick={toggle} className="p-1 bg-white/10 hover:bg-white/20 rounded-full transition-colors">
              {hidden ? <EyeOff className="w-3.5 h-3.5 text-white/60" /> : <Eye className="w-3.5 h-3.5 text-white/60" />}
            </button>
          </div>
          <motion.h1 key={String(hidden)} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            className="text-4xl font-bold mb-1 tracking-tight">
            {hidden ? "R$ ••••••" : fmt(totalBalance)}
          </motion.h1>
          {totalInvested > 0 && (
            <p className="text-blue-200 text-sm mb-4 flex items-center gap-1">
              <PiggyBank className="w-3.5 h-3.5" />
              {hidden ? "+ R$ •••••• investido" : `+ ${fmt(totalInvested)} investido`}
            </p>
          )}
          <div className="mb-4">
            <MonthSelector selectedDate={selectedDate} onChange={setSelectedDate} />
          </div>
        </div>

        {canAdd && (
          <div className="flex gap-2 px-5 pb-6">
            <motion.button whileTap={{ scale: 0.95 }}
              onClick={() => { setInitialType("income"); setShowTransactionForm(true); }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white/10 backdrop-blur-sm rounded-xl text-white text-sm font-medium">
              <TrendingUp className="w-4 h-4" /> Entrada
            </motion.button>
            <motion.button whileTap={{ scale: 0.95 }}
              onClick={() => { setInitialType("expense"); setShowTransactionForm(true); }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white/10 backdrop-blur-sm rounded-xl text-white text-sm font-medium">
              <TrendingDown className="w-4 h-4" /> Saída
            </motion.button>
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => setShowTransferForm(true)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white/10 backdrop-blur-sm rounded-xl text-white text-sm font-medium">
              <ArrowLeftRight className="w-4 h-4" /> Transferir
            </motion.button>
          </div>
        )}
      </div>

      <div className="px-5 -mt-4 relative z-10">
        <div className="grid grid-cols-2 gap-3 mb-6">
          <KPICard title="Entradas" value={kpis.totalIncome} type="income" delay={0.1}
            navigateTo={`/Transactions?filter=income&month=${format(selectedDate, 'yyyy-MM')}`} />
          <KPICard title="Saídas" value={kpis.totalExpense} type="expense" delay={0.2}
            navigateTo={`/Transactions?filter=expense&month=${format(selectedDate, 'yyyy-MM')}`} />
          <KPICard title="Saldo Atual" value={kpis.currentBalance} type="balance" subtitle="Realizado" delay={0.3}
            navigateTo={`/Transactions?filter=realized&month=${format(selectedDate, 'yyyy-MM')}`} />
          <KPICard title="Previsão" value={kpis.forecastBalance} type="forecast" subtitle="Com planejado" delay={0.4}
            navigateTo={`/Transactions?filter=planned&month=${format(selectedDate, 'yyyy-MM')}`} />
        </div>

        {/* Banner de indicação */}
        {showReferralBanner && !isViewingSharedProfile && (
          <ReferralBanner
            onOpen={() => setShowReferralModal(true)}
            onDismiss={() => {
              setShowReferralBanner(false);
              localStorage.setItem('referral_banner_dismissed', 'true');
            }}
          />
        )}

        {/* Botão Relatórios */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }} className="mb-6">
          <Link to={createPageUrl("Reports")}>
            <div className="flex items-center gap-4 bg-white dark:bg-gray-800 rounded-2xl px-4 py-3.5 border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                <BarChart2 className="w-5 h-5 text-slate-600 dark:text-slate-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Ver Relatórios</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                  {expenseCount > 0 ? `${expenseCount} gastos${savingsRate !== null ? ` · ${savingsRate}% poupado` : ""} este mês` : "Análise de gastos e metas"}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
            </div>
          </Link>
        </motion.div>

        {/* Contas */}
        {accounts.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Minhas Contas</h2>
              <Link to={createPageUrl("Accounts")} className="flex items-center gap-1 text-sm text-blue-600 font-medium">
                Ver todas <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
              {regularAccounts.map((account, index) => (
                <AccountCard key={account.id} account={account} balance={accountBalances[account.id] || 0} delay={index * 0.1} />
              ))}
            </div>
            {investmentAccounts.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
                  <PiggyBank className="w-3.5 h-3.5" /> Investimentos
                </p>
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                  {investmentAccounts.map((account, index) => (
                    <AccountCard key={account.id} account={account} balance={accountBalances[account.id] || 0} delay={index * 0.1} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Transações recentes */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Transações Recentes</h2>
            <Link to={createPageUrl("Transactions")} className="flex items-center gap-1 text-sm text-blue-600 font-medium">
              Ver todas <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          {recentTransactions.length > 0 ? (
            <div className="space-y-3">
              {recentTransactions.map((transaction, index) => (
                <TransactionItem key={transaction.id} transaction={transaction} delay={index * 0.05} />
              ))}
            </div>
          ) : (
            <EmptyState icon={Wallet} title="Nenhuma transação"
              description="Adicione sua primeira entrada ou saída."
              action="Adicionar Transação" onAction={() => setShowTransactionForm(true)} />
          )}
        </div>
      </div>

      {canAdd && (
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => setShowTransactionForm(true)}
          className="fixed bottom-24 right-5 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg shadow-blue-600/30 flex items-center justify-center z-40">
          <Plus className="w-6 h-6" />
        </motion.button>
      )}

      <AnimatePresence>
        {showTransactionForm && (
          <TransactionForm accounts={accounts.filter(a => a.type !== 'investment')}
            initialType={initialType}
            onSubmit={(data) => createTransactionMutation.mutate(data)}
            onClose={() => setShowTransactionForm(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTransferForm && (
          <TransferForm accounts={accounts}
            onSubmit={(data) => createTransferMutation.mutate(data)}
            onClose={() => setShowTransferForm(false)} />
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