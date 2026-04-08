import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "./utils";
import { motion } from "framer-motion";
import { Home, ArrowLeftRight, Wallet, User, Target, Sparkles } from "lucide-react";

const navItems = [
  { name: "Home",       icon: Home,          page: "Home"         },
  { name: "Transações", icon: ArrowLeftRight, page: "Transactions" },
  { name: "Metas",      icon: Target,        page: "Goals"        },
  { name: "Contas",     icon: Wallet,        page: "Accounts"     },
  { name: "Perfil",     icon: User,          page: "Profile"      },
];

export default function Layout({ children, currentPageName }) {
  const [darkMode, setDarkMode] = useState(false);
  const navigate = useNavigate();
  const isAIActive = currentPageName === "AIInsights";

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

  // Split nav items: 2 left, center button, 3 right
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

      <main className="pb-24 dark:bg-gray-900">{children}</main>

      <motion.nav
        initial={{ y: 100 }} animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur-lg border-t border-gray-200/50 dark:border-gray-700/50 z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-between h-16 max-w-lg mx-auto px-2 relative">

          {/* Left items */}
          {leftItems.map((item) => {
            const isActive = currentPageName === item.page;
            return (
              <Link key={item.page} to={createPageUrl(item.page)}
                className="flex flex-col items-center justify-center flex-1 min-w-0 h-full relative">
                {isActive && (
                  <motion.div layoutId="activeIndicator"
                    className="absolute top-0 h-0.5 w-8 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-b-full"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }} />
                )}
                <motion.div className="flex flex-col items-center" animate={{ y: isActive ? -1 : 0 }}>
                  <div className={`p-1.5 rounded-xl transition-all duration-300 ${isActive ? 'bg-blue-50 dark:bg-blue-900/40' : ''}`}>
                    <item.icon className={`w-5 h-5 transition-colors duration-300 ${
                      isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'
                    }`} />
                  </div>
                  <span className={`text-[10px] mt-0.5 transition-all duration-300 ${
                    isActive ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-gray-400 dark:text-gray-500'
                  }`}>{item.name}</span>
                </motion.div>
              </Link>
            );
          })}

          {/* Botão central FINN */}
          <div className="flex flex-col items-center justify-center px-2" style={{ marginTop: '-28px' }}>
            <motion.button
              whileTap={{ scale: 0.92 }}
              whileHover={{ scale: 1.05 }}
              onClick={() => navigate(createPageUrl('AIInsights'))}
              className={`relative w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                isAIActive
                  ? 'bg-gradient-to-br from-violet-500 via-purple-600 to-indigo-600 finn-glow-active'
                  : 'bg-gradient-to-br from-violet-500 via-purple-600 to-indigo-600 finn-glow'
              }`}
            >
              {/* Pulse ring quando ativo */}
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
                <Sparkles className="w-7 h-7 text-white" />
              </motion.div>
            </motion.button>
            <span className={`text-[10px] mt-1 font-bold transition-colors duration-300 ${
              isAIActive ? 'text-violet-600 dark:text-violet-400' : 'text-gray-500 dark:text-gray-400'
            }`}>Finn</span>
          </div>

          {/* Right items */}
          {rightItems.map((item) => {
            const isActive = currentPageName === item.page;
            return (
              <Link key={item.page} to={createPageUrl(item.page)}
                className="flex flex-col items-center justify-center flex-1 min-w-0 h-full relative">
                {isActive && (
                  <motion.div layoutId="activeIndicator"
                    className="absolute top-0 h-0.5 w-8 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-b-full"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }} />
                )}
                <motion.div className="flex flex-col items-center" animate={{ y: isActive ? -1 : 0 }}>
                  <div className={`p-1.5 rounded-xl transition-all duration-300 ${isActive ? 'bg-blue-50 dark:bg-blue-900/40' : ''}`}>
                    <item.icon className={`w-5 h-5 transition-colors duration-300 ${
                      isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'
                    }`} />
                  </div>
                  <span className={`text-[10px] mt-0.5 transition-all duration-300 ${
                    isActive ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-gray-400 dark:text-gray-500'
                  }`}>{item.name}</span>
                </motion.div>
              </Link>
            );
          })}
        </div>
      </motion.nav>
    </div>
  );
}