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
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-white p-5 border-b border-gray-100 flex items-center justify-between rounded-t-3xl sm:rounded-t-3xl">
          <h2 className="text-xl font-bold text-gray-900">
            {goal ? "Editar Meta" : "Nova Meta"}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5 pb-10">
          {/* Type Toggle */}
          <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
            <button
              type="button"
              onClick={() => setType("income")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-all ${
                type === "income" 
                  ? "bg-emerald-500 text-white shadow-sm" 
                  : "text-gray-600 hover:bg-gray-200"
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              Entrada
            </button>
            <button
              type="button"
              onClick={() => setType("expense")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-all ${
                type === "expense" 
                  ? "bg-red-500 text-white shadow-sm" 
                  : "text-gray-600 hover:bg-gray-200"
              }`}
            >
              <TrendingDown className="w-4 h-4" />
              Saída
            </button>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label className="text-gray-700">Categoria</Label>
            <Select
              value={formData.category}
              onValueChange={(value) => setFormData({ ...formData, category: value })}
            >
              <SelectTrigger className="h-12 border-gray-200 rounded-xl">
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
          <div className="space-y-2">
            <Label className="text-gray-700">Valor da Meta</Label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">R$</span>
              <Input
                type="number"
                step="0.01"
                placeholder="0,00"
                value={formData.target_amount}
                onChange={(e) => setFormData({ ...formData, target_amount: e.target.value })}
                className="pl-12 h-14 text-2xl font-bold border-gray-200 rounded-xl"
                required
              />
            </div>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            className={`w-full h-14 rounded-xl text-lg font-semibold ${
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
