import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, addMonths, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

const gerarMeses = () => {
  const meses = [];
  for (let i = 1; i <= 12; i++) {
    const data = addMonths(new Date(), i);
    meses.push({
      value: format(startOfMonth(data), "yyyy-MM"),
      label: format(startOfMonth(data), "MMMM 'de' yyyy", { locale: ptBR }),
    });
  }
  return meses;
};

export default function DuplicarModal({ titulo, subtitulo, onConfirm, onClose }) {
  const [mesesSelecionados, setMesesSelecionados] = useState([]);
  const meses = gerarMeses();

  const toggleMes = (value) => {
    setMesesSelecionados(prev =>
      prev.includes(value) ? prev.filter(m => m !== value) : [...prev, value]
    );
  };

  const handleConfirmar = () => {
    if (mesesSelecionados.length === 0) return;
    onConfirm(mesesSelecionados);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center pb-16 sm:pb-0"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[80vh] sm:max-h-[88vh] flex flex-col"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Copy className="w-4 h-4 text-blue-500" />
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white">Duplicar</h2>
              <p className="text-xs text-gray-400">{subtitulo}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Meses */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">
            Selecione os meses para duplicar:
          </p>
          {meses.map(({ value, label }) => {
            const selecionado = mesesSelecionados.includes(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggleMes(value)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all text-left ${
                  selecionado
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                }`}
              >
                <span className={`text-sm font-medium capitalize ${selecionado ? "text-blue-700 dark:text-blue-300" : "text-gray-700 dark:text-gray-300"}`}>
                  {label}
                </span>
                {selecionado && (
                  <span className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">✓</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex-shrink-0 space-y-2">
          {mesesSelecionados.length > 0 && (
            <p className="text-xs text-center text-gray-400">
              {mesesSelecionados.length} {mesesSelecionados.length === 1 ? "mês selecionado" : "meses selecionados"}
            </p>
          )}
          <Button
            onClick={handleConfirmar}
            disabled={mesesSelecionados.length === 0}
            className="w-full h-11 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-40"
          >
            Duplicar {mesesSelecionados.length > 0 ? `em ${mesesSelecionados.length} ${mesesSelecionados.length === 1 ? "mês" : "meses"}` : ""}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}