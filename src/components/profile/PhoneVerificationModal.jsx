import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { Phone, Shield, X, ChevronRight, RefreshCw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const TERMS = `Ao fornecer seu número de telefone, você concorda com:

• Receber notificações transacionais do PlanejApp (alertas de vencimento, confirmações de pagamento, atualizações de segurança)
• Uso do número para verificação de identidade e recuperação de conta
• Armazenamento do número de acordo com nossa Política de Privacidade (LGPD)

Não compartilharemos seu número com terceiros para fins de marketing. Você pode remover seu telefone a qualquer momento nas configurações da conta.`;

export default function PhoneVerificationModal({ onClose, onSuccess }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState("terms"); // terms | phone | otp | success
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const otpRefs = useRef([]);

  useEffect(() => {
    if (resendCountdown > 0) {
      const t = setTimeout(() => setResendCountdown(c => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendCountdown]);

  const formatPhoneDisplay = (val) => {
    const digits = val.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const handlePhoneChange = (e) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 11);
    setPhone(formatPhoneDisplay(raw));
  };

  const sendOTP = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) { toast.error("Digite um número válido com DDD"); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-phone", {
        body: { action: "send", userId: user.id, phone: digits }
      });
      if (error || data?.error) throw new Error(data?.error || "Erro ao enviar SMS");
      setStep("otp");
      setResendCountdown(60);
      toast.success("Código enviado por SMS!");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const verifyOTP = async () => {
    const code = otp.join("");
    if (code.length < 6) { toast.error("Digite o código completo"); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-phone", {
        body: { action: "verify", userId: user.id, code }
      });
      if (error || data?.error) throw new Error(data?.error || "Código inválido");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      setStep("success");
      setTimeout(() => { onSuccess?.(); onClose?.(); }, 2000);
    } catch (err) {
      toast.error(err.message);
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[999] flex items-end sm:items-center justify-center"
      onClick={onClose}>
      <motion.div initial={{ y: "100%", opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }} transition={{ type: "spring", damping: 30, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-gray-800 w-full max-w-md rounded-t-[2.5rem] sm:rounded-[2rem] overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="bg-gradient-to-br from-violet-600 to-indigo-600 px-6 pt-8 pb-6 text-white relative">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-white/20 rounded-full">
            <X className="w-4 h-4 text-white" />
          </button>
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mb-3">
            {step === "success"
              ? <CheckCircle2 className="w-7 h-7 text-white" />
              : <Phone className="w-7 h-7 text-white" />}
          </div>
          <h2 className="text-xl font-bold mb-1">
            {step === "terms" && "Verificação de telefone"}
            {step === "phone" && "Seu número"}
            {step === "otp" && "Digite o código"}
            {step === "success" && "Telefone verificado!"}
          </h2>
          <p className="text-violet-200 text-sm">
            {step === "terms" && "Para sua segurança e melhor experiência"}
            {step === "phone" && "Usaremos para verificação e alertas importantes"}
            {step === "otp" && `Enviamos um SMS para ${phone}`}
            {step === "success" && "Seu telefone foi confirmado com sucesso"}
          </p>
        </div>

        <div className="px-6 py-5">
          <AnimatePresence mode="wait">

            {/* STEP: Termos */}
            {step === "terms" && (
              <motion.div key="terms" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                <div className="bg-gray-50 dark:bg-gray-700 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Shield className="w-4 h-4 text-violet-600" />
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Termos de uso do telefone</p>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-line">{TERMS}</p>
                </div>
                <p className="text-xs text-gray-400 text-center">
                  Ao continuar, você concorda com os termos acima e com nossa{" "}
                  <span className="text-violet-600 underline">Política de Privacidade</span>
                </p>
                <div className="flex gap-3">
                  <button onClick={onClose}
                    className="flex-1 h-12 rounded-2xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-medium">
                    Agora não
                  </button>
                  <button onClick={() => setStep("phone")}
                    className="flex-1 h-12 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-medium flex items-center justify-center gap-2">
                    Aceitar e continuar <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP: Telefone */}
            {step === "phone" && (
              <motion.div key="phone" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 block">
                    Número com DDD
                  </label>
                  <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-2xl px-4 py-3 focus-within:border-violet-400 transition-colors">
                    <span className="text-gray-500 dark:text-gray-400 text-sm font-medium">🇧🇷 +55</span>
                    <div className="w-px h-5 bg-gray-300 dark:bg-gray-600" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={handlePhoneChange}
                      placeholder="(11) 99999-9999"
                      className="flex-1 bg-transparent text-gray-800 dark:text-gray-200 text-sm outline-none placeholder-gray-400"
                      autoFocus
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-400 text-center flex items-center justify-center gap-1">
                  <Shield className="w-3 h-3" /> Seus dados são protegidos pela LGPD
                </p>
                <button onClick={sendOTP} disabled={loading || phone.replace(/\D/g, "").length < 10}
                  className="w-full h-12 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading
                    ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                    : <>Enviar código SMS <ChevronRight className="w-4 h-4" /></>}
                </button>
              </motion.div>
            )}

            {/* STEP: OTP */}
            {step === "otp" && (
              <motion.div key="otp" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3 block text-center">
                    Digite o código de 6 dígitos
                  </label>
                  <div className="flex gap-2 justify-center">
                    {otp.map((digit, i) => (
                      <input key={i} ref={el => otpRefs.current[i] = el}
                        type="tel" maxLength={1} value={digit}
                        onChange={e => handleOtpChange(i, e.target.value)}
                        onKeyDown={e => handleOtpKeyDown(i, e)}
                        className="w-11 h-14 rounded-xl border-2 border-gray-200 dark:border-gray-600 text-center text-xl font-bold text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 outline-none focus:border-violet-500 transition-colors"
                      />
                    ))}
                  </div>
                </div>

                <button onClick={verifyOTP} disabled={loading || otp.join("").length < 6}
                  className="w-full h-12 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading
                    ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                    : "Verificar código"}
                </button>

                <div className="text-center">
                  {resendCountdown > 0 ? (
                    <p className="text-xs text-gray-400">Reenviar em {resendCountdown}s</p>
                  ) : (
                    <button onClick={sendOTP} disabled={loading}
                      className="text-xs text-violet-600 dark:text-violet-400 font-medium flex items-center justify-center gap-1 mx-auto">
                      <RefreshCw className="w-3 h-3" /> Reenviar código
                    </button>
                  )}
                  <button onClick={() => { setStep("phone"); setOtp(["","","","","",""]); }}
                    className="text-xs text-gray-400 mt-2 block mx-auto">
                    Trocar número
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP: Sucesso */}
            {step === "success" && (
              <motion.div key="success" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                className="text-center py-4">
                <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 0.5 }}
                  className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                </motion.div>
                <p className="text-gray-800 dark:text-gray-200 font-semibold">Pronto!</p>
                <p className="text-gray-400 text-sm mt-1">Seu telefone foi verificado com sucesso.</p>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}