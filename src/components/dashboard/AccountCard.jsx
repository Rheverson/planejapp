import { motion } from "framer-motion";
import { Building2, Wallet, Smartphone, TrendingUp, MoreHorizontal } from "lucide-react";

const iconMap = {
  bank: Building2,
  wallet: Wallet,
  digital: Smartphone,
  investment: TrendingUp,
  other: MoreHorizontal
};

const colorMap = {
  bank: "bg-blue-500",
  wallet: "bg-amber-500",
  digital: "bg-violet-500",
  investment: "bg-emerald-500",
  other: "bg-gray-500"
};

export default function AccountCard({ account, balance, onClick, delay = 0 }) {
  const Icon = iconMap[account.type] || Wallet;

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(val);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay }}
      onClick={onClick}
      className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 cursor-pointer hover:shadow-md hover:border-gray-200 dark:hover:border-gray-600 transition-all duration-300 min-w-[160px]"
    >
      <div className={`w-10 h-10 rounded-xl ${account.color || colorMap[account.type]} flex items-center justify-center mb-3`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      
      <p className="text-gray-500 dark:text-gray-400 text-xs font-medium mb-1 truncate">{account.name}</p>
      <p className={`text-lg font-bold ${balance >= 0 ? 'text-gray-900 dark:text-white' : 'text-red-600 dark:text-red-400'}`}>
        {formatCurrency(balance)}
      </p>
    </motion.div>
  );
}
