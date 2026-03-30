import React, { useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useSharedProfile } from "@/lib/SharedProfileContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Building2, Wallet, Smartphone, TrendingUp, MoreHorizontal, Trash2, Edit2 } from "lucide-react";
import { toast } from "sonner";

import AccountForm from "@/components/accounts/AccountForm";
import EmptyState from "@/components/common/EmptyState";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const iconMap = { bank: Building2, wallet: Wallet, digital: Smartphone, investment: TrendingUp, other: MoreHorizontal };
const typeLabels = { bank: "Conta Bancária", wallet: "Carteira", digital: "Conta Digital", investment: "Investimentos", other: "Outros" };

export default function Accounts() {
  const { user } = useAuth();
  const { activeOwnerId, isViewingSharedProfile, sharedPermissions } = useSharedProfile();
  const canManage = !isViewingSharedProfile || sharedPermissions?.add_transactions; // <- mesma permissão
  console.log('🔍 activeOwnerId:', activeOwnerId);
  console.log('🔍 isViewingSharedProfile:', isViewingSharedProfile);
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editAccount, setEditAccount] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', activeOwnerId],
    queryFn: async () => {
      console.log('📦 Buscando contas para:', activeOwnerId);
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', activeOwnerId)
        .order('name');
        console.log('📦 Contas encontradas:', data, 'Erro:', error);
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
        .eq('user_id', activeOwnerId);
      if (error) throw error;
      return data;
    },
    enabled: !!activeOwnerId
  });

  const createMutation = useMutation({
    mutationFn: async (newAccount) => {
      const { data, error } = await supabase
        .from('accounts')
        .insert([{ 
          ...newAccount, 
          user_id: activeOwnerId,  // <- era user.id
          initial_balance: parseFloat(newAccount.initial_balance || 0) 
        }])
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
      if (t.account_id && balances.hasOwnProperty(t.account_id) && t.is_realized !== false) {
        balances[t.account_id] += t.type === 'income' ? t.amount : -t.amount;
      }
    });
    return balances;
  }, [accounts, transactions]);

  const totalBalance = Object.values(accountBalances).reduce((sum, b) => sum + b, 0);
  const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
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
            <p className="text-3xl font-bold">{formatCurrency(totalBalance)}</p>
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
                  className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-xl ${account.color || 'bg-blue-500'} flex items-center justify-center`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white truncate">{account.name}</p>
                      <p className="text-sm text-gray-500">{typeLabels[account.type]}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${balance >= 0 ? 'text-gray-900 dark:text-white' : 'text-red-600'}`}>{formatCurrency(balance)}</p>
                      {canManage && (
                        <div className="flex gap-1 justify-end mt-1">
                          <button onClick={() => { setEditAccount(account); setShowForm(true); }}>
                            <Edit2 className="w-4 h-4 text-gray-400" />
                          </button>
                          <button onClick={() => setDeleteId(account.id)}>
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