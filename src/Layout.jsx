import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "./utils";
import { motion } from "framer-motion";
import { Home, ArrowLeftRight, Wallet, Target, Sparkles, User } from "lucide-react";

const navItems = [
  { name: "Home",       icon: Home,          page: "Home"         },
  { name: "Transações", icon: ArrowLeftRight, page: "Transactions" },
  { name: "Metas",      icon: Target,        page: "Goals"        },
  { name: "Contas",     icon: Wallet,        page: "Accounts"     },
];

const HIDE_PROFILE_ICON = ["AIInsights", "Profile"];
const NAV_HEIGHT = 68;

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

  const leftItems  = navItems.slice(0, 2);
  const rightItems = navItems.slice(2);

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

      {/* Ícone de perfil flutuante */}
      {showProfileIcon && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="fixed z-40"
          style={{ top: '44px', right: '16px' }}
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

      {/* Main — sem padding para AIInsights pois ele ocupa tela cheia */}
      <main
        className="dark:bg-gray-900"
        style={{
          paddingBottom: currentPageName === 'AIInsights'
            ? '0'
            : `calc(${NAV_HEIGHT}px + 28px + env(safe-area-inset-bottom, 0px))`
        }}
      >
        {children}
      </main>

      {/* Navbar */}
      <motion.nav
        initial={{ y: 100 }} animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur-lg border-t border-gray-200/50 dark:border-gray-700/50 z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] overflow-visible"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div
          className="max-w-lg mx-auto relative"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 60px 1fr 1fr',
            height: `${NAV_HEIGHT}px`,
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
          <div className="flex flex-col items-center justify-end pb-1 relative">
            <span className={`text-[10px] font-bold mb-0.5 transition-colors duration-300 ${
              isAIActive ? 'text-violet-600 dark:text-violet-400' : 'text-gray-500 dark:text-gray-400'
            }`}>
              Finn
            </span>
            <motion.button
              whileTap={{ scale: 0.92 }}
              whileHover={{ scale: 1.05 }}
              onClick={() => navigate(createPageUrl('AIInsights'))}
              className={`absolute bottom-6 w-14 h-14 rounded-2xl flex items-center justify-center ${
                isAIActive ? 'finn-glow-active' : 'finn-glow'
              } bg-gradient-to-br from-violet-500 via-purple-600 to-indigo-600`}
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
                <Sparkles className="w-6 h-6 text-white relative z-10" />
              </motion.div>
            </motion.button>
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