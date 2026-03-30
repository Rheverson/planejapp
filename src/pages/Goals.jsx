import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Target } from "lucide-react";
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO } from "date-fns";

import GoalForm from "@/components/goals/GoalForm";
import GoalProgressCard from "@/components/goals/GoalProgressCard";
import MonthSelector from "@/components/common/MonthSelector";
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
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showForm, setShowForm] = useState(false);
  const [editGoal, setEditGoal] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const queryClient = useQueryClient();

  const monthKey = format(selectedDate, "yyyy-MM");

  const { data: goals = [] } = useQuery({
    queryKey: ['goals'],
    queryFn: () => base44.entities.Goal.list()
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list()
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Goal.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      setShowForm(false);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Goal.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      setEditGoal(null);
      setShowForm(false);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Goal.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      setDeleteId(null);
    }
  });

  // Filter goals for selected month
  const monthGoals = goals.filter(g => g.month === monthKey);

  // Calculate current spending/income per category for the month
  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);

  const categoryTotals = useMemo(() => {
    const totals = {};
    
    transactions.forEach(t => {
      if (t.is_realized === false) return;
      
      const date = parseISO(t.date);
      if (!isWithinInterval(date, { start: monthStart, end: monthEnd })) return;

      const key = `${t.type}-${t.category}`;
      totals[key] = (totals[key] || 0) + t.amount;
    });

    return totals;
  }, [transactions, monthStart, monthEnd]);

  const handleSubmit = (data) => {
    if (editGoal) {
      updateMutation.mutate({ id: editGoal.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (goal) => {
    setEditGoal(goal);
    setShowForm(true);
  };

  // Separate goals by type
  const incomeGoals = monthGoals.filter(g => g.type === 'income');
  const expenseGoals = monthGoals.filter(g => g.type === 'expense');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24 transition-colors duration-200">
      {/* Header */}
      <div className="bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800 dark:from-purple-700 dark:via-purple-800 dark:to-indigo-900 text-white">
        <div className="px-5 pt-12 pb-8">
          <h1 className="text-2xl font-bold mb-6">Minhas Metas</h1>
          <MonthSelector selectedDate={selectedDate} onChange={setSelectedDate} />
        </div>
      </div>

      {/* Content */}
      <div className="px-5 py-6 -mt-4 relative z-10">
        {monthGoals.length > 0 ? (
          <div className="space-y-6">
            {/* Expense Goals */}
            {expenseGoals.length > 0 && (
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">Metas de Saídas</h2>
                <div className="space-y-3">
                  {expenseGoals.map((goal, index) => {
                    const key = `expense-${goal.category}`;
                    const current = categoryTotals[key] || 0;
                    return (
                      <GoalProgressCard
                        key={goal.id}
                        goal={goal}
                        current={current}
                        onEdit={handleEdit}
                        onDelete={setDeleteId}
                        delay={index * 0.1}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Income Goals */}
            {incomeGoals.length > 0 && (
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">Metas de Entradas</h2>
                <div className="space-y-3">
                  {incomeGoals.map((goal, index) => {
                    const key = `income-${goal.category}`;
                    const current = categoryTotals[key] || 0;
                    return (
                      <GoalProgressCard
                        key={goal.id}
                        goal={goal}
                        current={current}
                        onEdit={handleEdit}
                        onDelete={setDeleteId}
                        delay={(expenseGoals.length + index) * 0.1}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <EmptyState
            icon={Target}
            title="Nenhuma meta definida"
            description="Crie metas de entradas ou saídas para acompanhar seu progresso financeiro."
            action="Criar Meta"
            onAction={() => setShowForm(true)}
          />
        )}
      </div>

      {/* FAB */}
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

      {/* Form Modal */}
      <AnimatePresence>
        {showForm && (
          <GoalForm
            goal={editGoal}
            month={monthKey}
            onSubmit={handleSubmit}
            onClose={() => {
              setShowForm(false);
              setEditGoal(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir meta?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A meta será permanentemente removida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(deleteId)}
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