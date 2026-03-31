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
        className={`p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:shadow-sm transition-all duration-200 ${!isRealized ? 'opacity-80' : ''}`}
      >
        {/* Linha principal */}
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isIncome ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'bg-red-50 dark:bg-red-900/30'}`}>
            <Icon className={`w-4 h-4 ${isIncome ? 'text-emerald-600' : 'text-red-600'}`} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{transaction.description}</p>
              {!isRealized
                ? <Clock className="w-3 h-3 text-amber-500 flex-shrink-0" />
                : <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
              }
            </div>
            <p className="text-xs text-gray-400 truncate">
              {format(new Date(transaction.date), "dd 'de' MMM", { locale: ptBR })}
              {transaction.category && ` • ${transaction.category}`}
            </p>
          </div>

          <p className={`font-semibold text-sm flex-shrink-0 ${isIncome ? 'text-emerald-600' : 'text-red-600'}`}>
            {isIncome ? '+' : '-'} {fmt(transaction.amount)}
          </p>
        </div>

        {/* Linha de ações — só aparece se necessário */}
        {((!isRealized && onRegistrar) || onDuplicar) && (
          <div className="flex items-center gap-4 mt-2 pl-13" style={{ paddingLeft: '52px' }}>
            {!isRealized && onRegistrar && (
              <button type="button" onClick={() => onRegistrar(transaction)}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1">
                ✓ Registrar
              </button>
            )}
            {onDuplicar && (
              <button type="button" onClick={() => setShowDuplicar(true)}
                className="text-xs font-semibold text-gray-400 hover:text-gray-600 flex items-center gap-1">
                <Copy className="w-3 h-3" /> Duplicar
              </button>
            )}
          </div>
        )}
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