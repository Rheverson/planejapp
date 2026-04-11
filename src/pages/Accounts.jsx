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

const iconMap    = { bank: Building2, wallet: Wallet, digital: Smartphone, investment: TrendingUp, other: MoreHorizontal };
const typeLabels = { bank: "Conta Bancária", wallet: "Carteira", digital: "Conta Digital", investment: "Investimentos", other: "Outros" };
const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

// ── Modal de detalhes ────────────────────────────────────────
function AccountDetailModal({ account, transactions, onClose }) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const Icon = iconMap[account.type] || Wallet;

  const monthStart = startOfMonth(selectedDate);
  const monthEnd   = endOfMonth(selectedDate);

  const currentBalance = useMemo(() => {
    let bal = Number(account.initial_balance) || 0;
    transactions.forEach(t => {
      if (t.is_realized === false) return;
      if (t.type === "income"  && t.account_id === account.id) bal += Number(t.amount);
      else if (t.type === "expense" && t.account_id === account.id) bal -= Number(t.amount);
      else if (t.type === "transfer") {
        if (t.account_id === account.id) bal -= Number(t.amount);
        if (t.transfer_account_id === account.id) bal += Number(t.amount);
      }
    });
    return bal;
  }, [account, transactions]);

  const monthTx = useMemo(() => {
    return transactions
      .filter(t => {
        const date = parseISO(t.date);
        if (!isWithinInterval(date, { start: monthStart, end: monthEnd })) return false;
        return t.account_id === account.id || t.transfer_account_id === account.id;
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [transactions, monthStart, monthEnd, account.id]);

  const monthSummary = useMemo(() => {
    let income = 0, expense = 0;
    monthTx.forEach(t => {
      if (t.is_realized === false) return;
      if (t.type === "income" && t.account_id === account.id) income += t.amount;
      else if (t.type === "expense" && t.account_id === account.id) expense += t.amount;
      else if (t.type === "transfer") {
        if (t.transfer_account_id === account.id) income += t.amount;
        else if (t.account_id === account.id) expense += t.amount;
      }
    });
    return { income, expense, balance: income - expense };
  }, [monthTx, account.id]);

  const getTxIcon = (t) => {
    if (t.type === "transfer") return <ArrowLeftRight className="w-4 h-4 text-blue-500" />;
    if (t.type === "income")   return <ArrowUpRight   className="w-4 h-4 text-emerald-500" />;
    return <ArrowDownRight className="w-4 h-4 text-red-500" />;
  };

  const getTxAmount = (t) => {
    const isIn = t.type === "income" || (t.type === "transfer" && t.transfer_account_id === account.id);
    return (
      <span className={`text-sm font-medium ${isIn ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
        {isIn ? "+" : "-"}{fmt(t.amount)}
      </span>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center pb-16 sm:pb-0"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "100%", opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
      >
        {/* Header do modal */}
        <div className={`${account.color || "bg-blue-600"} px-5 pt-6 pb-4 text-white flex-shrink-0`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                <Icon className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="font-medium text-base leading-tight">{account.name}</p>
                <p className="text-white/65 text-xs">{typeLabels[account.type]}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 bg-white/15 rounded-full">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
          <p className="text-white/65 text-xs mb-0.5">Saldo atual</p>
          <p className="text-2xl font-medium mb-3">{fmt(currentBalance)}</p>
          <MonthSelector selectedDate={selectedDate} onChange={setSelectedDate} />
        </div>

        {/* Resumo mês */}
        <div className="flex border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <div className="flex-1 text-center py-2.5">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Entradas</p>
            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{fmt(monthSummary.income)}</p>
          </div>
          <div className="w-px bg-gray-100 dark:bg-gray-700" />
          <div className="flex-1 text-center py-2.5">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Saídas</p>
            <p className="text-sm font-medium text-red-600 dark:text-red-400">{fmt(monthSummary.expense)}</p>
          </div>
          <div className="w-px bg-gray-100 dark:bg-gray-700" />
          <div className="flex-1 text-center py-2.5">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Saldo mês</p>
            <p className={`text-sm font-medium ${monthSummary.balance >= 0 ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-400"}`}>
              {fmt(monthSummary.balance)}
            </p>
          </div>
        </div>

        {/* Lista de transações */}
        <div className="flex-1 overflow-y-auto">
          {monthTx.length === 0 ? (
            <div className="flex items-center justify-center h-28">
              <p className="text-sm text-gray-400">Nenhuma movimentação no período</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
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
                      {t.is_realized === false && " · Previsto"}
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
  const [showForm, setShowForm]           = useState(false);
  const [editAccount, setEditAccount]     = useState(null);
  const [deleteId, setDeleteId]           = useState(null);
  const [selectedAccount, setSelectedAccount] = useState(null);

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
      const { data, error } = await supabase.from("transactions").select("*").eq("user_id", activeOwnerId);
      if (error) throw error;
      return data;
    },
    enabled: !!activeOwnerId,
  });

  const createMutation = useMutation({
    mutationFn: async (newAccount) => {
      const { data, error } = await supabase.from("accounts")
        .insert([{ ...newAccount, user_id: activeOwnerId, initial_balance: parseFloat(newAccount.initial_balance || 0) }])
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["accounts"] }); setShowForm(false); toast.success("Conta criada!"); },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const { error } = await supabase.from("accounts").update({ ...data, initial_balance: parseFloat(data.initial_balance || 0) }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["accounts"] }); setEditAccount(null); setShowForm(false); toast.success("Conta atualizada!"); },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["accounts"] }); setDeleteId(null); toast.success("Conta removida!"); },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  const accountBalances = useMemo(() => {
    const balances = {};
    accounts.forEach(acc => { balances[acc.id] = Number(acc.initial_balance) || 0; });
    transactions.forEach(t => {
      if (t.is_realized === false) return;
      if (t.type === "income"  && t.account_id) balances[t.account_id] = (balances[t.account_id] || 0) + Number(t.amount);
      else if (t.type === "expense" && t.account_id) balances[t.account_id] = (balances[t.account_id] || 0) - Number(t.amount);
      else if (t.type === "transfer") {
        if (t.account_id) balances[t.account_id] = (balances[t.account_id] || 0) - Number(t.amount);
        if (t.transfer_account_id) balances[t.transfer_account_id] = (balances[t.transfer_account_id] || 0) + Number(t.amount);
      }
    });
    return balances;
  }, [accounts, transactions]);

  const regularAccounts    = accounts.filter(a => a.type !== "investment");
  const investmentAccounts = accounts.filter(a => a.type === "investment");
  const totalBalance    = regularAccounts.reduce((s, a)    => s + (accountBalances[a.id] || 0), 0);
  const totalInvested   = investmentAccounts.reduce((s, a) => s + (accountBalances[a.id] || 0), 0);

  const handleSubmit = (data) =>
    editAccount ? updateMutation.mutate({ id: editAccount.id, data }) : createMutation.mutate(data);

  const AccountRow = ({ account, index }) => {
    const Icon    = iconMap[account.type] || Wallet;
    const balance = accountBalances[account.id] || 0;
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }}
        className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 cursor-pointer"
        onClick={() => setSelectedAccount(account)}
      >
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-xl ${account.color || "bg-blue-600"} flex items-center justify-center flex-shrink-0`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 dark:text-white truncate text-sm">{account.name}</p>
            <p className="text-xs text-gray-400">{typeLabels[account.type]}</p>
          </div>
          <div className="text-right">
            <p className={`text-base font-medium ${balance >= 0 ? "text-gray-900 dark:text-white" : "text-red-600 dark:text-red-400"}`}>
              {fmt(balance)}
            </p>
            {canManage && (
              <div className="flex gap-1 justify-end mt-1" onClick={e => e.stopPropagation()}>
                <button onClick={() => { setEditAccount(account); setShowForm(true); }}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                  <Edit2 className="w-3.5 h-3.5 text-gray-400" />
                </button>
                <button onClick={() => setDeleteId(account.id)}
                  className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                </button>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24 transition-colors duration-200">

      {/* ── HEADER COMPACTO ─────────────────────────────────── */}
      <div className="bg-gradient-to-br from-violet-700 via-violet-800 to-purple-900 text-white">
        <div className="px-5 pt-12 pb-4">
          {isViewingSharedProfile && (
            <p className="text-violet-300 text-xs font-medium mb-2">👁 Visualizando perfil compartilhado</p>
          )}
          <h1 className="text-2xl font-medium text-white mb-3">Minhas Contas</h1>

          {/* Saldo consolidado compacto */}
          <div className="bg-white/10 rounded-2xl px-4 py-3 mb-1">
            <p className="text-violet-200 text-xs mb-0.5">Saldo consolidado</p>
            <p className="text-2xl font-medium">{fmt(totalBalance)}</p>
            {totalInvested > 0 && (
              <p className="text-violet-300 text-xs mt-1">+ {fmt(totalInvested)} investido</p>
            )}
          </div>
        </div>
      </div>

      {/* ── CONTEÚDO ─────────────────────────────────────────── */}
      <div className="px-4 py-4 space-y-4">

        {accounts.length === 0 && (
          <EmptyState
            icon={Wallet}
            title="Nenhuma conta cadastrada"
            description="Adicione suas contas para começar."
            action="Adicionar Conta"
            onAction={() => setShowForm(true)}
          />
        )}

        {regularAccounts.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 px-1">
              Contas
            </p>
            <div className="space-y-2.5">
              {regularAccounts.map((acc, i) => <AccountRow key={acc.id} account={acc} index={i} />)}
            </div>
          </div>
        )}

        {investmentAccounts.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 px-1">
              Investimentos
            </p>
            <div className="space-y-2.5">
              {investmentAccounts.map((acc, i) => <AccountRow key={acc.id} account={acc} index={i} />)}
            </div>
          </div>
        )}
      </div>

      {/* FAB */}
      {canManage && (
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => { setEditAccount(null); setShowForm(true); }}
          className="fixed bottom-24 right-5 bg-violet-700 text-white rounded-full shadow-lg shadow-violet-700/30 flex items-center justify-center z-40"
          style={{ width: 52, height: 52 }}
        >
          <Plus className="w-5 h-5" />
        </motion.button>
      )}

      <AnimatePresence>
        {showForm && (
          <AccountForm
            account={editAccount}
            onSubmit={handleSubmit}
            onClose={() => { setShowForm(false); setEditAccount(null); }}
          />
        )}
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
            <AlertDialogAction onClick={() => deleteMutation.mutate(deleteId)} className="bg-red-600 hover:bg-red-700">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}