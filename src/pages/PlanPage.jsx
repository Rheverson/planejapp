import React, { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, Crown, Zap, X, AlertTriangle,
  Calendar, CreditCard, ChevronRight, Sparkles, RefreshCw, Settings
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const PLANS = [
  {
    id: "free",
    name: "Gratuito",
    price: 0,
    description: "Para começar a organizar",
    color: "from-gray-500 to-gray-600",
    border: "border-gray-200 dark:border-gray-700",
    badge: null,
    features: ["Até 50 transações/mês", "1 conta bancária", "Relatórios básicos", "Acesso ao Finn (limitado)"],
    disabled: ["Metas ilimitadas", "Lançamentos recorrentes", "Análise IA avançada"],
  },
  {
    id: "monthly",
    name: "Pro",
    price: 12.90,
    description: "Para quem leva finanças a sério",
    color: "from-violet-600 to-indigo-600",
    border: "border-violet-300 dark:border-violet-700",
    badge: "Mais popular",
    features: ["Transações ilimitadas", "Contas ilimitadas", "Relatórios completos", "Finn IA sem limites", "Lançamentos recorrentes", "Metas e investimentos", "Notificações automáticas", "Suporte prioritário"],
    disabled: [],
  },
];

function CancelModal({ subscription, onClose, onConfirm, loading }) {
  const endDate = subscription?.current_period_end
    ? format(new Date(subscription.current_period_end), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
    : null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[999] flex items-end sm:items-center justify-center"
      onClick={onClose}>
      <motion.div initial={{ y: "100%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-gray-800 w-full max-w-md rounded-t-[2.5rem] sm:rounded-[2rem] overflow-hidden shadow-2xl">
        <div className="bg-gradient-to-br from-red-500 to-rose-600 px-6 pt-8 pb-6 text-white relative">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-white/20 rounded-full">
            <X className="w-4 h-4 text-white" />
          </button>
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mb-3">
            <AlertTriangle className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-bold mb-1">Cancelar assinatura</h2>
          <p className="text-red-100 text-sm">Tem certeza que deseja cancelar?</p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 space-y-2">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">O que acontece ao cancelar:</p>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-700 dark:text-gray-300">Você continua com acesso <strong>Pro até {endDate}</strong></p>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-700 dark:text-gray-300">Não há cobranças adicionais</p>
            </div>
            <div className="flex items-start gap-2">
              <X className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-700 dark:text-gray-300">Após {endDate}, voltará ao plano gratuito</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 h-12 rounded-2xl border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium text-sm">
              Manter Pro
            </button>
            <button onClick={onConfirm} disabled={loading}
              className="flex-1 h-12 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-medium text-sm disabled:opacity-60 flex items-center justify-center gap-2 transition-colors">
              {loading
                ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                : "Sim, cancelar"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function PlanPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showCancel, setShowCancel] = useState(false);
  const [loadingPortal, setLoadingPortal] = useState(false);

  const { data: subscription, isLoading } = useQuery({
    queryKey: ["subscription", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      return data;
    },
    enabled: !!user?.id,
  });

  const isActive = subscription?.status === "active" || subscription?.status === "trialing";
  const isCancelled = subscription?.status === "cancelled";
  const currentPlan = isActive || isCancelled ? "monthly" : "free";
  const endDate = subscription?.current_period_end
    ? format(new Date(subscription.current_period_end), "dd/MM/yyyy", { locale: ptBR })
    : null;
  const trialEnd = subscription?.trial_end
    ? format(new Date(subscription.trial_end), "dd/MM/yyyy", { locale: ptBR })
    : null;

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("cancel-subscription", {
        body: { userId: user.id }
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Erro");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      setShowCancel(false);
      toast.success("Assinatura cancelada. Acesso mantido até " + endDate + " 🗓️");
    },
    onError: (err) => toast.error("Erro ao cancelar: " + err.message),
  });

  // Abre o Stripe Customer Portal para gerenciar cobrança
  const openBillingPortal = async () => {
    setLoadingPortal(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("create-billing-portal", {
        body: { userId: user.id, returnUrl: window.location.href },
        headers: { Authorization: `Bearer ${session?.access_token}` }
      });
      if (error || data?.error) throw new Error(data?.error || "Erro ao abrir portal");
      window.location.href = data.url;
    } catch (err) {
      toast.error("Erro ao abrir portal de cobrança: " + err.message);
    } finally {
      setLoadingPortal(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
        <div className="bg-gradient-to-br from-violet-700 via-purple-800 to-indigo-900 text-white">
          <div className="px-5 pt-12 pb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center">
                <Crown className="w-5 h-5 text-amber-300" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Meu Plano</h1>
                <p className="text-violet-200 text-sm">Gerencie sua assinatura</p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 -mt-4 relative z-10 space-y-4">

          {/* Card plano atual */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className={`bg-gradient-to-r ${currentPlan === "monthly" ? "from-violet-600 to-indigo-600" : "from-gray-500 to-gray-600"} px-5 py-4 flex items-center justify-between`}>
              <div>
                <p className="text-white/80 text-xs font-medium mb-0.5">Plano atual</p>
                <p className="text-white text-lg font-bold flex items-center gap-2">
                  {currentPlan === "monthly" ? <><Crown className="w-4 h-4 text-amber-300" /> Pro</> : "Gratuito"}
                </p>
              </div>
              <div className="text-right">
                {currentPlan === "monthly" && (
                  <>
                    <p className="text-white text-2xl font-bold">R$12,90</p>
                    <p className="text-white/70 text-xs">/mês</p>
                  </>
                )}
              </div>
            </div>

            <div className="px-5 py-4 space-y-3">
              {/* Status */}
              {isActive && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                      {subscription?.status === "trialing" ? "Período de teste" : "Ativa"}
                    </span>
                  </div>
                  <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2.5 py-1 rounded-full font-medium">
                    ✅ Ativo
                  </span>
                </div>
              )}

              {isCancelled && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-amber-500 rounded-full" />
                    <span className="text-sm text-gray-600 dark:text-gray-300">Cancelado</span>
                  </div>
                  <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2.5 py-1 rounded-full font-medium">
                    ⏳ Ativo até {endDate}
                  </span>
                </div>
              )}

              {/* Datas */}
              {subscription?.status === "trialing" && trialEnd && (
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <Calendar className="w-4 h-4 flex-shrink-0" />
                  <span>Trial encerra em <strong className="text-gray-700 dark:text-gray-200">{trialEnd}</strong></span>
                </div>
              )}

              {endDate && subscription?.status !== "trialing" && (
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <Calendar className="w-4 h-4 flex-shrink-0" />
                  <span>
                    {isCancelled ? "Acesso até" : "Próxima cobrança em"}{" "}
                    <strong className="text-gray-700 dark:text-gray-200">{endDate}</strong>
                  </span>
                </div>
              )}
            </div>
          </motion.div>

          {/* Gerenciar cobrança — só aparece se tem Stripe */}
          {subscription?.stripe_subscription_id && (isActive || isCancelled) && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
              className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 px-5 pt-4 pb-2">Cobrança</p>

              <button onClick={openBillingPortal} disabled={loadingPortal}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group border-t border-gray-50 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-blue-100 dark:bg-blue-900/20 rounded-xl flex items-center justify-center">
                    <CreditCard className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Gerenciar cartão</p>
                    <p className="text-xs text-gray-400">Alterar ou remover método de pagamento</p>
                  </div>
                </div>
                {loadingPortal
                  ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-4 h-4 border-2 border-gray-300 border-t-violet-600 rounded-full" />
                  : <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />}
              </button>

              <button onClick={openBillingPortal} disabled={loadingPortal}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group border-t border-gray-50 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-violet-100 dark:bg-violet-900/20 rounded-xl flex items-center justify-center">
                    <Settings className="w-4 h-4 text-violet-600" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Histórico de faturas</p>
                    <p className="text-xs text-gray-400">Ver e baixar recibos de pagamento</p>
                  </div>
                </div>
                {loadingPortal
                  ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-4 h-4 border-2 border-gray-300 border-t-violet-600 rounded-full" />
                  : <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />}
              </button>
            </motion.div>
          )}

          {/* Planos disponíveis */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 px-1 mb-3">Planos disponíveis</p>
            <div className="space-y-3">
              {PLANS.map((plan) => {
                const isCurrent = plan.id === currentPlan;
                return (
                  <div key={plan.id}
                    className={`bg-white dark:bg-gray-800 rounded-2xl border-2 overflow-hidden transition-all ${isCurrent ? plan.border : "border-gray-100 dark:border-gray-700"}`}>
                    {plan.badge && (
                      <div className={`bg-gradient-to-r ${plan.color} px-5 py-1.5 flex items-center justify-between`}>
                        <span className="text-white text-xs font-semibold flex items-center gap-1">
                          <Sparkles className="w-3 h-3" /> {plan.badge}
                        </span>
                        {isCurrent && <span className="text-white/80 text-xs">✓ Seu plano atual</span>}
                      </div>
                    )}
                    <div className="px-5 py-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="font-bold text-gray-900 dark:text-white text-base">{plan.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{plan.description}</p>
                        </div>
                        <div className="text-right">
                          {plan.price > 0
                            ? <><p className="text-xl font-bold text-gray-900 dark:text-white">{fmt(plan.price)}</p><p className="text-xs text-gray-400">/mês</p></>
                            : <p className="text-xl font-bold text-gray-500">Grátis</p>}
                        </div>
                      </div>
                      <div className="space-y-1.5 mb-4">
                        {plan.features.map((f, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                            <span className="text-xs text-gray-600 dark:text-gray-300">{f}</span>
                          </div>
                        ))}
                        {plan.disabled.map((f, i) => (
                          <div key={i} className="flex items-center gap-2 opacity-40">
                            <X className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span className="text-xs text-gray-400 line-through">{f}</span>
                          </div>
                        ))}
                      </div>
                      {isCurrent ? (
                        <div className={`w-full h-10 rounded-xl bg-gradient-to-r ${plan.color} flex items-center justify-center`}>
                          <span className="text-white text-sm font-medium">✓ Plano atual</span>
                        </div>
                      ) : plan.id === "monthly" ? (
                        <button onClick={() => window.location.href = "/subscribe"}
                          className={`w-full h-10 rounded-xl bg-gradient-to-r ${plan.color} text-white text-sm font-medium flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity`}>
                          <Zap className="w-4 h-4" /> Fazer upgrade
                        </button>
                      ) : (
                        <button disabled className="w-full h-10 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-400 text-sm font-medium">
                          Plano inferior
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>

          {/* Cancelar */}
          {isActive && !isCancelled && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
              className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
              <button onClick={() => setShowCancel(true)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors group">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-red-100 dark:bg-red-900/20 rounded-xl flex items-center justify-center">
                    <X className="w-4 h-4 text-red-500" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-red-600 dark:text-red-400">Cancelar assinatura</p>
                    <p className="text-xs text-gray-400">Você mantém o acesso até {endDate}</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-red-400 transition-colors" />
              </button>
            </motion.div>
          )}

          {isCancelled && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl px-5 py-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Assinatura cancelada</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                    Seu acesso Pro continua ativo até <strong>{endDate}</strong>.
                  </p>
                  <button onClick={() => window.location.href = "/subscribe"}
                    className="mt-3 text-xs font-semibold text-violet-600 dark:text-violet-400 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" /> Reativar assinatura
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showCancel && (
          <CancelModal
            subscription={subscription}
            onClose={() => setShowCancel(false)}
            onConfirm={() => cancelMutation.mutate()}
            loading={cancelMutation.isPending}
          />
        )}
      </AnimatePresence>
    </>
  );
}