import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Edit2, Trash2 } from "lucide-react";

export default function GoalProgressCard({ goal, current, onEdit, onDelete, delay = 0 }) {
  const percentage = goal.target_amount > 0 ? Math.min((current / goal.target_amount) * 100, 100) : 0;
  const isIncome = goal.type === 'income';
  const isComplete = current >= goal.target_amount;

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(val);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${isIncome ? 'bg-emerald-50' : 'bg-red-50'} flex items-center justify-center`}>
            {isIncome ? (
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            ) : (
              <TrendingDown className="w-5 h-5 text-red-600" />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 capitalize">{goal.category}</h3>
            <p className="text-xs text-gray-500">{isIncome ? 'Entrada' : 'Saída'}</p>
          </div>
        </div>
        
        <div className="flex gap-1">
          <button
            onClick={() => onEdit(goal)}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Edit2 className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={() => onDelete(goal.id)}
            className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4 text-red-400" />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex justify-between items-baseline mb-2">
          <span className={`text-2xl font-bold ${isIncome ? 'text-emerald-600' : 'text-red-600'}`}>
            {formatCurrency(current)}
          </span>
          <span className="text-sm text-gray-500">
            de {formatCurrency(goal.target_amount)}
          </span>
        </div>
        
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className={`h-full rounded-full ${
              isComplete 
                ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                : isIncome
                  ? 'bg-gradient-to-r from-emerald-400 to-emerald-600'
                  : 'bg-gradient-to-r from-red-400 to-red-600'
            }`}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-sm">
        <span className={`font-semibold ${
          isComplete ? 'text-green-600' : isIncome ? 'text-emerald-600' : 'text-red-600'
        }`}>
          {percentage.toFixed(0)}% {isComplete ? '✓' : ''}
        </span>
        <span className="text-gray-500">
          {isComplete 
            ? 'Meta atingida!' 
            : `Faltam ${formatCurrency(Math.max(0, goal.target_amount - current))}`
          }
        </span>
      </div>
    </motion.div>
  );
}