import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";

export default function SubscriptionSuccess() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    // Limpa o código de indicação do localStorage
    localStorage.removeItem('referral_code');

    // Aguarda o webhook processar e invalida o cache
    const timer = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
    }, 3000);

    return () => clearTimeout(timer);
  }, [user]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 flex items-center justify-center p-5">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl">

        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-10 h-10 text-emerald-600" />
        </motion.div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Tudo certo! 🎉</h1>
        <p className="text-gray-500 text-sm mb-2">Sua assinatura foi ativada com sucesso.</p>
        <p className="text-emerald-600 font-semibold text-sm mb-8">30 dias grátis ativados!</p>

        <div className="bg-gray-50 rounded-2xl p-4 mb-6 text-left">
          <p className="text-xs font-semibold text-gray-500 mb-2">O que você tem acesso:</p>
          {[
            "Transações ilimitadas",
            "Compartilhamento de finanças",
            "Relatórios completos",
            "Metas e investimentos",
          ].map(item => (
            <div key={item} className="flex items-center gap-2 py-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-sm text-gray-600">{item}</span>
            </div>
          ))}
        </div>

        <Button onClick={() => navigate("/")}
          className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 font-bold">
          Começar a usar
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </motion.div>
    </div>
  );
}