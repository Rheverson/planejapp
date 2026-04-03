import React, { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { motion } from "framer-motion";
import { Check, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function Subscribe() {
  const { user } = useAuth();
  const [referralCode, setReferralCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    setLoading(true);
    try {
        // Pega a sessão atual para enviar o token
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
        toast.error("Você precisa estar logado");
        setLoading(false);
        return;
        }

        console.log("🔵 Session:", session.user.id);

        const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
            userId: session.user.id,
            email: session.user.email,
            referralCode: referralCode || null
        },
        headers: {
            Authorization: `Bearer ${session.access_token}` // <- adiciona o token
        }
        });

        console.log("✅ Resposta:", data);
        console.log("❌ Erro:", error);

        if (error) throw error;
        if (!data?.url) throw new Error("URL não retornada");

        window.location.href = data.url;

    } catch (err) {
        console.error("💥 Erro:", err);
        toast.error("Erro: " + err.message);
    } finally {
        setLoading(false);
    }
    };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 flex items-center justify-center p-5">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl">

        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 px-6 pt-8 pb-6 text-white text-center">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold">PlanejApp Pro</h1>
          <p className="text-blue-200 text-sm mt-1">30 dias grátis, cancele quando quiser</p>
        </div>

        <div className="px-6 py-6 space-y-5">
          <div className="text-center">
            <div className="flex items-end justify-center gap-1">
              <span className="text-gray-400 text-sm mb-1">R$</span>
              <span className="text-5xl font-bold text-gray-900">12</span>
              <span className="text-2xl font-bold text-gray-900">,90</span>
              <span className="text-gray-400 text-sm mb-1">/mês</span>
            </div>
            <p className="text-xs text-emerald-600 font-medium mt-1">✓ Primeiro mês grátis</p>
          </div>

          <div className="space-y-2">
            {[
              "Transações ilimitadas",
              "Compartilhamento de finanças",
              "Relatórios completos",
              "Metas e investimentos",
              "Suporte prioritário",
            ].map(item => (
              <div key={item} className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3 text-emerald-600" />
                </div>
                <span className="text-sm text-gray-700">{item}</span>
              </div>
            ))}
          </div>

          <div className="bg-amber-50 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-amber-600" />
              <p className="text-sm font-semibold text-amber-800">Indique e ganhe descontos</p>
            </div>
            <div className="space-y-1 text-xs text-amber-700">
              <p>• 1 indicado → 25% de desconto</p>
              <p>• 2 indicados → 50% de desconto</p>
              <p>• 3 indicados → 75% de desconto</p>
              <p>• 4+ indicados → 100% grátis! 🎉</p>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">
              Código de indicação (opcional)
            </label>
            <Input
              placeholder="Ex: AB12CD34"
              value={referralCode}
              onChange={e => setReferralCode(e.target.value.toUpperCase())}
              className="rounded-xl border-gray-200 uppercase"
              maxLength={8}
            />
          </div>

          <Button onClick={handleSubscribe} disabled={loading}
            className="w-full h-14 rounded-2xl text-base font-bold bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200">
            {loading ? "Aguarde..." : "Começar 30 dias grátis"}
          </Button>

          <p className="text-center text-xs text-gray-400">
            Cartão necessário. Cancele antes dos 30 dias e não será cobrado.
          </p>
        </div>
      </motion.div>
    </div>
  );
}