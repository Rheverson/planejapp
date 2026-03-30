import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Wallet, PiggyBank } from "lucide-react";

const iconMap = {
  income: TrendingUp,
  expense: TrendingDown,
  balance: Wallet,
  forecast: PiggyBank
};

const colorMap = {
  income: "from-emerald-500 to-emerald-600",
  expense: "from-red-500 to-red-600",
  balance: "from-blue-500 to-blue-600",
  forecast: "from-violet-500 to-violet-600"
};

const bgMap = {
  income: "bg-emerald-50",
  expense: "bg-red-50",
  balance: "bg-blue-50",
  forecast: "bg-violet-50"
};

const textMap = {
  income: "text-emerald-600",
  expense: "text-red-600",
  balance: "text-blue-600",
  forecast: "text-violet-600"
};

export default function KPICard({ title, value, subtitle, type, delay = 0 }) {
  const Icon = iconMap[type];

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
      transition={{ duration: 0.5, delay }}
      className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow duration-300"
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2.5 rounded-xl ${bgMap[type]} dark:brightness-90`}>
          <Icon className={`w-5 h-5 ${textMap[type]} dark:brightness-110`} />
        </div>
      </div>
      
      <p className="text-gray-500 dark:text-gray-400 text-sm font-medium mb-1">{title}</p>
      <p className={`text-2xl font-bold ${textMap[type]} dark:brightness-110`}>
        {formatCurrency(value)}
      </p>
      
      {subtitle && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">{subtitle}</p>
      )}
    </motion.div>
  );
}