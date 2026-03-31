import React, { useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useSharedProfile } from "@/lib/SharedProfileContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, TrendingUp, Trash2 } from "lucide-react";
import { startOfMonth, endOfMonth, isWithinInterval, parseISO } from "date-fns";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { useMonth } from "@/lib/MonthContext";
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
  const { selectedDate, setSelectedDate } = useMonth();
  const [searchParams] = useSearchParams();
  const [filter, setFilter] = useState(searchParams.get("filter") || "all");
  const [showForm, setShowForm] = useState(false);
  const [editTransaction, setEditTransaction] = useState(null); // <- novo
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteId, setDeleteId] = useState(null);
  const [realizarPrevisao, setRealizarPrevisao] = useState(null);

  React.useEffect(() => {
    const monthParam = searchParams.get("month");
    if (monthParam) setSelectedDate(new Date(monthParam + "-02"));
    const filterParam = searchParams.get("filter");
    if (filterParam) setFilter(filterParam);
  }, []);

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

  // <- mutation de edição nova
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const { error } = await supabase.from('transactions').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions', activeOwnerId] });
      setEditTransaction(null);
      setShowForm(false);
      toast.success("Transação atualizada!");
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

  // <- abre form de edição
  const handleEdit = (transaction) => {
    setEditTransaction(transaction);
    setShowForm(true);
  };

  // <- submit que decide criar ou editar
  const handleSubmit = (data) => {
    if (editTransaction) {
      updateMutation.mutate({ id: editTransaction.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

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

      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 text-white sticky top-0 z-20">
        <div className="px-5 pt-12 pb-4">
          {isViewingSharedProfile && (
            <p className="text-blue-200 text-xs font-medium mb-2">👁 Visualizando perfil compartilhado</p>
          )}
          <h1 className="text-2xl font-bold text-white mb-4">Transações</h1>
          <MonthSelector selectedDate={selectedDate} onChange={setSelectedDate} />
        </div>
        <div className="flex gap-4 px-5 pb-4">
          <div className="flex-1 text-center">
            <p className="text-xs text-blue-200 mb-1">Entradas</p>
            <p className="text-lg font-bold text-emerald-300">{fmt(summary.income)}</p>
          </div>
          <div className="flex-1 text-center border-x border-white/20">
            <p className="text-xs text-blue-200 mb-1">Saídas</p>
            <p className="text-lg font-bold text-red-300">{fmt(summary.expense)}</p>
          </div>
          <div className="flex-1 text-center">
            <p className="text-xs text-blue-200 mb-1">Saldo</p>
            <p className={`text-lg font-bold ${summary.balance >= 0 ? 'text-white' : 'text-red-300'}`}>{fmt(summary.balance)}</p>
          </div>
        </div>
        <div className="px-5 pb-4">
          <Input
            placeholder="Buscar transações..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-xl bg-white/10 border-white/20 text-white placeholder:text-blue-200"
          />
          {/* Filtros */}
          <div className="flex gap-2 pt-3 overflow-x-auto">
            {[
              { value: "all",      label: "Todos" },
              { value: "realized", label: "Realizados" },
              { value: "planned",  label: "Previstos" },
              { value: "income",   label: "Entradas" },
              { value: "expense",  label: "Saídas" },
            ].map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  filter === value
                    ? "bg-white text-blue-700"
                    : "bg-white/20 text-white hover:bg-white/30"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 py-4">
        {filteredTransactions.length > 0 ? (
          <div className="space-y-3">
            {filteredTransactions.map((transaction) => (
              <motion.div key={transaction.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
                <TransactionItem
                  transaction={transaction}
                  onRegistrar={(t) => setRealizarPrevisao(t)}
                  onDuplicar={(t, meses) => duplicarMutation.mutate({ transaction: t, meses })}
                  onEdit={canAdd ? handleEdit : null}
                  onDelete={canDelete ? (id) => setDeleteId(id) : null}
                />
              </motion.div>
            ))}
          </div>
        ) : (
          <EmptyState icon={TrendingUp} title="Nenhuma transação" description="Período sem dados." action="Adicionar" onAction={() => canAdd && setShowForm(true)} />
        )}
      </div>

      {canAdd && (
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => { setEditTransaction(null); setShowForm(true); }}
          className="fixed bottom-24 right-5 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg z-40 flex items-center justify-center">
          <Plus className="w-6 h-6" />
        </motion.button>
      )}

      <AnimatePresence>
        {showForm && (
          <TransactionForm
            accounts={accounts}
            onSubmit={handleSubmit}
            onClose={() => { setShowForm(false); setEditTransaction(null); }}
            initialType={editTransaction?.type || "expense"}
            initialData={editTransaction} // <- passa dados para preencher o form
          />
        )}
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