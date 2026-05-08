import React, { useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Lock, Eye, EyeOff, ArrowLeft, Loader2, CheckCircle2, X } from "lucide-react";

const Req = ({ met, label }) => (
  <div style={{ display:"flex",alignItems:"center",gap:8 }}>
    {met
      ? <CheckCircle2 size={13} color="#2ecc8a" />
      : <X size={13} color="rgba(255,255,255,0.15)" />}
    <span style={{ fontSize:"0.78rem",color:met?"#2ecc8a":"#3a4259" }}>{label}</span>
  </div>
);

export default function OnboardingPassword() {
  const location = useLocation();
  const navigate  = useNavigate();

  const [password, setPassword]         = useState("");
  const [confirm, setConfirm]           = useState("");
  const [showPass, setShowPass]         = useState(false);
  const [showConf, setShowConf]         = useState(false);
  const [loading, setLoading]           = useState(false);

  const { email="", name="", goal="" } = location.state || {};
  if (!email || !name || !goal) { navigate("/login"); return null; }

  const v = useMemo(() => ({
    len:     password.length >= 8,
    upper:   /[A-Z]/.test(password),
    lower:   /[a-z]/.test(password),
    number:  /[0-9]/.test(password),
    symbol:  /[!@#$%^&*(),.?":{}|<>]/.test(password),
  }), [password]);
  const valid   = Object.values(v).every(Boolean);
  const match   = password && confirm && password === confirm;
  const canSend = valid && match && !loading;

  const handleSignUp = async (e) => {
    e.preventDefault();
    if (!canSend) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { data: { full_name: name, onboarding_goal: goal } }
      });
      if (error) throw error;
      toast.success("Código enviado! Verifique seu e-mail.");
      navigate("/auth/verify", { state: { email, password } });
    } catch (err) {
      toast.error("Erro no cadastro", { description: err.message });
    } finally { setLoading(false); }
  };

  const inputStyle = (err) => ({
    width:"100%",background:"#12151c",border:`0.5px solid ${err?"#e85d5d":"rgba(255,255,255,0.08)"}`,borderRadius:10,padding:"12px 44px 12px 44px",color:"#e8edf5",fontSize:"0.95rem",outline:"none",fontFamily:"'Outfit',sans-serif",boxSizing:"border-box"
  });

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 relative overflow-hidden"
      style={{ background:"linear-gradient(170deg,#0d1829 0%,#060709 50%)" }}>

      <div className="absolute pointer-events-none" style={{ width:500,height:300,borderRadius:"50%",background:"rgba(29,78,216,0.18)",top:-80,left:"50%",transform:"translateX(-50%)",filter:"blur(80px)" }} />
      <div className="absolute pointer-events-none" style={{ width:200,height:200,borderRadius:"50%",background:"rgba(55,48,163,0.1)",bottom:"10%",right:"-30px",filter:"blur(60px)" }} />

      <motion.div initial={{ opacity:0,y:-16 }} animate={{ opacity:1,y:0 }} transition={{ duration:.5 }}
        className="flex items-center gap-2 mb-8 relative z-10">
        <div style={{ width:9,height:9,borderRadius:"50%",background:"#60a5fa",marginTop:2 }} />
        <span style={{ fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:"1.6rem",color:"#e8edf5",letterSpacing:"-0.04em" }}>PlanejeApp</span>
      </motion.div>

      <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:.15 }}
        className="flex items-center gap-2 mb-5 relative z-10">
        {[0,1,2].map(i => (
          <div key={i} style={{ height:5,borderRadius:3,width:i===2?18:5,background:i===2?"#1d4ed8":"rgba(255,255,255,0.12)",transition:"all .3s" }} />
        ))}
      </motion.div>

      <motion.div initial={{ opacity:0,y:24 }} animate={{ opacity:1,y:0 }} transition={{ duration:.5,delay:.18 }}
        className="relative z-10 w-full" style={{ maxWidth:420 }}>
        <div style={{ background:"#0c0e13",border:"0.5px solid rgba(255,255,255,0.08)",borderRadius:20,padding:"28px 28px 24px" }}>

          <button onClick={() => navigate("/onboarding/goals",{ state:{ email, name } })}
            style={{ display:"flex",alignItems:"center",gap:6,color:"#60a5fa",fontSize:"0.82rem",fontWeight:600,background:"none",border:"none",cursor:"pointer",marginBottom:20,fontFamily:"'Outfit',sans-serif" }}>
            <ArrowLeft size={16} /> Voltar
          </button>

          <h2 style={{ fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:"1.4rem",color:"#e8edf5",letterSpacing:"-0.03em",marginBottom:6 }}>
            Crie sua senha
          </h2>
          <p style={{ fontSize:"0.82rem",color:"#6b7a96",marginBottom:22,lineHeight:1.6 }}>
            Escolha uma senha forte para proteger sua conta.
          </p>

          <form onSubmit={handleSignUp} style={{ display:"flex",flexDirection:"column",gap:14 }}>
            {/* Senha */}
            <div>
              <label style={{ fontSize:"0.72rem",fontWeight:600,color:"#6b7a96",textTransform:"uppercase",letterSpacing:"0.1em",display:"block",marginBottom:6 }}>Senha</label>
              <div style={{ position:"relative" }}>
                <Lock size={15} style={{ position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:"#3a4259" }} />
                <input type={showPass?"text":"password"} placeholder="••••••••" value={password}
                  onChange={e => setPassword(e.target.value)} autoFocus style={inputStyle(false)}
                  onFocus={e => e.target.style.borderColor="rgba(37,99,235,0.5)"}
                  onBlur={e => e.target.style.borderColor="rgba(255,255,255,0.08)"}
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  style={{ position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#6b7a96",cursor:"pointer" }}>
                  {showPass ? <EyeOff size={17}/> : <Eye size={17}/>}
                </button>
              </div>
            </div>

            {/* Requisitos */}
            {password && (
              <div style={{ background:"#12151c",border:"0.5px solid rgba(255,255,255,0.06)",borderRadius:12,padding:"12px 14px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 12px" }}>
                <Req met={v.len}    label="8+ caracteres" />
                <Req met={v.upper}  label="Maiúscula" />
                <Req met={v.lower}  label="Minúscula" />
                <Req met={v.number} label="Número" />
                <Req met={v.symbol} label="Símbolo (!@#)" />
              </div>
            )}

            {/* Confirmar */}
            <div>
              <label style={{ fontSize:"0.72rem",fontWeight:600,color:"#6b7a96",textTransform:"uppercase",letterSpacing:"0.1em",display:"block",marginBottom:6 }}>Confirmar senha</label>
              <div style={{ position:"relative" }}>
                <Lock size={15} style={{ position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:"#3a4259" }} />
                <input type={showConf?"text":"password"} placeholder="••••••••" value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  style={{ ...inputStyle(confirm && !match),borderColor:confirm&&!match?"#e85d5d":undefined }}
                  onFocus={e => { if(!confirm||match) e.target.style.borderColor="rgba(37,99,235,0.5)"; }}
                  onBlur={e => { if(!confirm||match) e.target.style.borderColor="rgba(255,255,255,0.08)"; }}
                />
                <button type="button" onClick={() => setShowConf(!showConf)}
                  style={{ position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#6b7a96",cursor:"pointer" }}>
                  {showConf ? <EyeOff size={17}/> : <Eye size={17}/>}
                </button>
              </div>
              {confirm && !match && (
                <p style={{ fontSize:"0.75rem",color:"#e85d5d",marginTop:5,fontWeight:500 }}>As senhas não conferem</p>
              )}
            </div>

            <button type="submit" disabled={!canSend}
              style={{ width:"100%",background:!canSend?"#1a2e5a":"#1d4ed8",border:"none",borderRadius:12,padding:13,color:"#fff",fontSize:"1rem",fontWeight:700,fontFamily:"'Cabinet Grotesk',sans-serif",cursor:!canSend?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:!canSend?"none":"0 0 30px rgba(29,78,216,0.35)",transition:"all .2s",letterSpacing:"-0.01em" }}>
              {loading ? <><Loader2 size={18} className="animate-spin"/> Criando conta...</> : "Finalizar cadastro"}
            </button>
          </form>

          <p style={{ textAlign:"center",fontSize:"0.7rem",color:"#3a4259",marginTop:14 }}>Etapa 3 de 3</p>
        </div>
      </motion.div>
    </div>
  );
}