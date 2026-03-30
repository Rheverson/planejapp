// src/pages/auth/Verify.jsx - VERIFICAÇÃO DE CÓDIGO
// Verifica o código OTP enviado para o email e faz login automático

import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Mail, ArrowLeft } from "lucide-react";

export default function Verify() {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  
  const location = useLocation();
  const navigate = useNavigate();

  const email = location.state?.email;
  const password = location.state?.password;

  if (!email || !password) {
    navigate("/login");
    return null;
  }

  // Countdown para reenvio de código
  useEffect(() => {
    if (resendCountdown > 0) {
      const timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCountdown]);

  const handleVerify = async (e) => {
    e.preventDefault();
    if (token.length < 6) return;

    setLoading(true);
    try {
      // 1. Verifica o código OTP
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'signup'
      });

      if (verifyError) throw verifyError;

      // 2. Tenta logar automaticamente após verificar
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (loginError) throw loginError;

      toast.success("Sucesso!", {
        description: "Conta confirmada com sucesso. Bem-vindo!"
      });

      // 3. Vai para a Home (AuthContext cuidará do redirecionamento)
      navigate("/");

    } catch (err) {
      toast.error("Erro na verificação", {
        description: err.message || "Código inválido ou expirado. Tente novamente."
      });
      console.error("Erro na verificação:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setResendLoading(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.toLowerCase().trim()
      });

      if (error) throw error;

      toast.success("Código reenviado!", {
        description: "Verifique seu e-mail novamente."
      });

      setResendCountdown(60); // 60 segundos de espera
    } catch (err) {
      toast.error("Erro ao reenviar", {
        description: err.message
      });
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
        <button 
          onClick={() => navigate("/login")}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium text-sm mb-6"
        >
          <ArrowLeft size={18} />
          Voltar
        </button>

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <Mail size={32} />
          </div>
          
          <h2 className="text-2xl font-bold mb-2 text-gray-900">Verifique seu e-mail</h2>
          <p className="text-gray-600 text-sm">
            Enviamos um código de 6 dígitos para <br />
            <span className="font-semibold text-gray-800">{email}</span>
          </p>
        </div>

        <form onSubmit={handleVerify} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="token" className="block text-sm font-semibold text-gray-800">
              Código de verificação
            </label>
            <Input 
              id="token"
              type="text"
              placeholder="000000"
              maxLength={6}
              value={token}
              onChange={(e) => setToken(e.target.value.replace(/\D/g, ""))}
              className="text-center text-2xl tracking-[0.5em] h-16 font-bold border-2 focus:border-blue-500 rounded-xl"
              autoFocus
              disabled={loading}
            />
          </div>

          <Button 
            type="submit"
            disabled={loading || token.length < 6} 
            className="w-full h-14 bg-blue-600 hover:bg-blue-700 rounded-xl text-lg font-bold flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Verificando...
              </>
            ) : (
              "Confirmar Código"
            )}
          </Button>

          <div className="space-y-3 pt-4 border-t border-gray-200">
            <p className="text-sm text-gray-600 text-center">
              Não recebeu o código?
            </p>
            
            <Button 
              type="button"
              onClick={handleResendCode}
              disabled={resendLoading || resendCountdown > 0}
              variant="outline"
              className="w-full h-12 rounded-xl border-gray-200 hover:bg-gray-50"
            >
              {resendLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin mr-2" />
                  Reenviando...
                </>
              ) : resendCountdown > 0 ? (
                `Reenviar em ${resendCountdown}s`
              ) : (
                "Reenviar código"
              )}
            </Button>

            <p className="text-xs text-gray-400 text-center">
              Verifique a pasta de spam se não encontrar o email.
            </p>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
