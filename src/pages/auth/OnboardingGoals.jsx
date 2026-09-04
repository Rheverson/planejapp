import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, ArrowLeft, Target, TrendingUp, ShieldCheck, Wallet } from "lucide-react";

const goals = [
  { id:"save",    label:"Poupar dinheiro",     icon:Wallet,      color:"#2ecc8a", bg:"rgba(46,204,138,0.1)",  border:"rgba(46,204,138,0.25)"  },
  { id:"debt",    label:"Sair das dívidas",     icon:ShieldCheck, color:"#e85d5d", bg:"rgba(232,93,93,0.1)",   border:"rgba(232,93,93,0.25)"   },
  { id:"invest",  label:"Começar a investir",   icon:TrendingUp,  color:"#60a5fa", bg:"rgba(96,165,250,0.1)",  border:"rgba(96,165,250,0.25)"  },
  { id:"control", label:"Controlar os gastos",  icon:Target,      color:"#a78bfa", bg:"rgba(167,139,250,0.1)", border:"rgba(167,139,250,0.25)" },
];

export default function OnboardingGoals() {
  const location = useLocation();
  const navigate  = useNavigate();
  const [selected, setSelected] = useState("");

  const { email="", name="" } = location.state || {};
  if (!email || !name) { navigate("/login"); return null; }

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 relative overflow-hidden"
      style={{ background:"linear-gradient(170deg,#0d1829 0%,#060709 50%)" }}>

      <div className="absolute pointer-events-none" style={{ width:500,height:300,borderRadius:"50%",background:"rgba(29,78,216,0.18)",top:-80,left:"50%",transform:"translateX(-50%)",filter:"blur(80px)" }} />
      <div className="absolute pointer-events-none" style={{ width:200,height:200,borderRadius:"50%",background:"rgba(55,48,163,0.1)",bottom:"10%",right:"-30px",filter:"blur(60px)" }} />

      {/* Logo */}
      <motion.div initial={{ opacity:0,y:-16 }} animate={{ opacity:1,y:0 }} transition={{ duration:.5 }}
        className="flex items-center gap-2 mb-8 relative z-10">
        <div style={{ width:9,height:9,borderRadius:"50%",background:"#60a5fa",marginTop:2 }} />
        <span style={{ fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:"1.6rem",color:"#e8edf5",letterSpacing:"-0.04em" }}>PlanejeApp</span>
      </motion.div>

      {/* Steps */}
      <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:.15 }}
        className="flex items-center gap-2 mb-5 relative z-10">
        {[0,1,2].map(i => (
          <div key={i} style={{ height:5,borderRadius:3,width:i===1?18:5,background:i===1?"#1d4ed8":"rgba(255,255,255,0.12)",transition:"all .3s" }} />
        ))}
      </motion.div>

      <motion.div initial={{ opacity:0,y:24 }} animate={{ opacity:1,y:0 }} transition={{ duration:.5,delay:.18 }}
        className="relative z-10 w-full" style={{ maxWidth:420 }}>
        <div style={{ background:"#0c0e13",border:"0.5px solid rgba(255,255,255,0.08)",borderRadius:20,padding:"28px 28px 24px" }}>

          <button onClick={() => navigate("/onboarding/name",{ state:{ email } })}
            style={{ display:"flex",alignItems:"center",gap:6,color:"#60a5fa",fontSize:"0.82rem",fontWeight:600,background:"none",border:"none",cursor:"pointer",marginBottom:20,fontFamily:"'Outfit',sans-serif" }}>
            <ArrowLeft size={16} /> Voltar
          </button>

          <h2 style={{ fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:"1.4rem",color:"#e8edf5",letterSpacing:"-0.03em",marginBottom:6 }}>
            Qual é seu objetivo, {name.split(" ")[0]}?
          </h2>
          <p style={{ fontSize:"0.82rem",color:"#6b7a96",marginBottom:20,lineHeight:1.6 }}>
            Isso nos ajuda a personalizar seus relatórios e análises.
          </p>

          <div style={{ display:"flex",flexDirection:"column",gap:8,marginBottom:20 }}>
            {goals.map((g, i) => {
              const Icon = g.icon;
              const active = selected === g.id;
              return (
                <motion.button key={g.id}
                  initial={{ opacity:0,x:12 }} animate={{ opacity:1,x:0 }} transition={{ delay:.05*i }}
                  onClick={() => setSelected(g.id)}
                  style={{ display:"flex",alignItems:"center",gap:14,padding:"12px 14px",background:active?`${g.bg}`:"#12151c",border:`0.5px solid ${active?g.border:"rgba(255,255,255,0.07)"}`,borderRadius:12,cursor:"pointer",transition:"all .2s",width:"100%",textAlign:"left" }}>
                  <div style={{ width:38,height:38,borderRadius:10,background:active?g.bg:"rgba(255,255,255,0.04)",border:`0.5px solid ${active?g.border:"rgba(255,255,255,0.07)"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .2s" }}>
                    <Icon size={18} color={active?g.color:"#3a4259"} />
                  </div>
                  <span style={{ fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:"0.95rem",color:active?g.color:"#6b7a96",transition:"color .2s" }}>{g.label}</span>
                  {active && <div style={{ marginLeft:"auto",width:8,height:8,borderRadius:"50%",background:g.color }} />}
                </motion.button>
              );
            })}
          </div>

          <button onClick={() => selected && navigate("/onboarding/password",{ state:{ email, name, goal:selected } })}
            disabled={!selected}
            style={{ width:"100%",background:!selected?"#1a2e5a":"#1d4ed8",border:"none",borderRadius:12,padding:13,color:"#fff",fontSize:"1rem",fontWeight:700,fontFamily:"'Cabinet Grotesk',sans-serif",cursor:!selected?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:!selected?"none":"0 0 30px rgba(29,78,216,0.35)",transition:"all .2s",letterSpacing:"-0.01em" }}>
            Continuar <ArrowRight size={18} />
          </button>

          <p style={{ textAlign:"center",fontSize:"0.7rem",color:"#3a4259",marginTop:14 }}>Etapa 2 de 3</p>
        </div>
      </motion.div>
    </div>
  );
}