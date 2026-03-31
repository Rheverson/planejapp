import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, TrendingDown, Edit2, Trash2, PiggyBank } from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export default function GoalProgressCard({ goal, current, onEdit, onDelete, delay = 0 }) {
  const percentage = goal.target_amount > 0 ? Math.min((current / goal.target_amount) * 100, 100) : 0;
  const isIncome = goal.type === 'income';
  const isInvestment = goal.type === 'investment';
  const isComplete = current >= goal.target_amount;

  const daysLeft = goal.end_date
    ? Math.max(0, differenceInDays(parseISO(goal.end_date), new Date()))
    : null;

  const color = isInvestment ? 'violet' : isIncome ? 'emerald' : 'red';
  const colorMap = {
    violet: { bg: 'bg-violet-50 dark:bg-violet-900/30', text: 'text-violet-600 dark:text-violet-400', bar: 'from-violet-400 to-violet-600' },
    emerald: { bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-400', bar: 'from-emerald-400 to-emerald-600' },
    red: { bg: 'bg-red-50 dark:bg-red-900/30', text: 'text-red-600 dark:text-red-400', bar: 'from-red-400 to-red-600' },
  };
  const c = colorMap[color];
  const Icon = isInvestment ? PiggyBank : isIncome ? TrendingUp : TrendingDown;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">

      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center`}>
            <Icon className={`w-5 h-5 ${c.text}`} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">{goal.name || goal.category}</h3>
            <div className="flex items-center gap-2">
              <p className="text-xs text-gray-500 capitalize">{goal.category}</p>
              {goal.end_date && (
                <p className="text-xs text-gray-400">
                  · {daysLeft === 0 ? 'Hoje!' : `${daysLeft} dias restantes`}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-1">
          <button type="button" onClick={() => onEdit(goal)}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <Edit2 className="w-4 h-4 text-gray-400" />
          </button>
          <button type="button" onClick={() => onDelete(goal.id)}
            className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
            <Trash2 className="w-4 h-4 text-red-400" />
          </button>
        </div>
      </div>

      <div className="mb-3">
        <div className="flex justify-between items-baseline mb-2">
          <span className={`text-2xl font-bold ${c.text}`}>{fmt(current)}</span>
          <span className="text-sm text-gray-500">de {fmt(goal.target_amount)}</span>
        </div>
        <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <motion.div initial={{ width: 0 }} animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className={`h-full rounded-full bg-gradient-to-r ${isComplete ? 'from-green-500 to-emerald-500' : c.bar}`} />
        </div>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className={`font-semibold ${isComplete ? 'text-green-600' : c.text}`}>
          {percentage.toFixed(0)}% {isComplete ? '✓' : ''}
        </span>
        <span className="text-gray-500">
          {isComplete ? 'Meta atingida!' : `Faltam ${fmt(Math.max(0, goal.target_amount - current))}`}
        </span>
      </div>

      {goal.end_date && (
        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 flex justify-between text-xs text-gray-400">
          <span>{format(parseISO(goal.start_date), "dd/MM/yyyy")}</span>
          <span>{format(parseISO(goal.end_date), "dd/MM/yyyy", { locale: ptBR })}</span>
        </div>
      )}
    </motion.div>
  );
}