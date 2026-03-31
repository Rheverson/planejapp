import React, { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, TrendingUp, TrendingDown } from "lucide-react";

const incomeCategories = [
  "Salário", "Freelance", "Comissão", "Investimentos", "Presente", "Outros"
];

const expenseCategories = [
  "Alimentação", "Moradia", "Transporte", "Saúde", "Educação", "Lazer", "Compras", "Outros"
];

export default function GoalForm({ goal, month, onSubmit, onClose }) {
  const [type, setType] = useState(goal?.type || "expense");
  const [formData, setFormData] = useState({
    category: goal?.category || "",
    target_amount: goal?.target_amount || "",
    month: goal?.month || month,
    color: goal?.color || ""
  });

  const categories = type === "income" ? incomeCategories : expenseCategories;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      type,
      target_amount: parseFloat(formData.target_amount) || 0
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[88vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white px-4 py-3 border-b border-gray-100 flex items-center justify-between z-10 rounded-t-3xl">
          <h2 className="text-base font-bold text-gray-900">
            {goal ? "Editar Meta" : "Nova Meta"}
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-4 py-3 space-y-3 pb-5">

          {/* Type Toggle */}
          <div className="flex gap-1.5 p-1 bg-gray-100 rounded-xl">
            <button
              type="button"
              onClick={() => setType("income")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${
                type === "income"
                  ? "bg-emerald-500 text-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-200"
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Entrada
            </button>
            <button
              type="button"
              onClick={() => setType("expense")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${
                type === "expense"
                  ? "bg-red-500 text-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-200"
              }`}
            >
              <TrendingDown className="w-3.5 h-3.5" />
              Saída
            </button>
          </div>

          {/* Category */}
          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-600">Categoria</Label>
            <Select
              value={formData.category}
              onValueChange={(value) => setFormData({ ...formData, category: value })}
            >
              <SelectTrigger className="h-10 text-sm border-gray-200 rounded-xl">
                <SelectValue placeholder="Selecione uma categoria" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat.toLowerCase()}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Target Amount */}
          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-600">Valor da Meta</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">R$</span>
              <Input
                type="number"
                step="0.01"
                placeholder="0,00"
                value={formData.target_amount}
                onChange={(e) => setFormData({ ...formData, target_amount: e.target.value })}
                className="pl-10 h-11 text-xl font-bold border-gray-200 rounded-xl"
                required
              />
            </div>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            className={`w-full h-11 rounded-xl text-sm font-semibold ${
              type === "income"
                ? "bg-emerald-500 hover:bg-emerald-600"
                : "bg-red-500 hover:bg-red-600"
            }`}
          >
            {goal ? "Atualizar Meta" : "Criar Meta"}
          </Button>
        </form>
      </motion.div>
    </motion.div>
  );
}