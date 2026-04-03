import React, { useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useSharedProfile } from "@/lib/SharedProfileContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, TrendingUp, SlidersHorizontal, X } from "lucide-react";
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

const CATEGORIES = [
  "alimentação", "moradia", "transporte", "saúde", "educação",
  "lazer", "compras", "salário", "freelance", "investimentos", "outros"
];

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
  const [editTransaction, setEditTransaction] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteId, setDeleteId] = useState(null);
  const [realizarPrevisao, setRealizarPrevisao] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Filtros avançados
  const [advFilters, setAdvFilters] = useState({
    categories: [],
    accountIds: [],
    minAmount: "",
    maxAmount: "",
  });

  const hasAdvFilters = advFilters.categories.length > 0 ||
    advFilters.accountIds.length > 0 ||
    advFilters.minAmount !== "" ||
    advFilters.maxAmount !== "";

  const clearAdvFilters = () => setAdvFilters({ categories: [], accountIds: [], minAmount: "", maxAmount: "" });

  const toggleCategory = (cat) => {
    setAdvFilters(prev => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter(c => c !== cat)
        : [...prev.categories, cat]
    }));
  };

  const toggleAccount = (id) => {
    setAdvFilters(prev => ({
      ...prev,
      accountIds: prev.accountIds.includes(id)
        ? prev.accountIds.filter(a => a !== id)
        : [...prev.accountIds, id]
    }));
  };

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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['transactions', activeOwnerId] }); setShowForm(false); toast.success("Transação criada!"); },
    onError: (err) => toast.error("Erro: " + err.message)
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const { error } = await supabase.from('transactions').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['transactions', activeOwnerId] }); setEditTransaction(null); setShowForm(false); toast.success("Transação atualizada!"); },
    onError: (err) => toast.error("Erro: " + err.message)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['transactions', activeOwnerId] }); setDeleteId(null); toast.success("Transação excluída!"); },
    onError: (err) => toast.error("Erro: " + err.message)
  });

  const realizarMutation = useMutation({
    mutationFn: async ({ transaction, valorRealizado }) => {
      const restante = transaction.amount - valorRealizado;
      await supabase.from('transactions').update({ is_realized: true, amount: valorRealizado }).eq('id', transaction.id);
      if (restante > 0.01) {
        await supabase.from('transactions').insert([{
          description: transaction.description, amount: restante, type: transaction.type,
          category: transaction.category, account_id: transaction.account_id,
          date: transaction.date, is_realized: false, notes: transaction.notes, user_id: activeOwnerId,
        }]);
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['transactions', activeOwnerId] }); setRealizarPrevisao(null); toast.success("Realização registrada!"); },
    onError: (err) => toast.error("Erro: " + err.message)
  });

  const duplicarMutation = useMutation({
    mutationFn: async ({ transaction, meses }) => {
      const dia = transaction.date.split("-")[2];
      const inserts = meses.map((mes) => ({
        description: transaction.description, amount: transaction.amount, type: transaction.type,
        category: transaction.category, account_id: transaction.account_id,
        date: `${mes}-${dia}`, is_realized: false, notes: transaction.notes, user_id: activeOwnerId,
      }));
      const { error } = await supabase.from('transactions').insert(inserts);
      if (error) throw error;
    },
    onSuccess: (_, { meses }) => { queryClient.invalidateQueries({ queryKey: ['transactions', activeOwnerId] }); toast.success(`Duplicado em ${meses.length} ${meses.length === 1 ? "mês" : "meses"}!`); },
    onError: (err) => toast.error("Erro: " + err.message)
  });

  const handleEdit = (transaction) => { setEditTransaction(transaction); setShowForm(true); };
  const handleSubmit = (data) => {
    if (editTransaction) updateMutation.mutate({ id: editTransaction.id, data });
    else createMutation.mutate(data);
  };

  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);

  const filteredTransactions = useMemo(() => {
    return transactions
      .filter(t => isWithinInterval(parseISO(t.date), { start: monthStart, end: monthEnd }))
      .filter(t => {
        if (filter === "income")   return t.type === "income";
        if (filter === "expense")  return t.type === "expense";
        if (filter === "transfer") return t.type === "transfer";
        if (filter === "realized") return t.is_realized !== false;
        if (filter === "planned")  return t.is_realized === false;
        return true;
      })
      .filter(t => !searchQuery || t.description?.toLowerCase().includes(searchQuery.toLowerCase()))
      // Filtros avançados
      .filter(t => advFilters.categories.length === 0 || advFilters.categories.includes(t.category?.toLowerCase()))
      .filter(t => advFilters.accountIds.length === 0 || advFilters.accountIds.includes(t.account_id))
      .filter(t => advFilters.minAmount === "" || t.amount >= parseFloat(advFilters.minAmount))
      .filter(t => advFilters.maxAmount === "" || t.amount <= parseFloat(advFilters.maxAmount));
  }, [transactions, monthStart, monthEnd, filter, searchQuery, advFilters]);

  const summary = useMemo(() => {
    const income  = filteredTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
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

        <div className="px-5 pb-4 space-y-3">
          {/* Busca + botão filtro */}
          <div className="flex gap-2">
            <Input
              placeholder="Buscar transações..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 rounded-xl bg-white/10 border-white/20 text-white placeholder:text-blue-200"
            />
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all flex-shrink-0 relative ${
                showAdvanced || hasAdvFilters
                  ? "bg-white text-blue-700"
                  : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              {hasAdvFilters && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-orange-400 rounded-full" />
              )}
            </button>
          </div>

          {/* Filtros rápidos */}
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            {[
              { value: "all",      label: "Todos" },
              { value: "realized", label: "Realizados" },
              { value: "planned",  label: "Previstos" },
              { value: "income",   label: "Entradas" },
              { value: "expense",  label: "Saídas" },
              { value: "transfer", label: "Transferências" },
            ].map(({ value, label }) => (
              <button key={value} type="button" onClick={() => setFilter(value)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  filter === value ? "bg-white text-blue-700" : "bg-white/20 text-white hover:bg-white/30"
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Painel de filtros avançados */}
      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 overflow-hidden"
          >
            <div className="px-5 py-4 space-y-4">

              {/* Header do painel */}
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-gray-800 dark:text-white">Filtros avançados</p>
                {hasAdvFilters && (
                  <button onClick={clearAdvFilters}
                    className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 font-medium">
                    <X className="w-3 h-3" /> Limpar filtros
                  </button>
                )}
              </div>

              {/* Categorias */}
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Categoria</p>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map(cat => (
                    <button key={cat} onClick={() => toggleCategory(cat)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-all capitalize ${
                        advFilters.categories.includes(cat)
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200"
                      }`}>
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Contas */}
              {accounts.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Conta</p>
                  <div className="flex flex-wrap gap-1.5">
                    {accounts.map(acc => (
                      <button key={acc.id} onClick={() => toggleAccount(acc.id)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                          advFilters.accountIds.includes(acc.id)
                            ? "bg-blue-600 text-white"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200"
                        }`}>
                        {acc.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Valor */}
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Valor (R$)</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number" placeholder="Mínimo"
                    value={advFilters.minAmount}
                    onChange={e => setAdvFilters(prev => ({ ...prev, minAmount: e.target.value }))}
                    className="flex-1 h-9 px-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm text-gray-800 dark:text-white placeholder:text-gray-400"
                  />
                  <span className="text-gray-400 text-xs">até</span>
                  <input
                    type="number" placeholder="Máximo"
                    value={advFilters.maxAmount}
                    onChange={e => setAdvFilters(prev => ({ ...prev, maxAmount: e.target.value }))}
                    className="flex-1 h-9 px-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm text-gray-800 dark:text-white placeholder:text-gray-400"
                  />
                </div>
              </div>

              {/* Resumo dos filtros ativos */}
              {hasAdvFilters && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl px-3 py-2">
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                    {filteredTransactions.length} transação(ões) encontrada(s)
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-5 py-4">
        {filteredTransactions.length > 0 ? (
          <div className="space-y-3">
            {filteredTransactions.map((transaction) => (
              <motion.div key={transaction.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
                <TransactionItem
                  transaction={transaction}
                  accounts={accounts}
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
          <TransactionForm accounts={accounts} onSubmit={handleSubmit}
            onClose={() => { setShowForm(false); setEditTransaction(null); }}
            initialType={editTransaction?.type || "expense"} initialData={editTransaction} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {realizarPrevisao && (
          <RealizarPrevisaoModal transaction={realizarPrevisao}
            onConfirm={(dados) => realizarMutation.mutate(dados)}
            onClose={() => setRealizarPrevisao(null)} />
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