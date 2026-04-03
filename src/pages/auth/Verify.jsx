import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Mail, ArrowLeft, AlertCircle } from "lucide-react";

export default function Verify() {
  const [token, setToken] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [codeExpired, setCodeExpired] = useState(false);
  const inputRefs = useRef([]);

  const location = useLocation();
  const navigate = useNavigate();

  const email = location.state?.email;
  const password = location.state?.password;

  useEffect(() => {
    if (!email) navigate("/login");
  }, []);

  useEffect(() => {
    if (resendCountdown > 0) {
      const timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCountdown]);

  const handleChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newToken = [...token];
    newToken[index] = value.slice(-1);
    setToken(newToken);
    setCodeExpired(false);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !token[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const paste = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (paste.length === 6) {
      setToken(paste.split(""));
      inputRefs.current[5]?.focus();
    }
  };

  const fullToken = token.join("");

  const handleVerify = async (e) => {
    e.preventDefault();
    if (fullToken.length < 6) return;

    setLoading(true);
    setCodeExpired(false);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: fullToken,
        type: 'email'  // <- corrigido
      });

      if (verifyError) {
        if (verifyError.message.includes("expired") || verifyError.message.includes("invalid")) {
          setCodeExpired(true);
          setToken(["", "", "", "", "", ""]);
          inputRefs.current[0]?.focus();
          return;
        }
        throw verifyError;
      }

      if (password) {
        await supabase.auth.signInWithPassword({ email, password });
      }

      toast.success("Email confirmado! Bem-vindo!");
      navigate("/");

    } catch (err) {
      toast.error("Erro na verificação: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendLoading(true);
    setCodeExpired(false);
    try {
      // Usa signUp novamente — o Supabase reenvia o código se o usuário já existe mas não confirmou
      const { error } = await supabase.auth.signUp({
        email: email.toLowerCase().trim(),
        password: password || Math.random().toString(36), // senha temporária
        options: {
          emailRedirectTo: window.location.origin
        }
      });

      // Ignora erro de "already registered" — o email foi reenviado mesmo assim
      if (error && !error.message.includes("already registered") && !error.message.includes("User already registered")) {
        throw error;
      }

      toast.success("Novo código enviado! Verifique seu email.");
      setToken(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
      setResendCountdown(60);

    } catch (err) {
      toast.error("Erro ao reenviar: " + err.message);
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-blue-600 flex flex-col justify-center items-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl"
      >
        <button onClick={() => navigate("/login")}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium text-sm mb-6">
          <ArrowLeft size={18} /> Voltar
        </button>

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Mail size={32} />
          </div>
          <h2 className="text-2xl font-bold mb-2 text-gray-900">Verifique seu e-mail</h2>
          <p className="text-gray-500 text-sm">
            Enviamos um código para<br />
            <span className="font-semibold text-gray-800">{email}</span>
          </p>
        </div>

        {codeExpired && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-700">Código expirado ou inválido</p>
              <p className="text-xs text-red-600 mt-0.5">Clique em "Reenviar código" para receber um novo.</p>
            </div>
          </motion.div>
        )}

        <form onSubmit={handleVerify} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-3 text-center">
              Código de verificação
            </label>
            <div className="flex gap-2 justify-center" onPaste={handlePaste}>
              {token.map((digit, i) => (
                <input
                  key={i}
                  ref={el => inputRefs.current[i] = el}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handleChange(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)}
                  className={`w-12 h-14 text-center text-xl font-bold border-2 rounded-xl transition-colors outline-none
                    ${digit ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}
                    ${codeExpired ? 'border-red-300 bg-red-50' : ''}
                    focus:border-blue-500`}
                  disabled={loading}
                />
              ))}
            </div>
          </div>

          <Button type="submit" disabled={loading || fullToken.length < 6}
            className="w-full h-14 bg-blue-600 hover:bg-blue-700 rounded-xl text-lg font-bold">
            {loading
              ? <><Loader2 size={20} className="animate-spin mr-2" />Verificando...</>
              : "Confirmar Código"}
          </Button>

          <div className="text-center space-y-3 pt-2 border-t border-gray-100">
            <p className="text-sm text-gray-500">Não recebeu o código?</p>
            <Button type="button" onClick={handleResend}
              disabled={resendLoading || resendCountdown > 0}
              variant="outline" className="w-full h-12 rounded-xl border-gray-200">
              {resendLoading
                ? <><Loader2 size={18} className="animate-spin mr-2" />Reenviando...</>
                : resendCountdown > 0
                  ? `Reenviar em ${resendCountdown}s`
                  : "Reenviar código"}
            </Button>
            <p className="text-xs text-gray-400">Verifique também a pasta de spam.</p>
          </div>
        </form>
      </motion.div>
    </div>
  );
}