import { supabase } from "@/lib/supabase";
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
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

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handleAppUrlOpen = async ({ url }) => {
      if (url.includes("login-callback") || url.includes("access_token")) {
        const urlObj = new URL(url.replace("com.planeje.app://", "https://planeje.vercel.app/"));
        const hashParams = new URLSearchParams(urlObj.hash.substring(1));
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (!error) { toast.success("Login realizado!"); navigate("/"); }
          else toast.error("Erro ao processar login.");
        }
      }
    };
    App.addListener("appUrlOpen", handleAppUrlOpen);
    return () => { App.removeAllListeners(); };
  }, []);

  const handleSocialLogin = async (provider) => {
    setLoading(true);
    try {
      const redirectTo = Capacitor.isNativePlatform()
        ? "com.planeje.app://login-callback"
        : window.location.origin;
      const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
      if (error) { toast.error("Erro ao tentar login social"); setLoading(false); }
    } catch { toast.error("Erro inesperado."); setLoading(false); }
  };

  const handleCheckEmail = async (e) => {
    if (e) e.preventDefault();
    const sanitizedEmail = email.trim().toLowerCase();
    if (!sanitizedEmail.includes("@")) { toast.error("Digite um email válido."); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: sanitizedEmail, options: { shouldCreateUser: false } });
      if (error) { setStep("signup"); setEmail(sanitizedEmail); toast.info("Email não encontrado. Vamos criar sua conta!"); }
      else { setStep("password"); setEmail(sanitizedEmail); }
    } catch { toast.error("Erro ao verificar email."); }
    finally { setLoading(false); }
  };

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    setLoginError("");
    if (!password) { setLoginError("Por favor, digite sua senha."); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.toLowerCase(), password });
      if (error) {
        if (error.message.includes("Invalid login credentials")) setLoginError("Senha incorreta. Tente novamente.");
        else if (error.message.includes("Email not confirmed")) { toast.info("Confirme seu email primeiro!"); navigate("/auth/verify", { state: { email, password } }); }
        else setLoginError("Ocorreu um erro. Tente novamente.");
      } else { toast.success("Login bem-sucedido!"); }
    } catch { setLoginError("Erro ao fazer login."); }
    finally { setLoading(false); }
  };

  const stepIndex = { email: 0, password: 1, signup: 1 };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 relative overflow-hidden"
      style={{ background: "linear-gradient(170deg, #0d1829 0%, #060709 50%)" }}>

      {/* Orbs */}
      <div className="absolute pointer-events-none" style={{
        width: 500, height: 300, borderRadius: "50%",
        background: "rgba(29,78,216,0.18)", top: -80, left: "50%",
        transform: "translateX(-50%)", filter: "blur(80px)"
      }} />
      <div className="absolute pointer-events-none" style={{
        width: 250, height: 250, borderRadius: "50%",
        background: "rgba(55,48,163,0.1)", bottom: "15%", right: "-40px",
        filter: "blur(60px)"
      }} />

      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-center gap-2 mb-8 relative z-10"
      >
        <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#60a5fa", marginTop: 2 }} />
        <span style={{
          fontFamily: "'Cabinet Grotesk', sans-serif",
          fontWeight: 900, fontSize: "1.6rem",
          color: "#e8edf5", letterSpacing: "-0.04em"
        }}>PlanejeApp</span>
      </motion.div>

      {/* Hero text */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.08 }}
        className="text-center mb-6 relative z-10"
      >
        <h1 style={{
          fontFamily: "'Cabinet Grotesk', sans-serif",
          fontWeight: 900, fontSize: "clamp(2rem, 6vw, 2.8rem)",
          color: "#e8edf5", letterSpacing: "-0.03em", lineHeight: 1.1,
          marginBottom: 8
        }}>
          Bem-vindo ao seu{" "}
          <span style={{ color: "#60a5fa" }}>controle financeiro</span>
        </h1>
        <p style={{ color: "#6b7a96", fontSize: "0.95rem" }}>
          Organize, economize e cresça com inteligência artificial
        </p>
      </motion.div>

      {/* Step dots */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="flex items-center gap-2 mb-5 relative z-10"
      >
        {[0, 1, 2].map((i) => (
          <div key={i} style={{
            height: 5, borderRadius: 3,
            width: i === stepIndex[step] ? 18 : 5,
            background: i === stepIndex[step] ? "#1d4ed8" : "rgba(255,255,255,0.12)",
            transition: "all 0.3s ease"
          }} />
        ))}
      </motion.div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.18 }}
        className="relative z-10 w-full"
        style={{ maxWidth: 420 }}
      >
        <div style={{
          background: "#0c0e13",
          border: "0.5px solid rgba(255,255,255,0.08)",
          borderRadius: 20, padding: "28px 28px 24px"
        }}>
          <AnimatePresence mode="wait">

            {/* STEP EMAIL */}
            {step === "email" && (
              <motion.div key="email"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
              >
                <form onSubmit={handleCheckEmail} className="space-y-4">
                  <div>
                    <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "#6b7a96", textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>
                      E-mail
                    </label>
                    <input
                      type="email" placeholder="seu@email.com" value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={loading} autoFocus
                      style={{
                        width: "100%", background: "#12151c",
                        border: "0.5px solid rgba(255,255,255,0.08)",
                        borderRadius: 10, padding: "12px 14px",
                        color: "#e8edf5", fontSize: "0.95rem",
                        outline: "none", fontFamily: "'Outfit', sans-serif"
                      }}
                      onFocus={(e) => e.target.style.borderColor = "rgba(37,99,235,0.5)"}
                      onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.08)"}
                    />
                  </div>
                  <button type="submit" disabled={loading || !email}
                    style={{
                      width: "100%", background: loading || !email ? "#1a2e5a" : "#1d4ed8",
                      border: "none", borderRadius: 12, padding: "13px",
                      color: "#fff", fontSize: "1rem", fontWeight: 700,
                      fontFamily: "'Cabinet Grotesk', sans-serif",
                      cursor: loading || !email ? "not-allowed" : "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      boxShadow: loading || !email ? "none" : "0 0 30px rgba(29,78,216,0.35)",
                      transition: "all 0.2s", letterSpacing: "-0.01em"
                    }}
                  >
                    {loading ? <><Loader2 size={18} className="animate-spin" /> Verificando...</>
                      : <>Continuar <ChevronRight size={18} /></>}
                  </button>
                </form>

                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0" }}>
                  <div style={{ flex: 1, height: "0.5px", background: "rgba(255,255,255,0.07)" }} />
                  <span style={{ fontSize: "0.78rem", color: "#3a4259" }}>ou</span>
                  <div style={{ flex: 1, height: "0.5px", background: "rgba(255,255,255,0.07)" }} />
                </div>

                <button type="button" onClick={() => handleSocialLogin("google")} disabled={loading}
                  style={{
                    width: "100%", background: "transparent",
                    border: "0.5px solid rgba(255,255,255,0.1)",
                    borderRadius: 12, padding: "12px",
                    color: "#c8d0e0", fontSize: "0.9rem", fontWeight: 500,
                    fontFamily: "'Outfit', sans-serif",
                    cursor: "pointer", display: "flex", alignItems: "center",
                    justifyContent: "center", gap: 10, transition: "all 0.2s"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  <FcGoogle size={20} />
                  Continuar com Google
                </button>
              </motion.div>
            )}

            {/* STEP SENHA */}
            {step === "password" && (
              <motion.div key="password"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
              >
                <button onClick={() => { setStep("email"); setPassword(""); setLoginError(""); }}
                  style={{ display: "flex", alignItems: "center", gap: 6, color: "#60a5fa", fontSize: "0.82rem", fontWeight: 600, background: "none", border: "none", cursor: "pointer", marginBottom: 16, fontFamily: "'Outfit', sans-serif" }}>
                  <ArrowLeft size={16} /> Alterar e-mail
                </button>

                <div style={{ background: "rgba(37,99,235,0.1)", border: "0.5px solid rgba(37,99,235,0.25)", borderRadius: 999, padding: "4px 14px", textAlign: "center", fontSize: "0.8rem", color: "#60a5fa", marginBottom: 18, display: "inline-block", width: "100%" }}>
                  {email}
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "#6b7a96", textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>
                      Senha
                    </label>
                    <div style={{ position: "relative" }}>
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••" value={password}
                        onChange={(e) => { setPassword(e.target.value); setLoginError(""); }}
                        disabled={loading} autoFocus
                        style={{
                          width: "100%", background: "#12151c",
                          border: `0.5px solid ${loginError ? "#e85d5d" : "rgba(255,255,255,0.08)"}`,
                          borderRadius: 10, padding: "12px 44px 12px 14px",
                          color: "#e8edf5", fontSize: "0.95rem",
                          outline: "none", fontFamily: "'Outfit', sans-serif"
                        }}
                        onFocus={(e) => { if (!loginError) e.target.style.borderColor = "rgba(37,99,235,0.5)"; }}
                        onBlur={(e) => { if (!loginError) e.target.style.borderColor = "rgba(255,255,255,0.08)"; }}
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#6b7a96", cursor: "pointer" }}>
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {loginError && (
                      <p style={{ fontSize: "0.8rem", color: "#e85d5d", marginTop: 6, fontWeight: 500 }}>{loginError}</p>
                    )}
                  </div>

                  <button type="submit" disabled={loading || !password}
                    style={{
                      width: "100%", background: loading || !password ? "#1a2e5a" : "#1d4ed8",
                      border: "none", borderRadius: 12, padding: "13px",
                      color: "#fff", fontSize: "1rem", fontWeight: 700,
                      fontFamily: "'Cabinet Grotesk', sans-serif",
                      cursor: loading || !password ? "not-allowed" : "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      boxShadow: loading || !password ? "none" : "0 0 30px rgba(29,78,216,0.35)",
                      transition: "all 0.2s", letterSpacing: "-0.01em"
                    }}
                  >
                    {loading ? <><Loader2 size={18} className="animate-spin" /> Entrando...</>
                      : "Acessar minha conta"}
                  </button>

                  <button type="button" onClick={() => navigate("/forgot-password")}
                    style={{ width: "100%", textAlign: "center", fontSize: "0.82rem", color: "#3a4259", background: "none", border: "none", cursor: "pointer", fontFamily: "'Outfit', sans-serif", transition: "color 0.2s" }}
                    onMouseEnter={(e) => e.currentTarget.style.color = "#60a5fa"}
                    onMouseLeave={(e) => e.currentTarget.style.color = "#3a4259"}
                  >
                    Esqueci minha senha
                  </button>
                </form>
              </motion.div>
            )}

            {/* STEP CADASTRO */}
            {step === "signup" && (
              <motion.div key="signup"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
              >
                <button onClick={() => { setStep("email"); setEmail(""); }}
                  style={{ display: "flex", alignItems: "center", gap: 6, color: "#60a5fa", fontSize: "0.82rem", fontWeight: 600, background: "none", border: "none", cursor: "pointer", marginBottom: 16, fontFamily: "'Outfit', sans-serif" }}>
                  <ArrowLeft size={16} /> Voltar
                </button>

                <div style={{ marginBottom: 20 }}>
                  <p style={{ fontSize: "0.78rem", color: "#6b7a96", marginBottom: 4 }}>Email não encontrado:</p>
                  <div style={{ background: "rgba(37,99,235,0.1)", border: "0.5px solid rgba(37,99,235,0.25)", borderRadius: 999, padding: "4px 14px", fontSize: "0.8rem", color: "#60a5fa", display: "inline-block" }}>
                    {email}
                  </div>
                </div>

                <div style={{ background: "rgba(46,204,138,0.08)", border: "0.5px solid rgba(46,204,138,0.2)", borderRadius: 12, padding: "12px 14px", marginBottom: 18 }}>
                  <p style={{ fontSize: "0.82rem", color: "#2ecc8a", lineHeight: 1.6 }}>
                    Você será redirecionado para completar seu cadastro com nome, objetivos e senha.
                  </p>
                </div>

                <button onClick={() => navigate("/onboarding/name", { state: { email } })} disabled={loading}
                  style={{
                    width: "100%", background: "#1d4ed8",
                    border: "none", borderRadius: 12, padding: "13px",
                    color: "#fff", fontSize: "1rem", fontWeight: 700,
                    fontFamily: "'Cabinet Grotesk', sans-serif",
                    cursor: "pointer", display: "flex", alignItems: "center",
                    justifyContent: "center", gap: 8,
                    boxShadow: "0 0 30px rgba(29,78,216,0.35)",
                    letterSpacing: "-0.01em"
                  }}
                >
                  {loading ? <><Loader2 size={18} className="animate-spin" /> Redirecionando...</>
                    : <>Começar cadastro <ChevronRight size={18} /></>}
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Footer */}
        <p style={{ textAlign: "center", fontSize: "0.78rem", color: "#3a4259", marginTop: 16 }}>
          Ao continuar, você concorda com nossos{" "}
          <span style={{ color: "#60a5fa", cursor: "pointer" }}>Termos de uso</span>
        </p>
      </motion.div>
    </div>
  );
}