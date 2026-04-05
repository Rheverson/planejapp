import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gift, X, ChevronRight } from "lucide-react";

export default function ReferralBanner({ onOpen, onDismiss }) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl p-4 flex items-center gap-3 shadow-lg shadow-orange-200 dark:shadow-none cursor-pointer mb-6"
        onClick={onOpen}
      >
        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
          <Gift className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm">Indique e ganhe até 100% off</p>
          <p className="text-white/70 text-xs truncate">Cada amigo que pagar = 25% de desconto</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <ChevronRight className="w-4 h-4 text-white/70" />
          <button
            onClick={e => { e.stopPropagation(); onDismiss(); }}
            className="p-1 hover:bg-white/20 rounded-lg transition-colors ml-1"
          >
            <X className="w-3.5 h-3.5 text-white/70" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}