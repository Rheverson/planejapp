// src/pages/ResetPassword.jsx - PÁGINA DE REDEFINIÇÃO DE SENHA
// Essa página é acessada pelo link no email
// Fluxo: Link no email → Esta página → Nova Senha → Login

import React, { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Eye, EyeOff, CheckCircle2, X, AlertCircle } from "lucide-react";

export default function ResetPassword() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [linkValid, setLinkValid] = useState(null); // null = verificando, true = válido, false = inválido
  const [tokenVerified, setTokenVerified] = useState(false);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Validação de senha
  const passwordValidation = useMemo(() => {
    return {
      hasMinLength: newPassword.length >= 8,
      hasUpperCase: /[A-Z]/.test(newPassword),
      hasLowerCase: /[a-z]/.test(newPassword),
      hasNumber: /[0-9]/.test(newPassword),
      hasSymbol: /[!@#$%^&*(),.?":{}|<>]/.test(newPassword),
      isValid: newPassword.length >= 8 && 
               /[A-Z]/.test(newPassword) && 
               /[a-z]/.test(newPassword) && 
               /[0-9]/.test(newPassword) && 
               /[!@#$%^&*(),.?":{}|<>]/.test(newPassword)
    };
  }, [newPassword]);

  // ✅ Verificar se o link é válido quando a página carrega
  useEffect(() => {
    const verifyLink = async () => {
      try {
        // ✅ Verificar se há uma sessão válida (criada pelo link no email)
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error || !session) {
          // Link inválido ou expirado
          setLinkValid(false);
          toast.error("Link inválido ou expirado", {
            description: "Por favor, solicite um novo link de recuperação."
          });
          return;
        }

        // ✅ Link válido! Usuário tem sessão de recuperação
        setLinkValid(true);
        setTokenVerified(true);
      } catch (err) {
        console.error("Erro ao verificar link:", err);
        setLinkValid(false);
      }
    };

    verifyLink();
  }, []);

  // Redefinir senha
  const handleResetPassword = async (e) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error("Senhas não conferem", {
        description: "Verifique se as senhas são iguais."
      });
      return;
    }

    if (!passwordValidation.isValid) {
      toast.error("Senha fraca", {
        description: "A senha não atende aos requisitos de segurança."
      });
      return;
    }

    setLoading(true);
    try {
      // ✅ Atualizar a senha usando a sessão de recuperação
      const { error } = await supabase.auth.updateUser({ 
        password: newPassword 
      });

      if (error) throw error;

      toast.success("Sucesso!", {
        description: "Sua senha foi alterada com sucesso."
      });

      // ✅ Fazer logout
      await supabase.auth.signOut();

      // ✅ Redirecionar para login
      setTimeout(() => {
        navigate("/login", { 
          replace: true,
          state: { message: "Senha redefinida com sucesso. Faça login com sua nova senha." }
        });
      }, 1500);
    } catch (err) {
      toast.error("Erro ao redefinir senha", {
        description: err.message || "Tente novamente mais tarde."
      });
      console.error("Erro:", err);
    } finally {
      setLoading(false);
    }
  };

  const PasswordRequirement = ({ met, label }) => (
    <div className="flex items-center gap-2 text-sm">
      {met ? (
        <CheckCircle2 size={14} className="text-green-500" />
      ) : (
        <X size={14} className="text-gray-300" />
      )}
      <span className={met ? "text-green-600" : "text-gray-500"}>{label}</span>
    </div>
  );

  // ✅ Verificando link
  if (linkValid === null) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-600 to-blue-700 flex flex-col justify-center items-center p-4">
        <motion.div 
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl text-center"
        >
          <Loader2 size={48} className="animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Verificando link de recuperação...</p>
        </motion.div>
      </div>
    );
  }

  // ❌ Link inválido ou expirado
  if (!linkValid) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-600 to-blue-700 flex flex-col justify-center items-center p-4">
        <motion.div 
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl"
        >
          <div className="text-center space-y-4">
            <div className="bg-red-100 p-4 rounded-full w-fit mx-auto">
              <AlertCircle size={48} className="text-red-600" />
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900">Link Expirado</h2>
              <p className="text-gray-600 text-sm mt-2">
                O link de recuperação expirou ou é inválido. Por favor, solicite um novo link.
              </p>
            </div>

            <Button 
              onClick={() => navigate("/forgot-password")}
              className="w-full h-12 bg-blue-600 hover:bg-blue-700 rounded-xl text-lg font-semibold"
            >
              Solicitar Novo Link
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ✅ Link válido - Mostrar formulário de nova senha
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-600 to-blue-700 flex flex-col justify-center items-center p-4">
      <motion.div 
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl"
      >
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-6"
        >
          <button 
            onClick={() => navigate("/login")}
            className="flex items-center gap-2 text-sm text-blue-600 font-medium hover:text-blue-700 transition-colors"
          >
            <ArrowLeft size={16} /> Voltar para Login
          </button>

          <div>
            <h2 className="text-2xl font-bold text-gray-900">Defina uma Nova Senha</h2>
            <p className="text-gray-600 text-sm mt-2">
              Crie uma senha forte para sua conta.
            </p>
          </div>

          <form onSubmit={handleResetPassword} className="space-y-4">
            {/* Nova Senha */}
            <div className="space-y-2">
              <Label htmlFor="newPassword" className="font-semibold text-gray-800">Nova Senha</Label>
              <div className="relative">
                <Input 
                  id="newPassword"
                  type={showPassword ? "text" : "password"} 
                  value={newPassword} 
                  onChange={(e) => setNewPassword(e.target.value)} 
                  placeholder="••••••••"
                  className="h-12 pr-10 rounded-xl border-gray-200 focus:ring-blue-500"
                  disabled={loading}
                  autoFocus
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

            {/* Requisitos de Senha */}
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-2">
              <p className="text-xs font-semibold text-gray-700">Requisitos da senha:</p>
              <PasswordRequirement met={passwordValidation.hasMinLength} label="8+ caracteres" />
              <PasswordRequirement met={passwordValidation.hasUpperCase} label="Letra maiúscula" />
              <PasswordRequirement met={passwordValidation.hasLowerCase} label="Letra minúscula" />
              <PasswordRequirement met={passwordValidation.hasNumber} label="Número" />
              <PasswordRequirement met={passwordValidation.hasSymbol} label="Símbolo (!@#$%)" />
            </div>

            {/* Confirmar Senha */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="font-semibold text-gray-800">Confirmar Senha</Label>
              <div className="relative">
                <Input 
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"} 
                  value={confirmPassword} 
                  onChange={(e) => setConfirmPassword(e.target.value)} 
                  placeholder="••••••••"
                  className="h-12 pr-10 rounded-xl border-gray-200 focus:ring-blue-500"
                  disabled={loading}
                />
                <button 
                  type="button" 
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-red-600 font-medium">As senhas não conferem</p>
              )}
            </div>

            {/* Botão de Envio */}
            <Button 
              type="submit" 
              disabled={loading || !passwordValidation.isValid || newPassword !== confirmPassword} 
              className="w-full h-14 bg-green-600 hover:bg-green-700 rounded-xl text-lg font-semibold text-white flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Alterando...
                </>
              ) : (
                "Redefinir Senha"
              )}
            </Button>
          </form>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm text-blue-900">
              <strong>Segurança:</strong> Nunca compartilhe este link com ninguém.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
