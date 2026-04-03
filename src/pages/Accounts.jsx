import React, { useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useSharedProfile } from "@/lib/SharedProfileContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Building2, Wallet, Smartphone, TrendingUp, MoreHorizontal, Trash2, Edit2, X, ArrowUpRight, ArrowDownRight, ArrowLeftRight } from "lucide-react";
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

const iconMap = { bank: Building2, wallet: Wallet, digital: Smartphone, investment: TrendingUp, other: MoreHorizontal };
const typeLabels = { bank: "Conta Bancária", wallet: "Carteira", digital: "Conta Digital", investment: "Investimentos", other: "Outros" };
const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

// ── Modal de detalhes da conta ───────────────────────────────
function AccountDetailModal({ account, transactions, onClose }) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const Icon = iconMap[account.type] || Wallet;

  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);

  // Saldo atual (todas as transações realizadas)
  const currentBalance = useMemo(() => {
    let bal = account.initial_balance || 0;
    transactions.forEach(t => {
      if (t.is_realized === false) return;
      if (t.account_id === account.id) {
        if (t.type === 'income') bal += t.amount;
        else if (t.type === 'expense') bal -= t.amount;
        else if (t.type === 'transfer') bal -= t.amount;
      }
      if (t.transfer_account_id === account.id && t.type === 'transfer') {
        bal += t.amount;
      }
    });
    return bal;
  }, [account, transactions]);

  // Transações do mês para esta conta
  const monthTx = useMemo(() => {
    return transactions.filter(t => {
      const date = parseISO(t.date);
      if (!isWithinInterval(date, { start: monthStart, end: monthEnd })) return false;
      return t.account_id === account.id || t.transfer_account_id === account.id;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [transactions, monthStart, monthEnd, account.id]);

  // Resumo do mês
  const monthSummary = useMemo(() => {
    let income = 0, expense = 0, planned = 0;
    monthTx.forEach(t => {
      if (t.is_realized === false) { planned += t.amount; return; }
      if (t.type === 'income' && t.account_id === account.id) income += t.amount;
      else if (t.type === 'expense' && t.account_id === account.id) expense += t.amount;
      else if (t.type === 'transfer') {
        if (t.transfer_account_id === account.id) income += t.amount; // entrada por transferência
        else if (t.account_id === account.id) expense += t.amount;    // saída por transferência
      }
    });
    return { income, expense, planned, balance: income - expense };
  }, [monthTx, account.id]);

  const getTxIcon = (t) => {
    if (t.type === 'transfer') return <ArrowLeftRight className="w-4 h-4 text-blue-500" />;
    if (t.type === 'income') return <ArrowUpRight className="w-4 h-4 text-emerald-500" />;
    return <ArrowDownRight className="w-4 h-4 text-red-500" />;
  };

  const getTxAmount = (t) => {
    const isIn = t.type === 'income' || (t.type === 'transfer' && t.transfer_account_id === account.id);
    return (
      <span className={`text-sm font-bold ${isIn ? 'text-emerald-600' : 'text-red-600'}`}>
        {isIn ? '+' : '-'}{fmt(t.amount)}
      </span>
    );
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center pb-16 sm:pb-0"
      onClick={onClose}>
      <motion.div initial={{ y: "100%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "100%", opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">

        {/* Header */}
        <div className={`${account.color || 'bg-blue-500'} px-5 pt-6 pb-5 text-white flex-shrink-0`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Icon className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-bold text-lg leading-tight">{account.name}</p>
                <p className="text-white/70 text-xs">{typeLabels[account.type]}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 bg-white/20 rounded-full">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>

          <div className="mb-3">
            <p className="text-white/70 text-xs mb-0.5">Saldo atual</p>
            <p className="text-3xl font-bold">{fmt(currentBalance)}</p>
          </div>

          <MonthSelector selectedDate={selectedDate} onChange={setSelectedDate} />
        </div>

        {/* Resumo do mês */}
        <div className="grid grid-cols-3 gap-0 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <div className="text-center py-3 border-r border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-400 mb-0.5">Entradas</p>
            <p className="text-sm font-bold text-emerald-600">{fmt(monthSummary.income)}</p>
          </div>
          <div className="text-center py-3 border-r border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-400 mb-0.5">Saídas</p>
            <p className="text-sm font-bold text-red-600">{fmt(monthSummary.expense)}</p>
          </div>
          <div className="text-center py-3">
            <p className="text-xs text-gray-400 mb-0.5">Saldo mês</p>
            <p className={`text-sm font-bold ${monthSummary.balance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
              {fmt(monthSummary.balance)}
            </p>
          </div>
        </div>

        {/* Histórico */}
        <div className="flex-1 overflow-y-auto">
          {monthTx.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400">
              <p className="text-sm">Nenhuma movimentação no período</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-gray-700">
              {monthTx.map(t => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-xl bg-gray-50 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                    {getTxIcon(t)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{t.description}</p>
                    <p className="text-xs text-gray-400">
                      {format(parseISO(t.date), "dd 'de' MMM", { locale: ptBR })}
                      {t.category && ` · ${t.category}`}
                      {t.is_realized === false && ' · Previsto'}
                    </p>
                  </div>
                  {getTxAmount(t)}
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Página principal ─────────────────────────────────────────
export default function Accounts() {
  const { user } = useAuth();
  const { activeOwnerId, isViewingSharedProfile, sharedPermissions } = useSharedProfile();
  const canManage = !isViewingSharedProfile || sharedPermissions?.add_transactions;
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editAccount, setEditAccount] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [selectedAccount, setSelectedAccount] = useState(null); // <- detalhes

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
      const { data, error } = await supabase.from('transactions').select('*').eq('user_id', activeOwnerId);
      if (error) throw error;
      return data;
    },
    enabled: !!activeOwnerId
  });

  const createMutation = useMutation({
    mutationFn: async (newAccount) => {
      const { data, error } = await supabase.from('accounts')
        .insert([{ ...newAccount, user_id: activeOwnerId, initial_balance: parseFloat(newAccount.initial_balance || 0) }])
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['accounts'] }); setShowForm(false); toast.success('Conta criada!'); },
    onError: (err) => toast.error('Erro: ' + err.message)
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const { error } = await supabase.from('accounts').update({ ...data, initial_balance: parseFloat(data.initial_balance || 0) }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['accounts'] }); setEditAccount(null); setShowForm(false); toast.success('Conta atualizada!'); },
    onError: (err) => toast.error('Erro: ' + err.message)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('accounts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['accounts'] }); setDeleteId(null); toast.success('Conta removida!'); },
    onError: (err) => toast.error('Erro: ' + err.message)
  });

  const accountBalances = useMemo(() => {
    const balances = {};
    accounts.forEach(acc => { balances[acc.id] = acc.initial_balance || 0; });
    transactions.forEach(t => {
      if (t.is_realized === false) return;
      if (t.type === 'income' && t.account_id) balances[t.account_id] = (balances[t.account_id] || 0) + t.amount;
      else if (t.type === 'expense' && t.account_id) balances[t.account_id] = (balances[t.account_id] || 0) - t.amount;
      else if (t.type === 'transfer') {
        if (t.account_id) balances[t.account_id] = (balances[t.account_id] || 0) - t.amount;
        if (t.transfer_account_id) balances[t.transfer_account_id] = (balances[t.transfer_account_id] || 0) + t.amount;
      }
    });
    return balances;
  }, [accounts, transactions]);

  const totalBalance = Object.values(accountBalances).reduce((sum, b) => sum + b, 0);
  const handleSubmit = (data) => editAccount ? updateMutation.mutate({ id: editAccount.id, data }) : createMutation.mutate(data);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24 transition-colors duration-200">
      <div className="bg-gradient-to-br from-violet-600 via-violet-700 to-purple-800 text-white">
        <div className="px-5 pt-12 pb-8">
          {isViewingSharedProfile && (
            <p className="text-violet-200 text-xs font-medium mb-2">👁 Visualizando perfil compartilhado</p>
          )}
          <h1 className="text-2xl font-bold mb-6">Minhas Contas</h1>
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5">
            <p className="text-violet-200 text-sm font-medium mb-1">Saldo Consolidado</p>
            <p className="text-3xl font-bold">{fmt(totalBalance)}</p>
            <p className="text-violet-200 text-sm mt-2">{accounts.length} {accounts.length === 1 ? 'conta' : 'contas'} cadastradas</p>
          </div>
        </div>
      </div>

      <div className="px-5 py-6 -mt-4 relative z-10">
        {accounts.length > 0 ? (
          <div className="space-y-3">
            {accounts.map((account, index) => {
              const Icon = iconMap[account.type] || Wallet;
              const balance = accountBalances[account.id] || 0;
              return (
                <motion.div key={account.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }}
                  className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSelectedAccount(account)} // <- abre detalhes
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-xl ${account.color || 'bg-blue-500'} flex items-center justify-center`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white truncate">{account.name}</p>
                      <p className="text-sm text-gray-500">{typeLabels[account.type]}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${balance >= 0 ? 'text-gray-900 dark:text-white' : 'text-red-600'}`}>{fmt(balance)}</p>
                      {canManage && (
                        <div className="flex gap-1 justify-end mt-1" onClick={e => e.stopPropagation()}>
                          <button onClick={() => { setEditAccount(account); setShowForm(true); }} className="p-1.5 hover:bg-gray-100 rounded-lg">
                            <Edit2 className="w-4 h-4 text-gray-400" />
                          </button>
                          <button onClick={() => setDeleteId(account.id)} className="p-1.5 hover:bg-red-50 rounded-lg">
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={Wallet} title="Nenhuma conta cadastrada" description="Adicione suas contas para começar." action="Adicionar Conta" onAction={() => setShowForm(true)} />
        )}
      </div>

      {canManage && (
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => { setEditAccount(null); setShowForm(true); }}
          className="fixed bottom-24 right-5 w-14 h-14 bg-violet-600 text-white rounded-full shadow-lg flex items-center justify-center z-40">
          <Plus className="w-6 h-6" />
        </motion.button>
      )}

      <AnimatePresence>
        {showForm && <AccountForm account={editAccount} onSubmit={handleSubmit} onClose={() => { setShowForm(false); setEditAccount(null); }} />}
      </AnimatePresence>

      <AnimatePresence>
        {selectedAccount && (
          <AccountDetailModal
            account={selectedAccount}
            transactions={transactions}
            onClose={() => setSelectedAccount(null)}
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
            <AlertDialogAction onClick={() => deleteMutation.mutate(deleteId)} className="bg-red-600 hover:bg-red-700">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}