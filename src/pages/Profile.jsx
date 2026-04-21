import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  LogOut, ChevronRight, Moon, Bell, Shield,
  HelpCircle, Star, FileText, Wallet, Users, Clock, Gift, Tag, Crown, Zap
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
import CategoryManager from "@/components/profile/CategoryManager";
import ReferralInviteModal from "@/components/referral/ReferralInviteModal";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Profile() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showShareModal, setShowShareModal] = useState(false);
  const [showSharedList, setShowSharedList] = useState(false);
  const [showPendingInvites, setShowPendingInvites] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [showRateModal, setShowRateModal] = useState(false);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    const savedDarkMode = localStorage.getItem("darkMode") === "true";
    setDarkMode(savedDarkMode);
    document.documentElement.classList.toggle("dark", savedDarkMode);
    window.dispatchEvent(new CustomEvent("darkModeChange", { detail: savedDarkMode }));
  }, []);

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("*").eq("user_id", user.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions").select("*").eq("user_id", user.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const { data: sharedAccess = [] } = useQuery({
    queryKey: ["sharedAccess", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("shared_access").select("*").eq("owner_id", user.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const { data: pendingInvitesCount = 0 } = useQuery({
    queryKey: ["pendingInvitesCount", user?.email],
    queryFn: async () => {
      if (!user?.email) return 0;
      const { count, error } = await supabase
        .from("shared_access")
        .select("*", { count: "exact", head: true })
        .eq("shared_with_email", user.email)
        .eq("status", "pending");
      if (error) return 0;
      return count || 0;
    },
    enabled: !!user?.email,
  });

  const { data: referrals = [] } = useQuery({
    queryKey: ["referrals", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("referrals").select("*").eq("referrer_id", user.id);
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Busca assinatura
  const { data: subscription } = useQuery({
    queryKey: ["subscription", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      return data;
    },
    enabled: !!user?.id,
  });

  const isActive = subscription?.status === "active" || subscription?.status === "trialing";
  const isCancelled = subscription?.status === "cancelled";
  const endDate = subscription?.current_period_end
    ? format(new Date(subscription.current_period_end), "dd/MM/yyyy", { locale: ptBR })
    : null;

  const activeReferrals = referrals.filter(r => r.status === "active").length;
  const discountPercent = activeReferrals >= 4 ? 100 : activeReferrals >= 3 ? 75 : activeReferrals >= 2 ? 50 : activeReferrals >= 1 ? 25 : 0;

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await signOut();
      toast.success("Sessão encerrada com sucesso");
    } catch (error) {
      toast.error("Erro ao sair da conta.");
      setIsLoggingOut(false);
    }
  };

  const handleShare = async (data) => {
    try {
      const payload = {
        owner_id: user.id,
        shared_with_email: data.shared_with_email,
        relationship_type: data.relationship_type,
        status: "pending",
        permissions: data.permissions,
      };
      const { error } = await supabase.from("shared_access").insert([payload]).select();
      if (error) { toast.error(`Erro: ${error.message}`); return; }
      toast.success("Convite enviado!");
      setShowShareModal(false);
    } catch (err) {
      toast.error(`Erro inesperado: ${err.message}`);
    }
  };

  const stats = {
    totalAccounts: accounts.length,
    incomeTransactions: transactions.filter(t => t.type === "income").length,
    expenseTransactions: transactions.filter(t => t.type === "expense").length,
  };

  const menuItems = [
    {
      title: "Indicações",
      items: [
        {
          icon: Gift,
          label: "Indique e Ganhe",
          action: "referrals",
          badge: discountPercent > 0 ? `${discountPercent}% off` : null,
          badgeColor: "bg-orange-100 text-orange-600",
        },
      ],
    },
    {
      title: "Compartilhamento",
      items: [
        { icon: Users, label: "Compartilhar Finanças", action: "share", badge: sharedAccess.filter(s => s.status === "accepted").length || null },
        { icon: Clock, label: "Convites Pendentes", action: "pending_invites", badge: pendingInvitesCount > 0 ? pendingInvitesCount : null },
      ],
    },
    {
      title: "Preferências",
      items: [
        { icon: Bell, label: "Notificações", action: "toggle", state: notifications },
        { icon: Moon, label: "Modo Escuro", action: "toggle", state: darkMode },
      ],
    },
    {
      title: "Suporte",
      items: [
        { icon: HelpCircle, label: "Central de Ajuda", action: "help" },
        { icon: FileText, label: "Termos de Uso", action: "terms" },
        { icon: Shield, label: "Política de Privacidade", action: "privacy" },
      ],
    },
    {
      title: "Sobre",
      items: [
        { icon: Star, label: "Avaliar o App", action: "rate" },
      ],
    },
    {
      title: "Configurações",
      items: [
        { icon: Tag, label: "Gerenciar Categorias", action: "categories" },
      ],
    },
  ];

  const handleMenuAction = (item) => {
    try {
      if (item.action === "referrals") setShowReferralModal(true);
      else if (item.action === "share") setShowSharedList(true);
      else if (item.action === "pending_invites") setShowPendingInvites(true);
      else if (item.action === "plan") navigate("/PlanPage");
      else if (item.action === "toggle") {
        if (item.label === "Notificações") {
          setNotifications(!notifications);
          toast.success(`Notificações ${!notifications ? "ativadas" : "desativadas"}`);
        } else if (item.label === "Modo Escuro") {
          const newDarkMode = !darkMode;
          setDarkMode(newDarkMode);
          localStorage.setItem("darkMode", newDarkMode.toString());
          document.documentElement.classList.toggle("dark", newDarkMode);
          window.dispatchEvent(new CustomEvent("darkModeChange", { detail: newDarkMode }));
          toast.success(`Modo ${newDarkMode ? "escuro" : "claro"} ativado`);
        }
      } else if (item.action === "help") setShowHelpModal(true);
      else if (item.action === "terms") setShowTermsModal(true);
      else if (item.action === "privacy") setShowPrivacyModal(true);
      else if (item.action === "categories") setShowCategories(true);
      else if (item.action === "rate") setShowRateModal(true);
    } catch (error) {
      toast.error("Erro ao executar ação");
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const userName = user.user_metadata?.full_name || user.email.split("@")[0];
  const initials = userName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24 transition-colors duration-200">
      <div className="bg-white dark:bg-gray-800">
        <div className="px-5 pt-12 pb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Meu Perfil</h1>
          <NotificationCenter />
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="px-5 pb-4 flex items-center gap-4">
          <Avatar className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600">
            <AvatarFallback className="text-xl font-bold text-white bg-transparent">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold text-gray-900 dark:text-white truncate">{userName}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
          </div>
        </motion.div>

        {/* Card de assinatura */}
        <div className="px-5 pb-4">
          <button
            onClick={() => navigate("/PlanPage")}
            className={`w-full rounded-2xl p-4 flex items-center gap-3 text-left transition-opacity hover:opacity-90 ${
              isActive && !isCancelled
                ? "bg-gradient-to-r from-violet-600 to-indigo-600"
                : isCancelled
                ? "bg-gradient-to-r from-amber-500 to-orange-500"
                : "bg-gradient-to-r from-gray-500 to-gray-600"
            }`}
          >
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <Crown className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              {isActive && !isCancelled && (
                <>
                  <p className="text-white font-semibold text-sm flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                    Plano Pro ativo
                  </p>
                  <p className="text-white/70 text-xs">
                    {subscription?.status === "trialing"
                      ? `Trial até ${endDate}`
                      : `Próxima cobrança: ${endDate}`}
                  </p>
                </>
              )}
              {isCancelled && (
                <>
                  <p className="text-white font-semibold text-sm">Assinatura cancelada</p>
                  <p className="text-white/70 text-xs">Acesso Pro até {endDate}</p>
                </>
              )}
              {!subscription && (
                <>
                  <p className="text-white font-semibold text-sm flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-yellow-300" /> Fazer upgrade para Pro
                  </p>
                  <p className="text-white/70 text-xs">R$12,90/mês · Primeiro mês grátis</p>
                </>
              )}
            </div>
            <ChevronRight className="w-4 h-4 text-white/70 flex-shrink-0" />
          </button>
        </div>

        {/* Banner de indicação */}
        {discountPercent === 0 && (
          <div className="px-5 pb-5">
            <button onClick={() => setShowReferralModal(true)}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl p-4 flex items-center gap-3 text-left">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <Gift className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm">Indique amigos e ganhe descontos</p>
                <p className="text-white/70 text-xs">4 indicados = 100% grátis para sempre!</p>
              </div>
              <ChevronRight className="w-4 h-4 text-white/70 flex-shrink-0" />
            </button>
          </div>
        )}

        {discountPercent > 0 && (
          <div className="px-5 pb-5">
            <button onClick={() => setShowReferralModal(true)}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl p-4 flex items-center gap-3 text-left">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <Gift className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm">Você tem {discountPercent}% de desconto!</p>
                <p className="text-white/70 text-xs">{activeReferrals} indicado{activeReferrals > 1 ? "s" : ""} ativo{activeReferrals > 1 ? "s" : ""}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-white/70 flex-shrink-0" />
            </button>
          </div>
        )}

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
              {section.items.map((item, i) => {
                const isToggle = item.action === "toggle";
                const El = isToggle ? "div" : "button";
                return (
                <El key={item.label} onClick={() => handleMenuAction(item)} disabled={isLoggingOut}
                  className={`w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors disabled:opacity-50 cursor-pointer ${i !== section.items.length - 1 ? "border-b border-gray-100 dark:border-gray-700" : ""}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      item.action === "referrals" ? "bg-orange-100 dark:bg-orange-900/30" :
                      item.action === "plan" ? "bg-violet-100 dark:bg-violet-900/30" :
                      "bg-gray-100 dark:bg-gray-700"
                    }`}>
                      <item.icon className={`w-5 h-5 ${
                        item.action === "referrals" ? "text-orange-600 dark:text-orange-400" :
                        item.action === "plan" ? "text-violet-600 dark:text-violet-400" :
                        "text-gray-600 dark:text-gray-300"
                      }`} />
                    </div>
                    <span className="font-medium text-gray-900 dark:text-white">{item.label}</span>
                    {item.badge && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.badgeColor || (item.action === "pending_invites" ? "bg-orange-100 text-orange-600" : "bg-blue-100 text-blue-600")}`}>
                        {item.badge}
                      </span>
                    )}
                  </div>
                  {item.action === "toggle" ? (
                    <Switch checked={item.state} onCheckedChange={() => handleMenuAction(item)} disabled={isLoggingOut} />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  )}
                </El>
                );
              })}
            </div>
          </motion.div>
        ))}

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Button onClick={handleLogout} disabled={isLoggingOut} variant="outline"
            className="w-full h-14 rounded-2xl text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20">
            <LogOut className="w-5 h-5 mr-2" />
            {isLoggingOut ? "Saindo..." : "Sair da Conta"}
          </Button>
        </motion.div>
      </div>

      <AnimatePresence>
        {showReferralModal && <ReferralInviteModal onClose={() => setShowReferralModal(false)} />}
        {showShareModal && <ShareFinancesModal onSubmit={handleShare} onClose={() => setShowShareModal(false)} />}
        {showSharedList && (
          <SharedAccessList onClose={() => {
            setShowSharedList(false);
            queryClient.invalidateQueries({ queryKey: ["sharedAccess"] });
            queryClient.invalidateQueries({ queryKey: ["pendingInvitesCount"] });
          }} />
        )}
        {showCategories && <CategoryManager onClose={() => setShowCategories(false)} />}
        {showPendingInvites && (
          <PendingInvites onClose={() => {
            setShowPendingInvites(false);
            queryClient.invalidateQueries({ queryKey: ["pendingInvitesCount"] });
          }} />
        )}
        {showHelpModal && <HelpModal onClose={() => setShowHelpModal(false)} />}
        {showTermsModal && <TermsModal onClose={() => setShowTermsModal(false)} />}
        {showPrivacyModal && <PrivacyModal onClose={() => setShowPrivacyModal(false)} />}
        {showRateModal && <RateAppModal onSubmit={() => toast.success("Obrigado!")} onClose={() => setShowRateModal(false)} />}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ delay, icon: Icon, value, label, color, isPositive, isNegative }) {
  const colors = {
    blue: "bg-gray-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300",
    red: "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300",
  };
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
      className={`${colors[color]} rounded-xl p-4 text-center`}>
      {Icon ? <Icon className="w-5 h-5 mx-auto mb-2" /> : <div className="w-5 h-5 mx-auto mb-2 font-bold">{isPositive ? "+" : "-"}</div>}
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </motion.div>
  );
}