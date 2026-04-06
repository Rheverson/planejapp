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

  const [type, setType] = useState(initialData?.type || initialType);
  const [description, setDescription]   = useState(initialData?.description || "");
  const [amount, setAmount]             = useState(initialData?.amount ? String(initialData.amount) : "");
  const [category, setCategory]         = useState(initialData?.category || "");
  const [accountId, setAccountId]       = useState(initialData?.account_id || "");
  const [date, setDate]                 = useState(initialData?.date || today);
  const [isRealized, setIsRealized]     = useState(initialData?.is_realized ?? true);
  const [autoRealize, setAutoRealize]   = useState(initialData?.auto_realize || false);
  const [isRecurring, setIsRecurring]           = useState(initialData?.is_recurring || false);
  const [recurringFreq, setRecurringFreq]       = useState(initialData?.recurring_frequency || "monthly");
  const [recurringDay, setRecurringDay]         = useState(initialData?.recurring_day || todayDay);
  const [recurringEndDate, setRecurringEndDate] = useState(initialData?.recurring_end_date || "");
  const [showSuggestion, setShowSuggestion] = useState(false);

  const { suggestion, confidence, confirmCategory } = useCategorySuggestion(description, type);
  const categories = allCategories.filter(c => c.type === type).map(c => c.name);

  // Quando auto realizar é ativado, desativa is_realized
  const handleAutoRealizeChange = (val) => {
    setAutoRealize(val);
    if (val) setIsRealized(false);
  };

  // Quando is_realized é ativado, desativa auto realizar
  const handleIsRealizedChange = (val) => {
    setIsRealized(val);
    if (val) setAutoRealize(false);
  };

  const handleDescriptionChange = (val) => {
    setDescription(val);
    if (val && !category) setShowSuggestion(true);
    else if (!val) setShowSuggestion(false);
  };

  const handleDateChange = (val) => {
    setDate(val);
    if (isRecurring && recurringFreq === "monthly") {
      setRecurringDay(new Date(val + "T00:00:00").getDate());
    }
  };

  const handleCategoryChange = (val) => { setCategory(val); setShowSuggestion(false); };
  const handleTypeChange = (val) => { setType(val); setCategory(""); setShowSuggestion(false); };
  const handleAcceptSuggestion = () => { setCategory(suggestion); setShowSuggestion(false); };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (description && category) confirmCategory(category, description);
    onSubmit({
      description,
      amount:              parseFloat(amount) || 0,
      category,
      account_id:          accountId || null,
      date,
      is_realized:         isRecurring ? false : isRealized,
      auto_realize:        !isRecurring && !isRealized ? autoRealize : false,
      notes:               initialData?.notes || "",
      type,
      is_recurring:        isRecurring,
      recurring_frequency: isRecurring ? recurringFreq : null,
      recurring_day:       isRecurring && recurringFreq === "monthly" ? recurringDay : null,
      recurring_end_date:  isRecurring && recurringEndDate ? recurringEndDate : null,
    });
  };

  // Mostra auto realizar apenas quando é previsão (não realizada) e não é recorrente
  const showAutoRealize = !isRecurring && !isRealized;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center pb-16 sm:pb-0"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[88vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-white px-4 py-3 border-b border-gray-100 flex items-center justify-between z-10">
          <h2 className="text-base font-bold text-gray-900">
            {isEditing ? "Editar Transação" : "Nova Transação"}
          </h2>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-4 py-3 space-y-3 pb-5">

          <div className="flex gap-1.5 p-1 bg-gray-100 rounded-xl">
            {[
              { val: "income",  label: "Entrada", Icon: TrendingUp,   active: "bg-emerald-500" },
              { val: "expense", label: "Saída",   Icon: TrendingDown, active: "bg-red-500" },
            ].map(({ val, label, Icon, active }) => (
              <button key={val} type="button" onClick={() => handleTypeChange(val)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${
                  type === val ? `${active} text-white shadow-sm` : "text-gray-600 hover:bg-gray-200"
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-600">Valor</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">R$</span>
              <Input type="number" step="0.01" placeholder="0,00" value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-10 h-11 text-xl font-bold border-gray-200 rounded-xl" required
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-600">Descrição</Label>
            <Input placeholder="Ex: Salário, Aluguel, Mercado..." value={description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              className="h-10 text-sm border-gray-200 rounded-xl" required
            />
          </div>

          <CategorySuggestion
            suggestion={suggestion} confidence={confidence}
            onAccept={handleAcceptSuggestion}
            onReject={() => setShowSuggestion(false)}
            isVisible={showSuggestion && !!suggestion && !category}
          />

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs font-medium text-gray-600">Categoria</Label>
              <Select value={category} onValueChange={handleCategoryChange}>
                <SelectTrigger className="h-10 text-sm border-gray-200 rounded-xl">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat.toLowerCase()}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-gray-600">Conta</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="h-10 text-sm border-gray-200 rounded-xl">
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

          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-600">
              {isRecurring ? "Primeira ocorrência" : "Data"}
            </Label>
            <Input type="date" value={date} onChange={(e) => handleDateChange(e.target.value)}
              className="h-10 text-sm border-gray-200 rounded-xl" required
            />
          </div>

          {!isEditing && (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <button type="button" onClick={() => setIsRecurring(!isRecurring)}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Repeat className={`w-4 h-4 ${isRecurring ? "text-blue-500" : "text-gray-400"}`} />
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-900">Recorrente</p>
                    <p className="text-xs text-gray-400">
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
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 py-3 space-y-3 border-t border-gray-100">
                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-gray-600">Frequência</Label>
                        <div className="flex gap-1.5">
                          {frequencyOptions.map(({ value, label }) => (
                            <button key={value} type="button" onClick={() => setRecurringFreq(value)}
                              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                                recurringFreq === value
                                  ? "bg-blue-600 text-white border-blue-600"
                                  : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {recurringFreq === "monthly" && (
                        <div className="space-y-1">
                          <Label className="text-xs font-medium text-gray-600">Todo dia</Label>
                          <Select value={String(recurringDay)} onValueChange={(v) => setRecurringDay(parseInt(v))}>
                            <SelectTrigger className="h-10 text-sm border-gray-200 rounded-xl">
                              <SelectValue placeholder="Dia" />
                            </SelectTrigger>
                            <SelectContent className="max-h-48">
                              {dayOptions.map((d) => (
                                <SelectItem key={d} value={String(d)}>Dia {d}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-gray-400">Gera previsão todo dia {recurringDay} por 12 meses</p>
                        </div>
                      )}

                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-gray-600">
                          Encerra em <span className="font-normal text-gray-400">(opcional)</span>
                        </Label>
                        <Input type="date" value={recurringEndDate} min={date}
                          onChange={(e) => setRecurringEndDate(e.target.value)}
                          className="h-10 text-sm border-gray-200 rounded-xl"
                        />
                        <p className="text-xs text-gray-400">Sem data final gera 12 meses</p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {!isRecurring && (
            <div className="space-y-2">
              {/* Já foi realizada */}
              <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-xl">
                <div>
                  <p className="text-sm font-medium text-gray-900">Já foi realizada?</p>
                  <p className="text-xs text-gray-500">{isRealized ? "Transação confirmada" : "Previsão futura"}</p>
                </div>
                <Switch checked={isRealized} onCheckedChange={handleIsRealizedChange} />
              </div>

              {/* Auto realizar — só aparece quando é previsão */}
              <AnimatePresence>
                {showAutoRealize && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl border transition-colors ${
                      autoRealize
                        ? 'bg-blue-50 border-blue-200'
                        : 'bg-gray-50 border-transparent'
                    }`}>
                      <div className="flex items-center gap-2">
                        <Zap className={`w-4 h-4 ${autoRealize ? 'text-blue-600' : 'text-gray-400'}`} />
                        <div>
                          <p className="text-sm font-medium text-gray-900">Realizar automaticamente</p>
                          <p className="text-xs text-gray-500">
                            {autoRealize
                              ? `Será realizada automaticamente em ${new Date(date + 'T00:00:00').toLocaleDateString('pt-BR')}`
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

          <Button type="submit"
            className={`w-full h-11 rounded-xl text-sm font-semibold ${
              type === "income" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-red-500 hover:bg-red-600"
            }`}
          >
            {isEditing
              ? "Salvar alterações"
              : isRecurring
                ? `Criar recorrência ${type === "income" ? "de entrada" : "de saída"}`
                : `Adicionar ${type === "income" ? "Entrada" : "Saída"}`
            }
          </Button>
        </form>
      </motion.div>
    </motion.div>
  );
}