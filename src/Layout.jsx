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
  { name: "Carteira",   icon: Wallet,        page: "Accounts"     },
];

const HIDE_PROFILE_ICON = ["AIInsights", "Profile"];
const NAV_HEIGHT = 68;

export default function Layout({ children, currentPageName }) {
  const [darkMode, setDarkMode] = useState(false);
  const navigate = useNavigate();
  const isAIActive = currentPageName === "AIInsights";
  const showProfileIcon = !HIDE_PROFILE_ICON.includes(currentPageName);

  const { showPhoneModal, setShowPhoneModal } = usePhoneVerification();

  useEffect(() => {
    const savedDarkMode = localStorage.getItem("darkMode") === "true";
    setDarkMode(savedDarkMode);
    if (savedDarkMode) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");

    const handleDarkModeChange = (e) => {
      const isDark = e.detail;
      setDarkMode(isDark);
      if (isDark) document.documentElement.classList.add("dark");
      else document.documentElement.classList.remove("dark");
    };
    window.addEventListener("darkModeChange", handleDarkModeChange);
    return () => window.removeEventListener("darkModeChange", handleDarkModeChange);
  }, []);

  const leftItems  = navItems.slice(0, 2);
  const rightItems = navItems.slice(2);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      <style>{`
        :root { --primary: 217 91% 60%; --primary-foreground: 210 40% 98%; }
        * { -webkit-tap-highlight-color: transparent; }
        body { font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        /* Finn button — azul landing */
        .finn-glow        { box-shadow: 0 0 22px rgba(29,78,216,0.5), 0 4px 20px rgba(55,48,163,0.4); }
        .finn-glow-active { box-shadow: 0 0 32px rgba(29,78,216,0.75), 0 4px 28px rgba(55,48,163,0.6); }
        /* Dark mode — fundo preto estilo landing */
        .dark body { background: #060709; }
        .dark .dark\:bg-gray-900 { background: #060709 !important; }
        .dark .dark\:bg-gray-800 { background: #0c0e13 !important; }
        .dark .dark\:bg-gray-700\/60 { background: rgba(12,14,19,0.8) !important; }
        .dark .dark\:border-gray-700 { border-color: rgba(255,255,255,0.07) !important; }
      `}</style>

      {/* Ícone de perfil flutuante */}
      {showProfileIcon && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="fixed z-40"
          style={{ top: "44px", right: "16px" }}
        >
          <Link to={createPageUrl("Profile")}>
            <motion.div
              whileTap={{ scale: 0.9 }}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-white/20 border border-white/30"
            >
              <User className="w-4 h-4 text-white" />
            </motion.div>
          </Link>
        </motion.div>
      )}

      <main
        className="dark:bg-gray-900"
        style={{
          paddingBottom: currentPageName === "AIInsights"
            ? "0"
            : `calc(${NAV_HEIGHT}px + 28px + env(safe-area-inset-bottom, 0px))`
        }}
      >
        {children}
      </main>

      {/* Navbar */}
      <motion.nav
        initial={{ y: 100 }} animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed bottom-0 left-0 right-0 z-50 overflow-visible"
        style={{
          background: darkMode ? "rgba(6,7,9,0.95)" : "rgba(255,255,255,0.95)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderTop: darkMode ? "0.5px solid rgba(255,255,255,0.07)" : "1px solid rgba(229,231,235,0.8)",
          boxShadow: darkMode ? "none" : "0 -4px 20px rgba(0,0,0,0.05)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div
          className="max-w-lg mx-auto relative"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 60px 1fr 1fr",
            height: `${NAV_HEIGHT}px`,
          }}
        >
          {leftItems.map((item) => {
            const isActive = currentPageName === item.page;
            const activeColor = darkMode ? "#60a5fa" : "text-blue-600";
            const inactiveColor = darkMode ? "#3a4259" : "#9ca3af";
            return (
              <Link key={item.page} to={createPageUrl(item.page)}
                className="flex flex-col items-center justify-center h-full relative no-underline">
                {isActive && (
                  <motion.div layoutId="activeIndicator"
                    className="absolute top-0 h-0.5 w-8 rounded-b-full"
                    style={{ background: "linear-gradient(90deg, #1d4ed8, #3730a3)" }}
                    transition={{ type: "spring", stiffness: 380, damping: 30 }} />
                )}
                <div className={`p-1.5 rounded-xl transition-all duration-300`}
                  style={{ background: isActive ? (darkMode ? "rgba(29,78,216,0.15)" : "rgba(29,78,216,0.08)") : "transparent" }}>
                  <item.icon
                    className="w-5 h-5 transition-colors duration-300"
                    style={{ color: isActive ? (darkMode ? "#60a5fa" : "#1d4ed8") : (darkMode ? "#3a4259" : "#9ca3af") }}
                  />
                </div>
                <span
                  className="text-[10px] mt-0.5 transition-all duration-300"
                  style={{
                    color: isActive ? (darkMode ? "#60a5fa" : "#1d4ed8") : (darkMode ? "#3a4259" : "#9ca3af"),
                    fontWeight: isActive ? 700 : 400,
                  }}
                >{item.name}</span>
              </Link>
            );
          })}

          {/* Finn — botão azul landing */}
          <div className="flex flex-col items-center justify-end pb-1 relative">
            <span
              className="text-[10px] font-bold mb-0.5 transition-colors duration-300"
              style={{ color: isAIActive ? "#60a5fa" : (darkMode ? "#3a4259" : "#9ca3af") }}
            >Finn</span>
            <motion.button
              whileTap={{ scale: 0.92 }}
              whileHover={{ scale: 1.05 }}
              onClick={() => navigate(createPageUrl("AIInsights"))}
              className={`absolute bottom-6 w-14 h-14 rounded-2xl flex items-center justify-center border-none cursor-pointer ${isAIActive ? "finn-glow-active" : "finn-glow"}`}
              style={{ background: "linear-gradient(135deg, #1d4ed8 0%, #3730a3 60%, #4c1d95 100%)" }}
            >
              {isAIActive && (
                <motion.div
                  className="absolute inset-0 rounded-2xl"
                  style={{ background: "rgba(96,165,250,0.3)" }}
                  animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0, 0.4] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              )}
              <motion.div
                animate={{ rotate: isAIActive ? [0, 10, -10, 0] : 0 }}
                transition={{ duration: 2, repeat: isAIActive ? Infinity : 0, repeatDelay: 3 }}
              >
                <Sparkles className="w-6 h-6 text-white relative z-10" />
              </motion.div>
            </motion.button>
          </div>

          {rightItems.map((item) => {
            const isActive = currentPageName === item.page;
            return (
              <Link key={item.page} to={createPageUrl(item.page)}
                className="flex flex-col items-center justify-center h-full relative no-underline">
                {isActive && (
                  <motion.div layoutId="activeIndicator"
                    className="absolute top-0 h-0.5 w-8 rounded-b-full"
                    style={{ background: "linear-gradient(90deg, #1d4ed8, #3730a3)" }}
                    transition={{ type: "spring", stiffness: 380, damping: 30 }} />
                )}
                <div className="p-1.5 rounded-xl transition-all duration-300"
                  style={{ background: isActive ? (darkMode ? "rgba(29,78,216,0.15)" : "rgba(29,78,216,0.08)") : "transparent" }}>
                  <item.icon
                    className="w-5 h-5 transition-colors duration-300"
                    style={{ color: isActive ? (darkMode ? "#60a5fa" : "#1d4ed8") : (darkMode ? "#3a4259" : "#9ca3af") }}
                  />
                </div>
                <span
                  className="text-[10px] mt-0.5 transition-all duration-300"
                  style={{
                    color: isActive ? (darkMode ? "#60a5fa" : "#1d4ed8") : (darkMode ? "#3a4259" : "#9ca3af"),
                    fontWeight: isActive ? 700 : 400,
                  }}
                >{item.name}</span>
              </Link>
            );
          })}
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