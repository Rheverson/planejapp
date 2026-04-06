import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, X, Wallet, Target, TrendingDown, CheckCircle2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import AccountForm from "@/components/accounts/AccountForm";
import GoalForm from "@/components/goals/GoalForm";
import TransactionForm from "@/components/transactions/TransactionForm";

const steps = [
  {
    id: 1,
    icon: Wallet,
    color: "from-blue-500 to-blue-600",
    title: "Crie sua primeira conta",
    description: "Registre suas contas bancárias, carteira ou investimentos. O PlanejeApp calcula seu saldo automaticamente!",
    tip: "💡 Adicione o saldo atual de cada conta para começar com dados reais.",
    buttonLabel: "Criar minha primeira conta",
    skipLabel: "Pular por agora",
    preview: (
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mx-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-gray-800">Nubank</p>
            <p className="text-xs text-gray-400">Conta corrente</p>
          </div>
          <p className="text-sm font-bold text-emerald-600">R$ 1.250,00</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-purple-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-gray-800">Carteira</p>
            <p className="text-xs text-gray-400">Dinheiro em mãos</p>
          </div>
          <p className="text-sm font-bold text-emerald-600">R$ 350,00</p>
        </div>
      </div>
    )
  },
  {
    id: 2,
    icon: Target,
    color: "from-emerald-500 to-teal-600",
    title: "Defina suas metas",
    description: "Crie metas de economia, controle gastos por categoria ou planeje conquistar um objetivo!",
    tip: "💡 Comece com uma meta simples, como limitar gastos com alimentação.",
    buttonLabel: "Criar minha primeira meta",
    skipLabel: "Pular por agora",
    preview: (
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mx-4">
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-bold text-gray-800">🍕 Alimentação</p>
            <p className="text-xs text-gray-500">R$ 600 / R$ 800</p>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className="bg-emerald-500 rounded-full h-2" style={{ width: '75%' }} />
          </div>
          <p className="text-xs text-emerald-600 mt-1">75% utilizado</p>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-bold text-gray-800">✈️ Viagem</p>
            <p className="text-xs text-gray-500">R$ 1.200 / R$ 3.000</p>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className="bg-blue-500 rounded-full h-2" style={{ width: '40%' }} />
          </div>
          <p className="text-xs text-blue-600 mt-1">40% economizado</p>
        </div>
      </div>
    )
  },
  {
    id: 3,
    icon: TrendingDown,
    color: "from-orange-500 to-rose-500",
    title: "Lance entradas e saídas",
    description: "Registre seus ganhos e gastos diariamente. O app categoriza automaticamente e mostra para onde seu dinheiro vai!",
    tip: "💡 Use os botões de atalho na Home para lançar transações rapidamente.",
    buttonLabel: "Lançar primeira transação",
    skipLabel: "Pular por agora",
    preview: (
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mx-4">
        <div className="space-y-2">
          {[
            { emoji: "💼", name: "Salário", date: "Hoje", value: "+R$ 3.500", color: "text-emerald-600", bg: "bg-emerald-100" },
            { emoji: "🛒", name: "Supermercado", date: "Ontem", value: "-R$ 280", color: "text-red-500", bg: "bg-red-100" },
            { emoji: "⚡", name: "Conta de luz", date: "Há 2 dias", value: "-R$ 145", color: "text-red-500", bg: "bg-red-100" },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full ${item.bg} flex items-center justify-center flex-shrink-0`}>
                <span className="text-xs">{item.emoji}</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">{item.name}</p>
                <p className="text-xs text-gray-400">{item.date}</p>
              </div>
              <p className={`text-sm font-bold ${item.color}`}>{item.value}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }
];

export default function OnboardingTour() {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [accounts, setAccounts] = useState([]);

  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;
  const isCompleted = completedSteps.includes(currentStep);

  const handleComplete = async () => {
    console.log('🔵 handleComplete chamado, user.id:', user?.id);
    
    const { error } = await supabase
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('id', user.id);

    console.log('✅ Update resultado:', error);

    localStorage.setItem('onboarding_completed', 'true');
    queryClient.invalidateQueries();
    navigate('/');
    };

  const handleNext = () => {
    if (isLast) {
      handleComplete();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const markCompleted = () => {
    if (!completedSteps.includes(currentStep)) {
      setCompletedSteps(prev => [...prev, currentStep]);
    }
  };

  // ── Handlers de criação ──────────────────────────────
  const handleCreateAccount = async (data) => {
    try {
      const { data: newAccount, error } = await supabase
        .from('accounts')
        .insert([{ ...data, user_id: user.id }])
        .select()
        .single();

      if (error) throw error;

      setAccounts(prev => [...prev, newAccount]);
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      toast.success('Conta criada com sucesso!');
      setShowAccountForm(false);
      markCompleted();
    } catch (err) {
      toast.error('Erro ao criar conta: ' + err.message);
    }
  };

  const handleCreateGoal = async (data) => {
    try {
      const { error } = await supabase
        .from('goals')
        .insert([{ ...data, user_id: user.id}]);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['goals'] });
      toast.success('Meta criada com sucesso!');
      setShowGoalForm(false);
      markCompleted();
    } catch (err) {
      toast.error('Erro ao criar meta: ' + err.message);
    }
  };

  const handleCreateTransaction = async (data) => {
    try {
      const { error } = await supabase
        .from('transactions')
        .insert([{ ...data, user_id: user.id, amount: parseFloat(data.amount) }]);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      toast.success('Transação adicionada!');
      setShowTransactionForm(false);
      markCompleted();
    } catch (err) {
      toast.error('Erro ao criar transação: ' + err.message);
    }
  };

  const handleActionButton = () => {
    if (currentStep === 0) setShowAccountForm(true);
    else if (currentStep === 1) setShowGoalForm(true);
    else if (currentStep === 2) setShowTransactionForm(true);
  };

  const Icon = step.icon;

  return (
    <>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">

        {/* Header com indicador de etapas */}
        <div className="flex items-center justify-between px-5 pt-12 pb-4">
          <div className="flex gap-2">
            {steps.map((_, i) => (
              <motion.div key={i}
                animate={{ width: i === currentStep ? 24 : 8 }}
                className={`h-2 rounded-full transition-colors ${
                  i === currentStep ? 'bg-blue-600' :
                  completedSteps.includes(i) ? 'bg-blue-300' : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
          <button onClick={handleComplete}
            className="flex items-center gap-1 text-gray-400 text-sm font-medium">
            <X className="w-4 h-4" />
            Pular tudo
          </button>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 flex flex-col">
          <AnimatePresence mode="wait">
            <motion.div key={currentStep}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="flex-1 flex flex-col">

              {/* Card principal */}
              <div className={`bg-gradient-to-br ${step.color} mx-5 rounded-3xl p-8 mb-6 text-white text-center`}>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                  className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  {isCompleted
                    ? <CheckCircle2 className="w-10 h-10 text-white" />
                    : <Icon className="w-10 h-10 text-white" />
                  }
                </motion.div>
                <h2 className="text-2xl font-bold mb-2">{step.title}</h2>
                <p className="text-white/80 text-sm leading-relaxed">{step.description}</p>

                {isCompleted && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="mt-3 bg-white/20 rounded-xl px-4 py-2">
                    <p className="text-white text-sm font-semibold">✅ Concluído!</p>
                  </motion.div>
                )}
              </div>

              {/* Preview */}
              <div className="mb-4">{step.preview}</div>

              {/* Dica */}
              <div className="mx-5 bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-4 border border-blue-100 dark:border-blue-800">
                <p className="text-sm text-blue-700 dark:text-blue-300">{step.tip}</p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="px-5 pb-8 pt-4 space-y-3">
          {/* Botão de ação (criar conta/meta/transação) */}
          {!isCompleted && (
            <Button onClick={handleActionButton}
              className={`w-full h-14 rounded-2xl text-base font-bold flex items-center justify-center gap-2 ${
                currentStep === 0 ? 'bg-blue-600 hover:bg-blue-700' :
                currentStep === 1 ? 'bg-emerald-600 hover:bg-emerald-700' :
                'bg-orange-500 hover:bg-orange-600'
              }`}>
              <Plus className="w-5 h-5" />
              {step.buttonLabel}
            </Button>
          )}

          {/* Botão próximo */}
          <Button onClick={handleNext} variant={isCompleted ? "default" : "outline"}
            className={`w-full h-12 rounded-2xl font-semibold flex items-center justify-center gap-2 ${
              isCompleted ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'border-gray-200 text-gray-600'
            }`}>
            {isLast
              ? <><CheckCircle2 className="w-5 h-5" /> Começar a usar!</>
              : <>{isCompleted ? 'Próximo passo' : step.skipLabel}<ChevronRight className="w-4 h-4" /></>
            }
          </Button>
        </div>
      </div>

      {/* Modais de criação */}
      <AnimatePresence>
        {showAccountForm && (
          <AccountForm
            onSubmit={handleCreateAccount}
            onClose={() => setShowAccountForm(false)}
          />
        )}
        {showGoalForm && (
          <GoalForm
            accounts={accounts}
            onSubmit={handleCreateGoal}
            onClose={() => setShowGoalForm(false)}
          />
        )}
        {showTransactionForm && (
          <TransactionForm
            accounts={accounts}
            initialType="expense"
            onSubmit={handleCreateTransaction}
            onClose={() => setShowTransactionForm(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}