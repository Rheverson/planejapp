import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { 
  User, Mail, LogOut, ChevronRight, Moon, Bell, Shield, 
  HelpCircle, Star, FileText, Wallet, Users, Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import ShareFinancesModal from "@/components/profile/ShareFinancesModal";
import SharedAccessList from "@/components/profile/SharedAccessList";
import PendingInvites from "@/components/profile/PendingInvites";
import HelpModal from "@/components/profile/HelpModal";
import TermsModal from "@/components/profile/TermsModal";
import PrivacyModal from "@/components/profile/PrivacyModal";
import RateAppModal from "@/components/profile/RateAppModal";
import NotificationCenter from "@/components/NotificationCenter";
import ProfileSwitcher from "@/components/profile/ProfileSwitcher";
import { toast } from "sonner";
import CategoryManager from "@/components/profile/CategoryManager";
import { Tag } from "lucide-react";

export default function Profile() {
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();

  const [showShareModal, setShowShareModal] = useState(false);
  const [showSharedList, setShowSharedList] = useState(false);
  const [showPendingInvites, setShowPendingInvites] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [showRateModal, setShowRateModal] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    setDarkMode(savedDarkMode);
    if (savedDarkMode) document.documentElement.classList.add('dark');
  }, []);

  // Consultas de dados
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('accounts').select('*').eq('user_id', user.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('transactions').select('*').eq('user_id', user.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const { data: sharedAccess = [] } = useQuery({
    queryKey: ['sharedAccess', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('shared_access').select('*').eq('owner_id', user.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  // Query para contar convites pendentes
  const { data: pendingInvitesCount = 0 } = useQuery({
    queryKey: ['pendingInvitesCount', user?.email],
    queryFn: async () => {
      if (!user?.email) return 0;
      try {
        const { count, error } = await supabase
          .from('shared_access')
          .select('*', { count: 'exact', head: true })
          .eq('shared_with_email', user.email)
          .eq('status', 'pending');
        
        if (error) {
          console.error("Erro ao contar convites:", error);
          return 0;
        }
        return count || 0;
      } catch (err) {
        console.error("Erro na query de convites:", err);
        return 0;
      }
    },
    enabled: !!user?.email,
  });

  // Mutation para compartilhar finanças
  const createShareMutation = useMutation({
    mutationFn: async (formData) => {
      console.log('🔵 Tentando inserir:', formData); // <- adiciona
      const payload = {
        owner_id: user.id,
        shared_with_email: formData.shared_with_email.toLowerCase().trim(),
        relationship_type: formData.relationship_type,
        status: 'pending',
        permissions: formData.permissions,
      };

      console.log('📦 Payload:', payload);

      const { data, error } = await supabase
        .from('shared_access')
        .insert([payload])
        .select();

      console.log('Resultado:', { data, error });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sharedAccess'] });
      queryClient.invalidateQueries({ queryKey: ['pendingInvitesCount'] });
      setShowShareModal(false);
      toast.success('Convite enviado com sucesso!');
    },
    onError: (error) => {
      console.error("Erro no compartilhamento:", error);
      toast.error(`Erro: ${error.message || 'Não foi possível enviar o convite.'}`);
    }
  });

  const deleteShareMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('shared_access').delete().eq('id', id).eq('owner_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sharedAccess'] });
      toast.success('Compartilhamento removido!');
    },
    onError: (error) => {
      console.error("Erro ao remover compartilhamento:", error);
      toast.error('Erro ao remover compartilhamento');
    }
  });

  // ✅ CORRIGIDO: Logout chamando a função do contexto
  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await signOut();
      toast.success("Sessão encerrada com sucesso");
      // O AuthContext cuidará do redirecionamento para /login
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
      toast.error("Erro ao sair da conta. Tente novamente.");
      setIsLoggingOut(false);
    }
  };

  const handleShare = async (data) => {
    console.log('🟢 handleShare chamado:', data);
    console.log('👤 user:', user?.id, user?.email);
    
    try {
      const payload = {
        owner_id: user.id,
        shared_with_email: data.shared_with_email,
        relationship_type: data.relationship_type,
        status: 'pending',
        permissions: data.permissions,
      };

      console.log('📦 Payload:', JSON.stringify(payload));
      
      const { data: result, error } = await supabase
        .from('shared_access')
        .insert([payload])
        .select();

      console.log('✅ Result:', JSON.stringify(result));
      console.log('❌ Error:', JSON.stringify(error));

      if (error) {
        toast.error(`Erro: ${error.message}`);
        return;
      }

      toast.success('Convite enviado!');
      setShowShareModal(false);
      
    } catch (err) {
      console.error('💥 Catch:', err.message);
      toast.error(`Erro inesperado: ${err.message}`);
    }
  };

  const handleRateSubmit = (data) => {
    console.log('Rating:', data);
    toast.success('Obrigado pela sua avaliação!');
  };

  const stats = {
    totalAccounts: accounts.length,
    totalTransactions: transactions.length,
    incomeTransactions: transactions.filter(t => t.type === 'income').length,
    expenseTransactions: transactions.filter(t => t.type === 'expense').length
  };

  const menuItems = [
    {
      title: "Compartilhamento",
      items: [
        { 
          icon: Users, 
          label: "Compartilhar Finanças", 
          action: "share",
          badge: sharedAccess.filter(s => s.status === 'accepted').length || null
        },
        {
          icon: Clock,
          label: "Convites Pendentes",
          action: "pending_invites",
          badge: pendingInvitesCount > 0 ? pendingInvitesCount : null
        }
      ]
    },
    {
      title: "Preferências",
      items: [
        { icon: Bell, label: "Notificações", action: "toggle", state: notifications },
        { icon: Moon, label: "Modo Escuro", action: "toggle", state: darkMode }
      ]
    },
    {
      title: "Suporte",
      items: [
        { icon: HelpCircle, label: "Central de Ajuda", action: "help" },
        { icon: FileText, label: "Termos de Uso", action: "terms" },
        { icon: Shield, label: "Política de Privacidade", action: "privacy" }
      ]
    },
    {
      title: "Sobre",
      items: [
        { icon: Star, label: "Avaliar o App", action: "rate" }
      ]
    },
    {
      title: "Configurações",
      items: [
        { icon: Tag, label: "Gerenciar Categorias", action: "categories" },
      ]
    },
  ];

  const handleMenuAction = (item) => {
    try {
      if (item.action === "share") {
        setShowSharedList(true);
      } else if (item.action === "pending_invites") {
        setShowPendingInvites(true);
      } else if (item.action === "toggle") {
        if (item.label === "Notificações") {
          setNotifications(!notifications);
          toast.success(`Notificações ${!notifications ? 'ativadas' : 'desativadas'}`);
        } else if (item.label === "Modo Escuro") {
          const newDarkMode = !darkMode;
          setDarkMode(newDarkMode);
          localStorage.setItem('darkMode', newDarkMode.toString());
          document.documentElement.classList.toggle('dark', newDarkMode);
          toast.success(`Modo ${newDarkMode ? 'escuro' : 'claro'} ativado`);
        }
      } else if (item.action === "help") {
        setShowHelpModal(true);
      } else if (item.action === "terms") {
        setShowTermsModal(true);
      } else if (item.action === "privacy") {
        setShowPrivacyModal(true);
      } else if (item.action === "categories") {
        setShowCategories(true);
      } else if (item.action === "rate") {
        setShowRateModal(true);
      }
    } catch (error) {
      console.error("Erro ao executar ação do menu:", error);
      toast.error("Erro ao executar ação");
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const userName = user.user_metadata?.full_name || user.email.split('@')[0];
  const initials = userName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24 transition-colors duration-200">
      <div className="bg-white dark:bg-gray-800">
        <div className="px-5 pt-12 pb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Meu Perfil</h1>
          <NotificationCenter />
        </div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="px-5 pb-8 flex items-center gap-4"
        >
          <Avatar className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600">
            <AvatarFallback className="text-xl font-bold text-white bg-transparent">
              {initials}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold text-gray-900 dark:text-white truncate">
              {userName}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
          </div>
        </motion.div>

        <div className="grid grid-cols-3 gap-4 px-5 pb-6">
          <StatCard delay={0.1} icon={Wallet} value={stats.totalAccounts} label="Contas" color="blue" />
          <StatCard delay={0.2} label="Entradas" value={stats.incomeTransactions} isPositive color="emerald" />
          <StatCard delay={0.3} label="Saídas" value={stats.expenseTransactions} isNegative color="red" />
        </div>
      </div>

      <div className="px-5 py-6 space-y-6">
        <ProfileSwitcher />

        {menuItems.map((section, idx) => (
          <motion.div key={section.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 * idx }}>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3 px-1">{section.title}</p>
            <div className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700">
              {section.items.map((item, i) => (
                <button
                  key={item.label}
                  onClick={() => handleMenuAction(item)}
                  disabled={isLoggingOut}
                  className={`w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    i !== section.items.length - 1 ? 'border-b border-gray-100 dark:border-gray-700' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                      <item.icon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                    </div>
                    <span className="font-medium text-gray-900 dark:text-white">{item.label}</span>
                    {item.badge && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        item.action === 'pending_invites' 
                          ? 'bg-orange-100 text-orange-600' 
                          : 'bg-blue-100 text-blue-600'
                      }`}>
                        {item.badge}
                      </span>
                    )}
                  </div>
                  {item.action === 'toggle' ? (
                    <Switch 
                      checked={item.state} 
                      onCheckedChange={() => handleMenuAction(item)}
                      disabled={isLoggingOut}
                    />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        ))}

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Button
            onClick={handleLogout}
            disabled={isLoggingOut}
            variant="outline"
            className="w-full h-14 rounded-2xl text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <LogOut className="w-5 h-5 mr-2" /> 
            {isLoggingOut ? "Saindo..." : "Sair da Conta"}
          </Button>
        </motion.div>
      </div>

      <AnimatePresence>
        {showShareModal && (
          <ShareFinancesModal
            onSubmit={handleShare}
            onClose={() => setShowShareModal(false)}
          />
        )}
        {showSharedList && (
          <SharedAccessList
            onClose={() => {
              setShowSharedList(false);
              queryClient.invalidateQueries({ queryKey: ['sharedAccess'] });
              queryClient.invalidateQueries({ queryKey: ['pendingInvitesCount'] });
            }}
          />
        )}
        {showCategories && (
          <CategoryManager onClose={() => setShowCategories(false)} />
        )}
        {showPendingInvites && (
          <PendingInvites
            onClose={() => {
              setShowPendingInvites(false);
              queryClient.invalidateQueries({ queryKey: ['pendingInvitesCount'] });
            }}
          />
        )}
        {showHelpModal && (
          <HelpModal onClose={() => setShowHelpModal(false)} />
        )}
        {showTermsModal && (
          <TermsModal onClose={() => setShowTermsModal(false)} />
        )}
        {showPrivacyModal && (
          <PrivacyModal onClose={() => setShowPrivacyModal(false)} />
        )}
        {showRateModal && (
          <RateAppModal
            onSubmit={handleRateSubmit}
            onClose={() => setShowRateModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ delay, icon: Icon, value, label, color, isPositive, isNegative }) {
  const colors = {
    blue: "bg-gray-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300",
    red: "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300"
  };
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ delay }} 
      className={`${colors[color]} rounded-xl p-4 text-center`}
    >
      {Icon ? <Icon className="w-5 h-5 mx-auto mb-2" /> : <div className="w-5 h-5 mx-auto mb-2 font-bold">{isPositive ? '+' : '-'}</div>}
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </motion.div>
  );
}