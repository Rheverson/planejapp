import { useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Edit2, Trash2, PiggyBank } from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const PERIOD_LABEL = { daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal', yearly: 'Anual' };

export default function GoalProgressCard({ goal, current, onEdit, onDelete, delay = 0 }) {
  const rawPercentage = goal.target_amount > 0 ? (current / goal.target_amount) * 100 : 0;
  const percentage = Math.min(rawPercentage, 100);
  const isIncome = goal.type === 'income';
  const isInvestment = goal.type === 'investment';
  const isExpense = goal.type === 'expense';
  const isComplete = current >= goal.target_amount;
  const isOver = isExpense && rawPercentage > 100;

  const daysLeft = goal.end_date
    ? Math.max(0, differenceInDays(parseISO(goal.end_date), new Date()))
    : null;

  // ── Cor base por tipo ──────────────────────────────────────
  const color = isInvestment ? 'violet' : isIncome ? 'emerald' : 'red';
  const colorMap = {
    violet: { bg: 'bg-violet-50 dark:bg-violet-900/30', text: 'text-violet-600 dark:text-violet-400', bar: 'from-violet-400 to-violet-600' },
    emerald: { bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-400', bar: 'from-emerald-400 to-emerald-600' },
    red: { bg: 'bg-red-50 dark:bg-red-900/30', text: 'text-red-600 dark:text-red-400', bar: 'from-red-400 to-red-600' },
  };
  const c = colorMap[color];
  const Icon = isInvestment ? PiggyBank : isIncome ? TrendingUp : TrendingDown;
  const isContribution = isInvestment && goal.investment_type === 'contribution';

  // ── Status inteligente por tipo ────────────────────────────
  const getStatus = () => {
    if (isExpense) {
      if (rawPercentage > 100) return { label: `Limite ultrapassado! 🚨`, color: 'text-red-600 dark:text-red-400', barColor: 'from-red-500 to-red-700' };
      if (rawPercentage >= 90)  return { label: `Quase no limite ⚠️`,     color: 'text-orange-500 dark:text-orange-400', barColor: 'from-orange-400 to-red-500' };
      if (rawPercentage >= 70)  return { label: `Atenção aos gastos 👀`,   color: 'text-yellow-600 dark:text-yellow-400', barColor: 'from-yellow-400 to-orange-500' };
      return { label: `Faltam ${fmt(Math.max(0, goal.target_amount - current))}`, color: 'text-gray-500', barColor: c.bar };
    }
    if (isIncome || isInvestment) {
      if (isComplete) return { label: 'Meta atingida! 🎉', color: 'text-green-600 dark:text-green-400', barColor: 'from-green-400 to-emerald-500' };
      return { label: `Faltam ${fmt(Math.max(0, goal.target_amount - current))}`, color: 'text-gray-500', barColor: c.bar };
    }
    return { label: `Faltam ${fmt(Math.max(0, goal.target_amount - current))}`, color: 'text-gray-500', barColor: c.bar };
  };

  const status = getStatus();

  // Cor do valor atual para expense: fica vermelho mais forte se ultrapassou
  const currentValueColor = isExpense
    ? isOver ? 'text-red-700 dark:text-red-500 font-extrabold' : c.text
    : isComplete ? 'text-green-600 dark:text-green-400' : c.text;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={`bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border ${
        isOver ? 'border-red-300 dark:border-red-700' : 'border-gray-100 dark:border-gray-700'
      }`}>

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-10 h-10 rounded-xl ${isOver ? 'bg-red-100 dark:bg-red-900/40' : c.bg} flex items-center justify-center flex-shrink-0`}>
            <Icon className={`w-5 h-5 ${isOver ? 'text-red-600' : c.text}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-white truncate">
              {goal.name || goal.category}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-gray-500 capitalize">{goal.category}</p>
              {goal.end_date && daysLeft !== null && (
                <p className="text-xs text-gray-400">
                  · {daysLeft === 0 ? 'Hoje!' : `${daysLeft}d restantes`}
                </p>
              )}
            </div>
            {isInvestment && (
              <span className={`inline-flex items-center gap-1 mt-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
                isContribution
                  ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400'
              }`}>
                {isContribution ? `📅 ${PERIOD_LABEL[goal.contribution_period] || 'Mensal'}` : '🏦 Acumular'}
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-1 flex-shrink-0 ml-2">
          {onEdit && (
            <button type="button" onClick={() => onEdit(goal)}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
              <Edit2 className="w-4 h-4 text-gray-400" />
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={() => onDelete(goal.id)}
              className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
              <Trash2 className="w-4 h-4 text-red-400" />
            </button>
          )}
        </div>
      </div>

      {/* Progresso */}
      <div className="mb-3">
        <div className="flex justify-between items-baseline mb-2">
          <span className={`text-2xl font-bold ${currentValueColor}`}>{fmt(current)}</span>
          <span className="text-sm text-gray-500">
            {isContribution ? 'meta ' : 'de '}{fmt(goal.target_amount)}
          </span>
        </div>
        <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <motion.div initial={{ width: 0 }} animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className={`h-full rounded-full bg-gradient-to-r ${status.barColor}`} />
        </div>
      </div>

      {/* Percentual + status */}
      <div className="flex items-center justify-between text-sm">
        <span className={`font-semibold ${status.color}`}>
          {rawPercentage.toFixed(0)}% {isExpense && isOver ? '⚠️' : isComplete && !isExpense ? '✓' : ''}
        </span>
        <span className={`font-medium ${status.color}`}>
          {status.label}
        </span>
      </div>

      {/* Datas */}
      {goal.end_date && !isContribution && (
        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 flex justify-between text-xs text-gray-400">
          <span>{format(parseISO(goal.start_date), "dd/MM/yyyy")}</span>
          <span>{format(parseISO(goal.end_date), "dd/MM/yyyy", { locale: ptBR })}</span>
        </div>
      )}

      {isContribution && (
        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-400 text-center">Progresso do período atual</p>
        </div>
      )}
    </motion.div>
  );
}