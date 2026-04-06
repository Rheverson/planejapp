import React, { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Sparkles, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle2, Info, ChevronDown, ChevronUp,
  PiggyBank, Target, Zap, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMonth } from "@/lib/MonthContext";

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

export default function AIInsights() {
  const { user } = useAuth();
  const { selectedDate } = useMonth();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [expandedInsight, setExpandedInsight] = useState(null);

  const month = format(selectedDate, 'yyyy-MM');
  const monthLabel = format(selectedDate, 'MMMM yyyy', { locale: ptBR });

  const fetchInsights = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: result, error: err } = await supabase.functions.invoke('ai-insights', {
        body: { userId: user.id, month }
      });
      if (err) throw err;
      if (result.error) throw new Error(result.error);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 text-white">
        <div className="px-5 pt-12 pb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">IA Financeira</h1>
              <p className="text-purple-200 text-sm capitalize">{monthLabel}</p>
            </div>
          </div>
          <p className="text-purple-100 text-sm mt-2">
            Análise inteligente das suas finanças com recomendações personalizadas
          </p>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 -mt-4 relative z-10">

        {/* Botão gerar */}
        {!data && !loading && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
            <div className="w-16 h-16 bg-violet-100 dark:bg-violet-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-violet-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
              Análise com IA
            </h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
              Nossa IA analisa seus gastos, receitas e padrões para gerar insights personalizados e recomendações práticas.
            </p>
            <Button onClick={fetchInsights}
              className="w-full h-12 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 rounded-xl font-bold text-white">
              <Sparkles className="w-4 h-4 mr-2" />
              Gerar Análise de {format(selectedDate, 'MMMM', { locale: ptBR })}
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

        {/* Erro */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-4 border border-red-200">
            <p className="text-red-600 text-sm font-medium">Erro: {error}</p>
            <Button onClick={fetchInsights} variant="outline" className="mt-3 w-full rounded-xl">
              Tentar novamente
            </Button>
          </div>
        )}

        {/* Resultados */}
        {data && !loading && (
          <>
            {/* Score de saúde financeira */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className={`bg-gradient-to-br ${scoreColors[data.insights.score_color]} rounded-2xl p-6 text-white`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-white/80 text-sm">Saúde Financeira</p>
                  <p className="text-4xl font-bold mt-1">{data.insights.score}<span className="text-xl">/100</span></p>
                  <span className="inline-block mt-1 px-3 py-1 bg-white/20 rounded-full text-sm font-semibold">
                    {data.insights.score_label}
                  </span>
                </div>
                <div className="w-20 h-20 relative">
                  <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="white" strokeWidth="3"
                      strokeDasharray={`${data.insights.score} 100`} strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                </div>
              </div>
              <p className="text-white/90 text-sm leading-relaxed">{data.insights.resumo}</p>

              {/* Resumo financeiro */}
              <div className="grid grid-cols-3 gap-3 mt-4">
                <div className="bg-white/20 rounded-xl p-3 text-center">
                  <p className="text-white/70 text-xs">Entradas</p>
                  <p className="text-white font-bold text-sm">{fmt(data.meta.totalIncome)}</p>
                </div>
                <div className="bg-white/20 rounded-xl p-3 text-center">
                  <p className="text-white/70 text-xs">Saídas</p>
                  <p className="text-white font-bold text-sm">{fmt(data.meta.totalExpense)}</p>
                </div>
                <div className="bg-white/20 rounded-xl p-3 text-center">
                  <p className="text-white/70 text-xs">Poupança</p>
                  <p className="text-white font-bold text-sm">{data.meta.savingsRate}%</p>
                </div>
              </div>
            </motion.div>

            {/* Insights */}
            {data.insights.insights?.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                className="space-y-3">
                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 px-1">
                  💡 Insights do mês
                </h3>
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
                        {isExpanded
                          ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        }
                      </button>
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
                            className="overflow-hidden">
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

            {/* Recomendações de redução de custos */}
            {data.insights.recomendacoes?.length > 0 && (
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

            {/* Investimento sugerido */}
            {data.insights.investimento_sugerido && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-5 text-white">
                <div className="flex items-center gap-2 mb-3">
                  <PiggyBank className="w-5 h-5 text-white" />
                  <h3 className="text-sm font-bold">💰 Quanto investir</h3>
                </div>
                <div className="flex items-center gap-4 mb-3">
                  <div>
                    <p className="text-3xl font-bold">{fmt(data.insights.investimento_sugerido.valor)}</p>
                    <p className="text-emerald-100 text-sm">{data.insights.investimento_sugerido.percentual}% da sua renda</p>
                  </div>
                </div>
                <p className="text-emerald-100 text-sm mb-3">{data.insights.investimento_sugerido.justificativa}</p>
                {data.insights.investimento_sugerido.opcoes?.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-emerald-100">Onde investir:</p>
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
            {data.insights.regra_50_30_20 && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-4">📊 Regra 50/30/20</h3>
                {[
                  { label: "Necessidades", key: "necessidades", percent: "50%", color: "bg-blue-500" },
                  { label: "Desejos", key: "desejos", percent: "30%", color: "bg-amber-500" },
                  { label: "Investimentos", key: "investimentos", percent: "20%", color: "bg-emerald-500" },
                ].map(({ label, key, percent, color }) => {
                  const item = data.insights.regra_50_30_20[key];
                  const progress = item?.ideal > 0 ? Math.min((item.atual / item.ideal) * 100, 100) : 0;
                  return (
                    <div key={key} className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{label} <span className="text-gray-400">({percent})</span></p>
                        <p className="text-xs text-gray-500">{fmt(item?.atual)} / {fmt(item?.ideal)}</p>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                        <div className={`${color} rounded-full h-2 transition-all`} style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  );
                })}
              </motion.div>
            )}

            {/* Botão atualizar */}
            <Button onClick={fetchInsights} variant="outline"
              className="w-full h-12 rounded-2xl border-gray-200 text-gray-600 font-medium">
              <RefreshCw className="w-4 h-4 mr-2" />
              Atualizar análise
            </Button>
          </>
        )}
      </div>
    </div>
  );
}