import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "./utils";
import { motion, AnimatePresence } from "framer-motion";
import { Home, ArrowLeftRight, Wallet, Target, Sparkles, User } from "lucide-react";
import { usePhoneVerification } from "@/hooks/usePhoneVerification";
import PhoneVerificationModal from "@/components/profile/PhoneVerificationModal";

const navItems = [
  { name: "Home",       icon: Home,          page: "Home"         },
  { name: "Transações", icon: ArrowLeftRight, page: "Transactions" },
  { name: "Metas",      icon: Target,        page: "Goals"        },
  { name: "Contas",     icon: Wallet,        page: "Accounts"     },
];

const HIDE_PROFILE_ICON = ["AIInsights", "Profile"];
const NAV_HEIGHT = 68;

export default function Layout({ children, currentPageName }) {
  const [dark, setDark] = useState(() => localStorage.getItem("darkMode") === "true");
  const navigate   = useNavigate();
  const isAIActive = currentPageName === "AIInsights";
  const showProfileIcon = !HIDE_PROFILE_ICON.includes(currentPageName);
  const { showPhoneModal, setShowPhoneModal } = usePhoneVerification();

  useEffect(() => {
    const saved = localStorage.getItem("darkMode") === "true";
    setDark(saved);
    if (saved) document.documentElement.classList.add("dark");
    const h = (e) => {
      setDark(e.detail);
      if (e.detail) document.documentElement.classList.add("dark");
      else          document.documentElement.classList.remove("dark");
    };
    window.addEventListener("darkModeChange", h);
    return () => window.removeEventListener("darkModeChange", h);
  }, []);

  const leftItems  = navItems.slice(0, 2);
  const rightItems = navItems.slice(2);

  // ── Tokens ──────────────────────────────────────────────────
  const navBg   = dark ? "rgba(6,7,9,0.97)"   : "rgba(255,255,255,0.97)";
  const navBrd  = dark ? "rgba(255,255,255,0.07)" : "rgba(17,24,39,0.07)";
  const activeC = "#1d4ed8";                    // azul da paleta
  const mutedC  = dark ? "#4b5a78" : "#94a3b8"; // ícones inativos
  const activeBg = dark ? "rgba(29,78,216,0.12)" : "rgba(29,78,216,0.07)";

  const NavItem = ({ item }) => {
    const isActive = currentPageName === item.page;
    return (
      <Link to={createPageUrl(item.page)} style={{ textDecoration: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", position: "relative", flex: 1 }}>
        {/* Indicador topo */}
        {isActive && (
          <motion.div
            layoutId="navIndicator"
            style={{ position: "absolute", top: 0, height: 2.5, width: 28, background: "linear-gradient(90deg,#1d4ed8,#3730a3)", borderRadius: "0 0 4px 4px" }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
          />
        )}
        {/* Ícone */}
        <motion.div
          whileTap={{ scale: 0.85 }}
          style={{ padding: "6px 10px", borderRadius: 12, background: isActive ? activeBg : "transparent", transition: "background .2s" }}
        >
          <item.icon
            size={20}
            color={isActive ? activeC : mutedC}
            strokeWidth={isActive ? 2.2 : 1.8}
          />
        </motion.div>
        {/* Label */}
        <span style={{
          fontSize: "0.6rem", marginTop: 2, fontWeight: isActive ? 700 : 500,
          color: isActive ? activeC : mutedC,
          fontFamily: "'Outfit',sans-serif",
          letterSpacing: isActive ? "0" : "0.01em",
          transition: "color .2s",
        }}>
          {item.name}
        </span>
      </Link>
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: dark ? "#060709" : "#f1f4f9", transition: "background .2s", fontFamily: "'Outfit',sans-serif" }}>
      <style>{`
        * { -webkit-tap-highlight-color: transparent; }
        body { -webkit-font-smoothing: antialiased; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

        /* Cabinet Grotesk via Google Fonts — garante carregamento global */
        @import url('https://fonts.googleapis.com/css2?family=Cabinet+Grotesk:wght@400;500;700;800;900&family=Outfit:wght@300;400;500;600;700&display=swap');
      `}</style>

      {/* Botão de perfil flutuante */}
      {showProfileIcon && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{ position: "fixed", zIndex: 40, top: 44, right: 16 }}
        >
          <Link to={createPageUrl("Profile")}>
            <motion.div
              whileTap={{ scale: 0.88 }}
              style={{
                width: 34, height: 34, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(255,255,255,0.18)",
                border: "1px solid rgba(255,255,255,0.28)",
                backdropFilter: "blur(8px)",
              }}
            >
              <User size={15} color="#ffffff" />
            </motion.div>
          </Link>
        </motion.div>
      )}

      {/* Conteúdo */}
      <main style={{
        paddingBottom: currentPageName === "AIInsights"
          ? "0"
          : `calc(${NAV_HEIGHT}px + 28px + env(safe-area-inset-bottom, 0px))`,
      }}>
        {children}
      </main>

      {/* ══ BARRA DE NAVEGAÇÃO INFERIOR ════════════════════════ */}
      <motion.nav
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
          background: navBg,
          borderTop: `1px solid ${navBrd}`,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          boxShadow: dark
            ? "0 -4px 24px rgba(0,0,0,0.4)"
            : "0 -4px 24px rgba(17,24,39,0.06)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          overflow: "visible",
        }}
      >
        <div style={{
          maxWidth: 480, margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "1fr 1fr 64px 1fr 1fr",
          height: NAV_HEIGHT,
          position: "relative",
        }}>
          {/* Itens esquerda */}
          {leftItems.map(item => <NavItem key={item.page} item={item} />)}

          {/* Finn — botão central elevado */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", paddingBottom: 8, position: "relative" }}>
            <span style={{
              fontSize: "0.6rem", fontWeight: 700,
              color: isAIActive ? "#a78bfa" : mutedC,
              marginBottom: 4, fontFamily: "'Outfit',sans-serif",
              transition: "color .2s",
            }}>
              Finn
            </span>
            <motion.button
              whileTap={{ scale: 0.9 }}
              whileHover={{ scale: 1.05 }}
              onClick={() => navigate(createPageUrl("AIInsights"))}
              style={{
                position: "absolute",
                bottom: 14,
                width: 56, height: 56,
                borderRadius: 18,
                border: "none", cursor: "pointer",
                background: "linear-gradient(135deg,#7c3aed,#6d28d9,#4338ca)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: isAIActive
                  ? "0 0 28px rgba(124,58,237,0.7), 0 4px 20px rgba(99,102,241,0.5)"
                  : "0 0 16px rgba(124,58,237,0.4), 0 4px 14px rgba(99,102,241,0.3)",
                transition: "box-shadow .3s",
              }}
            >
              {/* Pulse quando ativo */}
              {isAIActive && (
                <motion.div
                  animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  style={{ position: "absolute", inset: 0, borderRadius: 18, background: "rgba(139,92,246,0.4)" }}
                />
              )}
              <motion.div
                animate={{ rotate: isAIActive ? [0, 8, -8, 0] : 0 }}
                transition={{ duration: 2, repeat: isAIActive ? Infinity : 0, repeatDelay: 3 }}
              >
                <Sparkles size={22} color="#ffffff" style={{ position: "relative", zIndex: 1 }} />
              </motion.div>
            </motion.button>
          </div>

          {/* Itens direita */}
          {rightItems.map(item => <NavItem key={item.page} item={item} />)}
        </div>
      </motion.nav>

      <AnimatePresence>
        {showPhoneModal && (
          <PhoneVerificationModal
            required={true}
            onClose={() => setShowPhoneModal(false)}
            onSuccess={() => setShowPhoneModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}