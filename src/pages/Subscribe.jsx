import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { motion } from "framer-motion";
import { Check, Users, Zap, LogOut, CheckCircle2, Lock, XCircle, Loader2, Gift, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function Subscribe() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [referralCode, setReferralCode] = useState('');
  const [referralLocked, setReferralLocked] = useState(false);
  const [referralValid, setReferralValid] = useState(null);
  const [validating, setValidating] = useState(false);
  const [loading, setLoading] = useState(false);

  // Verifica se veio via promo — redireciona direto
  useEffect(() => {
    const pendingCode = localStorage.getItem("pending_promo_code")
                     || sessionStorage.getItem("pending_promo_code");
    if (pendingCode) {
      navigate(`/Promo?code=${pendingCode}`, { replace: true });
      return;
    }

    // Código de indicação normal
    const saved = localStorage.getItem('referral_code');
    if (saved) {
      setReferralCode(saved.toUpperCase());
      setReferralLocked(true);
      validateCode(saved.toUpperCase());
    }
  }, []);

  const validateCode = async (code) => {
    if (!code || code.length < 8) { setReferralValid(null); return; }
    setValidating(true);
    try {
      const { data, error } = await supabase
        .rpc('validate_referral_code', { code: code.toUpperCase().trim() });
      if (error || !data) {
        setReferralValid(false); setReferralLocked(false);
        localStorage.removeItem('referral_code');
      } else if (data === user?.id) {
        setReferralValid(false); setReferralLocked(false);
        localStorage.removeItem('referral_code');
      } else {
        setReferralValid(true);
      }
    } catch { setReferralValid(false); }
    finally { setValidating(false); }
  };

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Você precisa estar logado"); setLoading(false); return; }

      if (referralCode && referralCode.trim() !== '') {
        if (referralValid === false) {
          toast.error("Código de indicação inválido.");
          setReferralCode(''); setReferralLocked(false);
          localStorage.removeItem('referral_code');
          setLoading(false); return;
        }
        if (referralValid === null) {
          const { data: referrer } = await supabase
            .from('profiles').select('id')
            .eq('referral_code', referralCode.toUpperCase().trim())
            .maybeSingle();
          if (!referrer) {
            toast.error("Código inválido."); setReferralCode('');
            setLoading(false); return;
          }
          if (referrer.id === session.user.id) {
            toast.error("Não pode usar seu próprio código.");
            setLoading(false); return;
          }
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
    } finally { setLoading(false); }
  };

  const handleCodeChange = (e) => {
    const val = e.target.value.toUpperCase();
    setReferralCode(val);
    setReferralValid(null);
    if (val.length === 8) validateCode(val);
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
            <button onClick={async () => { await signOut(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-xl text-white text-xs font-medium transition-colors">
              <LogOut className="w-3.5 h-3.5" /> Sair
            </button>
          </div>

          {/* Progress */}
          <div className="flex items-center justify-center gap-2 mb-4">
            {[{ label: "Cadastro", done: true }, { label: "Plano", active: true }, { label: "Pagamento" }].map((s, i) => (
              <React.Fragment key={i}>
                <div className="flex items-center gap-1.5">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${s.done ? "bg-white text-blue-600" : s.active ? "bg-white text-blue-600" : "bg-white/30 text-white/70"}`}>
                    {s.done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <span className={`text-xs ${s.active || s.done ? "text-white font-semibold" : "text-white/70"}`}>{s.label}</span>
                </div>
                {i < 2 && <div className="w-6 h-px bg-white/30" />}
              </React.Fragment>
            ))}
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
            <p className="text-xs text-emerald-600 font-medium mt-1">✓ Primeiro mês grátis · Cancele quando quiser</p>
          </div>

          {/* Features */}
          <div className="space-y-2">
            {["Transações ilimitadas", "Compartilhamento de finanças", "Relatórios completos", "Metas e investimentos", "Suporte prioritário"].map(item => (
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
              Código de indicação {!referralCode ? '(opcional)' : ''}
            </label>
            <div className="relative">
              <Input
                placeholder="Ex: AB12CD34"
                value={referralCode}
                onChange={handleCodeChange}
                className={`rounded-xl border-gray-200 uppercase pr-10 ${
                  referralValid === true ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-bold tracking-widest' :
                  referralValid === false ? 'bg-red-50 border-red-300 text-red-700' : ''
                } ${referralLocked && referralValid === true ? 'cursor-not-allowed' : ''}`}
                maxLength={8}
                readOnly={referralLocked && referralValid === true}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {validating && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
                {!validating && referralValid === true && <Lock className="w-4 h-4 text-emerald-500" />}
                {!validating && referralValid === false && <XCircle className="w-4 h-4 text-red-500" />}
              </div>
            </div>
            {!validating && referralValid === true && (
              <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Código válido!
              </p>
            )}
            {!validating && referralValid === false && (
              <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1 font-medium">
                <XCircle className="w-3.5 h-3.5" /> Código inválido.
              </p>
            )}
          </div>

          {/* Botão */}
          <Button onClick={handleSubscribe}
            disabled={loading || validating || referralValid === false}
            className="w-full h-14 rounded-2xl text-base font-bold bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200 disabled:opacity-50">
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