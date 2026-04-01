import React, { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, TrendingUp, TrendingDown, PiggyBank } from "lucide-react";
import { format, addMonths, addYears } from "date-fns";
import { useAuth } from "@/lib/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const today = new Date().toISOString().split("T")[0];

const presetPeriods = [
  { label: "1 mês",   getEnd: () => format(addMonths(new Date(), 1), "yyyy-MM-dd") },
  { label: "3 meses", getEnd: () => format(addMonths(new Date(), 3), "yyyy-MM-dd") },
  { label: "6 meses", getEnd: () => format(addMonths(new Date(), 6), "yyyy-MM-dd") },
  { label: "1 ano",   getEnd: () => format(addYears(new Date(), 1),  "yyyy-MM-dd") },
  { label: "2 anos",  getEnd: () => format(addYears(new Date(), 2),  "yyyy-MM-dd") },
  { label: "5 anos",  getEnd: () => format(addYears(new Date(), 5),  "yyyy-MM-dd") },
];

export default function GoalForm({ goal, accounts = [], onSubmit, onClose }) {
  const { user } = useAuth();

  const { data: allCategories = [] } = useQuery({
    queryKey: ['categories', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .or(`user_id.eq.${user?.id},is_default.eq.true`)
        .order('is_default', { ascending: false })
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id
  });

  const [type, setType] = useState(goal?.type || "expense");
  const [name, setName] = useState(goal?.name || "");
  const [category, setCategory] = useState(goal?.category || "");
  const [targetAmount, setTargetAmount] = useState(goal?.target_amount || "");
  const [startDate, setStartDate] = useState(goal?.start_date || today);
  const [endDate, setEndDate] = useState(goal?.end_date || format(addMonths(new Date(), 1), "yyyy-MM-dd"));
  const [linkedAccountId, setLinkedAccountId] = useState(goal?.linked_account_id || "");

  const categories = allCategories.filter(c => c.type === type).map(c => c.name);
  const investmentAccounts = accounts.filter(a => a.type === 'investment');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      name: name || category,
      type,
      category,
      target_amount: parseFloat(targetAmount) || 0,
      start_date: startDate,
      end_date: endDate,
      linked_account_id: linkedAccountId || null,
    });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center pb-16 sm:pb-0"
      onClick={onClose}>
      <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[88vh] overflow-y-auto">

        <div className="sticky top-0 bg-white px-4 py-3 border-b border-gray-100 flex items-center justify-between z-10">
          <h2 className="text-base font-bold text-gray-900">{goal ? "Editar Meta" : "Nova Meta"}</h2>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-4 py-3 space-y-3 pb-5">

          <div className="flex gap-1.5 p-1 bg-gray-100 rounded-xl">
            {[
              { val: "income",     label: "Entrada",      Icon: TrendingUp,   active: "bg-emerald-500" },
              { val: "expense",    label: "Saída",        Icon: TrendingDown, active: "bg-red-500" },
              { val: "investment", label: "Investimento", Icon: PiggyBank,    active: "bg-violet-500" },
            ].map(({ val, label, Icon, active }) => (
              <button key={val} type="button" onClick={() => { setType(val); setCategory(""); }}
                className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-all ${
                  type === val ? `${active} text-white shadow-sm` : "text-gray-600 hover:bg-gray-200"
                }`}>
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-600">Nome da meta</Label>
            <Input placeholder="Ex: Reserva de emergência, Viagem..." value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10 text-sm border-gray-200 rounded-xl" required />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-600">Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-10 text-sm border-gray-200 rounded-xl">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat.toLowerCase()}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-600">Valor da meta</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">R$</span>
              <Input type="number" step="0.01" placeholder="0,00" value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                className="pl-10 h-11 text-xl font-bold border-gray-200 rounded-xl" required />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium text-gray-600">Período</Label>
            <div className="flex gap-1.5 flex-wrap">
              {presetPeriods.map(({ label, getEnd }) => (
                <button key={label} type="button"
                  onClick={() => { setStartDate(today); setEndDate(getEnd()); }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                    endDate === getEnd()
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                  }`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Início</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                  className="h-10 text-sm border-gray-200 rounded-xl" required />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Fim</Label>
                <Input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)}
                  className="h-10 text-sm border-gray-200 rounded-xl" required />
              </div>
            </div>
          </div>

          {type === "investment" && investmentAccounts.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs font-medium text-gray-600">Conta vinculada</Label>
              <Select value={linkedAccountId} onValueChange={setLinkedAccountId}>
                <SelectTrigger className="h-10 text-sm border-gray-200 rounded-xl">
                  <SelectValue placeholder="Selecione (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {investmentAccounts.map(acc => (
                    <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button type="submit" className={`w-full h-11 rounded-xl text-sm font-semibold ${
            type === "income"     ? "bg-emerald-500 hover:bg-emerald-600"
            : type === "investment" ? "bg-violet-500 hover:bg-violet-600"
            : "bg-red-500 hover:bg-red-600"
          }`}>
            {goal ? "Atualizar Meta" : "Criar Meta"}
          </Button>
        </form>
      </motion.div>
    </motion.div>
  );
}