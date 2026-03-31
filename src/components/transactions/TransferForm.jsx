import React, { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, ArrowLeftRight } from "lucide-react";

const today = new Date().toISOString().split("T")[0];

export default function TransferForm({ accounts, onSubmit, onClose }) {
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("Transferência");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (fromAccountId === toAccountId) return;
    onSubmit({ fromAccountId, toAccountId, amount, date, description });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center pb-16 sm:pb-0"
      onClick={onClose}>
      <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md overflow-y-auto max-h-[80vh]">

        <div className="sticky top-0 bg-white px-4 py-3 border-b border-gray-100 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-blue-600" />
            <h2 className="text-base font-bold text-gray-900">Transferência entre contas</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-4 py-3 space-y-3 pb-5">
          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-600">Valor</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">R$</span>
              <Input type="number" step="0.01" placeholder="0,00" value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-10 h-11 text-xl font-bold border-gray-200 rounded-xl" required />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-600">De (origem)</Label>
            <Select value={fromAccountId} onValueChange={setFromAccountId} required>
              <SelectTrigger className="h-10 text-sm border-gray-200 rounded-xl">
                <SelectValue placeholder="Selecione a conta origem" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map(acc => (
                  <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-600">Para (destino)</Label>
            <Select value={toAccountId} onValueChange={setToAccountId} required>
              <SelectTrigger className="h-10 text-sm border-gray-200 rounded-xl">
                <SelectValue placeholder="Selecione a conta destino" />
              </SelectTrigger>
              <SelectContent>
                {accounts.filter(a => a.id !== fromAccountId).map(acc => (
                  <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-600">Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)}
              className="h-10 text-sm border-gray-200 rounded-xl" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-600">Data</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="h-10 text-sm border-gray-200 rounded-xl" required />
          </div>

          <Button type="submit" className="w-full h-11 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700">
            Transferir
          </Button>
        </form>
      </motion.div>
    </motion.div>
  );
}