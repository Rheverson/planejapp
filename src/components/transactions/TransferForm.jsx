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
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center pb-16 sm:pb-0"
      onClick={onClose}>
      <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl w-full max-w-md overflow-y-auto max-h-[80vh] shadow-2xl">

        <div className="sticky top-0 bg-white dark:bg-gray-900 px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-blue-600" />
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Transferência entre contas</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
            <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-4 py-3 space-y-3 pb-5">
          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Valor</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-sm">R$</span>
              <Input type="number" step="0.01" placeholder="0,00" value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-10 h-11 text-xl font-bold rounded-xl
                  bg-white dark:bg-gray-800
                  text-gray-900 dark:text-white
                  border-gray-200 dark:border-gray-700
                  placeholder:text-gray-300 dark:placeholder:text-gray-600"
                required />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">De (origem)</Label>
            <Select value={fromAccountId} onValueChange={setFromAccountId} required>
              <SelectTrigger className="h-10 text-sm rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white">
                <SelectValue placeholder="Selecione a conta origem" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                {accounts.map(acc => (
                  <SelectItem key={acc.id} value={acc.id} className="dark:text-white dark:focus:bg-gray-700">{acc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Para (destino)</Label>
            <Select value={toAccountId} onValueChange={setToAccountId} required>
              <SelectTrigger className="h-10 text-sm rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white">
                <SelectValue placeholder="Selecione a conta destino" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                {accounts.filter(a => a.id !== fromAccountId).map(acc => (
                  <SelectItem key={acc.id} value={acc.id} className="dark:text-white dark:focus:bg-gray-700">{acc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)}
              className="h-10 text-sm rounded-xl
                bg-white dark:bg-gray-800
                text-gray-900 dark:text-white
                border-gray-200 dark:border-gray-700" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Data</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="h-10 text-sm rounded-xl
                bg-white dark:bg-gray-800
                text-gray-900 dark:text-white
                border-gray-200 dark:border-gray-700
                [color-scheme:light] dark:[color-scheme:dark]"
              required />
          </div>

          <Button type="submit" className="w-full h-11 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200 dark:shadow-blue-900/30">
            Transferir
          </Button>
        </form>
      </motion.div>
    </motion.div>
  );
}