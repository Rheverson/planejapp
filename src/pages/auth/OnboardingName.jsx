import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, User } from "lucide-react";

export default function OnboardingName() {
  const location = useLocation();
  const navigate  = useNavigate();
  const [name, setName] = useState("");
  const email = location.state?.email || "";

  const handleNext = () => {
    if (name.trim().length >= 2)
      navigate("/onboarding/goals", { state: { email, name: name.trim() } });
  };

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
          <div key={i} style={{ height:5,borderRadius:3,width:i===0?18:5,background:i===0?"#1d4ed8":"rgba(255,255,255,0.12)",transition:"all .3s" }} />
        ))}
      </motion.div>

      <motion.div initial={{ opacity:0,y:24 }} animate={{ opacity:1,y:0 }} transition={{ duration:.5,delay:.18 }}
        className="relative z-10 w-full" style={{ maxWidth:420 }}>
        <div style={{ background:"#0c0e13",border:"0.5px solid rgba(255,255,255,0.08)",borderRadius:20,padding:"28px 28px 24px" }}>

          <div style={{ marginBottom:24 }}>
            <h2 style={{ fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:"1.4rem",color:"#e8edf5",letterSpacing:"-0.03em",marginBottom:6 }}>
              Como podemos te chamar?
            </h2>
            <p style={{ fontSize:"0.82rem",color:"#6b7a96",lineHeight:1.6 }}>
              Vamos personalizar sua experiência financeira.
            </p>
          </div>

          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:"0.72rem",fontWeight:600,color:"#6b7a96",textTransform:"uppercase",letterSpacing:"0.1em",display:"block",marginBottom:6 }}>Nome ou apelido</label>
            <div style={{ position:"relative" }}>
              <User size={16} style={{ position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:"#3a4259" }} />
              <input
                type="text" placeholder="Ex: João, Ju, Rafa..." value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key==="Enter" && handleNext()}
                autoFocus
                style={{ width:"100%",background:"#12151c",border:"0.5px solid rgba(255,255,255,0.08)",borderRadius:10,padding:"12px 14px 12px 40px",color:"#e8edf5",fontSize:"0.95rem",outline:"none",fontFamily:"'Outfit',sans-serif",boxSizing:"border-box" }}
                onFocus={e => e.target.style.borderColor="rgba(37,99,235,0.5)"}
                onBlur={e => e.target.style.borderColor="rgba(255,255,255,0.08)"}
              />
            </div>
          </div>

          <button onClick={handleNext} disabled={name.trim().length < 2}
            style={{ width:"100%",background:name.trim().length<2?"#1a2e5a":"#1d4ed8",border:"none",borderRadius:12,padding:13,color:"#fff",fontSize:"1rem",fontWeight:700,fontFamily:"'Cabinet Grotesk',sans-serif",cursor:name.trim().length<2?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:name.trim().length<2?"none":"0 0 30px rgba(29,78,216,0.35)",transition:"all .2s",letterSpacing:"-0.01em" }}>
            Continuar <ArrowRight size={18} />
          </button>

          <p style={{ textAlign:"center",fontSize:"0.7rem",color:"#3a4259",marginTop:14 }}>Etapa 1 de 3</p>
        </div>
      </motion.div>
    </div>
  );
}