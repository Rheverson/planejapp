import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "./utils";
import { motion } from "framer-motion";
import { Home, ArrowLeftRight, Wallet, User, Target } from "lucide-react";

const navItems = [
  { name: "Home", icon: Home, page: "Home" },
  { name: "Transações", icon: ArrowLeftRight, page: "Transactions" },
  { name: "Metas", icon: Target, page: "Goals" },
  { name: "Contas", icon: Wallet, page: "Accounts" },
  { name: "Perfil", icon: User, page: "Profile" }
];

export default function Layout({ children, currentPageName }) {
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    setDarkMode(savedDarkMode);
    if (savedDarkMode) {
      document.documentElement.classList.add('dark');
    }

    const handleDarkModeChange = (e) => {
      const isDark = e.detail;
      setDarkMode(isDark);
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    window.addEventListener('darkModeChange', handleDarkModeChange);
    return () => window.removeEventListener('darkModeChange', handleDarkModeChange);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      <style>{`
        :root {
          --primary: 217 91% 60%;
          --primary-foreground: 210 40% 98%;
        }
        * {
          -webkit-tap-highlight-color: transparent;
        }
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
      
      <main className="pb-24 dark:bg-gray-900">
        {children}
      </main>
      
      <motion.nav 
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur-lg border-t border-gray-200/50 dark:border-gray-700/50 pb-safe-area-inset-bottom z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]"
      >
        <div className="flex items-center justify-between h-16 max-w-lg mx-auto px-4 relative">
          {navItems.map((item) => {
            const isActive = currentPageName === item.page;
            
            return (
              <Link
                key={item.page}
                to={createPageUrl(item.page)}
                className="flex flex-col items-center justify-center flex-1 min-w-0 h-full relative"
              >
                {/* Indicador de Aba Ativa - Fora do motion.div de escala para estabilidade */}
                {isActive && (
                  <motion.div
                    layoutId="activeIndicator"
                    className="absolute top-0 h-1 w-10 bg-gradient-to-r from-blue-500 to-indigo-600 dark:from-blue-400 dark:to-indigo-500 rounded-b-full z-20"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}

                <motion.div
                  className="flex flex-col items-center justify-center w-full"
                  animate={{
                    y: isActive ? -2 : 0
                  }}
                >
                  {/* Container do Ícone */}
                  <div
                    className={`p-2 rounded-xl transition-all duration-300 ${
                      isActive 
                        ? 'bg-blue-50 dark:bg-blue-900/40 scale-110' 
                        : 'bg-transparent scale-100'
                    }`}
                  >
                    <item.icon 
                      className={`w-5 h-5 transition-colors duration-300 ${
                        isActive 
                          ? 'text-blue-600 dark:text-blue-400 stroke-[2.5]' 
                          : 'text-gray-400 dark:text-gray-500'
                      }`} 
                    />
                  </div>
                  
                  {/* Texto do Menu */}
                  <span
                    className={`text-[10px] mt-1 truncate w-full text-center transition-all duration-300 ${
                      isActive 
                        ? 'text-blue-600 dark:text-blue-400 font-bold opacity-100' 
                        : 'text-gray-500 dark:text-gray-400 opacity-80'
                    }`}
                  >
                    {item.name}
                  </span>
                </motion.div>
              </Link>
            );
          })}
        </div>
      </motion.nav>
    </div>
  );
}