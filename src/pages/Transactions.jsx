import React, { useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useSharedProfile } from "@/lib/SharedProfileContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, TrendingUp, Trash2 } from "lucide-react";
import { startOfMonth, endOfMonth, isWithinInterval, parseISO } from "date-fns";
import { toast } from "sonner";
import RealizarPrevisaoModal from "@/components/transactions/RealizarPrevisaoModal";
import TransactionItem from "@/components/transactions/TransactionItem";
import TransactionForm from "@/components/transactions/TransactionForm";
import MonthSelector from "@/components/common/MonthSelector";
import EmptyState from "@/components/common/EmptyState";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Transactions() {
  const { user } = useAuth();
  const { activeOwnerId, isViewingSharedProfile, sharedPermissions } = useSharedProfile();
  const canAdd = !isViewingSharedProfile || sharedPermissions?.add_transactions;
  const canDelete = !isViewingSharedProfile || sharedPermissions?.delete_transactions;
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteId, setDeleteId] = useState(null);
  const [realizarPrevisao, setRealizarPrevisao] = useState(null);

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', activeOwnerId],
    queryFn: async () => {
      const { data, error } = await supabase.from('accounts').select('*').eq('user_id', activeOwnerId);
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

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const { error } = await supabase.from('transactions').insert([{ ...data, user_id: activeOwnerId }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions', activeOwnerId] });
      setShowForm(false);
      toast.success("Transação criada!");
    },
    onError: (err) => toast.error("Erro: " + err.message)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions', activeOwnerId] });
      setDeleteId(null);
      toast.success("Transação excluída!");
    },
    onError: (err) => toast.error("Erro: " + err.message)
  });

  const realizarMutation = useMutation({
    mutationFn: async ({ transaction, valorRealizado }) => {
      const restante = transaction.amount - valorRealizado;
      await supabase.from('transactions')
        .update({ is_realized: true, amount: valorRealizado })
        .eq('id', transaction.id);
      if (restante > 0.01) {
        await supabase.from('transactions').insert([{
          description: transaction.description,
          amount: restante,
          type: transaction.type,
          category: transaction.category,
          account_id: transaction.account_id,
          date: transaction.date,
          is_realized: false,
          notes: transaction.notes,
          user_id: activeOwnerId,
        }]);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions', activeOwnerId] });
      setRealizarPrevisao(null);
      toast.success("Realização registrada!");
    },
    onError: (err) => toast.error("Erro: " + err.message)
  });

  const duplicarMutation = useMutation({
    mutationFn: async ({ transaction, meses }) => {
      const dia = transaction.date.split("-")[2];
      const inserts = meses.map((mes) => ({
        description: transaction.description,
        amount: transaction.amount,
        type: transaction.type,
        category: transaction.category,
        account_id: transaction.account_id,
        date: `${mes}-${dia}`,
        is_realized: false,
        notes: transaction.notes,
        user_id: activeOwnerId,
      }));
      const { error } = await supabase.from('transactions').insert(inserts);
      if (error) throw error;
    },
    onSuccess: (_, { meses }) => {
      queryClient.invalidateQueries({ queryKey: ['transactions', activeOwnerId] });
      toast.success(`Duplicado em ${meses.length} ${meses.length === 1 ? "mês" : "meses"}!`);
    },
    onError: (err) => toast.error("Erro: " + err.message)
  });

  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);

  const filteredTransactions = useMemo(() => {
    return transactions
      .filter(t => isWithinInterval(parseISO(t.date), { start: monthStart, end: monthEnd }))
      .filter(t => {
        if (filter === "income") return t.type === "income";
        if (filter === "expense") return t.type === "expense";
        if (filter === "realized") return t.is_realized !== false;
        if (filter === "planned") return t.is_realized === false;
        return true;
      })
      .filter(t => !searchQuery || t.description?.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [transactions, monthStart, monthEnd, filter, searchQuery]);

  const summary = useMemo(() => {
    const income = filteredTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expense = filteredTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    return { income, expense, balance: income - expense };
  }, [filteredTransactions]);

  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24 transition-colors duration-200">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 sticky top-0 z-20">
        <div className="px-5 pt-12 pb-4">
          {isViewingSharedProfile && (
            <p className="text-blue-500 text-xs font-medium mb-2">👁 Visualizando perfil compartilhado</p>
          )}
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Transações</h1>
          <MonthSelector selectedDate={selectedDate} onChange={setSelectedDate} />
        </div>
        <div className="flex gap-4 px-5 pb-4">
          <div className="flex-1 text-center">
            <p className="text-xs text-gray-500 mb-1">Entradas</p>
            <p className="text-lg font-bold text-emerald-600">{fmt(summary.income)}</p>
          </div>
          <div className="flex-1 text-center border-x border-gray-100">
            <p className="text-xs text-gray-500 mb-1">Saídas</p>
            <p className="text-lg font-bold text-red-600">{fmt(summary.expense)}</p>
          </div>
          <div className="flex-1 text-center">
            <p className="text-xs text-gray-500 mb-1">Saldo</p>
            <p className={`text-lg font-bold ${summary.balance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{fmt(summary.balance)}</p>
          </div>
        </div>
        <div className="px-5 pb-4">
          <Input placeholder="Buscar transações..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="rounded-xl bg-gray-50 dark:bg-gray-900" />
        </div>
      </div>

      <div className="px-5 py-4">
        {filteredTransactions.length > 0 ? (
          <div className="space-y-3">
            {filteredTransactions.map((transaction) => (
              <motion.div key={transaction.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="relative flex items-center gap-2">
                <div className="flex-1">
                  <TransactionItem
                    transaction={transaction}
                    onRegistrar={(t) => setRealizarPrevisao(t)}
                    onDuplicar={(t, meses) => duplicarMutation.mutate({ transaction: t, meses })}
                  />
                </div>
                {canDelete && (
                  <button onClick={() => setDeleteId(transaction.id)} className="p-2 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100">
                    <Trash2 className="w-5 h-5 text-red-500" />
                  </button>
                )}
              </motion.div>
            ))}
          </div>
        ) : (
          <EmptyState icon={TrendingUp} title="Nenhuma transação" description="Período sem dados." action="Adicionar" onAction={() => canAdd && setShowForm(true)} />
        )}
      </div>

      {canAdd && (
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => setShowForm(true)}
          className="fixed bottom-24 right-5 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg z-40 flex items-center justify-center">
          <Plus className="w-6 h-6" />
        </motion.button>
      )}

      <AnimatePresence>
        {showForm && <TransactionForm accounts={accounts} onSubmit={(data) => createMutation.mutate(data)} onClose={() => setShowForm(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {realizarPrevisao && (
          <RealizarPrevisaoModal
            transaction={realizarPrevisao}
            onConfirm={(dados) => realizarMutation.mutate(dados)}
            onClose={() => setRealizarPrevisao(null)}
          />
        )}
      </AnimatePresence>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir transação?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate(deleteId)} className="bg-red-600 hover:bg-red-700 text-white">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}