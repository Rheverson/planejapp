import { mensagemDeErro } from "@/lib/erros";
import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { motion } from "framer-motion";
import { Check, Users, Zap, LogOut, CheckCircle2, Lock, XCircle, Loader2, Gift, Sparkles, ChevronRight } from "lucide-react";
import { toast } from "sonner";

export default function Subscribe() {
  const { user, signOut } = useAuth();
  const [referralCode, setReferralCode]     = useState('');
  const [referralLocked, setReferralLocked] = useState(false);
  const [referralValid, setReferralValid]   = useState(null);
  const [validating, setValidating]         = useState(false);
  const [loading, setLoading]               = useState(false);

  const promoCode = localStorage.getItem("pending_promo_code") || "";
  const promoDays = parseInt(localStorage.getItem("pending_promo_days") || "0");
  const isPromo   = !!promoCode && promoDays > 30;
  const trialDays = isPromo ? promoDays : 30;

  useEffect(() => {
    const saved = localStorage.getItem('referral_code');
    if (saved && !isPromo) {
      setReferralCode(saved.toUpperCase());
      setReferralLocked(true);
      validateCode(saved.toUpperCase());
    }
  }, []);

  const validateCode = async (code) => {
    if (!code || code.length < 8) { setReferralValid(null); return; }
    setValidating(true);
    try {
      const { data, error } = await supabase.rpc('validate_referral_code', { code: code.toUpperCase().trim() });
      if (error || !data) { setReferralValid(false); setReferralLocked(false); localStorage.removeItem('referral_code'); }
      else if (data === user?.id) { setReferralValid(false); setReferralLocked(false); localStorage.removeItem('referral_code'); }
      else setReferralValid(true);
    } catch { setReferralValid(false); }
    finally { setValidating(false); }
  };

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Você precisa estar logado"); setLoading(false); return; }
      if (!isPromo && referralCode && referralCode.trim() !== '' && referralValid === false) {
        toast.error("Código de indicação inválido.");
        setReferralCode(''); setReferralLocked(false);
        localStorage.removeItem('referral_code');
        setLoading(false); return;
      }
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          userId: session.user.id,
          email: session.user.email,
          referralCode: !isPromo ? (referralCode || null) : null,
          promoCode: isPromo ? promoCode : null,
          trialDays: trialDays,
        },
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (error) throw error;
      if (!data?.url) throw new Error("URL não retornada");
      window.location.href = data.url;
    } catch (err) {
      toast.error(mensagemDeErro(err));
    } finally { setLoading(false); }
  };

  const handleCodeChange = (e) => {
    const val = e.target.value.toUpperCase();
    setReferralCode(val); setReferralValid(null);
    if (val.length === 8) validateCode(val);
  };

  const features = [
    isPromo ? `${trialDays} dias grátis (brinde do evento)` : "30 dias grátis para testar",
    "Transações ilimitadas",
    "IA Finn — consultor financeiro",
    "Compartilhamento de finanças",
    "Relatórios e metas completos",
    "Suporte prioritário",
  ];

  const accentColor = isPromo ? "#a78bfa" : "#60a5fa";
  const btnBg       = isPromo ? "#7c3aed" : "#1d4ed8";
  const btnGlow     = isPromo ? "rgba(124,58,237,0.4)"   : "rgba(29,78,216,0.4)";

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 relative overflow-hidden"
      style={{ background: "linear-gradient(170deg,#0d1829 0%,#060709 50%)" }}>

      {/* Orbs */}
      <div className="absolute pointer-events-none" style={{ width:500,height:300,borderRadius:"50%",background:isPromo?"rgba(124,58,237,0.15)":"rgba(29,78,216,0.18)",top:-80,left:"50%",transform:"translateX(-50%)",filter:"blur(80px)" }} />
      <div className="absolute pointer-events-none" style={{ width:250,height:250,borderRadius:"50%",background:"rgba(55,48,163,0.1)",bottom:"15%",right:"-40px",filter:"blur(60px)" }} />

      {/* Logo */}
      <motion.div initial={{ opacity:0,y:-16 }} animate={{ opacity:1,y:0 }} transition={{ duration:.5 }}
        className="flex items-center gap-2 mb-6 relative z-10">
        <div style={{ width:9,height:9,borderRadius:"50%",background:accentColor,marginTop:2 }} />
        <span style={{ fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:"1.6rem",color:"#e8edf5",letterSpacing:"-0.04em" }}>PlanejeApp</span>
      </motion.div>

      <motion.div initial={{ opacity:0,y:24 }} animate={{ opacity:1,y:0 }} transition={{ duration:.5,delay:.1 }}
        className="relative z-10 w-full" style={{ maxWidth:420 }}>
        <div style={{ background:"#0c0e13",border:"0.5px solid rgba(255,255,255,0.08)",borderRadius:20,overflow:"hidden" }}>

          {/* Header */}
          <div style={{ background:`linear-gradient(135deg,${isPromo?"#4c1d95,#6d28d9":"#1e3a8a,#1d4ed8"})`,padding:"20px 24px 16px" }}>
            {/* Usuário */}
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16 }}>
              <div>
                <p style={{ fontSize:"0.7rem",color:"rgba(255,255,255,0.5)",marginBottom:2 }}>Logado como</p>
                <p style={{ fontSize:"0.82rem",color:"#fff",fontWeight:600,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{user?.email}</p>
              </div>
              <button onClick={async () => { await signOut(); }}
                style={{ display:"flex",alignItems:"center",gap:6,padding:"6px 12px",background:"rgba(255,255,255,0.12)",border:"0.5px solid rgba(255,255,255,0.2)",borderRadius:10,color:"rgba(255,255,255,0.8)",fontSize:"0.75rem",fontWeight:600,cursor:"pointer",fontFamily:"'Outfit',sans-serif" }}>
                <LogOut size={13}/> Sair
              </button>
            </div>

            {/* Steps */}
            <div style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:16 }}>
              {[{label:"Cadastro",done:true},{label:"Plano",active:true},{label:"Pagamento"}].map((s,i)=>(
                <React.Fragment key={i}>
                  <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                    <div style={{ width:22,height:22,borderRadius:"50%",background:s.done||s.active?"rgba(255,255,255,0.9)":"rgba(255,255,255,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.65rem",fontWeight:700,color:s.done||s.active?"#1d4ed8":"rgba(255,255,255,0.5)" }}>
                      {s.done ? <Check size={11}/> : i+1}
                    </div>
                    <span style={{ fontSize:"0.72rem",color:s.active||s.done?"#fff":"rgba(255,255,255,0.5)",fontWeight:s.active||s.done?600:400 }}>{s.label}</span>
                  </div>
                  {i<2 && <div style={{ width:20,height:"0.5px",background:"rgba(255,255,255,0.2)" }}/>}
                </React.Fragment>
              ))}
            </div>

            {/* Badge promo */}
            {isPromo && (
              <div style={{ display:"flex",justifyContent:"center",marginBottom:12 }}>
                <div style={{ display:"inline-flex",alignItems:"center",gap:6,background:"rgba(255,255,255,0.15)",border:"0.5px solid rgba(255,255,255,0.25)",borderRadius:999,padding:"4px 12px" }}>
                  <Gift size={13} color="#fcd34d"/>
                  <span style={{ fontSize:"0.72rem",fontWeight:700,color:"#fff" }}>Código do evento ativo!</span>
                </div>
              </div>
            )}

            {/* Ícone + título */}
            <div style={{ textAlign:"center" }}>
              <div style={{ width:52,height:52,background:"rgba(255,255,255,0.15)",borderRadius:16,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 10px" }}>
                {isPromo ? <Sparkles size={26} color="#fff"/> : <Zap size={26} color="#fff"/>}
              </div>
              <h1 style={{ fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:"1.3rem",color:"#fff",letterSpacing:"-0.03em",marginBottom:4 }}>PlanejApp Pro</h1>
              <p style={{ fontSize:"0.78rem",color:"rgba(255,255,255,0.6)" }}>
                {isPromo ? `🎉 ${trialDays} dias grátis — exclusivo do evento` : "30 dias grátis, cancele quando quiser"}
              </p>
            </div>
          </div>

          {/* Body */}
          <div style={{ padding:"20px 24px 24px",display:"flex",flexDirection:"column",gap:18 }}>

            {/* Preço */}
            <div style={{ textAlign:"center" }}>
              <div style={{ display:"flex",alignItems:"flex-end",justifyContent:"center",gap:2 }}>
                <span style={{ fontSize:"0.85rem",color:"#6b7a96",marginBottom:6 }}>R$</span>
                <span style={{ fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:"3rem",color:"#e8edf5",letterSpacing:"-0.04em",lineHeight:1 }}>12</span>
                <span style={{ fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:"1.8rem",color:"#e8edf5",marginBottom:4 }}>,90</span>
                <span style={{ fontSize:"0.85rem",color:"#6b7a96",marginBottom:6 }}>/mês</span>
              </div>
              <p style={{ fontSize:"0.75rem",fontWeight:600,color:accentColor,marginTop:4 }}>
                {isPromo ? `✓ ${trialDays} dias grátis · Depois R$12,90/mês` : "✓ Primeiro mês grátis · Cancele quando quiser"}
              </p>
            </div>

            {/* Features */}
            <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
              {features.map((item,i) => (
                <div key={item} style={{ display:"flex",alignItems:"center",gap:10 }}>
                  <div style={{ width:18,height:18,borderRadius:6,background:i===0&&isPromo?"rgba(167,139,250,0.15)":"rgba(46,204,138,0.12)",border:`0.5px solid ${i===0&&isPromo?"rgba(167,139,250,0.3)":"rgba(46,204,138,0.3)"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                    <Check size={11} color={i===0&&isPromo?"#a78bfa":"#2ecc8a"}/>
                  </div>
                  <span style={{ fontSize:"0.82rem",color:i===0&&isPromo?"#a78bfa":"#6b7a96",fontWeight:i===0&&isPromo?600:400 }}>{item}</span>
                </div>
              ))}
            </div>

            {/* Referral — só se não for promo */}
            {!isPromo && (
              <>
                <div style={{ background:"rgba(245,158,11,0.07)",border:"0.5px solid rgba(245,158,11,0.2)",borderRadius:12,padding:"12px 14px" }}>
                  <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:8 }}>
                    <Users size={14} color="#f59e0b"/>
                    <p style={{ fontSize:"0.8rem",fontWeight:700,color:"#f59e0b" }}>Indique e ganhe descontos</p>
                  </div>
                  {["1 indicado → 25% off","2 indicados → 50% off","3 indicados → 75% off","4+ indicados → 100% grátis 🎉"].map(t=>(
                    <p key={t} style={{ fontSize:"0.72rem",color:"#6b7a96",marginBottom:3 }}>• {t}</p>
                  ))}
                </div>

                <div>
                  <label style={{ fontSize:"0.68rem",fontWeight:600,color:"#6b7a96",textTransform:"uppercase",letterSpacing:"0.1em",display:"block",marginBottom:6 }}>
                    Código de indicação (opcional)
                  </label>
                  <div style={{ position:"relative" }}>
                    <input
                      placeholder="Ex: AB12CD34" value={referralCode} onChange={handleCodeChange}
                      maxLength={8} readOnly={referralLocked && referralValid===true}
                      style={{ width:"100%",background:"#12151c",border:`0.5px solid ${referralValid===true?"rgba(46,204,138,0.5)":referralValid===false?"rgba(232,93,93,0.5)":"rgba(255,255,255,0.08)"}`,borderRadius:10,padding:"11px 40px 11px 14px",color:referralValid===true?"#2ecc8a":referralValid===false?"#e85d5d":"#e8edf5",fontSize:"0.9rem",fontWeight:referralValid===true?700:400,outline:"none",fontFamily:"'Outfit',sans-serif",textTransform:"uppercase",letterSpacing:"0.05em",boxSizing:"border-box" }}
                    />
                    <div style={{ position:"absolute",right:12,top:"50%",transform:"translateY(-50%)" }}>
                      {validating && <Loader2 size={16} color="#6b7a96" className="animate-spin"/>}
                      {!validating && referralValid===true  && <Lock     size={15} color="#2ecc8a"/>}
                      {!validating && referralValid===false && <XCircle  size={15} color="#e85d5d"/>}
                    </div>
                  </div>
                  {!validating && referralValid===true && (
                    <p style={{ fontSize:"0.72rem",color:"#2ecc8a",marginTop:5,fontWeight:600,display:"flex",alignItems:"center",gap:4 }}>
                      <CheckCircle2 size={12}/> Código válido!
                    </p>
                  )}
                </div>
              </>
            )}

            {/* Botão */}
            <button onClick={handleSubscribe}
              disabled={loading||validating||(!isPromo&&referralValid===false)}
              style={{ width:"100%",background:loading||validating?"#1a2e5a":btnBg,border:"none",borderRadius:12,padding:"14px",color:"#fff",fontSize:"1rem",fontWeight:700,fontFamily:"'Cabinet Grotesk',sans-serif",cursor:loading||validating?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:loading?"none":`0 0 30px ${btnGlow}`,transition:"all .2s",letterSpacing:"-0.01em",opacity:!isPromo&&referralValid===false?0.5:1 }}>
              {loading ? <><Loader2 size={18} className="animate-spin"/> Aguarde...</>
                : isPromo ? <>{`🎉 Ativar ${trialDays} dias grátis`}<ChevronRight size={18}/></>
                : <>Começar 30 dias grátis <ChevronRight size={18}/></>}
            </button>

            <p style={{ textAlign:"center",fontSize:"0.7rem",color:"#3a4259" }}>
              Cartão necessário. Cancele antes dos {trialDays} dias e não será cobrado.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}