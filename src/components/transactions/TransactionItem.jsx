import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ShoppingCart, Home, Car, Utensils, Heart, Briefcase,
  GraduationCap, Plane, Gift, DollarSign, Clock, CheckCircle2, Copy
} from "lucide-react";
import DuplicarModal from "@/components/common/DuplicarModal";

const categoryIcons = {
  alimentacao: Utensils, moradia: Home, transporte: Car,
  saude: Heart, trabalho: Briefcase, educacao: GraduationCap,
  lazer: Plane, compras: ShoppingCart, presentes: Gift,
  salario: DollarSign, outros: DollarSign
};

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export default function TransactionItem({ transaction, delay = 0, onRegistrar, onDuplicar }) {
  const [showDuplicar, setShowDuplicar] = useState(false);
  const Icon = categoryIcons[transaction.category?.toLowerCase()] || DollarSign;
  const isIncome = transaction.type === 'income';
  const isRealized = transaction.is_realized !== false;

  const handleDuplicarConfirm = (meses) => {
    onDuplicar?.(transaction, meses);
    setShowDuplicar(false);
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, delay }}
        className={`flex items-center gap-4 p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:shadow-sm transition-all duration-200 ${!isRealized ? 'opacity-80' : ''}`}
      >
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${isIncome ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'bg-red-50 dark:bg-red-900/30'}`}>
          <Icon className={`w-5 h-5 ${isIncome ? 'text-emerald-600' : 'text-red-600'}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-gray-900 dark:text-white truncate">{transaction.description}</p>
            {!isRealized
              ? <Clock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
              : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
            }
          </div>
          <p className="text-sm text-gray-400">
            {format(new Date(transaction.date), "dd 'de' MMM", { locale: ptBR })}
            {transaction.category && ` • ${transaction.category}`}
          </p>

          <div className="flex items-center gap-3 mt-1.5">
            {!isRealized && onRegistrar && (
              <button type="button" onClick={() => onRegistrar(transaction)}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                ✓ Registrar realização
              </button>
            )}
            {onDuplicar && (
              <button type="button" onClick={() => setShowDuplicar(true)}
                className="text-xs font-semibold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex items-center gap-1 hover:underline">
                <Copy className="w-3 h-3" /> Duplicar
              </button>
            )}
          </div>
        </div>

        <p className={`font-semibold flex-shrink-0 ${isIncome ? 'text-emerald-600' : 'text-red-600'}`}>
          {isIncome ? '+' : '-'} {fmt(transaction.amount)}
        </p>
      </motion.div>

      <AnimatePresence>
        {showDuplicar && (
          <DuplicarModal
            subtitulo={`${transaction.description} · ${fmt(transaction.amount)}`}
            onConfirm={handleDuplicarConfirm}
            onClose={() => setShowDuplicar(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}