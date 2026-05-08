import React, { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Eye, EyeOff, CheckCircle2, X, AlertCircle, Lock } from "lucide-react";

const Req = ({ met, label }) => (
  <div style={{ display:"flex",alignItems:"center",gap:8 }}>
    {met ? <CheckCircle2 size={13} color="#2ecc8a"/> : <X size={13} color="rgba(255,255,255,0.15)"/>}
    <span style={{ fontSize:"0.78rem",color:met?"#2ecc8a":"#3a4259" }}>{label}</span>
  </div>
);

export default function ResetPassword() {
  const [newPass, setNewPass]   = useState("");
  const [confirm, setConfirm]   = useState("");
  const [showNew, setShowNew]   = useState(false);
  const [showCon, setShowCon]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [linkValid, setLinkValid] = useState(null);
  const navigate = useNavigate();

  const v = useMemo(() => ({
    len:    newPass.length >= 8,
    upper:  /[A-Z]/.test(newPass),
    lower:  /[a-z]/.test(newPass),
    number: /[0-9]/.test(newPass),
    symbol: /[!@#$%^&*(),.?":{}|<>]/.test(newPass),
  }), [newPass]);
  const valid = Object.values(v).every(Boolean);
  const match = newPass && confirm && newPass === confirm;

  useEffect(() => {
    const check = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      setLinkValid(!error && !!session);
    };
    check();
  }, []);

  const handleReset = async (e) => {
    e.preventDefault();
    if (!valid || !match) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) throw error;
      toast.success("Senha alterada com sucesso!");
      await supabase.auth.signOut();
      setTimeout(() => navigate("/login", { replace:true }), 1200);
    } catch (err) {
      toast.error("Erro ao redefinir", { description: err.message });
    } finally { setLoading(false); }
  };

  const Shell = ({ children }) => (
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
          {children}
        </div>
      </motion.div>
    </div>
  );

  if (linkValid === null) return (
    <Shell>
      <div style={{ textAlign:"center",padding:"20px 0" }}>
        <Loader2 size={36} color="#1d4ed8" className="animate-spin" style={{ margin:"0 auto 12px" }}/>
        <p style={{ fontSize:"0.82rem",color:"#6b7a96" }}>Verificando link de recuperação...</p>
      </div>
    </Shell>
  );

  if (!linkValid) return (
    <Shell>
      <div style={{ textAlign:"center" }}>
        <div style={{ width:64,height:64,borderRadius:"50%",background:"rgba(232,93,93,0.1)",border:"1px solid rgba(232,93,93,0.2)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px" }}>
          <AlertCircle size={30} color="#e85d5d"/>
        </div>
        <h2 style={{ fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:"1.3rem",color:"#e8edf5",letterSpacing:"-0.03em",marginBottom:8 }}>Link expirado</h2>
        <p style={{ fontSize:"0.82rem",color:"#6b7a96",lineHeight:1.6,marginBottom:20 }}>
          O link de recuperação expirou ou é inválido. Solicite um novo.
        </p>
        <button onClick={() => navigate("/forgot-password")}
          style={{ width:"100%",background:"#1d4ed8",border:"none",borderRadius:12,padding:13,color:"#fff",fontSize:"1rem",fontWeight:700,fontFamily:"'Cabinet Grotesk',sans-serif",cursor:"pointer",boxShadow:"0 0 30px rgba(29,78,216,0.35)",letterSpacing:"-0.01em" }}>
          Solicitar novo link
        </button>
      </div>
    </Shell>
  );

  return (
    <Shell>
      <button onClick={() => navigate("/login")}
        style={{ display:"flex",alignItems:"center",gap:6,color:"#60a5fa",fontSize:"0.82rem",fontWeight:600,background:"none",border:"none",cursor:"pointer",marginBottom:20,fontFamily:"'Outfit',sans-serif" }}>
        <ArrowLeft size={16}/> Voltar para o login
      </button>

      <h2 style={{ fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:"1.4rem",color:"#e8edf5",letterSpacing:"-0.03em",marginBottom:6 }}>
        Nova senha
      </h2>
      <p style={{ fontSize:"0.82rem",color:"#6b7a96",marginBottom:22,lineHeight:1.6 }}>
        Crie uma senha forte para sua conta.
      </p>

      <form onSubmit={handleReset} style={{ display:"flex",flexDirection:"column",gap:14 }}>
        <div>
          <label style={{ fontSize:"0.72rem",fontWeight:600,color:"#6b7a96",textTransform:"uppercase",letterSpacing:"0.1em",display:"block",marginBottom:6 }}>Nova senha</label>
          <div style={{ position:"relative" }}>
            <Lock size={15} style={{ position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:"#3a4259" }}/>
            <input type={showNew?"text":"password"} placeholder="••••••••" value={newPass}
              onChange={e => setNewPass(e.target.value)} autoFocus
              style={{ width:"100%",background:"#12151c",border:"0.5px solid rgba(255,255,255,0.08)",borderRadius:10,padding:"12px 44px",color:"#e8edf5",fontSize:"0.95rem",outline:"none",fontFamily:"'Outfit',sans-serif",boxSizing:"border-box" }}
              onFocus={e => e.target.style.borderColor="rgba(37,99,235,0.5)"}
              onBlur={e => e.target.style.borderColor="rgba(255,255,255,0.08)"}
            />
            <button type="button" onClick={() => setShowNew(!showNew)}
              style={{ position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#6b7a96",cursor:"pointer" }}>
              {showNew?<EyeOff size={17}/>:<Eye size={17}/>}
            </button>
          </div>
        </div>

        {newPass && (
          <div style={{ background:"#12151c",border:"0.5px solid rgba(255,255,255,0.06)",borderRadius:12,padding:"12px 14px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 12px" }}>
            <Req met={v.len}    label="8+ caracteres"/>
            <Req met={v.upper}  label="Maiúscula"/>
            <Req met={v.lower}  label="Minúscula"/>
            <Req met={v.number} label="Número"/>
            <Req met={v.symbol} label="Símbolo (!@#)"/>
          </div>
        )}

        <div>
          <label style={{ fontSize:"0.72rem",fontWeight:600,color:"#6b7a96",textTransform:"uppercase",letterSpacing:"0.1em",display:"block",marginBottom:6 }}>Confirmar senha</label>
          <div style={{ position:"relative" }}>
            <Lock size={15} style={{ position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:"#3a4259" }}/>
            <input type={showCon?"text":"password"} placeholder="••••••••" value={confirm}
              onChange={e => setConfirm(e.target.value)}
              style={{ width:"100%",background:"#12151c",border:`0.5px solid ${confirm&&!match?"#e85d5d":"rgba(255,255,255,0.08)"}`,borderRadius:10,padding:"12px 44px",color:"#e8edf5",fontSize:"0.95rem",outline:"none",fontFamily:"'Outfit',sans-serif",boxSizing:"border-box" }}
              onFocus={e => { if(!confirm||match) e.target.style.borderColor="rgba(37,99,235,0.5)"; }}
              onBlur={e => { if(!confirm||match) e.target.style.borderColor="rgba(255,255,255,0.08)"; }}
            />
            <button type="button" onClick={() => setShowCon(!showCon)}
              style={{ position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#6b7a96",cursor:"pointer" }}>
              {showCon?<EyeOff size={17}/>:<Eye size={17}/>}
            </button>
          </div>
          {confirm && !match && <p style={{ fontSize:"0.75rem",color:"#e85d5d",marginTop:5,fontWeight:500 }}>As senhas não conferem</p>}
        </div>

        <button type="submit" disabled={loading||!valid||!match}
          style={{ width:"100%",background:loading||!valid||!match?"#1a2e5a":"#1d4ed8",border:"none",borderRadius:12,padding:13,color:"#fff",fontSize:"1rem",fontWeight:700,fontFamily:"'Cabinet Grotesk',sans-serif",cursor:loading||!valid||!match?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:loading||!valid||!match?"none":"0 0 30px rgba(29,78,216,0.35)",transition:"all .2s",letterSpacing:"-0.01em" }}>
          {loading?<><Loader2 size={18} className="animate-spin"/> Alterando...</>:"Redefinir senha"}
        </button>
      </form>

      <div style={{ marginTop:16,background:"rgba(37,99,235,0.06)",border:"0.5px solid rgba(37,99,235,0.15)",borderRadius:12,padding:"10px 14px" }}>
        <p style={{ fontSize:"0.75rem",color:"#3a4259",lineHeight:1.6 }}>🔒 Nunca compartilhe este link com ninguém.</p>
      </div>
    </Shell>
  );
}