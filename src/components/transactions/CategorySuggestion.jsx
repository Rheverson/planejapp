import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function CategorySuggestion({ 
  suggestion, 
  confidence, 
  onAccept, 
  onReject,
  isVisible 
}) {
  if (!isVisible || !suggestion) return null;

  const confidenceLabel = confidence >= 0.8 ? "Alta" : confidence >= 0.5 ? "Média" : "Baixa";
  const confidenceColor = confidence >= 0.8 ? "bg-emerald-100 text-emerald-700" : 
                          confidence >= 0.5 ? "bg-amber-100 text-amber-700" : 
                          "bg-gray-100 text-gray-700";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10, height: 0 }}
        animate={{ opacity: 1, y: 0, height: "auto" }}
        exit={{ opacity: 0, y: -10, height: 0 }}
        className="flex items-center justify-between p-3 bg-blue-50 border border-blue-100 rounded-xl mb-3"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-500" />
          <span className="text-sm text-gray-700">
            Sugestão: <span className="font-medium capitalize">{suggestion}</span>
          </span>
          <Badge className={`text-xs ${confidenceColor}`}>
            {confidenceLabel}
          </Badge>
        </div>
        
        <div className="flex items-center gap-1">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onAccept}
            className="p-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
          >
            <Check className="w-4 h-4" />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onReject}
            className="p-1.5 bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </motion.button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}