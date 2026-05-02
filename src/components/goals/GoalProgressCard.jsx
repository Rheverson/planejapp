import { useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Edit2, Trash2, PiggyBank } from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const PERIOD_LABEL = { daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal', yearly: 'Anual' };

export default function GoalProgressCard({ goal, current, onEdit, onDelete, delay = 0 }) {
  const rawPercentage = goal.target_amount > 0 ? (current / goal.target_amount) * 100 : 0;
  const percentage    = Math.min(rawPercentage, 100);
  const isIncome      = goal.type === 'income';
  const isInvestment  = goal.type === 'investment';
  const isExpense     = goal.type === 'expense';
  const isComplete    = current >= goal.target_amount;
  const isOver        = isExpense && rawPercentage > 100;

  const daysLeft = goal.end_date
    ? Math.max(0, differenceInDays(parseISO(goal.end_date), new Date()))
    : null;

  const color    = isInvestment ? 'violet' : isIncome ? 'emerald' : 'red';
  const colorMap = {
    violet: { bg: 'bg-violet-50 dark:bg-violet-900/30', text: 'text-violet-600 dark:text-violet-400', bar: 'from-violet-400 to-violet-600' },
    emerald: { bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-400', bar: 'from-emerald-400 to-emerald-600' },
    red:    { bg: 'bg-red-50 dark:bg-red-900/30',     text: 'text-red-600 dark:text-red-400',         bar: 'from-red-400 to-red-600'         },
  };
  const c    = colorMap[color];
  const Icon = isInvestment ? PiggyBank : isIncome ? TrendingUp : TrendingDown;
  const isContribution = isInvestment && goal.investment_type === 'contribution';

  const getStatus = () => {
    if (isExpense) {
      if (rawPercentage > 100) return { label: 'Limite ultrapassado! 🚨', color: 'text-red-600 dark:text-red-400',      barColor: 'from-red-500 to-red-700'       };
      if (rawPercentage >= 90) return { label: 'Quase no limite ⚠️',      color: 'text-orange-500 dark:text-orange-400', barColor: 'from-orange-400 to-red-500'    };
      if (rawPercentage >= 70) return { label: 'Atenção aos gastos 👀',    color: 'text-yellow-600 dark:text-yellow-400', barColor: 'from-yellow-400 to-orange-500' };
      return { label: `Faltam ${fmt(Math.max(0, goal.target_amount - current))}`, color: 'text-gray-400 dark:text-gray-500', barColor: c.bar };
    }
    if (isIncome || isInvestment) {
      if (isComplete) return { label: 'Meta atingida! 🎉', color: 'text-green-600 dark:text-green-400', barColor: 'from-green-400 to-emerald-500' };
      return { label: `Faltam ${fmt(Math.max(0, goal.target_amount - current))}`, color: 'text-gray-400 dark:text-gray-500', barColor: c.bar };
    }
    return { label: `Faltam ${fmt(Math.max(0, goal.target_amount - current))}`, color: 'text-gray-400 dark:text-gray-500', barColor: c.bar };
  };

  const status = getStatus();
  const currentValueColor = isExpense
    ? isOver ? 'text-red-700 dark:text-red-400 font-bold' : c.text
    : isComplete ? 'text-green-600 dark:text-green-400' : c.text;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
      className={`bg-white dark:bg-gray-800 rounded-2xl px-4 py-3 border ${
        isOver ? 'border-red-200 dark:border-red-800' : 'border-gray-100 dark:border-gray-700'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-2.5">
        <div className={`w-8 h-8 rounded-xl ${isOver ? 'bg-red-100 dark:bg-red-900/40' : c.bg} flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-4 h-4 ${isOver ? 'text-red-600' : c.text}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {goal.name || goal.category}
            </h3>
            {isInvestment && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                isContribution
                  ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400'
              }`}>
                {isContribution ? PERIOD_LABEL[goal.contribution_period] || 'Mensal' : 'Acumular'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {goal.category && <p className="text-[10px] text-gray-400 capitalize">{goal.category}</p>}
            {daysLeft !== null && (
              <p className="text-[10px] text-gray-400">· {daysLeft === 0 ? 'Hoje!' : `${daysLeft}d`}</p>
            )}
          </div>
        </div>
        <div className="flex gap-0.5 flex-shrink-0">
          {onEdit && (
            <button type="button" onClick={() => onEdit(goal)}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
              <Edit2 className="w-3.5 h-3.5 text-gray-400" />
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={() => onDelete(goal.id)}
              className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
            </button>
          )}
        </div>
      </div>

      {/* Valores + barra */}
      <div className="flex items-baseline justify-between mb-1.5">
        <span className={`text-base font-medium ${currentValueColor}`}>{fmt(current)}</span>
        <span className="text-xs text-gray-400">{isContribution ? 'meta ' : 'de '}{fmt(goal.target_amount)}</span>
      </div>

      <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mb-2">
        <motion.div
          initial={{ width: 0 }} animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className={`h-full rounded-full bg-gradient-to-r ${status.barColor}`}
        />
      </div>

      {/* % + status */}
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium ${status.color}`}>
          {rawPercentage.toFixed(0)}%{isExpense && isOver ? ' ⚠️' : isComplete && !isExpense ? ' ✓' : ''}
        </span>
        <span className={`text-xs ${status.color}`}>{status.label}</span>
      </div>

      {/* Datas */}
      {goal.end_date && !isContribution && (
        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 flex justify-between">
          <span className="text-[10px] text-gray-400">{format(parseISO(goal.start_date), "dd/MM/yy")}</span>
          <span className="text-[10px] text-gray-400">{format(parseISO(goal.end_date), "dd/MM/yy", { locale: ptBR })}</span>
        </div>
      )}
      {isContribution && (
        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
          <p className="text-[10px] text-gray-400 text-center">Progresso do período atual</p>
        </div>
      )}
    </motion.div>
  );
} 