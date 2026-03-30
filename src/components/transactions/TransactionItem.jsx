import { motion } from "framer-motion";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  ShoppingCart, Home, Car, Utensils, Heart, Briefcase, 
  GraduationCap, Plane, Gift, DollarSign, Clock, CheckCircle2
} from "lucide-react";

const categoryIcons = {
  alimentacao: Utensils,
  moradia: Home,
  transporte: Car,
  saude: Heart,
  trabalho: Briefcase,
  educacao: GraduationCap,
  lazer: Plane,
  compras: ShoppingCart,
  presentes: Gift,
  salario: DollarSign,
  outros: DollarSign
};

export default function TransactionItem({ transaction, delay = 0 }) {
  const Icon = categoryIcons[transaction.category?.toLowerCase()] || DollarSign;
  const isIncome = transaction.type === 'income';
  const isRealized = transaction.is_realized !== false;

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(val);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay }}
      className={`flex items-center gap-4 p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:shadow-sm transition-all duration-200 ${!isRealized ? 'opacity-70' : ''}`}
    >
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isIncome ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'bg-red-50 dark:bg-red-900/30'}`}>
        <Icon className={`w-5 h-5 ${isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`} />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-gray-900 dark:text-white truncate">{transaction.description}</p>
          {!isRealized && (
            <Clock className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 flex-shrink-0" />
          )}
          {isRealized && (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
          )}
        </div>
        <p className="text-sm text-gray-400 dark:text-gray-500">
          {format(new Date(transaction.date), "dd 'de' MMM", { locale: ptBR })}
          {transaction.category && ` • ${transaction.category}`}
        </p>
      </div>
      
      <p className={`font-semibold ${isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
        {isIncome ? '+' : '-'} {formatCurrency(transaction.amount)}
      </p>
    </motion.div>
  );
}