import React, { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Building2, Wallet, Smartphone, TrendingUp, MoreHorizontal } from "lucide-react";

const accountTypes = [
  { value: "bank", label: "Conta Bancária", icon: Building2 },
  { value: "wallet", label: "Carteira", icon: Wallet },
  { value: "digital", label: "Conta Digital", icon: Smartphone },
  { value: "investment", label: "Investimentos", icon: TrendingUp },
  { value: "other", label: "Outros", icon: MoreHorizontal }
];

const colors = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-pink-500"
];

export default function AccountForm({ onSubmit, onClose, account = null }) {
  const [formData, setFormData] = useState({
    name: account?.name || "",
    type: account?.type || "bank",
    color: account?.color || colors[0],
    initial_balance: account?.initial_balance || 0
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      initial_balance: parseFloat(formData.initial_balance) || 0
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
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            {account ? "Editar Conta" : "Nova Conta"}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5 pb-10">
          {/* Name */}
          <div className="space-y-2">
            <Label className="text-gray-700">Nome da Conta</Label>
            <Input
              placeholder="Ex: Nubank, Carteira, Itaú..."
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="h-12 border-gray-200 rounded-xl"
              required
            />
          </div>

          {/* Type */}
          <div className="space-y-2">
            <Label className="text-gray-700">Tipo</Label>
            <Select
              value={formData.type}
              onValueChange={(value) => setFormData({ ...formData, type: value })}
            >
              <SelectTrigger className="h-12 border-gray-200 rounded-xl">
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                {accountTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex items-center gap-2">
                      <type.icon className="w-4 h-4" />
                      {type.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Color */}
          <div className="space-y-2">
            <Label className="text-gray-700">Cor</Label>
            <div className="flex gap-2 flex-wrap">
              {colors.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setFormData({ ...formData, color })}
                  className={`w-10 h-10 rounded-xl ${color} transition-transform ${
                    formData.color === color ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : ""
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-gray-700">Saldo Inicial</Label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">R$</span>
              <Input
                type="number"
                step="0.01"
                placeholder="0,00"
                value={formData.initial_balance}
                onChange={(e) => setFormData({ ...formData, initial_balance: e.target.value })}
                className="pl-12 h-12 border-gray-200 rounded-xl"
              />
            </div>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            className="w-full h-14 rounded-xl text-lg font-semibold bg-blue-600 hover:bg-blue-700"
          >
            {account ? "Salvar Alterações" : "Criar Conta"}
          </Button>
        </form>
      </motion.div>
    </motion.div>
  );
}