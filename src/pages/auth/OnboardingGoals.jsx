// src/pages/auth/OnboardingGoals.jsx - ETAPA 2 DO CADASTRO
// Coleta o objetivo financeiro do novo usuário

import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, ArrowLeft, Target, TrendingUp, ShieldCheck, Wallet } from "lucide-react";

const goals = [
  { id: "save", title: "Poupar dinheiro", icon: Wallet, color: "text-green-500", bg: "bg-green-50" },
  { id: "debt", title: "Sair das dívidas", icon: ShieldCheck, color: "text-red-500", bg: "bg-red-50" },
  { id: "invest", title: "Começar a investir", icon: TrendingUp, color: "text-blue-500", bg: "bg-blue-50" },
  { id: "control", title: "Controlar gastos", icon: Target, color: "text-purple-500", bg: "bg-purple-50" },
];

export default function OnboardingGoals() {
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedGoal, setSelectedGoal] = useState("");

  const email = location.state?.email || "";
  const name = location.state?.name || "";

  if (!email || !name) {
    navigate("/login");
    return null;
  }

  const handleNext = () => {
    if (selectedGoal) {
      navigate("/onboarding/password", { state: { email, name, goal: selectedGoal } });
    }
  };

  const handleBack = () => {
    navigate("/onboarding/name", { state: { email } });
  };

  return (
    <div className="min-h-screen bg-blue-600 flex flex-col justify-end sm:justify-center items-center p-4">
      <div className="mb-8 text-center text-white px-4 text-balance">
        <h1 className="text-3xl font-bold tracking-tight">Qual seu objetivo?</h1>
        <p className="opacity-80">Isso nos ajuda a preparar seu painel</p>
      </div>

      <motion.div 
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl"
      >
        <button 
          onClick={handleBack}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium text-sm mb-4"
        >
          <ArrowLeft size={18} />
          Voltar
        </button>

        <div className="grid grid-cols-1 gap-3 mb-6">
          {goals.map((goal) => (
            <button
              key={goal.id}
              onClick={() => setSelectedGoal(goal.id)}
              className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${
                selectedGoal === goal.id 
                  ? "border-blue-600 bg-blue-50/50" 
                  : "border-gray-100 hover:border-blue-200"
              }`}
            >
              <div className={`p-3 rounded-xl ${goal.bg} ${goal.color}`}>
                <goal.icon size={24} />
              </div>
              <span className="font-semibold text-gray-700 text-lg">{goal.title}</span>
            </button>
          ))}
        </div>

        <Button 
          onClick={handleNext}
          disabled={!selectedGoal}
          className="w-full h-14 rounded-xl text-lg font-semibold bg-blue-600 hover:bg-blue-700 flex items-center justify-center gap-2 transition-all active:scale-95"
        >
          Continuar
          <ArrowRight size={20} />
        </Button>
        <p className="text-center text-xs text-gray-400 mt-4 italic">Etapa 2 de 3</p>
      </motion.div>
    </div>
  );
}
