import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { X, TrendingUp, TrendingDown } from "lucide-react";
import CategorySuggestion from "./CategorySuggestion";
import { useCategorySuggestion } from "./useCategorySuggestion";

const incomeCategories = [
  "Salário", "Freelance", "Comissão", "Investimentos", "Presente", "Outros"
];

const expenseCategories = [
  "Alimentação", "Moradia", "Transporte", "Saúde", "Educação", "Lazer", "Compras", "Outros"
];

export default function TransactionForm({ accounts, onSubmit, onClose, initialType = "expense" }) {
  const [type, setType] = useState(initialType);
  const [formData, setFormData] = useState({
    description: "",
    amount: "",
    category: "",
    account_id: "",
    date: new Date().toISOString().split('T')[0],
    is_realized: true,
    notes: ""
  });
  const [showSuggestion, setShowSuggestion] = useState(true);

  const { suggestion, confidence, confirmCategory } = useCategorySuggestion(
    formData.description,
    type
  );

  const categories = type === "income" ? incomeCategories : expenseCategories;

  // Reset suggestion visibility quando descrição muda
  useEffect(() => {
    if (formData.description && !formData.category) {
      setShowSuggestion(true);
    }
  }, [formData.description]);

  const handleAcceptSuggestion = () => {
    setFormData({ ...formData, category: suggestion });
    setShowSuggestion(false);
  };

  const handleRejectSuggestion = () => {
    setShowSuggestion(false);
  };

  const handleCategoryChange = (value) => {
    setFormData({ ...formData, category: value });
    setShowSuggestion(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Aprende com a categoria escolhida
    if (formData.description && formData.category) {
      confirmCategory(formData.category, formData.description);
    }

    onSubmit({
      ...formData,
      type,
      amount: parseFloat(formData.amount) || 0
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center pb-16 sm:pb-0"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-white p-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Nova Transação</h2>
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

          {/* Amount */}
          <div className="space-y-2">
            <Label className="text-gray-700">Valor</Label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">R$</span>
              <Input
                type="number"
                step="0.01"
                placeholder="0,00"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="pl-12 h-14 text-2xl font-bold border-gray-200 rounded-xl"
                required
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label className="text-gray-700">Descrição</Label>
            <Input
              placeholder="Ex: Salário, Aluguel, Mercado..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="h-12 border-gray-200 rounded-xl"
              required
            />
          </div>

          {/* Category Suggestion */}
          <CategorySuggestion
            suggestion={suggestion}
            confidence={confidence}
            onAccept={handleAcceptSuggestion}
            onReject={handleRejectSuggestion}
            isVisible={showSuggestion && suggestion && !formData.category}
          />

          {/* Category & Account */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-gray-700">Categoria</Label>
              <Select
                value={formData.category}
                onValueChange={handleCategoryChange}
              >
                <SelectTrigger className="h-12 border-gray-200 rounded-xl">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat.toLowerCase()}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-700">Conta</Label>
              <Select
                value={formData.account_id}
                onValueChange={(value) => setFormData({ ...formData, account_id: value })}
              >
                <SelectTrigger className="h-12 border-gray-200 rounded-xl">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Date */}
          <div className="space-y-2">
            <Label className="text-gray-700">Data</Label>
            <Input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="h-12 border-gray-200 rounded-xl"
              required
            />
          </div>

          {/* Realized Toggle */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
            <div>
              <p className="font-medium text-gray-900">Já foi realizada?</p>
              <p className="text-sm text-gray-500">
                {formData.is_realized ? "Transação confirmada" : "Previsão futura"}
              </p>
            </div>
            <Switch
              checked={formData.is_realized}
              onCheckedChange={(checked) => setFormData({ ...formData, is_realized: checked })}
            />
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
            Adicionar {type === "income" ? "Entrada" : "Saída"}
          </Button>
        </form>
      </motion.div>
    </motion.div>
  );
}