import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ShoppingCart, Home, Car, Utensils, Heart, Briefcase,
  GraduationCap, Plane, Gift, DollarSign, Clock, CheckCircle2,
  Copy, Pencil, Trash2, CheckCheck, ArrowLeftRight
} from "lucide-react";
import DuplicarModal from "@/components/common/DuplicarModal";

const categoryIcons = {
  alimentacao: Utensils, moradia: Home, transporte: Car,
  saude: Heart, trabalho: Briefcase, educacao: GraduationCap,
  lazer: Plane, compras: ShoppingCart, presentes: Gift,
  salario: DollarSign, outros: DollarSign
};

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

// ✅ Corrige o bug de timezone: "2026-04-12" interpretado como UTC meia-noite
// vira 11/04 às 21h em Brasília. Adicionar T12:00:00 evita isso.
function parseDate(dateStr) {
  return new Date(dateStr + "T12:00:00");
}

export default function TransactionItem({ transaction, accounts = [], delay = 0, onRegistrar, onDuplicar, onEdit, onDelete }) {
  const [showDuplicar, setShowDuplicar] = useState(false);

  const isTransfer = transaction.type === 'transfer';
  const isIncome   = transaction.type === 'income';
  const isRealized = transaction.is_realized !== false;

  const Icon = isTransfer
    ? ArrowLeftRight
    : categoryIcons[transaction.category?.toLowerCase()] || DollarSign;

  const account = accounts.find(a => a.id === transaction.account_id);
  const transferAccount = accounts.find(a => a.id === transaction.transfer_account_id);
  const accountLabel = isTransfer && account && transferAccount
    ? `${account.name} → ${transferAccount.name}`
    : account?.name || null;

  const iconBg = isTransfer
    ? 'bg-blue-50 dark:bg-blue-900/30'
    : isIncome
      ? 'bg-emerald-50 dark:bg-emerald-900/30'
      : 'bg-red-50 dark:bg-red-900/30';

  const iconColor = isTransfer
    ? 'text-blue-500'
    : isIncome
      ? 'text-emerald-600'
      : 'text-red-600';

  const amountColor = isTransfer
    ? 'text-blue-500'
    : isIncome
      ? 'text-emerald-600'
      : 'text-red-600';

  const amountPrefix = isTransfer ? '⇄' : isIncome ? '+' : '-';

  const handleDuplicarConfirm = (meses) => {
    onDuplicar?.(transaction, meses);
    setShowDuplicar(false);
  };

  const hasActions = onRegistrar || onDuplicar || onEdit || onDelete;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, delay }}
        className={`rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:shadow-sm transition-all duration-200 overflow-hidden ${!isRealized ? 'opacity-80' : ''}`}
      >
        <div className="flex items-center gap-3 p-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
            <Icon className={`w-4 h-4 ${iconColor}`} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
                {transaction.description}
              </p>
              {!isRealized
                ? <Clock className="w-3 h-3 text-amber-500 flex-shrink-0" />
                : <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
              }
            </div>
            <p className="text-xs text-gray-400 truncate">
              {/* ✅ usa parseDate para evitar bug de timezone UTC→Brasília */}
              {format(parseDate(transaction.date), "dd 'de' MMM", { locale: ptBR })}
              {!isTransfer && transaction.category && ` · ${transaction.category}`}
              {accountLabel && ` · ${accountLabel}`}
            </p>
          </div>

          <span className={`font-semibold text-sm flex-shrink-0 ${amountColor}`}>
            {amountPrefix} {fmt(transaction.amount)}
          </span>
        </div>

        {hasActions && (
          <div className="flex items-center justify-end gap-1 px-3 pb-2 border-t border-gray-50 dark:border-gray-700 pt-1.5">
            {!isRealized && onRegistrar && (
              <button type="button" onClick={() => onRegistrar(transaction)} title="Registrar"
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 transition-colors">
                <CheckCheck className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-xs text-blue-600 font-medium">Registrar</span>
              </button>
            )}
            {onDuplicar && !isTransfer && (
              <button type="button" onClick={() => setShowDuplicar(true)} title="Duplicar"
                className="w-7 h-7 rounded-lg bg-gray-50 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-100 transition-colors">
                <Copy className="w-3.5 h-3.5 text-gray-500" />
              </button>
            )}
            {onEdit && !isTransfer && (
              <button type="button" onClick={() => onEdit(transaction)} title="Editar"
                className="w-7 h-7 rounded-lg bg-gray-50 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-100 transition-colors">
                <Pencil className="w-3.5 h-3.5 text-gray-500" />
              </button>
            )}
            {onDelete && (
              <button type="button" onClick={() => onDelete(transaction.id)} title="Excluir"
                className="w-7 h-7 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center hover:bg-red-100 transition-colors">
                <Trash2 className="w-3.5 h-3.5 text-red-500" />
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