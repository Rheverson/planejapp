import React, { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useSharedProfile } from "@/lib/SharedProfileContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Target } from "lucide-react";
import { parseISO, isWithinInterval, isBefore } from "date-fns";
import { toast } from "sonner";

import GoalForm from "@/components/goals/GoalForm";
import GoalProgressCard from "@/components/goals/GoalProgressCard";
import EmptyState from "@/components/common/EmptyState";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Goals() {
  const { user } = useAuth();
  const { activeOwnerId, isViewingSharedProfile, sharedPermissions } = useSharedProfile();
  const [showForm, setShowForm] = useState(false);
  const [editGoal, setEditGoal] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const queryClient = useQueryClient();

  const ownerId = activeOwnerId ?? user?.id;

  const canAddGoals = !isViewingSharedProfile || sharedPermissions?.add_transactions;

  const {
    data: goals = [],
    isLoading: goalsLoading,
    error: goalsError,
  } = useQuery({
    queryKey: ["goals", ownerId],
    queryFn: async () => {
      if (isViewingSharedProfile) {
        const { data, error } = await supabase.rpc("get_shared_goals", { p_owner_id: ownerId });
        if (error) throw error;
        return data ?? [];
      }
      const { data, error } = await supabase
        .from("goals")
        .select("*")
        .eq("user_id", ownerId)
        .order("end_date");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!ownerId,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .eq("user_id", ownerId)
        .order("name");

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!ownerId,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", ownerId)
        .order("date", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!ownerId,
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      if (!ownerId) {
        throw new Error("Usuário não identificado.");
      }

      const { error } = await supabase.from("goals").insert([
        {
          ...data,
          user_id: ownerId,
        },
      ]);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals", ownerId] });
      setShowForm(false);
      toast.success("Meta criada!");
    },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      if (!ownerId) {
        throw new Error("Usuário não identificado.");
      }

      const { error } = await supabase
        .from("goals")
        .update(data)
        .eq("id", id)
        .eq("user_id", ownerId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals", ownerId] });
      setEditGoal(null);
      setShowForm(false);
      toast.success("Meta atualizada!");
    },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      if (!ownerId) {
        throw new Error("Usuário não identificado.");
      }

      const { error } = await supabase
        .from("goals")
        .delete()
        .eq("id", id)
        .eq("user_id", ownerId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals", ownerId] });
      setDeleteId(null);
      toast.success("Meta excluída!");
    },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  const goalsWithProgress = useMemo(() => {
    return goals.map((goal) => {
      let current = 0;

      if (goal.linked_account_id) {
        const start = parseISO(goal.start_date);
        const end = parseISO(goal.end_date);

        transactions.forEach((t) => {
          if (t.is_realized === false) return;
          if (
            t.account_id !== goal.linked_account_id &&
            t.transfer_account_id !== goal.linked_account_id
          ) {
            return;
          }

          const date = parseISO(t.date);
          if (!isWithinInterval(date, { start, end })) return;

          if (t.type === "income" && t.account_id === goal.linked_account_id) {
            current += t.amount;
          } else if (t.type === "expense" && t.account_id === goal.linked_account_id) {
            current -= t.amount;
          } else if (t.type === "transfer") {
            if (t.transfer_account_id === goal.linked_account_id) current += t.amount;
            if (t.account_id === goal.linked_account_id) current -= t.amount;
          }
        });
      } else {
        const start = parseISO(goal.start_date);
        const end = parseISO(goal.end_date);

        transactions.forEach((t) => {
          if (t.is_realized === false) return;
          const date = parseISO(t.date);
          if (!isWithinInterval(date, { start, end })) return;

          if (goal.type === 'investment') {
            // Para metas de investimento: soma entradas em contas de investimento
            const account = accounts.find(a => a.id === t.account_id);
            if (account?.type === 'investment') {
              if (t.type === 'income') current += t.amount;
              else if (t.type === 'expense') current -= t.amount;
            }
          } else {
            // Para metas de income/expense: filtra por tipo e categoria
            if (t.type !== goal.type) return;
            if (goal.category && t.category !== goal.category) return;
            current += t.amount;
          }
        });
      }

      return { ...goal, current };
    });
  }, [goals, transactions, accounts]);

  const activeGoals = goalsWithProgress.filter(
    (g) => !isBefore(parseISO(g.end_date), new Date())
  );
  const completedGoals = goalsWithProgress.filter((g) =>
    isBefore(parseISO(g.end_date), new Date())
  );

  const expenseGoals = activeGoals.filter((g) => g.type === "expense");
  const incomeGoals = activeGoals.filter((g) => g.type === "income");
  const investmentGoals = activeGoals.filter((g) => g.type === "investment");

  const handleSubmit = (data) => {
    if (editGoal) {
      updateMutation.mutate({ id: editGoal.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const goalsErrorMessage =
    goalsError instanceof Error
      ? goalsError.message
      : goalsError?.message || JSON.stringify(goalsError) || "Erro desconhecido ao carregar metas.";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24 transition-colors duration-200">
      <div className="bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800 text-white">
        <div className="px-5 pt-12 pb-8">
          {isViewingSharedProfile && (
            <p className="text-purple-200 text-xs font-medium mb-2">
              Visualizando perfil compartilhado
            </p>
          )}
          <h1 className="text-2xl font-bold mb-2">Minhas Metas</h1>
          <p className="text-purple-200 text-sm">{activeGoals.length} metas ativas</p>
        </div>
      </div>

      <div className="px-5 py-6 -mt-4 relative z-10 space-y-6">
        {!ownerId && (
          <div className="rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-sm border border-red-200 dark:border-red-900">
            <p className="text-sm font-medium text-red-600 dark:text-red-400">
              Não foi possível identificar o perfil ativo.
            </p>
          </div>
        )}

        {ownerId && goalsLoading && (
          <div className="rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-sm">
            <p className="text-sm text-gray-600 dark:text-gray-300">Carregando metas...</p>
          </div>
        )}

        {ownerId && goalsError && (
          <div className="rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-sm border border-red-200 dark:border-red-900">
            <p className="text-sm font-medium text-red-600 dark:text-red-400">
              Erro ao carregar metas.
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
              Se isso acontece só no perfil compartilhado, o problema provavelmente está na
              policy RLS da tabela goals.
            </p>
            <p className="text-xs text-red-500 mt-2 break-all">{goalsErrorMessage}</p>
          </div>
        )}

        {!goalsLoading && !goalsError && activeGoals.length === 0 && (
          <EmptyState
            icon={Target}
            title="Nenhuma meta ativa"
            description="Crie metas de curto, médio ou longo prazo para acompanhar seu progresso."
            action={canAddGoals ? "Criar Meta" : undefined}
            onAction={canAddGoals ? () => setShowForm(true) : undefined}
          />
        )}

        {!goalsLoading && !goalsError && investmentGoals.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">
              Investimentos
            </h2>
            <div className="space-y-3">
              {investmentGoals.map((goal, i) => (
                <GoalProgressCard
                  key={goal.id}
                  goal={goal}
                  current={goal.current}
                  onEdit={canAddGoals ? (g) => { setEditGoal(g); setShowForm(true); } : undefined}
                  onDelete={canAddGoals ? setDeleteId : undefined}
                  delay={i * 0.1}
                />
              ))}
            </div>
          </div>
        )}

        {!goalsLoading && !goalsError && expenseGoals.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">
              Metas de Saídas
            </h2>
            <div className="space-y-3">
              {expenseGoals.map((goal, i) => (
                <GoalProgressCard
                  key={goal.id}
                  goal={goal}
                  current={goal.current}
                  onEdit={canAddGoals ? (g) => { setEditGoal(g); setShowForm(true); } : undefined}
                  onDelete={canAddGoals ? setDeleteId : undefined}
                  delay={i * 0.1}
                />
              ))}
            </div>
          </div>
        )}

        {!goalsLoading && !goalsError && incomeGoals.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">
              Metas de Entradas
            </h2>
            <div className="space-y-3">
              {incomeGoals.map((goal, i) => (
                <GoalProgressCard
                  key={goal.id}
                  goal={goal}
                  current={goal.current}
                  onEdit={canAddGoals ? (g) => { setEditGoal(g); setShowForm(true); } : undefined}
                  onDelete={canAddGoals ? setDeleteId : undefined}
                  delay={i * 0.1}
                />
              ))}
            </div>
          </div>
        )}

        {!goalsLoading && !goalsError && completedGoals.length > 0 && (
          <div>
            <h2 className="text-base font-semibold text-gray-400 dark:text-gray-500 mb-3">
              Encerradas
            </h2>
            <div className="space-y-3 opacity-60">
              {completedGoals.map((goal, i) => (
                <GoalProgressCard
                  key={goal.id}
                  goal={goal}
                  current={goal.current}
                  onEdit={canAddGoals ? (g) => { setEditGoal(g); setShowForm(true); } : undefined}
                  onDelete={canAddGoals ? setDeleteId : undefined}
                  delay={i * 0.1}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {canAddGoals && (
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => {
            setEditGoal(null);
            setShowForm(true);
          }}
          className="fixed bottom-24 right-5 w-14 h-14 bg-purple-600 text-white rounded-full shadow-lg shadow-purple-600/30 flex items-center justify-center z-40"
        >
          <Plus className="w-6 h-6" />
        </motion.button>
      )}

      <AnimatePresence>
        {showForm && canAddGoals && (
          <GoalForm
            goal={editGoal}
            accounts={accounts}
            onSubmit={handleSubmit}
            onClose={() => {
              setShowForm(false);
              setEditGoal(null);
            }}
          />
        )}
      </AnimatePresence>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir meta?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) deleteMutation.mutate(deleteId);
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
