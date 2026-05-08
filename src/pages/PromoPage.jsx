        import React, { useState, useEffect } from "react";
        import { useSearchParams, useNavigate } from "react-router-dom";
        import { motion, AnimatePresence } from "framer-motion";
        import { Sparkles, CheckCircle, XCircle, Loader2, Gift, ArrowRight } from "lucide-react";
        import { supabase } from "@/lib/supabase";
        import { useAuth } from "@/lib/AuthContext";

        function useIsDark() {
        const [dark, setDark] = useState(() =>
            localStorage.getItem("darkMode") === "true" ||
            document.documentElement.classList.contains("dark")
        );
        useEffect(() => {
            const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
            obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
            return () => obs.disconnect();
        }, []);
        return dark;
        }

        export default function PromoPage() {
        const dark = useIsDark();
        const [searchParams] = useSearchParams();
        const navigate = useNavigate();
        const { user } = useAuth();

        const codeFromUrl = searchParams.get("code") || "";
        const [code, setCode] = useState(codeFromUrl.toUpperCase());
        const [status, setStatus] = useState("idle"); // idle | loading | valid | error | used | expired
        const [errorMsg, setErrorMsg] = useState("");
        const [promoData, setPromoData] = useState(null);

        // Auto-verifica se veio com código na URL
        useEffect(() => {
            if (codeFromUrl) handleVerify(codeFromUrl.toUpperCase());
        }, []);

        const handleVerify = async (codeToCheck = code) => {
            if (!codeToCheck.trim() || status === "loading") return;
            setStatus("loading");

            const { data: promo, error } = await supabase
            .from("promo_codes")
            .select("*")
            .eq("code", codeToCheck.trim().toUpperCase())
            .single();

            if (error || !promo) {
            setStatus("error");
            setErrorMsg("Código inválido. Verifique e tente novamente.");
            return;
            }

            if (promo.is_used) {
            setStatus("used");
            setErrorMsg("Este código já foi utilizado.");
            return;
            }

            if (new Date(promo.expires_at) < new Date()) {
            setStatus("expired");
            setErrorMsg("Este código expirou.");
            return;
            }

            // Código válido — salva e vai para assinatura
            setPromoData(promo);
            localStorage.setItem("pending_promo_code", codeToCheck.toUpperCase());
            localStorage.setItem("pending_promo_days", String(promo.trial_days));
            setStatus("valid");
        };

        const handleContinue = () => {
            if (user) {
            // Já logado — vai direto para assinatura
            navigate("/subscribe");
            } else {
            // Precisa criar conta primeiro
            navigate("/login");
            }
        };

        const bg    = dark ? "#060709" : "#f7f8fa";
        const card  = dark ? "#0c0e13" : "#ffffff";
        const text  = dark ? "#e8edf5" : "#0f172a";
        const muted = dark ? "#6b7a96" : "#64748b";
        const brd   = dark ? "rgba(255,255,255,0.07)" : "rgba(17,24,39,0.06)";
        const inputBg = dark ? "#12151c" : "#f8fafc";

        return (
            <div style={{ minHeight: "100vh", background: bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'Outfit',sans-serif" }}>
            <div style={{ width: "100%", maxWidth: 420 }}>

                {/* Logo */}
                <div style={{ textAlign: "center", marginBottom: 32 }}>
                <div style={{ width: 64, height: 64, borderRadius: 18, background: "linear-gradient(135deg,#1d4ed8,#3730a3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", boxShadow: "0 0 32px rgba(29,78,216,0.4)" }}>
                    <Sparkles size={28} color="#fff" />
                </div>
                <h1 style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 900, fontSize: "1.6rem", color: text, letterSpacing: "-0.03em", margin: 0 }}>
                    PlanejApp
                </h1>
                <p style={{ color: muted, fontSize: "0.82rem", marginTop: 4 }}>Brinde exclusivo do evento 🎁</p>
                </div>

                {/* Card */}
                <div style={{ background: card, border: `1px solid ${brd}`, borderRadius: 20, overflow: "hidden", boxShadow: dark ? "none" : "0 4px 24px rgba(17,24,39,0.08)" }}>

                {/* Banner */}
                <div style={{ background: "linear-gradient(135deg,#1d4ed8,#3730a3)", padding: "16px 20px", display: "flex", alignItems: "center", gap: 10 }}>
                    <Gift size={20} color="#fff" />
                    <div>
                    <p style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 800, fontSize: "0.95rem", color: "#fff", margin: 0 }}>
                        60 dias grátis
                    </p>
                    <p style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.7)", margin: 0 }}>
                        Evento de Empreendedorismo · Maio 2026
                    </p>
                    </div>
                </div>

                <div style={{ padding: 24 }}>
                    <AnimatePresence mode="wait">

                    {/* Input do código */}
                    {(status === "idle" || status === "loading") && (
                        <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <p style={{ fontSize: "0.82rem", color: muted, marginBottom: 16, lineHeight: 1.5 }}>
                            Digite o código que você recebeu para ativar <strong style={{ color: "#1d4ed8" }}>60 dias grátis</strong> do PlanejApp Pro.
                        </p>
                        <label style={{ fontSize: "0.65rem", fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>
                            Código promocional
                        </label>
                        <input
                            value={code}
                            onChange={e => setCode(e.target.value.toUpperCase())}
                            onKeyDown={e => e.key === "Enter" && handleVerify()}
                            placeholder="FINN-EV16-XXXX"
                            style={{ width: "100%", height: 48, padding: "0 14px", background: inputBg, border: `1px solid ${brd}`, borderRadius: 12, color: text, fontSize: "1rem", fontWeight: 700, fontFamily: "'Cabinet Grotesk',sans-serif", outline: "none", letterSpacing: "0.05em", boxSizing: "border-box", marginBottom: 12 }}
                        />
                        <button onClick={() => handleVerify()}
                            disabled={!code.trim() || status === "loading"}
                            style={{ width: "100%", height: 48, borderRadius: 12, border: "none", background: code.trim() ? "linear-gradient(135deg,#1d4ed8,#3730a3)" : (dark ? "rgba(255,255,255,0.06)" : "#f1f5f9"), color: code.trim() ? "#fff" : muted, fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 800, fontSize: "0.95rem", cursor: code.trim() ? "pointer" : "not-allowed", boxShadow: code.trim() ? "0 0 20px rgba(29,78,216,0.3)" : "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all .2s" }}>
                            {status === "loading"
                            ? <><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Verificando...</>
                            : <><Gift size={16} /> Verificar código</>}
                        </button>
                        </motion.div>
                    )}

                    {/* Código válido */}
                    {status === "valid" && (
                        <motion.div key="valid" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                        <div style={{ textAlign: "center", marginBottom: 20 }}>
                            <CheckCircle size={48} color="#10b981" style={{ margin: "0 auto 12px", display: "block" }} />
                            <h2 style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 800, fontSize: "1.1rem", color: text, marginBottom: 6 }}>
                            Código válido! 🎉
                            </h2>
                            <p style={{ fontSize: "0.8rem", color: muted, lineHeight: 1.5 }}>
                            Você ganhou <strong style={{ color: "#1d4ed8" }}>60 dias grátis</strong> do plano Pro!
                            </p>
                        </div>

                        {/* O que inclui */}
                        <div style={{ background: dark ? "#12151c" : "#f8fafc", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
                            <p style={{ fontSize: "0.68rem", fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
                            Plano Pro inclui:
                            </p>
                            {["✅ 60 dias grátis (em vez de 30)", "✅ Transações ilimitadas", "✅ IA Finn — consultor financeiro", "✅ Compartilhamento com família", "✅ Relatórios e metas", "💳 R$12,90/mês após o período"].map((item, i) => (
                            <p key={i} style={{ fontSize: "0.78rem", color: i < 5 ? text : muted, marginBottom: 4 }}>{item}</p>
                            ))}
                        </div>

                        <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 10, padding: "8px 12px", marginBottom: 16, fontSize: "0.72rem", color: "#92400e" }}>
                            💳 Cartão necessário para ativar. Cancele antes dos 60 dias sem cobrança.
                        </div>

                        <button onClick={handleContinue}
                            style={{ width: "100%", height: 48, borderRadius: 12, border: "none", background: "linear-gradient(135deg,#1d4ed8,#3730a3)", color: "#fff", fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 800, fontSize: "0.92rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 0 20px rgba(29,78,216,0.3)" }}>
                            {user ? "Ativar agora" : "Criar conta e ativar"} <ArrowRight size={16} />
                        </button>
                        </motion.div>
                    )}

                    {/* Erro / usado / expirado */}
                    {(status === "error" || status === "used" || status === "expired") && (
                        <motion.div key="error" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: "center" }}>
                        <XCircle size={48} color="#ef4444" style={{ margin: "0 auto 12px", display: "block" }} />
                        <h2 style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 800, fontSize: "1rem", color: text, marginBottom: 6 }}>
                            {status === "used" ? "Código já utilizado" : status === "expired" ? "Código expirado" : "Código inválido"}
                        </h2>
                        <p style={{ fontSize: "0.8rem", color: muted, marginBottom: 20 }}>{errorMsg}</p>
                        <button onClick={() => { setStatus("idle"); setCode(""); }}
                            style={{ width: "100%", height: 44, borderRadius: 12, border: `1px solid ${brd}`, background: "transparent", color: muted, fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 700, fontSize: "0.88rem", cursor: "pointer" }}>
                            Tentar outro código
                        </button>
                        </motion.div>
                    )}

                    </AnimatePresence>
                </div>
                </div>

                <p style={{ textAlign: "center", fontSize: "0.68rem", color: muted, marginTop: 16 }}>
                Código de uso único · Exclusivo para participantes do evento 🔒
                </p>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
        }