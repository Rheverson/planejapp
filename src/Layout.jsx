import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "./utils";
import { motion } from "framer-motion";
import { Home, ArrowLeftRight, Wallet, Target, Sparkles, User } from "lucide-react";

const navItems = [
  { name: "Home",       icon: Home,          page: "Home"         },
  { name: "Transações", icon: ArrowLeftRight, page: "Transactions" },
  // centro = Finn
  { name: "Metas",      icon: Target,        page: "Goals"        },
  { name: "Contas",     icon: Wallet,        page: "Accounts"     },
];

// Páginas onde o ícone de perfil NÃO aparece
const HIDE_PROFILE_ICON = ["AIInsights", "Profile"];

export default function Layout({ children, currentPageName }) {
  const [darkMode, setDarkMode] = useState(false);
  const navigate = useNavigate();
  const isAIActive = currentPageName === "AIInsights";
  const showProfileIcon = !HIDE_PROFILE_ICON.includes(currentPageName);

  useEffect(() => {
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    setDarkMode(savedDarkMode);
    if (savedDarkMode) document.documentElement.classList.add('dark');
    const handleDarkModeChange = (e) => {
      const isDark = e.detail;
      setDarkMode(isDark);
      if (isDark) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    };
    window.addEventListener('darkModeChange', handleDarkModeChange);
    return () => window.removeEventListener('darkModeChange', handleDarkModeChange);
  }, []);

  const leftItems  = navItems.slice(0, 2); // Home, Transações
  const rightItems = navItems.slice(2);    // Metas, Contas

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      <style>{`
        :root { --primary: 217 91% 60%; --primary-foreground: 210 40% 98%; }
        * { -webkit-tap-highlight-color: transparent; }
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .finn-glow {
          box-shadow: 0 0 20px rgba(139, 92, 246, 0.5), 0 4px 24px rgba(99, 102, 241, 0.4);
        }
        .finn-glow-active {
          box-shadow: 0 0 30px rgba(139, 92, 246, 0.7), 0 4px 32px rgba(99, 102, 241, 0.6);
        }
      `}</style>

      {/* Ícone de perfil flutuante no canto superior direito */}
      {showProfileIcon && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="fixed top-0 right-0 z-40"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)', right: '16px' }}
        >
          <Link to={createPageUrl("Profile")}>
            <motion.div
              whileTap={{ scale: 0.9 }}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all shadow-md ${
                currentPageName === 'Profile'
                  ? 'bg-blue-600 shadow-blue-200 dark:shadow-blue-900'
                  : 'bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-gray-200 dark:shadow-gray-900'
              }`}
            >
              <User className={`w-4 h-4 ${
                currentPageName === 'Profile'
                  ? 'text-white'
                  : 'text-gray-600 dark:text-gray-300'
              }`} />
            </motion.div>
          </Link>
        </motion.div>
      )}

      <main
        className="dark:bg-gray-900"
        style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px))' }}
      >
        {children}
      </main>

      <motion.nav
        initial={{ y: 100 }} animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur-lg border-t border-gray-200/50 dark:border-gray-700/50 z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Grid simétrico: 2 + centro(72px) + 2 */}
        <div
          className="max-w-lg mx-auto relative"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 72px 1fr 1fr',
            height: '64px',
          }}
        >
          {/* Left items */}
          {leftItems.map((item) => {
            const isActive = currentPageName === item.page;
            return (
              <Link key={item.page} to={createPageUrl(item.page)}
                className="flex flex-col items-center justify-center h-full relative">
                {isActive && (
                  <motion.div layoutId="activeIndicator"
                    className="absolute top-0 h-0.5 w-8 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-b-full"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }} />
                )}
                <div className={`p-1.5 rounded-xl transition-all duration-300 ${isActive ? 'bg-blue-50 dark:bg-blue-900/40' : ''}`}>
                  <item.icon className={`w-5 h-5 transition-colors duration-300 ${
                    isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'
                  }`} />
                </div>
                <span className={`text-[10px] mt-0.5 transition-all duration-300 ${
                  isActive ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-gray-400 dark:text-gray-500'
                }`}>{item.name}</span>
              </Link>
            );
          })}

          {/* Centro — Finn */}
          <div className="relative flex items-end justify-center pb-1">
            <motion.button
              whileTap={{ scale: 0.92 }}
              whileHover={{ scale: 1.05 }}
              onClick={() => navigate(createPageUrl('AIInsights'))}
              className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 relative ${
                isAIActive ? 'finn-glow-active' : 'finn-glow'
              } bg-gradient-to-br from-violet-500 via-purple-600 to-indigo-600`}
              style={{ marginBottom: '4px' }}
            >
              {isAIActive && (
                <motion.div
                  className="absolute inset-0 rounded-2xl bg-violet-400"
                  animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0, 0.4] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              )}
              <motion.div
                animate={{ rotate: isAIActive ? [0, 10, -10, 0] : 0 }}
                transition={{ duration: 2, repeat: isAIActive ? Infinity : 0, repeatDelay: 3 }}
              >
                <Sparkles className="w-7 h-7 text-white relative z-10" />
              </motion.div>
            </motion.button>

            {/* Label Finn abaixo da nav */}
            <span
              className={`absolute text-[10px] font-bold transition-colors duration-300 ${
                isAIActive ? 'text-violet-600 dark:text-violet-400' : 'text-gray-500 dark:text-gray-400'
              }`}
              style={{ bottom: '-2px' }}
            >
              Finn
            </span>
          </div>

          {/* Right items */}
          {rightItems.map((item) => {
            const isActive = currentPageName === item.page;
            return (
              <Link key={item.page} to={createPageUrl(item.page)}
                className="flex flex-col items-center justify-center h-full relative">
                {isActive && (
                  <motion.div layoutId="activeIndicator"
                    className="absolute top-0 h-0.5 w-8 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-b-full"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }} />
                )}
                <div className={`p-1.5 rounded-xl transition-all duration-300 ${isActive ? 'bg-blue-50 dark:bg-blue-900/40' : ''}`}>
                  <item.icon className={`w-5 h-5 transition-colors duration-300 ${
                    isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'
                  }`} />
                </div>
                <span className={`text-[10px] mt-0.5 transition-all duration-300 ${
                  isActive ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-gray-400 dark:text-gray-500'
                }`}>{item.name}</span>
              </Link>
            );
          })}
        </div>
      </motion.nav>
    </div>
  );
}