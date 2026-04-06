import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Sparkles, AlertTriangle, CheckCircle2, Info,
  ChevronDown, ChevronUp, PiggyBank, RefreshCw, Clock, Trash2, Calendar
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const scoreColors = {
  red: "from-red-500 to-rose-600",
  orange: "from-orange-500 to-amber-600",
  yellow: "from-yellow-500 to-amber-500",
  blue: "from-blue-500 to-indigo-600",
  green: "from-emerald-500 to-teal-600",
};

const insightIcons = {
  positivo: { icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-200 dark:border-emerald-800" },
  negativo: { icon: AlertTriangle, color: "text-red-500", bg: "bg-red-50 dark:bg-red-900/20", border: "border-red-200 dark:border-red-800" },
  neutro: { icon: Info, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-900/20", border: "border-blue-200 dark:border-blue-800" },
};

const months = [
  { value: "01", label: "Janeiro" }, { value: "02", label: "Fevereiro" },
  { value: "03", label: "Março" }, { value: "04", label: "Abril" },
  { value: "05", label: "Maio" }, { value: "06", label: "Junho" },
  { value: "07", label: "Julho" }, { value: "08", label: "Agosto" },
  { value: "09", label: "Setembro" }, { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" }, { value: "12", label: "Dezembro" },
];

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 3 }, (_, i) => currentYear - i);

export default function AIInsights() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [data, setData] = useState(null);
  const [savedDate, setSavedDate] = useState(null);
  const [error, setError] = useState(null);
  const [limiteAtingido, setLimiteAtingido] = useState(false);
  const [expandedInsight, setExpandedInsight] = useState(null);
  const [usage, setUsage] = useState(null);
  const [showPeriodSelector, setShowPeriodSelector] = useState(false);

  const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(String(currentYear));

  const month = `${selectedYear}-${selectedMonth}`;
  const monthLabel = format(new Date(`${selectedYear}-${selectedMonth}-02`), 'MMMM yyyy', { locale: ptBR });

  useEffect(() => {
    loadSavedInsights();
  }, [user?.id]);

  const loadSavedInsights = async () => {
    setLoadingSaved(true);
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('ai_insights, ai_insights_date')
        .eq('id', user.id)
        .single();
      if (profile?.ai_insights) {
        setData(profile.ai_insights);
        setSavedDate(profile.ai_insights_date);
      }
    } catch (err) {
      console.error('Erro ao carregar insights:', err);
    } finally {
      setLoadingSaved(false);
    }
  };

  const saveInsights = async (insightsData) => {
    await supabase
      .from('profiles')
      .update({ ai_insights: insightsData, ai_insights_date: new Date().toISOString() })
      .eq('id', user.id);
  };

  const deleteInsights = async () => {
    await supabase
      .from('profiles')
      .update({ ai_insights: null, ai_insights_date: null })
      .eq('id', user.id);
    setData(null);
    setSavedDate(null);
    setUsage(null);
  };

  const fetchInsights = async () => {
    setLoading(true);
    setError(null);
    setLimiteAtingido(false);
    setShowPeriodSelector(false);
    try {
      const { data: result, error: err } = await supabase.functions.invoke('ai-insights', {
        body: { userId: user.id, month }
      });

      if (err) {
        try {
          const errBody = JSON.parse(err.context?.responseText || '{}')
          if (errBody.error === 'limite_atingido') {
            setLimiteAtingido(true);
            setError(errBody.message);
            return;
          }
        } catch {}
        throw err;
      }

      if (result?.error === 'limite_atingido') {
        setLimiteAtingido(true);
        setError(result.message);
        return;
      }

      if (result?.error) throw new Error(result.error);

      setData(result);
      setUsage(result.usage);
      setSavedDate(new Date().toISOString());
      await saveInsights(result);
    } catch (err) {
      setError("Erro ao gerar análise. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  if (loadingSaved) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 text-white">
        <div className="px-5 pt-12 pb-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">IA Financeira</h1>
                <p className="text-purple-200 text-sm">Análise inteligente das suas finanças</p>
              </div>
            </div>
            {data && (
              <button onClick={deleteInsights}
                className="p-2 bg-white/20 hover:bg-white/30 rounded-xl transition-colors">
                <Trash2 className="w-4 h-4 text-white" />
              </button>
            )}
          </div>
          {savedDate && (
            <p className="text-purple-200 text-xs mt-2">
              📅 Análise gerada em {format(new Date(savedDate), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
          )}
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 -mt-4 relative z-10">

        {/* Indicador de uso */}
        {usage && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="bg-violet-50 dark:bg-violet-900/20 rounded-xl p-3 border border-violet-200 dark:border-violet-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-violet-600" />
              <p className="text-sm text-violet-700 dark:text-violet-300">Análises restantes esta semana</p>
            </div>
            <span className="font-bold text-violet-600">{usage.remaining}/2</span>
          </motion.div>
        )}

        {/* Limite atingido */}
        {limiteAtingido && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-5 border border-amber-200 dark:border-amber-800 text-center">
            <Clock className="w-10 h-10 text-amber-500 mx-auto mb-3" />
            <p className="text-amber-800 dark:text-amber-300 font-semibold mb-1">Limite semanal atingido</p>
            <p className="text-amber-600 dark:text-amber-400 text-sm">{error}</p>
          </motion.div>
        )}

        {/* Seletor de período */}
        <AnimatePresence>
          {showPeriodSelector && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
              <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-violet-600" />
                Qual período deseja analisar?
              </h3>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">Mês</p>
                  <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger className="h-10 rounded-xl border-gray-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map(m => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">Ano</p>
                  <Select value={selectedYear} onValueChange={setSelectedYear}>
                    <SelectTrigger className="h-10 rounded-xl border-gray-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map(y => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="bg-violet-50 dark:bg-violet-900/20 rounded-xl p-3 mb-4">
                <p className="text-sm text-violet-700 dark:text-violet-300 text-center font-medium capitalize">
                  📊 Analisando: {monthLabel}
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => setShowPeriodSelector(false)} variant="outline"
                  className="flex-1 h-11 rounded-xl border-gray-200">
                  Cancelar
                </Button>
                <Button onClick={fetchInsights}
                  className="flex-1 h-11 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-xl font-bold text-white">
                  <Sparkles className="w-4 h-4 mr-2" />
                  Gerar
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Botão gerar */}
        {!data && !loading && !limiteAtingido && !showPeriodSelector && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
            <div className="w-16 h-16 bg-violet-100 dark:bg-violet-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-violet-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Análise com IA</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">
              Nossa IA analisa seus gastos, receitas e padrões para gerar insights personalizados.
            </p>
            <p className="text-xs text-gray-400 mb-6">📊 2 análises gratuitas por semana</p>
            <Button onClick={() => setShowPeriodSelector(true)}
              className="w-full h-12 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 rounded-xl font-bold text-white">
              <Sparkles className="w-4 h-4 mr-2" />
              Gerar Nova Análise
            </Button>
          </motion.div>
        )}

        {/* Loading */}
        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
            <div className="w-16 h-16 bg-violet-100 dark:bg-violet-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
                <Sparkles className="w-8 h-8 text-violet-600" />
              </motion.div>
            </div>
            <p className="text-gray-700 dark:text-gray-300 font-semibold mb-1">Analisando suas finanças...</p>
            <p className="text-gray-400 text-sm">Isso pode levar alguns segundos</p>
          </motion.div>
        )}

        {/* Erro genérico */}
        {error && !limiteAtingido && (
          <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-4 border border-red-200">
            <p className="text-red-600 text-sm font-medium">{error}</p>
            <Button onClick={() => setShowPeriodSelector(true)} variant="outline" className="mt-3 w-full rounded-xl">
              Tentar novamente
            </Button>
          </div>
        )}

        {/* Resultados */}
        {data && !loading && (
          <>
            {/* Score */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className={`bg-gradient-to-br ${scoreColors[data.insights?.score_color] || scoreColors.blue} rounded-2xl p-6 text-white`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-white/80 text-sm">Saúde Financeira</p>
                  <p className="text-4xl font-bold mt-1">{data.insights?.score}<span className="text-xl">/100</span></p>
                  <span className="inline-block mt-1 px-3 py-1 bg-white/20 rounded-full text-sm font-semibold">
                    {data.insights?.score_label}
                  </span>
                </div>
                <div className="w-20 h-20 relative">
                  <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="white" strokeWidth="3"
                      strokeDasharray={`${data.insights?.score} 100`} strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                </div>
              </div>

              <p className="text-white/90 text-sm leading-relaxed mb-4">{data.insights?.resumo}</p>

              {/* Alerta projeção negativa */}
              {data.insights?.alerta_projecao && data.insights.alerta_projecao !== 'null' && (
                <div className="bg-red-500/30 border border-red-300/50 rounded-xl p-3 mb-4">
                  <p className="text-white text-sm font-semibold">{data.insights.alerta_projecao}</p>
                </div>
              )}

              {/* Realizado */}
              <p className="text-white/70 text-xs font-semibold mb-2 uppercase tracking-wide">Realizado até agora</p>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-white/20 rounded-xl p-2.5 text-center">
                  <p className="text-white/70 text-xs">Entradas</p>
                  <p className="text-white font-bold text-xs">{fmt(data.meta?.totalIncome)}</p>
                </div>
                <div className="bg-white/20 rounded-xl p-2.5 text-center">
                  <p className="text-white/70 text-xs">Saídas</p>
                  <p className="text-white font-bold text-xs">{fmt(data.meta?.totalExpense)}</p>
                </div>
                <div className="bg-white/20 rounded-xl p-2.5 text-center">
                  <p className="text-white/70 text-xs">Poupança</p>
                  <p className="text-white font-bold text-xs">{data.meta?.savingsRate}%</p>
                </div>
              </div>

              {/* Projeção */}
              <p className="text-white/70 text-xs font-semibold mb-2 uppercase tracking-wide">Projeção fim do mês</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white/20 rounded-xl p-2.5 text-center">
                  <p className="text-white/70 text-xs">Entradas</p>
                  <p className="text-white font-bold text-xs">{fmt(data.meta?.totalIncomeProjected)}</p>
                </div>
                <div className="bg-white/20 rounded-xl p-2.5 text-center">
                  <p className="text-white/70 text-xs">Saídas</p>
                  <p className="text-white font-bold text-xs">{fmt(data.meta?.totalExpenseProjected)}</p>
                </div>
                <div className={`rounded-xl p-2.5 text-center ${data.meta?.isProjectedNegative ? 'bg-red-500/40 border border-red-300/50' : 'bg-white/20'}`}>
                  <p className="text-white/70 text-xs">Saldo final</p>
                  <p className="text-white font-bold text-xs">{fmt(data.meta?.balanceProjected)}</p>
                </div>
              </div>
            </motion.div>

            {/* Insights */}
            {data.insights?.insights?.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                className="space-y-3">
                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 px-1">💡 Insights do mês</h3>
                {data.insights.insights.map((insight, i) => {
                  const { icon: Icon, color, bg, border } = insightIcons[insight.tipo] || insightIcons.neutro;
                  const isExpanded = expandedInsight === i;
                  return (
                    <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className={`${bg} rounded-2xl border ${border} overflow-hidden`}>
                      <button onClick={() => setExpandedInsight(isExpanded ? null : i)}
                        className="w-full flex items-center gap-3 p-4 text-left">
                        <div className={`w-8 h-8 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
                          <Icon className={`w-4 h-4 ${color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{insight.titulo}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{insight.descricao}</p>
                        </div>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                      </button>
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                            <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3">
                              <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{insight.descricao}</p>
                              <div className="bg-white dark:bg-gray-700 rounded-xl p-3">
                                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">✅ Ação recomendada:</p>
                                <p className="text-sm text-gray-700 dark:text-gray-200">{insight.acao}</p>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}

            {/* Recomendações */}
            {data.insights?.recomendacoes?.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="px-5 pt-4 pb-2">
                  <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">✂️ Onde reduzir custos</h3>
                </div>
                <div className="divide-y divide-gray-50 dark:divide-gray-700">
                  {data.insights.recomendacoes.map((rec, i) => (
                    <div key={i} className="px-5 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 capitalize">{rec.categoria}</p>
                        <span className="text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full">
                          Economize {fmt(rec.economia_possivel)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-red-500">Atual: {fmt(rec.gasto_atual)}</span>
                        <span className="text-gray-300">→</span>
                        <span className="text-xs text-emerald-600">Ideal: {fmt(rec.gasto_ideal)}</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{rec.dica}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Investimento */}
            {data.insights?.investimento_sugerido && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                className={`rounded-2xl p-5 text-white ${data.meta?.isProjectedNegative ? 'bg-gradient-to-br from-red-500 to-rose-600' : 'bg-gradient-to-br from-emerald-500 to-teal-600'}`}>
                <div className="flex items-center gap-2 mb-3">
                  <PiggyBank className="w-5 h-5 text-white" />
                  <h3 className="text-sm font-bold">💰 Quanto investir</h3>
                </div>
                <p className="text-3xl font-bold">{fmt(data.insights.investimento_sugerido.valor)}</p>
                <p className="text-white/80 text-sm mb-2">{data.insights.investimento_sugerido.percentual} da sua renda</p>
                <p className="text-white/80 text-sm mb-3">{data.insights.investimento_sugerido.justificativa}</p>
                {data.insights.investimento_sugerido.valor > 0 && data.insights.investimento_sugerido.opcoes?.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-white/70">Onde investir:</p>
                    {data.insights.investimento_sugerido.opcoes.map((op, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-white/60" />
                        <p className="text-sm text-white/90">{op}</p>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* Regra 50/30/20 */}
            {data.insights?.regra_50_30_20 && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">📊 Regra 50/30/20</h3>

                {/* Base de cálculo */}
                <div className="bg-gray-50 dark:bg-gray-700 rounded-xl px-3 py-2 mb-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Base: <span className="font-bold text-gray-700 dark:text-gray-200">
                      {fmt(data.insights.regra_50_30_20.renda_base)}
                    </span> (renda projetada do mês)
                  </p>
                </div>

                {[
                  { label: "Necessidades", key: "necessidades", percent: "50%", color: "bg-blue-500", desc: "Aluguel, alimentação, saúde, transporte" },
                  { label: "Desejos", key: "desejos", percent: "30%", color: "bg-amber-500", desc: "Lazer, compras, restaurantes" },
                  { label: "Investimentos", key: "investimentos", percent: "20%", color: "bg-emerald-500", desc: "Poupança e investimentos" },
                ].map(({ label, key, percent, color, desc }) => {
                  const item = data.insights.regra_50_30_20[key];
                  const progress = item?.ideal > 0 ? Math.min((item.atual / item.ideal) * 100, 100) : 0;
                  const isOver = item?.atual > item?.ideal;
                  return (
                    <div key={key} className="mb-4">
                      <div className="flex items-center justify-between mb-0.5">
                        <div>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
                          <span className="text-gray-400 text-xs ml-1">({percent})</span>
                        </div>
                        <span className={`text-xs font-bold ${isOver ? 'text-red-500' : 'text-emerald-600'}`}>
                          {fmt(item?.atual)} / {fmt(item?.ideal)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mb-1.5">{desc}</p>
                      <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                        <div className={`${isOver ? 'bg-red-500' : color} rounded-full h-2 transition-all`}
                          style={{ width: `${progress}%` }} />
                      </div>
                      {isOver && (
                        <p className="text-xs text-red-500 mt-1">
                          ⚠️ Acima do ideal em {fmt(item.atual - item.ideal)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </motion.div>
            )}

            {/* Botão nova análise */}
            {!showPeriodSelector && !limiteAtingido && (
              <Button onClick={() => setShowPeriodSelector(true)} variant="outline"
                className="w-full h-12 rounded-2xl border-gray-200 text-gray-600 font-medium">
                <RefreshCw className="w-4 h-4 mr-2" />
                Gerar nova análise
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}