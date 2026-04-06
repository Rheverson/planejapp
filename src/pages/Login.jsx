import { supabase } from "@/lib/supabase"; 
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, ChevronRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const navigate = useNavigate();

  // Escuta o deep link quando voltar do Google no APK
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handleAppUrlOpen = async ({ url }) => {
      if (url.includes('login-callback') || url.includes('access_token')) {
        // Extrai os tokens da URL
        const urlObj = new URL(url.replace('com.planeje.app://', 'https://planeje.vercel.app/'));
        const hashParams = new URLSearchParams(urlObj.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (!error) {
            toast.success("Login realizado com sucesso!");
            navigate("/");
          } else {
            toast.error("Erro ao processar login. Tente novamente.");
          }
        }
      }
    };

    App.addListener('appUrlOpen', handleAppUrlOpen);
    return () => { App.removeAllListeners(); };
  }, []);

  const handleSocialLogin = async (provider) => {
    setLoading(true);
    try {
      const redirectTo = Capacitor.isNativePlatform()
        ? 'com.planeje.app://login-callback'
        : window.location.origin;

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo }
      });

      if (error) {
        toast.error("Erro ao tentar login social", { description: error.message });
        setLoading(false);
      }
    } catch (err) {
      toast.error("Erro inesperado. Tente novamente.");
      setLoading(false);
    }
  };

  const handleCheckEmail = async (e) => {
    if (e) e.preventDefault();
    const sanitizedEmail = email.trim().toLowerCase();
    if (!sanitizedEmail.includes("@")) {
      toast.error("Por favor, digite um email válido.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: sanitizedEmail,
        options: { shouldCreateUser: false }
      });
      if (error) {
        setStep("signup");
        setEmail(sanitizedEmail);
        toast.info("Email não encontrado. Vamos criar sua conta!");
      } else {
        setStep("password");
        setEmail(sanitizedEmail);
      }
    } catch (err) {
      toast.error("Erro ao verificar email. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    setLoginError("");
    if (!password) { setLoginError("Por favor, digite sua senha."); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase(), password
      });
      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          setLoginError("Senha incorreta. Por favor, tente novamente.");
        } else if (error.message.includes("Email not confirmed")) {
          toast.info("Confirme seu email primeiro!");
          navigate("/auth/verify", { state: { email, password } });
        } else {
          setLoginError("Ocorreu um erro. Tente novamente.");
        }
      } else {
        toast.success("Login bem-sucedido!");
      }
    } catch (err) {
      setLoginError("Erro ao fazer login. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoToSignup = () => {
    navigate("/onboarding/name", { state: { email } });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-600 to-blue-700 flex flex-col justify-center items-center p-4">
      <div className="mb-12 text-center text-white">
        <h1 className="text-4xl font-bold tracking-tight mb-2">Planeje</h1>
        <p className="text-blue-100">Seu controle financeiro inteligente</p>
      </div>

      <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl">
        <AnimatePresence mode="wait">

          {step === "email" && (
            <motion.div key="email" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Bem-vindo</h2>
                <p className="text-gray-600">Digite seu email para continuar</p>
              </div>
              <form onSubmit={handleCheckEmail} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="font-semibold text-gray-800">E-mail</Label>
                  <Input id="email" type="email" placeholder="seu@email.com" value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 rounded-xl border-gray-200 focus:ring-blue-500 text-lg"
                    autoFocus disabled={loading} />
                </div>
                <Button type="submit" disabled={loading || !email}
                  className="w-full h-14 rounded-xl text-lg font-semibold bg-blue-600 hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2">
                  {loading && step === 'email'
                    ? <><Loader2 size={20} className="animate-spin" />Verificando...</>
                    : <>Continuar<ChevronRight size={20} /></>}
                </Button>
              </form>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
                <div className="relative flex justify-center text-sm"><span className="px-2 bg-white text-gray-500">ou</span></div>
              </div>
              <Button type="button" onClick={() => handleSocialLogin('google')} variant="outline"
                className="w-full h-12 rounded-xl border-gray-300 hover:bg-gray-50 flex items-center justify-center gap-3 text-gray-700 font-medium"
                disabled={loading}>
                <FcGoogle size={22} />
                Continuar com o Google
              </Button>
            </motion.div>
          )}

          {step === "password" && (
            <motion.div key="password" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <button onClick={() => { setStep("email"); setPassword(""); setLoginError(""); }}
                className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium mb-4">
                <ArrowLeft size={20} /> Alterar e-mail
              </button>
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Digite sua senha</h2>
                <p className="text-gray-600 text-sm">{email}</p>
              </div>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password" className="font-semibold text-gray-800">Senha</Label>
                  <div className="relative">
                    <Input id="password" type={showPassword ? "text" : "password"} placeholder="••••••••"
                      value={password} onChange={(e) => { setPassword(e.target.value); setLoginError(""); }}
                      className={`h-12 rounded-xl pr-12 focus:ring-blue-500 text-lg ${loginError ? 'border-red-500' : 'border-gray-200'}`}
                      autoFocus disabled={loading} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                  {loginError && <p className="text-sm text-red-600 font-medium pt-1">{loginError}</p>}
                </div>
                <Button type="submit" disabled={loading || !password}
                  className="w-full h-14 rounded-xl text-lg font-semibold bg-blue-600 hover:bg-blue-700 transition-all shadow-lg shadow-blue-200">
                  {loading && step === 'password'
                    ? <><Loader2 size={20} className="animate-spin mr-2" />Entrando...</>
                    : "Acessar minha conta"}
                </Button>
                <button type="button" onClick={() => navigate("/forgot-password")}
                  className="w-full text-center text-sm text-gray-400 hover:text-blue-600 transition-colors">
                  Esqueci minha senha
                </button>
              </form>
            </motion.div>
          )}

          {step === "signup" && (
            <motion.div key="signup" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <button onClick={() => { setStep("email"); setEmail(""); }}
                className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium mb-4">
                <ArrowLeft size={20} /> Voltar
              </button>
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Vamos criar sua conta</h2>
                <p className="text-gray-600 text-sm">{email}</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                <p className="text-sm text-blue-900">Você será redirecionado para completar seu cadastro com nome, objetivos e senha.</p>
              </div>
              <Button onClick={handleGoToSignup} disabled={loading}
                className="w-full h-14 rounded-xl text-lg font-semibold bg-blue-600 hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2">
                {loading && step === 'signup'
                  ? <><Loader2 size={20} className="animate-spin" />Redirecionando...</>
                  : <>Começar cadastro<ChevronRight size={20} /></>}
              </Button>
            </motion.div>
          )}

        </AnimatePresence>
      </motion.div>
    </div>
  );
}