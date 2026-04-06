import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { motion } from "framer-motion";
import { Check, Users, Zap, LogOut, CheckCircle2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function Subscribe() {
  const { user, signOut } = useAuth();
  const [referralCode, setReferralCode] = useState('');
  const [referralLocked, setReferralLocked] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('referral_code');
    if (saved) {
      setReferralCode(saved.toUpperCase());
      setReferralLocked(true);
    }
  }, []);

  const handleSubscribe = async () => {
    setLoading(true);
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { toast.error("Você precisa estar logado"); setLoading(false); return; }

        // Valida o código de indicação se foi preenchido
        if (referralCode) {
        const { data: referrer, error: referrerError } = await supabase
            .from('profiles')
            .select('id')
            .eq('referral_code', referralCode.toUpperCase())
            .maybeSingle();

        if (!referrer) {
            toast.error("Código de indicação inválido. Verifique com quem te indicou.");
            // Se estava travado (veio da URL), destrava para o usuário corrigir
            if (referralLocked) {
            setReferralLocked(false);
            localStorage.removeItem('referral_code');
            }
            setLoading(false);
            return;
        }

        // Bloqueia auto-indicação
        if (referrer.id === session.user.id) {
            toast.error("Você não pode usar seu próprio código de indicação.");
            setReferralCode('');
            setReferralLocked(false);
            localStorage.removeItem('referral_code');
            setLoading(false);
            return;
        }
        }

        const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { userId: session.user.id, email: session.user.email, referralCode: referralCode || null },
        headers: { Authorization: `Bearer ${session.access_token}` }
        });

        if (error) throw error;
        if (!data?.url) throw new Error("URL não retornada");
        window.location.href = data.url;

    } catch (err) {
        toast.error("Erro: " + err.message);
    } finally {
        setLoading(false);
    }
    };

  const handleLogout = async () => {
    await signOut();
    toast.success("Sessão encerrada");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 flex items-center justify-center p-5">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 px-6 pt-6 pb-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="text-left">
              <p className="text-blue-200 text-xs">Logado como</p>
              <p className="text-white text-sm font-medium truncate max-w-[180px]">{user?.email}</p>
            </div>
            <button onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-xl text-white text-xs font-medium transition-colors">
              <LogOut className="w-3.5 h-3.5" />
              Sair
            </button>
          </div>

          {/* Indicador de etapas */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-full bg-white/30 flex items-center justify-center">
                <Check className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-white/70 text-xs">Cadastro</span>
            </div>
            <div className="w-8 h-px bg-white/30" />
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center">
                <span className="text-blue-600 text-xs font-bold">2</span>
              </div>
              <span className="text-white text-xs font-semibold">Plano</span>
            </div>
            <div className="w-8 h-px bg-white/30" />
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-full bg-white/30 flex items-center justify-center">
                <span className="text-white/70 text-xs font-bold">3</span>
              </div>
              <span className="text-white/70 text-xs">Pagamento</span>
            </div>
          </div>

          <div className="text-center">
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Zap className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold">PlanejApp Pro</h1>
            <p className="text-blue-200 text-sm mt-1">30 dias grátis, cancele quando quiser</p>
          </div>
        </div>

        <div className="px-6 py-6 space-y-5">
          {/* Preço */}
          <div className="text-center">
            <div className="flex items-end justify-center gap-1">
              <span className="text-gray-400 text-sm mb-1">R$</span>
              <span className="text-5xl font-bold text-gray-900">12</span>
              <span className="text-2xl font-bold text-gray-900">,90</span>
              <span className="text-gray-400 text-sm mb-1">/mês</span>
            </div>
            <p className="text-xs text-emerald-600 font-medium mt-1">✓ Primeiro mês grátis</p>
          </div>

          {/* Benefícios */}
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

          {/* Indicação */}
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

          {/* Código de indicação */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">
              Código de indicação {referralLocked ? '' : '(opcional)'}
            </label>
            <div className="relative">
              <Input
                placeholder="Ex: AB12CD34"
                value={referralCode}
                onChange={e => !referralLocked && setReferralCode(e.target.value.toUpperCase())}
                className={`rounded-xl border-gray-200 uppercase pr-10 ${
                  referralLocked
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700 cursor-not-allowed font-bold tracking-widest'
                    : ''
                }`}
                maxLength={8}
                readOnly={referralLocked}
              />
              {referralLocked && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Lock className="w-4 h-4 text-emerald-500" />
                </div>
              )}
            </div>
            {referralLocked && (
              <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Código de indicação aplicado!
              </p>
            )}
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