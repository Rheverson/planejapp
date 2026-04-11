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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Goals() {
  const { user } = useAuth();
  const { activeOwnerId, isViewingSharedProfile, sharedPermissions } = useSharedProfile();
  const [showForm, setShowForm]   = useState(false);
  const [editGoal, setEditGoal]   = useState(null);
  const [deleteId, setDeleteId]   = useState(null);
  const queryClient = useQueryClient();

  const ownerId     = activeOwnerId ?? user?.id;
  const canAddGoals = !isViewingSharedProfile || sharedPermissions?.add_transactions;

  const { data: goals = [], isLoading: goalsLoading, error: goalsError } = useQuery({
    queryKey: ["goals", ownerId],
    queryFn: async () => {
      if (isViewingSharedProfile) {
        const { data, error } = await supabase.rpc("get_shared_goals", { p_owner_id: ownerId });
        if (error) throw error;
        return data ?? [];
      }
      const { data, error } = await supabase.from("goals").select("*").eq("user_id", ownerId).order("end_date");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!ownerId,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("*").eq("user_id", ownerId).order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!ownerId,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions").select("*").eq("user_id", ownerId).order("date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!ownerId,
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      if (!ownerId) throw new Error("Usuário não identificado.");
      const { error } = await supabase.from("goals").insert([{ ...data, user_id: ownerId }]);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["goals", ownerId] }); setShowForm(false); toast.success("Meta criada!"); },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      if (!ownerId) throw new Error("Usuário não identificado.");
      const { error } = await supabase.from("goals").update(data).eq("id", id).eq("user_id", ownerId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["goals", ownerId] }); setEditGoal(null); setShowForm(false); toast.success("Meta atualizada!"); },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      if (!ownerId) throw new Error("Usuário não identificado.");
      const { error } = await supabase.from("goals").delete().eq("id", id).eq("user_id", ownerId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["goals", ownerId] }); setDeleteId(null); toast.success("Meta excluída!"); },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  const goalsWithProgress = useMemo(() => {
    const getPeriodBounds = (goal) => {
      const now = new Date();
      if (goal.contribution_period === "daily") {
        const s = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const e = new Date(s); e.setDate(e.getDate() + 1);
        return { start: s, end: e };
      }
      if (goal.contribution_period === "weekly") {
        const s = new Date(now); s.setDate(now.getDate() - now.getDay()); s.setHours(0,0,0,0);
        const e = new Date(s); e.setDate(s.getDate() + 7);
        return { start: s, end: e };
      }
      if (goal.contribution_period === "yearly") {
        return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear() + 1, 0, 1) };
      }
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
    };

    return goals.map((goal) => {
      let current = 0;
      if (goal.type === "investment") {
        if (goal.investment_type === "contribution") {
          const { start, end } = getPeriodBounds(goal);
          transactions.forEach((t) => {
            if (!t.is_realized) return;
            if (t.account_id !== goal.linked_account_id) return;
            if (t.type !== "income") return;
            const date = parseISO(t.date);
            if (date < start || date >= end) return;
            current += Number(t.amount);
          });
        } else {
          const account = accounts.find(a => a.id === goal.linked_account_id);
          if (account) {
            current = Number(account.initial_balance) || 0;
            transactions.forEach((t) => {
              if (!t.is_realized) return;
              if (t.type === "transfer") {
                if (t.transfer_account_id === goal.linked_account_id) current += Number(t.amount);
                if (t.account_id === goal.linked_account_id) current -= Number(t.amount);
                return;
              }
              if (t.account_id !== goal.linked_account_id) return;
              if (t.type === "income") current += Number(t.amount);
              if (t.type === "expense") current -= Number(t.amount);
            });
          } else {
            const start = parseISO(goal.start_date), end = parseISO(goal.end_date);
            transactions.forEach((t) => {
              if (!t.is_realized) return;
              const date = parseISO(t.date);
              if (!isWithinInterval(date, { start, end })) return;
              const acc = accounts.find(a => a.id === t.account_id);
              if (acc?.type === "investment") {
                if (t.type === "income") current += Number(t.amount);
                if (t.type === "expense") current -= Number(t.amount);
              }
            });
          }
        }
      } else {
        const start = parseISO(goal.start_date), end = parseISO(goal.end_date);
        transactions.forEach((t) => {
          if (!t.is_realized) return;
          const date = parseISO(t.date);
          if (!isWithinInterval(date, { start, end })) return;
          if (t.type !== goal.type) return;
          if (goal.category && t.category !== goal.category) return;
          current += Number(t.amount);
        });
      }
      return { ...goal, current };
    });
  }, [goals, transactions, accounts]);

  const activeGoals    = goalsWithProgress.filter(g => !isBefore(parseISO(g.end_date), new Date()));
  const completedGoals = goalsWithProgress.filter(g => isBefore(parseISO(g.end_date), new Date()));
  const expenseGoals   = activeGoals.filter(g => g.type === "expense");
  const incomeGoals    = activeGoals.filter(g => g.type === "income");
  const investmentGoals = activeGoals.filter(g => g.type === "investment");

  const handleSubmit = (data) => {
    if (editGoal) updateMutation.mutate({ id: editGoal.id, data });
    else createMutation.mutate(data);
  };

  const goalsErrorMessage = goalsError instanceof Error
    ? goalsError.message
    : goalsError?.message || JSON.stringify(goalsError) || "Erro desconhecido.";

  const Section = ({ title, goals: list }) => (
    <div>
      <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 px-1">{title}</p>
      <div className="space-y-2.5">
        {list.map((goal, i) => (
          <GoalProgressCard
            key={goal.id} goal={goal} current={goal.current}
            onEdit={canAddGoals ? (g) => { setEditGoal(g); setShowForm(true); } : undefined}
            onDelete={canAddGoals ? setDeleteId : undefined}
            delay={i * 0.08}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24 transition-colors duration-200">

      {/* ── HEADER COMPACTO ─────────────────────────────────── */}
      <div className="bg-gradient-to-br from-purple-700 via-purple-800 to-indigo-900 text-white">
        <div className="px-5 pt-12 pb-4">
          {isViewingSharedProfile && (
            <p className="text-purple-300 text-xs font-medium mb-2">👁 Visualizando perfil compartilhado</p>
          )}
          <h1 className="text-2xl font-medium text-white mb-1">Minhas Metas</h1>
          <p className="text-purple-300 text-sm">{activeGoals.length} {activeGoals.length === 1 ? "meta ativa" : "metas ativas"}</p>
        </div>

        {/* Resumo rápido */}
        {activeGoals.length > 0 && (
          <div className="flex gap-0 mx-5 mb-4 bg-white/10 rounded-2xl overflow-hidden">
            <div className="flex-1 text-center py-2.5 px-2">
              <p className="text-[10px] text-purple-200 mb-0.5 uppercase tracking-wide">Saídas</p>
              <p className="text-sm font-medium text-white">{expenseGoals.length}</p>
            </div>
            <div className="w-px bg-white/20" />
            <div className="flex-1 text-center py-2.5 px-2">
              <p className="text-[10px] text-purple-200 mb-0.5 uppercase tracking-wide">Entradas</p>
              <p className="text-sm font-medium text-white">{incomeGoals.length}</p>
            </div>
            <div className="w-px bg-white/20" />
            <div className="flex-1 text-center py-2.5 px-2">
              <p className="text-[10px] text-purple-200 mb-0.5 uppercase tracking-wide">Invest.</p>
              <p className="text-sm font-medium text-white">{investmentGoals.length}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── CONTEÚDO ─────────────────────────────────────────── */}
      <div className="px-4 py-4 space-y-5">

        {!ownerId && (
          <div className="rounded-2xl bg-white dark:bg-gray-800 p-4 border border-red-200 dark:border-red-900">
            <p className="text-sm font-medium text-red-600 dark:text-red-400">Não foi possível identificar o perfil ativo.</p>
          </div>
        )}

        {ownerId && goalsLoading && (
          <div className="rounded-2xl bg-white dark:bg-gray-800 p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Carregando metas...</p>
          </div>
        )}

        {ownerId && goalsError && (
          <div className="rounded-2xl bg-white dark:bg-gray-800 p-4 border border-red-200 dark:border-red-900">
            <p className="text-sm font-medium text-red-600 dark:text-red-400">Erro ao carregar metas.</p>
            <p className="text-xs text-red-500 mt-1 break-all">{goalsErrorMessage}</p>
          </div>
        )}

        {!goalsLoading && !goalsError && activeGoals.length === 0 && (
          <EmptyState
            icon={Target}
            title="Nenhuma meta ativa"
            description="Crie metas para acompanhar seu progresso financeiro."
            action={canAddGoals ? "Criar Meta" : undefined}
            onAction={canAddGoals ? () => setShowForm(true) : undefined}
          />
        )}

        {!goalsLoading && !goalsError && investmentGoals.length > 0 && (
          <Section title="Investimentos" goals={investmentGoals} />
        )}

        {!goalsLoading && !goalsError && expenseGoals.length > 0 && (
          <Section title="Metas de saídas" goals={expenseGoals} />
        )}

        {!goalsLoading && !goalsError && incomeGoals.length > 0 && (
          <Section title="Metas de entradas" goals={incomeGoals} />
        )}

        {!goalsLoading && !goalsError && completedGoals.length > 0 && (
          <div className="opacity-60">
            <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 px-1">Encerradas</p>
            <div className="space-y-2.5">
              {completedGoals.map((goal, i) => (
                <GoalProgressCard
                  key={goal.id} goal={goal} current={goal.current}
                  onEdit={canAddGoals ? (g) => { setEditGoal(g); setShowForm(true); } : undefined}
                  onDelete={canAddGoals ? setDeleteId : undefined}
                  delay={i * 0.08}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* FAB */}
      {canAddGoals && (
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => { setEditGoal(null); setShowForm(true); }}
          className="fixed bottom-24 right-5 bg-purple-700 text-white rounded-full shadow-lg shadow-purple-700/30 flex items-center justify-center z-40"
          style={{ width: 52, height: 52 }}
        >
          <Plus className="w-5 h-5" />
        </motion.button>
      )}

      <AnimatePresence>
        {showForm && canAddGoals && (
          <GoalForm
            goal={editGoal} accounts={accounts} onSubmit={handleSubmit}
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
            <AlertDialogAction onClick={() => { if (deleteId) deleteMutation.mutate(deleteId); }} className="bg-red-600 hover:bg-red-700">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}