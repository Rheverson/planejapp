// src/pages/auth/OnboardingPassword.jsx - ETAPA 3 DO CADASTRO
// Coleta a senha e cria a conta no Supabase

import React, { useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock, Eye, EyeOff, ArrowLeft, Loader2, AlertCircle, CheckCircle2, X } from "lucide-react";

export default function OnboardingPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const { email, name, goal } = location.state || {};

  if (!email || !name || !goal) {
    navigate("/login");
    return null;
  }

  const passwordValidation = useMemo(() => {
    return {
      hasMinLength: password.length >= 8,
      hasUpperCase: /[A-Z]/.test(password),
      hasLowerCase: /[a-z]/.test(password),
      hasNumber: /[0-9]/.test(password),
      hasSymbol: /[!@#$%^&*(),.?":{}|<>]/.test(password),
      isValid: password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password) && /[!@#$%^&*(),.?":{}|<>]/.test(password)
    };
  }, [password]);

  const passwordsMatch = password && confirmPassword && password === confirmPassword;
  const canSubmit = passwordValidation.isValid && passwordsMatch && !loading;

  const handleSignUp = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    try {
      // 1. Criar conta no Supabase
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: { full_name: name, onboarding_goal: goal }
        }
      });

      if (authError) throw authError;

      toast.success("Código enviado!", {
        description: "Verifique seu e-mail para confirmar o cadastro."
      });

      // 2. Vai para a tela de verificação de código
      navigate("/auth/verify", { state: { email, password } });

    } catch (err) {
      toast.error("Erro no Cadastro", {
        description: err.message 
      });
      console.error("Erro no cadastro:", err);
    } finally {
      setLoading(false);
    }
  };

  const PasswordRequirement = ({ met, label }) => (
    <div className="flex items-center gap-2 text-sm">
      {met ? <CheckCircle2 size={14} className="text-green-500" /> : <X size={14} className="text-gray-300" />}
      <span className={met ? "text-green-600" : "text-gray-500"}>{label}</span>
    </div>
  );

  const handleBack = () => {
    navigate("/onboarding/goals", { state: { email, name } });
  };

  return (
    <div className="min-h-screen bg-blue-600 flex flex-col justify-center items-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }} 
        animate={{ opacity: 1, scale: 1 }} 
        className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl"
      >
        <button 
          onClick={handleBack}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium text-sm mb-6"
        >
          <ArrowLeft size={18} />
          Voltar
        </button>

        <h2 className="text-2xl font-bold mb-2 text-gray-900">Segurança da conta</h2>
        <p className="text-gray-600 mb-6 text-sm">Crie uma senha forte para seu acesso.</p>
        
        <form onSubmit={handleSignUp} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password" className="font-semibold text-gray-800">Senha</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <Input 
                id="password"
                type={showPassword ? "text" : "password"} 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                placeholder="••••••••"
                className="pl-10 pr-10 h-12 rounded-xl border-gray-200 focus:ring-blue-500"
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)} 
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-2">
            <p className="text-xs font-semibold text-gray-700 mb-2">Requisitos da senha:</p>
            <PasswordRequirement met={passwordValidation.hasMinLength} label="8+ caracteres" />
            <PasswordRequirement met={passwordValidation.hasUpperCase} label="Letra maiúscula" />
            <PasswordRequirement met={passwordValidation.hasLowerCase} label="Letra minúscula" />
            <PasswordRequirement met={passwordValidation.hasNumber} label="Número" />
            <PasswordRequirement met={passwordValidation.hasSymbol} label="Símbolo (!@#$%)" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="font-semibold text-gray-800">Confirmar Senha</Label>
            <div className="relative">
              <Input 
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"} 
                value={confirmPassword} 
                onChange={(e) => setConfirmPassword(e.target.value)} 
                placeholder="••••••••"
                className="pr-10 h-12 rounded-xl border-gray-200 focus:ring-blue-500"
              />
              <button 
                type="button" 
                onClick={() => setShowConfirmPassword(!showConfirmPassword)} 
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {password && confirmPassword && !passwordsMatch && (
              <p className="text-xs text-red-600 font-medium">As senhas não conferem</p>
            )}
          </div>

          <Button 
            type="submit" 
            disabled={!canSubmit} 
            className="w-full h-14 bg-blue-600 hover:bg-blue-700 rounded-xl text-lg font-bold flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Criando conta...
              </>
            ) : (
              "Finalizar Cadastro"
            )}
          </Button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-4 italic">Etapa 3 de 3</p>
      </motion.div>
    </div>
  );
}
