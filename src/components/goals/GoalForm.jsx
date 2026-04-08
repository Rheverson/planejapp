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
        .from('categories').select('*')
        .or(`user_id.eq.${user?.id},is_default.eq.true`)
        .order('is_default', { ascending: false }).order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id
  });

  const [type, setType]                           = useState(goal?.type || "expense");
  const [name, setName]                           = useState(goal?.name || "");
  const [category, setCategory]                   = useState(goal?.category || "");
  const [targetAmount, setTargetAmount]           = useState(goal?.target_amount || "");
  const [startDate, setStartDate]                 = useState(goal?.start_date || today);
  const [endDate, setEndDate]                     = useState(goal?.end_date || format(addMonths(new Date(), 1), "yyyy-MM-dd"));
  const [linkedAccountId, setLinkedAccountId]     = useState(goal?.linked_account_id || "");
  const [investmentType, setInvestmentType]       = useState(goal?.investment_type || "accumulate");
  const [contributionPeriod, setContributionPeriod] = useState(goal?.contribution_period || "monthly");

  const categories = allCategories.filter(c => c.type === type).map(c => c.name);
  const investmentAccounts = accounts.filter(a => a.type === 'investment');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      name: name || category, type, category,
      target_amount: parseFloat(targetAmount) || 0,
      start_date: startDate, end_date: endDate,
      linked_account_id: linkedAccountId || null,
      investment_type: type === 'investment' ? investmentType : null,
      contribution_period: type === 'investment' && investmentType === 'contribution' ? contributionPeriod : null,
    });
  };

  const inputClass = "rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-gray-200 dark:border-gray-700 placeholder:text-gray-300 dark:placeholder:text-gray-600";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center pb-16 sm:pb-0"
      onClick={onClose}>
      <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[88vh] overflow-y-auto shadow-2xl">

        <div className="sticky top-0 bg-white dark:bg-gray-900 px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between z-10">
          <h2 className="text-base font-bold text-gray-900 dark:text-white">{goal ? "Editar Meta" : "Nova Meta"}</h2>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
            <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-4 py-3 space-y-3 pb-5">

          {/* Tipo */}
          <div className="flex gap-1.5 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
            {[
              { val: "income",     label: "Entrada",      Icon: TrendingUp,   active: "bg-emerald-500" },
              { val: "expense",    label: "Saída",        Icon: TrendingDown, active: "bg-red-500" },
              { val: "investment", label: "Investimento", Icon: PiggyBank,    active: "bg-violet-500" },
            ].map(({ val, label, Icon, active }) => (
              <button key={val} type="button"
                onClick={() => { setType(val); setCategory(""); setInvestmentType("accumulate"); }}
                className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-all ${
                  type === val ? `${active} text-white shadow-sm` : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}>
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>

          {/* Subtipo investimento */}
          {type === "investment" && (
            <div className="space-y-1">
              <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Tipo de meta</Label>
              <div className="flex gap-1.5 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
                {[
                  { val: "accumulate",   label: "🏦 Acumular" },
                  { val: "contribution", label: "📅 Aporte periódico" },
                ].map(({ val, label }) => (
                  <button key={val} type="button" onClick={() => setInvestmentType(val)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                      investmentType === val ? "bg-violet-500 text-white shadow-sm" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 px-1">
                {investmentType === 'accumulate' ? '🏦 Acompanha o saldo total da conta vinculada' : '📅 Acompanha quanto você aportou no período'}
              </p>
            </div>
          )}

          {/* Período aporte */}
          {type === "investment" && investmentType === 'contribution' && (
            <div className="space-y-1">
              <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Repetir a cada</Label>
              <div className="flex gap-1.5 flex-wrap">
                {[
                  { val: 'daily', label: 'Diário' }, { val: 'weekly', label: 'Semanal' },
                  { val: 'monthly', label: 'Mensal' }, { val: 'yearly', label: 'Anual' },
                ].map(({ val, label }) => (
                  <button key={val} type="button" onClick={() => setContributionPeriod(val)}
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                      contributionPeriod === val
                        ? "bg-violet-500 text-white border-violet-500"
                        : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-violet-300"
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Nome */}
          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Nome da meta</Label>
            <Input placeholder="Ex: Reserva de emergência, Viagem..." value={name}
              onChange={(e) => setName(e.target.value)}
              className={`h-10 text-sm ${inputClass}`} required />
          </div>

          {/* Categoria */}
          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className={`h-10 text-sm ${inputClass}`}>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat.toLowerCase()} className="dark:text-white dark:focus:bg-gray-700">{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Valor */}
          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">
              {type === 'investment' && investmentType === 'contribution' ? 'Valor do aporte' : 'Valor da meta'}
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-sm">R$</span>
              <Input type="number" step="0.01" placeholder="0,00" value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                className={`pl-10 h-11 text-xl font-bold ${inputClass}`} required />
            </div>
          </div>

          {/* Período */}
          {!(type === 'investment' && investmentType === 'contribution') && (
            <div className="space-y-2">
              <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Período</Label>
              <div className="flex gap-1.5 flex-wrap">
                {presetPeriods.map(({ label, getEnd }) => (
                  <button key={label} type="button"
                    onClick={() => { setStartDate(today); setEndDate(getEnd()); }}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                      endDate === getEnd()
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-blue-300"
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-gray-500 dark:text-gray-400">Início</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                    className={`h-10 text-sm ${inputClass} [color-scheme:light] dark:[color-scheme:dark]`} required />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-500 dark:text-gray-400">Fim</Label>
                  <Input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)}
                    className={`h-10 text-sm ${inputClass} [color-scheme:light] dark:[color-scheme:dark]`} required />
                </div>
              </div>
            </div>
          )}

          {/* Conta vinculada */}
          {type === "investment" && investmentAccounts.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Conta vinculada</Label>
              <Select value={linkedAccountId} onValueChange={setLinkedAccountId}>
                <SelectTrigger className={`h-10 text-sm ${inputClass}`}>
                  <SelectValue placeholder="Selecione (opcional)" />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                  {investmentAccounts.map(acc => (
                    <SelectItem key={acc.id} value={acc.id} className="dark:text-white dark:focus:bg-gray-700">{acc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button type="submit" className={`w-full h-11 rounded-xl text-sm font-semibold text-white shadow-lg ${
            type === "income"      ? "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-200 dark:shadow-emerald-900/30"
            : type === "investment" ? "bg-violet-500 hover:bg-violet-600 shadow-violet-200 dark:shadow-violet-900/30"
            : "bg-red-500 hover:bg-red-600 shadow-red-200 dark:shadow-red-900/30"
          }`}>
            {goal ? "Atualizar Meta" : "Criar Meta"}
          </Button>
        </form>
      </motion.div>
    </motion.div>
  );
}