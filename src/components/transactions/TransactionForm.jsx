import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { X, TrendingUp, TrendingDown, Repeat, Zap } from "lucide-react";
import CategorySuggestion from "./CategorySuggestion";
import { useCategorySuggestion } from "./useCategorySuggestion";
import { useAuth } from "@/lib/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const frequencyOptions = [
  { value: "monthly", label: "Mensal" },
  { value: "weekly",  label: "Semanal" },
  { value: "yearly",  label: "Anual" },
];
const dayOptions = Array.from({ length: 31 }, (_, i) => i + 1);
const today = new Date().toISOString().split("T")[0];
const todayDay = new Date().getDate();

export default function TransactionForm({ accounts, onSubmit, onClose, initialType = "expense", initialData = null }) {
  const isEditing = !!initialData;
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

  const [type, setType]                         = useState(initialData?.type || initialType);
  const [description, setDescription]           = useState(initialData?.description || "");
  const [amount, setAmount]                     = useState(initialData?.amount ? String(initialData.amount) : "");
  const [category, setCategory]                 = useState(initialData?.category || "");
  const [accountId, setAccountId]               = useState(initialData?.account_id || "");
  const [date, setDate]                         = useState(initialData?.date || today);
  const [isRealized, setIsRealized]             = useState(initialData?.is_realized ?? true);
  const [autoRealize, setAutoRealize]           = useState(initialData?.auto_realize || false);
  const [isRecurring, setIsRecurring]           = useState(initialData?.is_recurring || false);
  const [recurringFreq, setRecurringFreq]       = useState(initialData?.recurring_frequency || "monthly");
  const [recurringDay, setRecurringDay]         = useState(initialData?.recurring_day || todayDay);
  const [recurringEndDate, setRecurringEndDate] = useState(initialData?.recurring_end_date || "");
  const [showSuggestion, setShowSuggestion]     = useState(false);

  const { suggestion, confidence, confirmCategory } = useCategorySuggestion(description, type);
  const categories = allCategories.filter(c => c.type === type).map(c => c.name);

  const handleAutoRealizeChange = (val) => { setAutoRealize(val); if (val) setIsRealized(false); };
  const handleIsRealizedChange  = (val) => { setIsRealized(val); if (val) setAutoRealize(false); };
  const handleDescriptionChange = (val) => {
    setDescription(val);
    if (val && !category) setShowSuggestion(true);
    else if (!val) setShowSuggestion(false);
  };
  const handleDateChange = (val) => {
    setDate(val);
    if (isRecurring && recurringFreq === "monthly")
      setRecurringDay(new Date(val + "T00:00:00").getDate());
  };
  const handleCategoryChange = (val) => { setCategory(val); setShowSuggestion(false); };
  const handleTypeChange     = (val) => { setType(val); setCategory(""); setShowSuggestion(false); };
  const handleAcceptSuggestion = () => { setCategory(suggestion); setShowSuggestion(false); };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (description && category) confirmCategory(category, description);
    onSubmit({
      description, amount: parseFloat(amount) || 0, category,
      account_id: accountId || null, date,
      is_realized: isRecurring ? false : isRealized,
      auto_realize: !isRecurring && !isRealized ? autoRealize : false,
      notes: initialData?.notes || "", type,
      is_recurring: isRecurring,
      recurring_frequency: isRecurring ? recurringFreq : null,
      recurring_day: isRecurring && recurringFreq === "monthly" ? recurringDay : null,
      recurring_end_date: isRecurring && recurringEndDate ? recurringEndDate : null,
    });
  };

  const showAutoRealize = !isRecurring && !isRealized;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center pb-16 sm:pb-0"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[88vh] overflow-y-auto shadow-2xl"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between z-10">
          <h2 className="text-base font-bold text-gray-900 dark:text-white">
            {isEditing ? "Editar Transação" : "Nova Transação"}
          </h2>
          <button type="button" onClick={onClose}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-4 py-3 space-y-3 pb-5">

          {/* Tipo */}
          <div className="flex gap-1.5 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
            {[
              { val: "income",  label: "Entrada", Icon: TrendingUp,   active: "bg-emerald-500" },
              { val: "expense", label: "Saída",   Icon: TrendingDown, active: "bg-red-500" },
            ].map(({ val, label, Icon, active }) => (
              <button key={val} type="button" onClick={() => handleTypeChange(val)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${
                  type === val
                    ? `${active} text-white shadow-sm`
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>

          {/* Valor */}
          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Valor</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-sm font-medium">R$</span>
              <Input
                type="number" step="0.01" placeholder="0,00" value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-10 h-11 text-xl font-bold rounded-xl
                  bg-white dark:bg-gray-800
                  text-gray-900 dark:text-white
                  border-gray-200 dark:border-gray-700
                  placeholder:text-gray-300 dark:placeholder:text-gray-600
                  focus:border-blue-400 dark:focus:border-blue-500
                  focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/30"
                required
              />
            </div>
          </div>

          {/* Descrição */}
          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Descrição</Label>
            <Input
              placeholder="Ex: Salário, Aluguel, Mercado..." value={description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              className="h-10 text-sm rounded-xl
                bg-white dark:bg-gray-800
                text-gray-900 dark:text-white
                border-gray-200 dark:border-gray-700
                placeholder:text-gray-300 dark:placeholder:text-gray-600
                focus:border-blue-400 dark:focus:border-blue-500"
              required
            />
          </div>

          <CategorySuggestion
            suggestion={suggestion} confidence={confidence}
            onAccept={handleAcceptSuggestion}
            onReject={() => setShowSuggestion(false)}
            isVisible={showSuggestion && !!suggestion && !category}
          />

          {/* Categoria e Conta */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Categoria</Label>
              <Select value={category} onValueChange={handleCategoryChange}>
                <SelectTrigger className="h-10 text-sm rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat.toLowerCase()} className="dark:text-white dark:focus:bg-gray-700">{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Conta</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="h-10 text-sm rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id} className="dark:text-white dark:focus:bg-gray-700">{acc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Data */}
          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">
              {isRecurring ? "Primeira ocorrência" : "Data"}
            </Label>
            <Input
              type="date" value={date} onChange={(e) => handleDateChange(e.target.value)}
              className="h-10 text-sm rounded-xl
                bg-white dark:bg-gray-800
                text-gray-900 dark:text-white
                border-gray-200 dark:border-gray-700
                [color-scheme:light] dark:[color-scheme:dark]"
              required
            />
          </div>

          {/* Recorrente */}
          {!isEditing && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <button type="button" onClick={() => setIsRecurring(!isRecurring)}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <div className="flex items-center gap-2">
                  <Repeat className={`w-4 h-4 ${isRecurring ? "text-blue-500" : "text-gray-400 dark:text-gray-500"}`} />
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Recorrente</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {isRecurring ? "Ocorrências viram previsão automaticamente" : "Repetir todo mês, semana ou ano"}
                    </p>
                  </div>
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
                </div>
              </button>

              <AnimatePresence>
                {isRecurring && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 py-3 space-y-3 border-t border-gray-100 dark:border-gray-700">
                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Frequência</Label>
                        <div className="flex gap-1.5">
                          {frequencyOptions.map(({ value, label }) => (
                            <button key={value} type="button" onClick={() => setRecurringFreq(value)}
                              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                                recurringFreq === value
                                  ? "bg-blue-600 text-white border-blue-600"
                                  : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-blue-300"
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {recurringFreq === "monthly" && (
                        <div className="space-y-1">
                          <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Todo dia</Label>
                          <Select value={String(recurringDay)} onValueChange={(v) => setRecurringDay(parseInt(v))}>
                            <SelectTrigger className="h-10 text-sm rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white">
                              <SelectValue placeholder="Dia" />
                            </SelectTrigger>
                            <SelectContent className="max-h-48 dark:bg-gray-800 dark:border-gray-700">
                              {dayOptions.map((d) => (
                                <SelectItem key={d} value={String(d)} className="dark:text-white dark:focus:bg-gray-700">Dia {d}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-gray-400 dark:text-gray-500">Gera previsão todo dia {recurringDay} por 12 meses</p>
                        </div>
                      )}

                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                          Encerra em <span className="font-normal text-gray-400 dark:text-gray-500">(opcional)</span>
                        </Label>
                        <Input
                          type="date" value={recurringEndDate} min={date}
                          onChange={(e) => setRecurringEndDate(e.target.value)}
                          className="h-10 text-sm rounded-xl
                            bg-white dark:bg-gray-800
                            text-gray-900 dark:text-white
                            border-gray-200 dark:border-gray-700
                            [color-scheme:light] dark:[color-scheme:dark]"
                        />
                        <p className="text-xs text-gray-400 dark:text-gray-500">Sem data final gera 12 meses</p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Realizada / Auto realizar */}
          {!isRecurring && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-transparent dark:border-gray-700/50">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Já foi realizada?</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{isRealized ? "Transação confirmada" : "Previsão futura"}</p>
                </div>
                <Switch checked={isRealized} onCheckedChange={handleIsRealizedChange} />
              </div>

              <AnimatePresence>
                {showAutoRealize && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
                  >
                    <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl border transition-colors ${
                      autoRealize
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                        : 'bg-gray-50 dark:bg-gray-800/50 border-transparent dark:border-gray-700/50'
                    }`}>
                      <div className="flex items-center gap-2">
                        <Zap className={`w-4 h-4 ${autoRealize ? 'text-blue-600' : 'text-gray-400 dark:text-gray-500'}`} />
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">Realizar automaticamente</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {autoRealize
                              ? `Será realizada em ${new Date(date + 'T00:00:00').toLocaleDateString('pt-BR')}`
                              : 'Marcar como realizada na data de vencimento'}
                          </p>
                        </div>
                      </div>
                      <Switch checked={autoRealize} onCheckedChange={handleAutoRealizeChange} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Botão */}
          <Button type="submit"
            className={`w-full h-11 rounded-xl text-sm font-semibold text-white shadow-lg ${
              type === "income"
                ? "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-200 dark:shadow-emerald-900/30"
                : "bg-red-500 hover:bg-red-600 shadow-red-200 dark:shadow-red-900/30"
            }`}
          >
            {isEditing
              ? "Salvar alterações"
              : isRecurring
                ? `Criar recorrência ${type === "income" ? "de entrada" : "de saída"}`
                : `Adicionar ${type === "income" ? "Entrada" : "Saída"}`}
          </Button>
        </form>
      </motion.div>
    </motion.div>
  );
}