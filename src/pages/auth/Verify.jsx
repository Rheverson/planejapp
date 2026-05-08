import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Loader2, Mail, ArrowLeft, AlertCircle } from "lucide-react";

export default function Verify() {
  const [token, setToken]               = useState(["","","","","",""]);
  const [loading, setLoading]           = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [countdown, setCountdown]       = useState(0);
  const [codeExpired, setCodeExpired]   = useState(false);
  const inputRefs = useRef([]);

  const location = useLocation();
  const navigate  = useNavigate();
  const email    = location.state?.email;
  const password = location.state?.password;

  useEffect(() => { if (!email) navigate("/login"); }, []);
  useEffect(() => {
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown(c => c-1), 1000);
      return () => clearTimeout(t);
    }
  }, [countdown]);

  const handleChange = (idx, val) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...token]; next[idx] = val.slice(-1); setToken(next);
    setCodeExpired(false);
    if (val && idx < 5) inputRefs.current[idx+1]?.focus();
  };

  const handleKeyDown = (idx, e) => {
    if (e.key==="Backspace" && !token[idx] && idx > 0) inputRefs.current[idx-1]?.focus();
  };

  const handlePaste = (e) => {
    const p = e.clipboardData.getData("text").replace(/\D/g,"").slice(0,6);
    if (p.length===6) { setToken(p.split("")); inputRefs.current[5]?.focus(); }
  };

  const full = token.join("");

  const handleVerify = async (e) => {
    e.preventDefault();
    if (full.length < 6) return;
    setLoading(true); setCodeExpired(false);
    try {
      const { error } = await supabase.auth.verifyOtp({ email, token:full, type:"email" });
      if (error) {
        if (error.message.includes("expired")||error.message.includes("invalid")) {
          setCodeExpired(true); setToken(["","","","","",""]); inputRefs.current[0]?.focus(); return;
        }
        throw error;
      }
      if (password) await supabase.auth.signInWithPassword({ email, password });
      toast.success("Email confirmado! Bem-vindo 🎉");
      navigate("/");
    } catch (err) {
      toast.error("Erro na verificação: " + err.message);
    } finally { setLoading(false); }
  };

  const handleResend = async () => {
    setResendLoading(true); setCodeExpired(false);
    try {
      const { error } = await supabase.auth.signUp({
        email: email.toLowerCase().trim(),
        password: password || Math.random().toString(36),
        options: { emailRedirectTo: window.location.origin }
      });
      if (error && !error.message.includes("already registered")) throw error;
      toast.success("Novo código enviado!");
      setToken(["","","","","",""]); inputRefs.current[0]?.focus(); setCountdown(60);
    } catch (err) {
      toast.error("Erro ao reenviar: " + err.message);
    } finally { setResendLoading(false); }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 relative overflow-hidden"
      style={{ background:"linear-gradient(170deg,#0d1829 0%,#060709 50%)" }}>

      <div className="absolute pointer-events-none" style={{ width:500,height:300,borderRadius:"50%",background:"rgba(29,78,216,0.18)",top:-80,left:"50%",transform:"translateX(-50%)",filter:"blur(80px)" }}/>
      <div className="absolute pointer-events-none" style={{ width:200,height:200,borderRadius:"50%",background:"rgba(55,48,163,0.1)",bottom:"10%",right:"-30px",filter:"blur(60px)" }}/>

      <motion.div initial={{ opacity:0,y:-16 }} animate={{ opacity:1,y:0 }} transition={{ duration:.5 }}
        className="flex items-center gap-2 mb-8 relative z-10">
        <div style={{ width:9,height:9,borderRadius:"50%",background:"#60a5fa",marginTop:2 }}/>
        <span style={{ fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:"1.6rem",color:"#e8edf5",letterSpacing:"-0.04em" }}>PlanejeApp</span>
      </motion.div>

      <motion.div initial={{ opacity:0,y:24 }} animate={{ opacity:1,y:0 }} transition={{ duration:.5,delay:.1 }}
        className="relative z-10 w-full" style={{ maxWidth:420 }}>
        <div style={{ background:"#0c0e13",border:"0.5px solid rgba(255,255,255,0.08)",borderRadius:20,padding:"28px 28px 24px" }}>

          <button onClick={() => navigate("/login")}
            style={{ display:"flex",alignItems:"center",gap:6,color:"#60a5fa",fontSize:"0.82rem",fontWeight:600,background:"none",border:"none",cursor:"pointer",marginBottom:20,fontFamily:"'Outfit',sans-serif" }}>
            <ArrowLeft size={16}/> Voltar
          </button>

          {/* Ícone e cabeçalho */}
          <div style={{ textAlign:"center",marginBottom:24 }}>
            <div style={{ width:56,height:56,borderRadius:16,background:"rgba(29,78,216,0.15)",border:"0.5px solid rgba(37,99,235,0.3)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px" }}>
              <Mail size={26} color="#60a5fa"/>
            </div>
            <h2 style={{ fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:"1.3rem",color:"#e8edf5",letterSpacing:"-0.03em",marginBottom:6 }}>
              Verifique seu e-mail
            </h2>
            <p style={{ fontSize:"0.8rem",color:"#6b7a96",lineHeight:1.6 }}>
              Enviamos um código para<br/>
              <span style={{ color:"#e8edf5",fontWeight:600 }}>{email}</span>
            </p>
          </div>

          {/* Alerta expirado */}
          {codeExpired && (
            <motion.div initial={{ opacity:0,y:-8 }} animate={{ opacity:1,y:0 }}
              style={{ background:"rgba(232,93,93,0.08)",border:"0.5px solid rgba(232,93,93,0.25)",borderRadius:12,padding:"10px 14px",marginBottom:18,display:"flex",alignItems:"flex-start",gap:10 }}>
              <AlertCircle size={16} color="#e85d5d" style={{ flexShrink:0,marginTop:2 }}/>
              <div>
                <p style={{ fontSize:"0.8rem",fontWeight:600,color:"#e85d5d" }}>Código expirado ou inválido</p>
                <p style={{ fontSize:"0.74rem",color:"#6b7a96",marginTop:2 }}>Clique em "Reenviar código" abaixo.</p>
              </div>
            </motion.div>
          )}

          {/* Inputs do código */}
          <form onSubmit={handleVerify}>
            <label style={{ fontSize:"0.72rem",fontWeight:600,color:"#6b7a96",textTransform:"uppercase",letterSpacing:"0.1em",display:"block",marginBottom:12,textAlign:"center" }}>
              Código de verificação
            </label>
            <div style={{ display:"flex",gap:8,justifyContent:"center",marginBottom:20 }} onPaste={handlePaste}>
              {token.map((d,i) => (
                <input key={i} ref={el => inputRefs.current[i]=el}
                  type="text" inputMode="numeric" maxLength={1} value={d}
                  onChange={e => handleChange(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)}
                  disabled={loading}
                  style={{ width:46,height:54,textAlign:"center",fontSize:"1.3rem",fontWeight:700,fontFamily:"'Cabinet Grotesk',sans-serif",background:"#12151c",border:`1.5px solid ${codeExpired?"rgba(232,93,93,0.4)":d?"rgba(37,99,235,0.6)":"rgba(255,255,255,0.08)"}`,borderRadius:12,color:codeExpired?"#e85d5d":d?"#60a5fa":"#e8edf5",outline:"none",transition:"all .15s" }}
                  onFocus={e => { if(!codeExpired) e.target.style.borderColor="rgba(37,99,235,0.8)"; }}
                  onBlur={e => { if(!codeExpired) e.target.style.borderColor=d?"rgba(37,99,235,0.6)":"rgba(255,255,255,0.08)"; }}
                />
              ))}
            </div>

            <button type="submit" disabled={loading||full.length<6}
              style={{ width:"100%",background:loading||full.length<6?"#1a2e5a":"#1d4ed8",border:"none",borderRadius:12,padding:13,color:"#fff",fontSize:"1rem",fontWeight:700,fontFamily:"'Cabinet Grotesk',sans-serif",cursor:loading||full.length<6?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:loading||full.length<6?"none":"0 0 30px rgba(29,78,216,0.35)",transition:"all .2s",letterSpacing:"-0.01em",marginBottom:16 }}>
              {loading?<><Loader2 size={18} className="animate-spin"/> Verificando...</>:"Confirmar código"}
            </button>
          </form>

          {/* Divisor */}
          <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:14 }}>
            <div style={{ flex:1,height:"0.5px",background:"rgba(255,255,255,0.07)" }}/>
            <span style={{ fontSize:"0.72rem",color:"#3a4259" }}>não recebeu?</span>
            <div style={{ flex:1,height:"0.5px",background:"rgba(255,255,255,0.07)" }}/>
          </div>

          <button type="button" onClick={handleResend}
            disabled={resendLoading||countdown>0}
            style={{ width:"100%",background:"transparent",border:"0.5px solid rgba(255,255,255,0.1)",borderRadius:12,padding:"11px",color:countdown>0?"#3a4259":"#6b7a96",fontSize:"0.88rem",fontWeight:600,fontFamily:"'Outfit',sans-serif",cursor:resendLoading||countdown>0?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"all .2s" }}
            onMouseEnter={e => { if(!resendLoading&&!countdown) { e.currentTarget.style.borderColor="rgba(37,99,235,0.4)"; e.currentTarget.style.color="#60a5fa"; }}}
            onMouseLeave={e => { e.currentTarget.style.borderColor="rgba(255,255,255,0.1)"; e.currentTarget.style.color=countdown?"#3a4259":"#6b7a96"; }}>
            {resendLoading ? <><Loader2 size={16} className="animate-spin"/> Reenviando...</>
              : countdown > 0 ? `Reenviar em ${countdown}s`
              : "Reenviar código"}
          </button>

          <p style={{ textAlign:"center",fontSize:"0.7rem",color:"#3a4259",marginTop:12 }}>
            Verifique também a pasta de spam.
          </p>
        </div>
      </motion.div>
    </div>
  );
}