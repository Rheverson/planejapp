import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function MonthSelector({ selectedDate, onChange }) {
  const handlePrevMonth = () => {
    onChange(subMonths(selectedDate, 1));
  };

  const handleNextMonth = () => {
    onChange(addMonths(selectedDate, 1));
  };

  return (
    <div className="flex items-center justify-center gap-4">
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={handlePrevMonth}
        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
      >
        <ChevronLeft className="w-5 h-5 text-white-600" />
      </motion.button>
      
      <motion.p
        key={selectedDate.toISOString()}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-lg font-semibold text-white min-w-[160px] text-center capitalize"
      >
        {format(selectedDate, "MMMM 'de' yyyy", { locale: ptBR })}
      </motion.p>
      
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={handleNextMonth}
        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
      >
        <ChevronRight className="w-5 h-5 text-white-600" />
      </motion.button>
    </div>
  );
}