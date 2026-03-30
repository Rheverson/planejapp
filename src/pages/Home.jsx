import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useSharedProfile } from "@/lib/SharedProfileContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, TrendingUp, TrendingDown, Wallet, ChevronRight } from "lucide-react";
import { startOfMonth, endOfMonth, isWithinInterval, parseISO } from "date-fns";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";

import KPICard from "@/components/dashboard/KPICard";
import AccountCard from "@/components/dashboard/AccountCard";
import TransactionItem from "@/components/transactions/TransactionItem";
import TransactionForm from "@/components/transactions/TransactionForm";
import MonthSelector from "@/components/common/MonthSelector";
import EmptyState from "@/components/common/EmptyState";

export default function Home() {
  const { user } = useAuth();
  const { activeOwnerId, isViewingSharedProfile, sharedPermissions } = useSharedProfile();
  const canAdd = !isViewingSharedProfile || sharedPermissions?.add_transactions;
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [initialType, setInitialType] = useState("expense");
  const queryClient = useQueryClient();
  

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', activeOwnerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', activeOwnerId)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!activeOwnerId
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions', activeOwnerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', activeOwnerId)
        .order('date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!activeOwnerId
  });

  const createTransactionMutation = useMutation({
    mutationFn: async (newTransaction) => {
      const { data, error } = await supabase
        .from('transactions')
        .insert([{
          ...newTransaction,
          user_id: activeOwnerId,  // <- era user.id
          amount: parseFloat(newTransaction.amount)
        }])
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setShowTransactionForm(false);
      toast.success('Transação adicionada!');
    },
    onError: (err) => {
      toast.error('Erro ao salvar: ' + err.message);
    }
  });

  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);

  const monthTransactions = useMemo(() => {
    return transactions.filter(t => {
      const date = parseISO(t.date);
      return isWithinInterval(date, { start: monthStart, end: monthEnd });
    });
  }, [transactions, monthStart, monthEnd]);

  const kpis = useMemo(() => {
    const realized = monthTransactions.filter(t => t.is_realized !== false);
    const planned = monthTransactions.filter(t => t.is_realized === false);
    const totalIncomeRealized = realized.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalIncomePlanned = planned.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalExpenseRealized = realized.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const totalExpensePlanned = planned.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    return {
      totalIncome: totalIncomeRealized + totalIncomePlanned,
      totalExpense: totalExpenseRealized + totalExpensePlanned,
      currentBalance: totalIncomeRealized - totalExpenseRealized,
      forecastBalance: (totalIncomeRealized + totalIncomePlanned) - (totalExpenseRealized + totalExpensePlanned)
    };
  }, [monthTransactions]);

  const accountBalances = useMemo(() => {
    const balances = {};
    accounts.forEach(acc => {
      balances[acc.id] = acc.initial_balance || 0;
    });
    transactions.forEach(t => {
      if (t.account_id && t.is_realized !== false) {
        if (t.type === 'income') {
          balances[t.account_id] = (balances[t.account_id] || 0) + t.amount;
        } else {
          balances[t.account_id] = (balances[t.account_id] || 0) - t.amount;
        }
      }
    });
    return balances;
  }, [accounts, transactions]);

  const totalBalance = Object.values(accountBalances).reduce((sum, b) => sum + b, 0);
  const recentTransactions = monthTransactions.slice(0, 5);

  const handleAddTransaction = (type) => {
    setInitialType(type);
    setShowTransactionForm(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24 transition-colors duration-200">
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 dark:from-blue-700 dark:via-blue-800 dark:to-indigo-900 text-white">
        <div className="px-5 pt-12 pb-8">
          {isViewingSharedProfile && (
            <p className="text-blue-200 text-xs font-medium mb-2">👁 Visualizando perfil compartilhado</p>
          )}
          <p className="text-blue-200 text-sm font-medium mb-1">Saldo Total</p>
          <motion.h1
            key={totalBalance}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl font-bold mb-6"
          >
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalBalance)}
          </motion.h1>
          <MonthSelector selectedDate={selectedDate} onChange={setSelectedDate} />
        </div>

        {canAdd && (   // <- era !isViewingSharedProfile
          <div className="flex gap-3 px-5 pb-6">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => handleAddTransaction("income")}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/10 backdrop-blur-sm rounded-xl text-white font-medium"
            >
              <TrendingUp className="w-5 h-5" /> Entrada
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => handleAddTransaction("expense")}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/10 backdrop-blur-sm rounded-xl text-white font-medium"
            >
              <TrendingDown className="w-5 h-5" /> Saída
            </motion.button>
          </div>
        )}

      </div>

      <div className="px-5 -mt-4 relative z-10">
        <div className="grid grid-cols-2 gap-3 mb-6">
          <KPICard title="Entradas" value={kpis.totalIncome} type="income" delay={0.1} />
          <KPICard title="Saídas" value={kpis.totalExpense} type="expense" delay={0.2} />
          <KPICard title="Saldo Atual" value={kpis.currentBalance} type="balance" subtitle="Realizado" delay={0.3} />
          <KPICard title="Previsão" value={kpis.forecastBalance} type="forecast" subtitle="Com planejado" delay={0.4} />
        </div>

        {accounts.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Minhas Contas</h2>
              <Link to={createPageUrl("Accounts")} className="flex items-center gap-1 text-sm text-blue-600 font-medium">
                Ver todas <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
              {accounts.map((account, index) => (
                <AccountCard key={account.id} account={account} balance={accountBalances[account.id] || 0} delay={index * 0.1} />
              ))}
            </div>
          </div>
        )}

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
            <EmptyState icon={Wallet} title="Nenhuma transação" description="Adicione sua primeira entrada ou saída." action="Adicionar Transação" onAction={() => setShowTransactionForm(true)} />
          )}
        </div>
      </div>

      {canAdd && (   // <- era !isViewingSharedProfile
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowTransactionForm(true)}
          className="fixed bottom-24 right-5 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg shadow-blue-600/30 flex items-center justify-center z-40"
        >
          <Plus className="w-6 h-6" />
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
    </div>
  );
}