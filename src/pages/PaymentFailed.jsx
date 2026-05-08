import React, { useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, CreditCard, ArrowRight, LogOut, RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";

export default function PaymentFailed() {
  const { user, signOut } = useAuth();
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const handleUpdatePayment = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Sessão expirada. Faça login novamente."); return; }

      const { data, error } = await supabase.functions.invoke("create-billing-portal", {
        body: { returnUrl: window.location.origin + "/" },
        headers: { Authorization: `Bearer ${session.access_token}` }
      });

      if (error) throw error;
      if (!data?.url) throw new Error("URL não retornada");
      window.location.href = data.url;

    } catch (err) {
      toast.error("Erro ao abrir portal: " + err.message);
    } finally { setLoading(false); }
  };

  const handleRetryCheck = async () => {
    setRetrying(true);
    try {
      // Força re-fetch da subscription
      await new Promise(r => setTimeout(r, 2000));
      window.location.reload();
    } finally { setRetrying(false); }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 relative overflow-hidden"
      style={{ background: "linear-gradient(170deg,#0d1829 0%,#060709 50%)" }}>

      {/* Orbs */}
      <div className="absolute pointer-events-none" style={{ width:500,height:300,borderRadius:"50%",background:"rgba(232,93,93,0.1)",top:-80,left:"50%",transform:"translateX(-50%)",filter:"blur(80px)" }} />
      <div className="absolute pointer-events-none" style={{ width:250,height:250,borderRadius:"50%",background:"rgba(55,48,163,0.08)",bottom:"15%",right:"-40px",filter:"blur(60px)" }} />

      {/* Logo */}
      <motion.div initial={{ opacity:0,y:-16 }} animate={{ opacity:1,y:0 }} transition={{ duration:.5 }}
        className="flex items-center gap-2 mb-8 relative z-10">
        <div style={{ width:9,height:9,borderRadius:"50%",background:"#e85d5d",marginTop:2 }} />
        <span style={{ fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:"1.6rem",color:"#e8edf5",letterSpacing:"-0.04em" }}>PlanejeApp</span>
      </motion.div>

      <motion.div initial={{ opacity:0,y:24 }} animate={{ opacity:1,y:0 }} transition={{ duration:.5,delay:.1 }}
        className="relative z-10 w-full" style={{ maxWidth:420 }}>
        <div style={{ background:"#0c0e13",border:"0.5px solid rgba(232,93,93,0.2)",borderRadius:20,padding:"28px 28px 24px" }}>

          {/* Ícone */}
          <div style={{ textAlign:"center",marginBottom:20 }}>
            <motion.div initial={{ scale:0 }} animate={{ scale:1 }} transition={{ delay:.2,type:"spring",stiffness:200 }}
              style={{ width:72,height:72,borderRadius:"50%",background:"rgba(232,93,93,0.1)",border:"1px solid rgba(232,93,93,0.3)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px" }}>
              <AlertCircle size={36} color="#e85d5d"/>
            </motion.div>
            <h1 style={{ fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:"1.5rem",color:"#e8edf5",letterSpacing:"-0.03em",marginBottom:8 }}>
              Pagamento recusado
            </h1>
            <p style={{ fontSize:"0.82rem",color:"#6b7a96",lineHeight:1.7 }}>
              Não conseguimos processar o pagamento da sua assinatura. Atualize seu método de pagamento para continuar usando o PlanejApp.
            </p>
          </div>

          {/* Info do usuário */}
          <div style={{ background:"#12151c",border:"0.5px solid rgba(255,255,255,0.06)",borderRadius:12,padding:"12px 14px",marginBottom:20 }}>
            <p style={{ fontSize:"0.7rem",color:"#6b7a96",marginBottom:3 }}>Conta</p>
            <p style={{ fontSize:"0.88rem",color:"#e8edf5",fontWeight:600 }}>{user?.email}</p>
          </div>

          {/* O que pode acontecer */}
          <div style={{ background:"rgba(232,93,93,0.06)",border:"0.5px solid rgba(232,93,93,0.15)",borderRadius:12,padding:"12px 14px",marginBottom:20 }}>
            <p style={{ fontSize:"0.72rem",fontWeight:700,color:"#e85d5d",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10 }}>
              O que acontece agora:
            </p>
            {[
              "Seu acesso ao app está suspenso",
              "Seus dados estão preservados e seguros",
              "Atualize o cartão para reativar imediatamente",
            ].map((item,i) => (
              <div key={i} style={{ display:"flex",alignItems:"flex-start",gap:8,marginBottom:6 }}>
                <div style={{ width:16,height:16,borderRadius:4,background:"rgba(232,93,93,0.15)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1 }}>
                  <span style={{ fontSize:"0.6rem",color:"#e85d5d" }}>!</span>
                </div>
                <span style={{ fontSize:"0.78rem",color:"#6b7a96",lineHeight:1.5 }}>{item}</span>
              </div>
            ))}
          </div>

          {/* Botão principal — atualizar cartão */}
          <button onClick={handleUpdatePayment} disabled={loading}
            style={{ width:"100%",background:loading?"#1a2e5a":"#1d4ed8",border:"none",borderRadius:12,padding:"14px",color:"#fff",fontSize:"1rem",fontWeight:700,fontFamily:"'Cabinet Grotesk',sans-serif",cursor:loading?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:loading?"none":"0 0 30px rgba(29,78,216,0.35)",transition:"all .2s",letterSpacing:"-0.01em",marginBottom:10 }}>
            {loading
              ? <><Loader2 size={18} className="animate-spin"/> Abrindo portal...</>
              : <><CreditCard size={18}/> Atualizar método de pagamento <ArrowRight size={16}/></>}
          </button>

          {/* Botão secundário — verificar novamente */}
          <button onClick={handleRetryCheck} disabled={retrying}
            style={{ width:"100%",background:"transparent",border:"0.5px solid rgba(255,255,255,0.08)",borderRadius:12,padding:"11px",color:"#6b7a96",fontSize:"0.88rem",fontWeight:600,fontFamily:"'Outfit',sans-serif",cursor:retrying?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"all .2s",marginBottom:16 }}
            onMouseEnter={e => { e.currentTarget.style.borderColor="rgba(37,99,235,0.4)"; e.currentTarget.style.color="#60a5fa"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor="rgba(255,255,255,0.08)"; e.currentTarget.style.color="#6b7a96"; }}>
            {retrying
              ? <><Loader2 size={15} className="animate-spin"/> Verificando...</>
              : <><RefreshCw size={15}/> Já atualizei, verificar novamente</>}
          </button>

          {/* Sair */}
          <button onClick={async () => await signOut()}
            style={{ width:"100%",background:"transparent",border:"none",color:"#3a4259",fontSize:"0.8rem",fontFamily:"'Outfit',sans-serif",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,transition:"color .2s" }}
            onMouseEnter={e => e.currentTarget.style.color="#e85d5d"}
            onMouseLeave={e => e.currentTarget.style.color="#3a4259"}>
            <LogOut size={13}/> Sair da conta
          </button>
        </div>

        <p style={{ textAlign:"center",fontSize:"0.7rem",color:"#3a4259",marginTop:14 }}>
          Dúvidas?{" "}
          <a href="https://wa.me/5541999322187" target="_blank" rel="noreferrer"
            style={{ color:"#2ecc8a",fontWeight:600,textDecoration:"none" }}>
            Falar no WhatsApp
          </a>
        </p>
      </motion.div>
    </div>
  );
}