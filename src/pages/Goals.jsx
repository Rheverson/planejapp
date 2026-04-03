import React, { useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useSharedProfile } from "@/lib/SharedProfileContext"; // ➕ Adicione isto
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Target } from "lucide-react";
import { parseISO, isWithinInterval, isAfter, isBefore } from "date-fns";
import { toast } from "sonner";
import { useMonth } from "@/lib/MonthContext";

import GoalForm from "@/components/goals/GoalForm";
import GoalProgressCard from "@/components/goals/GoalProgressCard";
import EmptyState from "@/components/common/EmptyState";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Goals() {
  const { user } = useAuth();
  const { isViewingSharedProfile, activeOwnerId } = useSharedProfile(); // ➕ Adicione isto
  const { selectedDate } = useMonth();
  const [showForm, setShowForm] = useState(false);
  const [editGoal, setEditGoal] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const queryClient = useQueryClient();

  // ➕ Determina qual ID usar (próprio ou do perfil compartilhado)
  const targetUserId = isViewingSharedProfile ? activeOwnerId : user?.id;
  
  // ➕ Determina se pode editar (só pode editar seu próprio perfil)
  const canEdit = !isViewingSharedProfile;

  const { data: goals = [] } = useQuery({
    queryKey: ['goals', targetUserId], // ✅ Usa targetUserId
    queryFn: async () => {
      const { data, error } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', targetUserId) // ✅ Busca do dono correto
        .order('end_date');
      if (error) throw error;
      return data;
    },
    enabled: !!targetUserId // ✅ Valida se tem ID
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', targetUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', targetUserId); // ✅ Busca do dono correto
      if (error) throw error;
      return data;
    },
    enabled: !!targetUserId
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions', targetUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', targetUserId); // ✅ Busca do dono correto
      if (error) throw error;
      return data;
    },
    enabled: !!targetUserId
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const { error } = await supabase.from('goals').insert([{ ...data, user_id: user?.id }]);
      if (error) throw error;
    },
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ['goals', user?.id] }); 
      setShowForm(false); 
      toast.success("Meta criada!"); 
    },
    onError: (err) => toast.error("Erro: " + err.message)
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const { error } = await supabase.from('goals').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ['goals', user?.id] }); 
      setEditGoal(null); 
      setShowForm(false); 
      toast.success("Meta atualizada!"); 
    },
    onError: (err) => toast.error("Erro: " + err.message)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('goals').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ['goals', user?.id] }); 
      setDeleteId(null); 
      toast.success("Meta excluída!"); 
    },
    onError: (err) => toast.error("Erro: " + err.message)
  });

  // Calcula progresso real de cada meta com base nas transações do período
  const goalsWithProgress = useMemo(() => {
    return goals.map(goal => {
      let current = 0;

      if (goal.linked_account_id) {
        const start = parseISO(goal.start_date);
        const end = parseISO(goal.end_date);
        
        transactions.forEach(t => {
          if (t.is_realized === false) return;
          if (t.account_id !== goal.linked_account_id && t.transfer_account_id !== goal.linked_account_id) return;
          
          const date = parseISO(t.date);
          if (!isWithinInterval(date, { start, end })) return;

          if (t.type === 'income' && t.account_id === goal.linked_account_id) {
            current += t.amount;
          } else if (t.type === 'expense' && t.account_id === goal.linked_account_id) {
            current -= t.amount;
          } else if (t.type === 'transfer') {
            if (t.transfer_account_id === goal.linked_account_id) current += t.amount;
            if (t.account_id === goal.linked_account_id) current -= t.amount;
          }
        });

      } else {
        const start = parseISO(goal.start_date);
        const end = parseISO(goal.end_date);
        transactions.forEach(t => {
          if (t.is_realized === false || t.type !== goal.type) return;
          if (goal.category && t.category !== goal.category) return;
          const date = parseISO(t.date);
          if (isWithinInterval(date, { start, end })) current += t.amount;
        });
      }

      return { ...goal, current };
    });
  }, [goals, transactions, accounts]);

  const activeGoals = goalsWithProgress.filter(g => !isBefore(parseISO(g.end_date), new Date()));
  const completedGoals = goalsWithProgress.filter(g => isBefore(parseISO(g.end_date), new Date()));

  const expenseGoals = activeGoals.filter(g => g.type === 'expense');
  const incomeGoals = activeGoals.filter(g => g.type === 'income');
  const investmentGoals = activeGoals.filter(g => g.type === 'investment');

  const handleSubmit = (data) => {
    if (editGoal) updateMutation.mutate({ id: editGoal.id, data });
    else createMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24 transition-colors duration-200">
      <div className="bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800 text-white">
        <div className="px-5 pt-12 pb-8">
          <h1 className="text-2xl font-bold mb-2">
            {isViewingSharedProfile ? "Metas de " + activeOwnerId : "Minhas Metas"} {/* ➕ Título dinâmico */}
          </h1>
          <p className="text-purple-200 text-sm">{activeGoals.length} metas ativas</p>
        </div>
      </div>

      <div className="px-5 py-6 -mt-4 relative z-10 space-y-6">
        {activeGoals.length === 0 && (
          <EmptyState icon={Target} title="Nenhuma meta ativa"
            description="Crie metas de curto, médio ou longo prazo para acompanhar seu progresso."
            action={canEdit ? "Criar Meta" : undefined} // ➕ Botão só aparece se pode editar
            onAction={canEdit ? () => setShowForm(true) : undefined} />
        )}

        {investmentGoals.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">Investimentos</h2>
            <div className="space-y-3">
              {investmentGoals.map((goal, i) => (
                <GoalProgressCard 
                  key={goal.id} 
                  goal={goal} 
                  current={goal.current}
                  onEdit={canEdit ? (g) => { setEditGoal(g); setShowForm(true); } : undefined} // ➕ Edição desabilitada
                  onDelete={canEdit ? setDeleteId : undefined} // ➕ Exclusão desabilitada
                  delay={i * 0.1} 
                />
              ))}
            </div>
          </div>
        )}

        {expenseGoals.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">Metas de Saídas</h2>
            <div className="space-y-3">
              {expenseGoals.map((goal, i) => (
                <GoalProgressCard 
                  key={goal.id} 
                  goal={goal} 
                  current={goal.current}
                  onEdit={canEdit ? (g) => { setEditGoal(g); setShowForm(true); } : undefined}
                  onDelete={canEdit ? setDeleteId : undefined}
                  delay={i * 0.1} 
                />
              ))}
            </div>
          </div>
        )}

        {incomeGoals.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">Metas de Entradas</h2>
            <div className="space-y-3">
              {incomeGoals.map((goal, i) => (
                <GoalProgressCard 
                  key={goal.id} 
                  goal={goal} 
                  current={goal.current}
                  onEdit={canEdit ? (g) => { setEditGoal(g); setShowForm(true); } : undefined}
                  onDelete={canEdit ? setDeleteId : undefined}
                  delay={i * 0.1} 
                />
              ))}
            </div>
          </div>
        )}

        {completedGoals.length > 0 && (
          <div>
            <h2 className="text-base font-semibold text-gray-400 dark:text-gray-500 mb-3">Encerradas</h2>
            <div className="space-y-3 opacity-60">
              {completedGoals.map((goal, i) => (
                <GoalProgressCard 
                  key={goal.id} 
                  goal={goal} 
                  current={goal.current}
                  onEdit={canEdit ? (g) => { setEditGoal(g); setShowForm(true); } : undefined}
                  onDelete={canEdit ? setDeleteId : undefined}
                  delay={i * 0.1} 
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {canEdit && ( // ➕ Botão só aparece se pode editar
        <motion.button 
          whileTap={{ scale: 0.9 }} 
          onClick={() => { setEditGoal(null); setShowForm(true); }}
          className="fixed bottom-24 right-5 w-14 h-14 bg-purple-600 text-white rounded-full shadow-lg shadow-purple-600/30 flex items-center justify-center z-40">
          <Plus className="w-6 h-6" />
        </motion.button>
      )}

      <AnimatePresence>
        {showForm && canEdit && (
          <GoalForm 
            goal={editGoal} 
            accounts={accounts}
            onSubmit={handleSubmit}
            onClose={() => { setShowForm(false); setEditGoal(null); }} 
          />
        )}
      </AnimatePresence>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir meta?</AlertDialogTitle>
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