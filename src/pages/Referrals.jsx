import React, { useMemo } from "react";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Copy, Share2, Users, Gift, CheckCircle2, Clock, XCircle } from "lucide-react";
import { toast } from "sonner";

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export default function Referrals() {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('referral_code').eq('id', user.id).single();
      return data;
    },
    enabled: !!user?.id
  });

  const { data: referrals = [] } = useQuery({
    queryKey: ['referrals', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('referrals')
        .select('*, referred:referred_id(email)')
        .eq('referrer_id', user.id)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!user?.id
  });

  const activeCount = referrals.filter(r => r.status === 'active').length;
  const pendingCount = referrals.filter(r => r.status === 'pending').length;

  const discountPercent = useMemo(() => {
    if (activeCount >= 4) return 100;
    if (activeCount === 3) return 75;
    if (activeCount === 2) return 50;
    if (activeCount === 1) return 25;
    return 0;
  }, [activeCount]);

  const discountValue = (12.90 * discountPercent / 100).toFixed(2);
  const finalValue = (12.90 - parseFloat(discountValue)).toFixed(2);

  const referralCode = profile?.referral_code || '';
  const referralLink = `https://planejapp.vercel.app?ref=${referralCode}`;

  const copyCode = () => {
    navigator.clipboard.writeText(referralCode);
    toast.success('Código copiado!');
  };

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink);
    toast.success('Link copiado!');
  };

  const shareLink = async () => {
    if (navigator.share) {
      await navigator.share({
        title: 'PlanejApp',
        text: `Use meu código ${referralCode} e ganhe 30 dias grátis no PlanejApp!`,
        url: referralLink,
      });
    } else {
      copyLink();
    }
  };

  const getStatusIcon = (status) => {
    if (status === 'active') return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    if (status === 'pending') return <Clock className="w-4 h-4 text-amber-500" />;
    return <XCircle className="w-4 h-4 text-red-400" />;
  };

  const getStatusLabel = (status) => {
    if (status === 'active') return 'Ativo — desconto aplicado';
    if (status === 'pending') return 'Aguardando primeiro pagamento';
    return 'Cancelado';
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 text-white">
        <div className="px-5 pt-12 pb-8">
          <h1 className="text-2xl font-bold mb-1">Indicações</h1>
          <p className="text-amber-100 text-sm">Indique amigos e ganhe descontos</p>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 -mt-4 relative z-10">

        {/* Desconto atual */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl p-5 text-white ${discountPercent === 100 ? 'bg-emerald-500' : discountPercent > 0 ? 'bg-amber-500' : 'bg-gray-800'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/80 text-sm">Seu desconto atual</p>
              <p className="text-4xl font-bold mt-1">{discountPercent}%</p>
              {discountPercent > 0 ? (
                <p className="text-white/80 text-sm mt-1">
                  Pagando {fmt(parseFloat(finalValue))}/mês
                </p>
              ) : (
                <p className="text-white/80 text-sm mt-1">Indique para ganhar desconto</p>
              )}
            </div>
            <div className="text-right">
              <Gift className="w-12 h-12 text-white/40 mx-auto" />
            </div>
          </div>

          {/* Barra de progresso */}
          <div className="mt-4">
            <div className="flex justify-between text-xs text-white/70 mb-1">
              <span>{activeCount} indicados ativos</span>
              <span>4 para 100% grátis</span>
            </div>
            <div className="w-full bg-white/20 rounded-full h-2">
              <div className="bg-white rounded-full h-2 transition-all duration-500"
                style={{ width: `${Math.min((activeCount / 4) * 100, 100)}%` }} />
            </div>
          </div>
        </motion.div>

        {/* Seu código */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">Seu código de indicação</p>
          
          <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700 rounded-xl p-4 mb-3">
            <span className="text-2xl font-bold text-blue-600 tracking-widest flex-1 text-center">
              {referralCode || '...'}
            </span>
            <button onClick={copyCode} className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <Copy className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </button>
          </div>

          <button onClick={shareLink}
            className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors">
            <Share2 className="w-4 h-4" />
            Compartilhar link de convite
          </button>
        </motion.div>

        {/* Tabela de descontos */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">Como funciona</p>
          <div className="space-y-2">
            {[
              { count: 1, percent: 25, value: '9,68' },
              { count: 2, percent: 50, value: '6,45' },
              { count: 3, percent: 75, value: '3,23' },
              { count: 4, percent: 100, value: '0,00' },
            ].map(({ count, percent, value }) => (
              <div key={count} className={`flex items-center justify-between p-3 rounded-xl ${activeCount >= count ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-gray-50 dark:bg-gray-700'}`}>
                <div className="flex items-center gap-2">
                  {activeCount >= count
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    : <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
                  }
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {count} {count === 1 ? 'indicado' : 'indicados'}
                  </span>
                </div>
                <div className="text-right">
                  <span className={`text-sm font-bold ${activeCount >= count ? 'text-emerald-600' : 'text-gray-500'}`}>
                    {percent}% off
                  </span>
                  <span className="text-xs text-gray-400 ml-1">R${value}/mês</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3 text-center">
            * Desconto aplicado apenas após o indicado pagar a primeira mensalidade
          </p>
        </motion.div>

        {/* Lista de indicados */}
        {referrals.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="px-5 pt-4 pb-2">
              <p className="text-sm font-bold text-gray-700 dark:text-gray-300">Seus indicados</p>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-gray-700">
              {referrals.map(r => (
                <div key={r.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                    <Users className="w-4 h-4 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                      {r.referred?.email || 'Usuário'}
                    </p>
                    <p className="text-xs text-gray-400">{getStatusLabel(r.status)}</p>
                  </div>
                  {getStatusIcon(r.status)}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {referrals.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
            className="bg-white dark:bg-gray-800 rounded-2xl p-8 text-center shadow-sm border border-gray-100 dark:border-gray-700">
            <Users className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 text-sm font-medium">Nenhum indicado ainda</p>
            <p className="text-gray-400 text-xs mt-1">Compartilhe seu código e comece a ganhar descontos!</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}