import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, X, Wallet, Target, TrendingDown, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const steps = [
  {
    id: 1,
    icon: Wallet,
    color: "from-blue-500 to-blue-600",
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    title: "Crie sua primeira conta",
    description: "Registre suas contas bancárias, carteira, cartão de crédito ou investimentos. O PlanejeApp calcula seu saldo automaticamente!",
    tip: "💡 Dica: Adicione o saldo atual de cada conta para começar com dados reais.",
    image: (
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mx-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-800">Nubank</p>
            <p className="text-xs text-gray-400">Conta corrente</p>
          </div>
          <div className="ml-auto">
            <p className="text-sm font-bold text-emerald-600">R$ 1.250,00</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-800">Carteira</p>
            <p className="text-xs text-gray-400">Dinheiro em mãos</p>
          </div>
          <div className="ml-auto">
            <p className="text-sm font-bold text-emerald-600">R$ 350,00</p>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 2,
    icon: Target,
    color: "from-emerald-500 to-teal-600",
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
    title: "Defina suas metas",
    description: "Crie metas de economia, controle gastos por categoria ou planeje conquistar um objetivo. O app acompanha seu progresso!",
    tip: "💡 Dica: Comece com uma meta simples, como limitar gastos com alimentação.",
    image: (
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
    iconBg: "bg-orange-100",
    iconColor: "text-orange-600",
    title: "Lance entradas e saídas",
    description: "Registre seus ganhos e gastos diariamente. O PlanejeApp categoriza automaticamente e mostra para onde seu dinheiro está indo!",
    tip: "💡 Dica: Use os botões de atalho na Home para lançar transações rapidamente.",
    image: (
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mx-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <span className="text-xs">💼</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-800">Salário</p>
              <p className="text-xs text-gray-400">Hoje</p>
            </div>
            <p className="text-sm font-bold text-emerald-600">+R$ 3.500</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <span className="text-xs">🛒</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-800">Supermercado</p>
              <p className="text-xs text-gray-400">Ontem</p>
            </div>
            <p className="text-sm font-bold text-red-500">-R$ 280</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <span className="text-xs">⚡</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-800">Conta de luz</p>
              <p className="text-xs text-gray-400">Há 2 dias</p>
            </div>
            <p className="text-sm font-bold text-red-500">-R$ 145</p>
          </div>
        </div>
      </div>
    )
  }
];

export default function OnboardingTour() {
  const [currentStep, setCurrentStep] = useState(0);
  const navigate = useNavigate();

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;

  const handleNext = () => {
    if (isLast) {
      handleComplete();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem('onboarding_completed', 'true');
    navigate('/');
  };

  const Icon = step.icon;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-12 pb-4">
        <div className="flex gap-2">
          {steps.map((_, i) => (
            <motion.div
              key={i}
              animate={{ width: i === currentStep ? 24 : 8 }}
              className={`h-2 rounded-full transition-colors ${i === currentStep ? 'bg-blue-600' : i < currentStep ? 'bg-blue-300' : 'bg-gray-200'}`}
            />
          ))}
        </div>
        <button onClick={handleComplete}
          className="flex items-center gap-1 text-gray-400 text-sm font-medium">
          <X className="w-4 h-4" />
          Pular
        </button>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 flex flex-col">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="flex-1 flex flex-col"
          >
            {/* Ícone e título */}
            <div className={`bg-gradient-to-br ${step.color} mx-5 rounded-3xl p-8 mb-6 text-white text-center`}>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Icon className="w-10 h-10 text-white" />
              </motion.div>
              <h2 className="text-2xl font-bold mb-2">{step.title}</h2>
              <p className="text-white/80 text-sm leading-relaxed">{step.description}</p>
            </div>

            {/* Preview */}
            <div className="mb-4">
              {step.image}
            </div>

            {/* Dica */}
            <div className="mx-5 bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-4 border border-blue-100 dark:border-blue-800">
              <p className="text-sm text-blue-700 dark:text-blue-300">{step.tip}</p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="px-5 pb-8 pt-4 space-y-3">
        <Button onClick={handleNext}
          className="w-full h-14 rounded-2xl text-base font-bold bg-blue-600 hover:bg-blue-700 flex items-center justify-center gap-2">
          {isLast ? (
            <>
              <CheckCircle2 className="w-5 h-5" />
              Começar a usar!
            </>
          ) : (
            <>
              Próximo
              <ChevronRight className="w-5 h-5" />
            </>
          )}
        </Button>

        {!isLast && (
          <button onClick={handleComplete}
            className="w-full text-center text-sm text-gray-400 py-2">
            Pular tutorial
          </button>
        )}
      </div>
    </div>
  );
}