import React, { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { ArrowLeft, Mail, Loader2, CheckCircle2, ChevronRight } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const navigate = useNavigate();

  const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!isValidEmail(email)) { toast.error("Digite um email válido."); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.toLowerCase().trim(),
        { redirectTo: `${window.location.origin}/reset-password` }
      );
      if (error) throw error;
      setEmailSent(true);
    } catch (err) {
      toast.error("Erro ao enviar email", { description: err.message });
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 relative overflow-hidden"
      style={{ background: "linear-gradient(170deg,#0d1829 0%,#060709 50%)" }}>

      {/* Orbs */}
      <div className="absolute pointer-events-none" style={{ width:500,height:300,borderRadius:"50%",background:"rgba(29,78,216,0.18)",top:-80,left:"50%",transform:"translateX(-50%)",filter:"blur(80px)" }} />
      <div className="absolute pointer-events-none" style={{ width:250,height:250,borderRadius:"50%",background:"rgba(55,48,163,0.1)",bottom:"15%",right:"-40px",filter:"blur(60px)" }} />

      {/* Logo */}
      <motion.div initial={{ opacity:0,y:-16 }} animate={{ opacity:1,y:0 }} transition={{ duration:.5 }}
        className="flex items-center gap-2 mb-8 relative z-10">
        <div style={{ width:9,height:9,borderRadius:"50%",background:"#60a5fa",marginTop:2 }} />
        <span style={{ fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:"1.6rem",color:"#e8edf5",letterSpacing:"-0.04em" }}>PlanejeApp</span>
      </motion.div>

      <motion.div initial={{ opacity:0,y:24 }} animate={{ opacity:1,y:0 }} transition={{ duration:.5,delay:.1 }}
        className="relative z-10 w-full" style={{ maxWidth:420 }}>
        <div style={{ background:"#0c0e13",border:"0.5px solid rgba(255,255,255,0.08)",borderRadius:20,padding:"28px 28px 24px" }}>

          {!emailSent ? (
            <motion.div key="form" initial={{ opacity:0,x:20 }} animate={{ opacity:1,x:0 }} transition={{ duration:.25 }}>
              <button onClick={() => navigate("/login")}
                style={{ display:"flex",alignItems:"center",gap:6,color:"#60a5fa",fontSize:"0.82rem",fontWeight:600,background:"none",border:"none",cursor:"pointer",marginBottom:20,fontFamily:"'Outfit',sans-serif" }}>
                <ArrowLeft size={16} /> Voltar para o login
              </button>

              <h2 style={{ fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:"1.4rem",color:"#e8edf5",letterSpacing:"-0.03em",marginBottom:6 }}>
                Recuperar senha
              </h2>
              <p style={{ fontSize:"0.82rem",color:"#6b7a96",marginBottom:22,lineHeight:1.6 }}>
                Digite seu email e enviaremos um link para redefinir sua senha.
              </p>

              <form onSubmit={handleSend} style={{ display:"flex",flexDirection:"column",gap:12 }}>
                <div>
                  <label style={{ fontSize:"0.72rem",fontWeight:600,color:"#6b7a96",textTransform:"uppercase",letterSpacing:"0.1em",display:"block",marginBottom:6 }}>E-mail</label>
                  <div style={{ position:"relative" }}>
                    <Mail size={16} style={{ position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:"#3a4259" }} />
                    <input type="email" placeholder="seu@email.com" value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={loading} autoFocus
                      style={{ width:"100%",background:"#12151c",border:"0.5px solid rgba(255,255,255,0.08)",borderRadius:10,padding:"12px 14px 12px 40px",color:"#e8edf5",fontSize:"0.95rem",outline:"none",fontFamily:"'Outfit',sans-serif",boxSizing:"border-box" }}
                      onFocus={e => e.target.style.borderColor="rgba(37,99,235,0.5)"}
                      onBlur={e => e.target.style.borderColor="rgba(255,255,255,0.08)"}
                    />
                  </div>
                </div>

                <button type="submit" disabled={loading || !email || !isValidEmail(email)}
                  style={{ width:"100%",background:loading||!email||!isValidEmail(email)?"#1a2e5a":"#1d4ed8",border:"none",borderRadius:12,padding:13,color:"#fff",fontSize:"1rem",fontWeight:700,fontFamily:"'Cabinet Grotesk',sans-serif",cursor:loading||!email?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:loading||!email?"none":"0 0 30px rgba(29,78,216,0.35)",transition:"all .2s",letterSpacing:"-0.01em" }}>
                  {loading ? <><Loader2 size={18} className="animate-spin" /> Enviando...</> : <>Enviar link <ChevronRight size={18} /></>}
                </button>
              </form>

              <div style={{ marginTop:16,background:"rgba(37,99,235,0.08)",border:"0.5px solid rgba(37,99,235,0.2)",borderRadius:12,padding:"10px 14px" }}>
                <p style={{ fontSize:"0.78rem",color:"#6b7a96",lineHeight:1.6 }}>
                  💡 Verifique também a pasta de spam se não receber em alguns minutos.
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div key="sent" initial={{ opacity:0,x:20 }} animate={{ opacity:1,x:0 }} transition={{ duration:.25 }} style={{ textAlign:"center" }}>
              <div style={{ width:64,height:64,borderRadius:"50%",background:"rgba(46,204,138,0.12)",border:"1px solid rgba(46,204,138,0.25)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px" }}>
                <CheckCircle2 size={32} color="#2ecc8a" />
              </div>
              <h2 style={{ fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:"1.3rem",color:"#e8edf5",letterSpacing:"-0.03em",marginBottom:8 }}>Email enviado!</h2>
              <p style={{ fontSize:"0.82rem",color:"#6b7a96",lineHeight:1.6,marginBottom:6 }}>Enviamos o link para:</p>
              <div style={{ background:"rgba(37,99,235,0.1)",border:"0.5px solid rgba(37,99,235,0.25)",borderRadius:999,padding:"4px 14px",fontSize:"0.82rem",color:"#60a5fa",fontWeight:600,display:"inline-block",marginBottom:20 }}>
                {email}
              </div>

              <div style={{ background:"#12151c",border:"0.5px solid rgba(255,255,255,0.06)",borderRadius:12,padding:"14px 16px",textAlign:"left",marginBottom:20 }}>
                <p style={{ fontSize:"0.72rem",fontWeight:700,color:"#6b7a96",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10 }}>O que fazer agora:</p>
                {["Abra seu email","Clique em 'Redefinir Senha'","Crie uma nova senha","Faça login com ela"].map((s,i)=>(
                  <div key={i} style={{ display:"flex",alignItems:"center",gap:10,marginBottom:8 }}>
                    <div style={{ width:20,height:20,borderRadius:6,background:"rgba(37,99,235,0.15)",border:"0.5px solid rgba(37,99,235,0.3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.65rem",color:"#60a5fa",fontWeight:700,flexShrink:0 }}>{i+1}</div>
                    <span style={{ fontSize:"0.8rem",color:"#6b7a96" }}>{s}</span>
                  </div>
                ))}
              </div>

              <button onClick={() => { setEmailSent(false); setEmail(""); }}
                style={{ width:"100%",background:"transparent",border:"0.5px solid rgba(255,255,255,0.1)",borderRadius:12,padding:"11px",color:"#6b7a96",fontSize:"0.88rem",fontWeight:600,fontFamily:"'Outfit',sans-serif",cursor:"pointer",transition:"all .2s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor="rgba(37,99,235,0.4)"; e.currentTarget.style.color="#60a5fa"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor="rgba(255,255,255,0.1)"; e.currentTarget.style.color="#6b7a96"; }}>
                Usar outro email
              </button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}