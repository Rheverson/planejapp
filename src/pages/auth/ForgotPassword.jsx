// src/pages/ForgotPassword.jsx - VERSÃO PROFISSIONAL
// Fluxo: Email → Link no email → Nova Senha → Login
// Padrão usado por Google, Microsoft, GitHub, etc.

import React, { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Mail, Loader2, CheckCircle2 } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  
  const navigate = useNavigate();

  // Validação de email
  const isValidEmail = (emailStr) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr);
  };

  // Enviar email de recuperação com link
  const handleSendRecoveryEmail = async (e) => {
    e.preventDefault();
    
    if (!isValidEmail(email)) {
      toast.error("Email inválido", {
        description: "Por favor, digite um email válido."
      });
      return;
    }

    setLoading(true);
    try {
      // ✅ Usar redirectTo para enviar link profissional
      // O link vai incluir o token automaticamente
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.toLowerCase().trim(),
        {
          redirectTo: `${window.location.origin}/reset-password`
        }
      );

      if (error) throw error;

      setEmailSent(true);
      toast.success("Email enviado!", {
        description: "Verifique seu e-mail para o link de recuperação."
      });
    } catch (err) {
      toast.error("Erro ao enviar email", {
        description: err.message || "Tente novamente mais tarde."
      });
      console.error("Erro:", err);
    } finally {
      setLoading(false);
    }
  };

  // Voltar
  const handleBack = () => {
    if (emailSent) {
      setEmailSent(false);
      setEmail("");
    } else {
      navigate("/login");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-600 to-blue-700 flex flex-col justify-center items-center p-4">
      <motion.div 
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl"
      >
        {!emailSent ? (
          // STEP 1: SOLICITAR EMAIL
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <button 
              onClick={handleBack}
              className="flex items-center gap-2 text-sm text-blue-600 font-medium hover:text-blue-700 transition-colors"
            >
              <ArrowLeft size={16} /> Voltar
            </button>

            <div>
              <h2 className="text-2xl font-bold text-gray-900">Recuperar Senha</h2>
              <p className="text-gray-600 text-sm mt-2">
                Digite o email da sua conta e enviaremos um link para redefinir sua senha.
              </p>
            </div>

            <form onSubmit={handleSendRecoveryEmail} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="font-semibold text-gray-800">E-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <Input 
                    id="email"
                    type="email" 
                    placeholder="seu@email.com" 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    className="h-12 pl-10 rounded-xl border-gray-200 focus:ring-blue-500"
                    disabled={loading}
                    autoFocus
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                disabled={loading || !email || !isValidEmail(email)} 
                className="w-full h-14 bg-blue-600 hover:bg-blue-700 rounded-xl text-lg font-semibold flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Enviando...
                  </>
                ) : (
                  "Enviar Link de Recuperação"
                )}
              </Button>
            </form>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-sm text-blue-900">
                <strong>Dica:</strong> Verifique sua pasta de spam se não receber o email em alguns minutos.
              </p>
            </div>
          </motion.div>
        ) : (
          // STEP 2: EMAIL ENVIADO
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6 text-center"
          >
            <div className="flex justify-center">
              <div className="bg-green-100 p-4 rounded-full">
                <CheckCircle2 size={48} className="text-green-600" />
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900">Email enviado!</h2>
              <p className="text-gray-600 text-sm mt-2">
                Enviamos um link de recuperação para:
              </p>
              <p className="font-semibold text-gray-900 mt-1">{email}</p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-left space-y-2">
              <p className="text-sm font-semibold text-blue-900">O que fazer agora:</p>
              <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                <li>Abra seu email</li>
                <li>Clique no link "Redefinir Senha"</li>
                <li>Defina uma nova senha</li>
                <li>Faça login com a nova senha</li>
              </ol>
            </div>

            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                O link expira em <strong>24 horas</strong>
              </p>

              <button
                onClick={() => {
                  setEmailSent(false);
                  setEmail("");
                }}
                className="w-full text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
              >
                Usar outro email
              </button>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
