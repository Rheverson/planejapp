import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, ArrowRight, Zap, Users, BarChart2, Target } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";

export default function SubscriptionSuccess() {
  const navigate     = useNavigate();
  const queryClient  = useQueryClient();
  const { user }     = useAuth();

  useEffect(() => {
    localStorage.removeItem('referral_code');
    localStorage.removeItem('pending_promo_code');
    localStorage.removeItem('pending_promo_days');

    const timer = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
    }, 3000);
    return () => clearTimeout(timer);
  }, [user]);

  const features = [
    { icon: Zap,      label: "IA Finn — análises toda semana",     color: "#60a5fa" },
    { icon: BarChart2,label: "Relatórios e metas completos",        color: "#2ecc8a" },
    { icon: Users,    label: "Compartilhamento com família",        color: "#a78bfa" },
    { icon: Target,   label: "Transações ilimitadas",               color: "#f59e0b" },
  ];

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 relative overflow-hidden"
      style={{ background: "linear-gradient(170deg,#0d1829 0%,#060709 50%)" }}>

      {/* Orbs */}
      <div className="absolute pointer-events-none" style={{ width:500,height:300,borderRadius:"50%",background:"rgba(46,204,138,0.12)",top:-80,left:"50%",transform:"translateX(-50%)",filter:"blur(80px)" }} />
      <div className="absolute pointer-events-none" style={{ width:250,height:250,borderRadius:"50%",background:"rgba(29,78,216,0.1)",bottom:"15%",right:"-40px",filter:"blur(60px)" }} />

      {/* Logo */}
      <motion.div initial={{ opacity:0,y:-16 }} animate={{ opacity:1,y:0 }} transition={{ duration:.5 }}
        className="flex items-center gap-2 mb-8 relative z-10">
        <div style={{ width:9,height:9,borderRadius:"50%",background:"#2ecc8a",marginTop:2 }} />
        <span style={{ fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:"1.6rem",color:"#e8edf5",letterSpacing:"-0.04em" }}>PlanejeApp</span>
      </motion.div>

      <motion.div initial={{ opacity:0,y:24 }} animate={{ opacity:1,y:0 }} transition={{ duration:.5,delay:.1 }}
        className="relative z-10 w-full" style={{ maxWidth:420 }}>
        <div style={{ background:"#0c0e13",border:"0.5px solid rgba(255,255,255,0.08)",borderRadius:20,padding:"28px 28px 24px" }}>

          {/* Ícone de sucesso */}
          <div style={{ textAlign:"center",marginBottom:20 }}>
            <motion.div initial={{ scale:0 }} animate={{ scale:1 }} transition={{ delay:.2,type:"spring",stiffness:200 }}
              style={{ width:72,height:72,borderRadius:"50%",background:"rgba(46,204,138,0.12)",border:"1px solid rgba(46,204,138,0.3)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px" }}>
              <CheckCircle2 size={36} color="#2ecc8a"/>
            </motion.div>

            <motion.h1 initial={{ opacity:0,y:10 }} animate={{ opacity:1,y:0 }} transition={{ delay:.35 }}
              style={{ fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:"1.6rem",color:"#e8edf5",letterSpacing:"-0.03em",marginBottom:6 }}>
              Tudo certo! 🎉
            </motion.h1>
            <motion.p initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:.45 }}
              style={{ fontSize:"0.82rem",color:"#6b7a96",lineHeight:1.6,marginBottom:8 }}>
              Sua assinatura foi ativada com sucesso.
            </motion.p>
            <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:.5 }}
              style={{ display:"inline-flex",alignItems:"center",gap:6,background:"rgba(46,204,138,0.1)",border:"0.5px solid rgba(46,204,138,0.25)",borderRadius:999,padding:"4px 14px" }}>
              <div style={{ width:6,height:6,borderRadius:"50%",background:"#2ecc8a" }}/>
              <span style={{ fontSize:"0.75rem",fontWeight:700,color:"#2ecc8a" }}>Trial ativado!</span>
            </motion.div>
          </div>

          {/* O que você tem acesso */}
          <div style={{ background:"#12151c",border:"0.5px solid rgba(255,255,255,0.06)",borderRadius:14,padding:"14px 16px",marginBottom:20 }}>
            <p style={{ fontSize:"0.68rem",fontWeight:700,color:"#6b7a96",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:12 }}>
              O que você tem acesso:
            </p>
            <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
              {features.map(({ icon: Icon, label, color }, i) => (
                <motion.div key={label}
                  initial={{ opacity:0,x:-10 }} animate={{ opacity:1,x:0 }} transition={{ delay:.5+i*.08 }}
                  style={{ display:"flex",alignItems:"center",gap:10 }}>
                  <div style={{ width:30,height:30,borderRadius:9,background:`${color}18`,border:`0.5px solid ${color}40`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                    <Icon size={15} color={color}/>
                  </div>
                  <span style={{ fontSize:"0.82rem",color:"#c8d0e0" }}>{label}</span>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Botão */}
          <motion.button initial={{ opacity:0,y:10 }} animate={{ opacity:1,y:0 }} transition={{ delay:.7 }}
            onClick={() => navigate("/onboarding-tour")}
            style={{ width:"100%",background:"#16a34a",border:"none",borderRadius:12,padding:"14px",color:"#fff",fontSize:"1rem",fontWeight:700,fontFamily:"'Cabinet Grotesk',sans-serif",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:"0 0 30px rgba(22,163,74,0.35)",transition:"all .2s",letterSpacing:"-0.01em" }}
            onMouseEnter={e => e.currentTarget.style.background="#15803d"}
            onMouseLeave={e => e.currentTarget.style.background="#16a34a"}>
            Começar a usar <ArrowRight size={18}/>
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}