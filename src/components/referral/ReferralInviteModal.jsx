import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import { X, Gift, Copy, Share2, ChevronRight, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";

export default function ReferralInviteModal({ onClose }) {
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
      const { data } = await supabase.from('referrals').select('*').eq('referrer_id', user.id);
      return data || [];
    },
    enabled: !!user?.id
  });

  const activeCount = referrals.filter(r => r.status === 'active').length;
  const discountPercent = activeCount >= 4 ? 100 : activeCount === 3 ? 75 : activeCount === 2 ? 50 : activeCount === 1 ? 25 : 0;
  const nextDiscount = discountPercent === 100 ? 100 : discountPercent + 25;
  const nextCount = activeCount >= 4 ? 4 : activeCount + 1;

  const referralCode = profile?.referral_code || '';
  const referralLink = `https://planejapp.com.br?ref=${referralCode}`;

  const copyCode = () => {
    navigator.clipboard.writeText(referralCode);
    toast.success('Código copiado!');
  };

  const shareLink = async () => {
    if (navigator.share) {
      await navigator.share({
        title: 'PlanejApp',
        text: `Use meu código ${referralCode} e ganhe 30 dias grátis no PlanejApp! 🎉`,
        url: referralLink,
      });
    } else {
      navigator.clipboard.writeText(referralLink);
      toast.success('Link copiado!');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[999] flex items-end sm:items-center justify-center pb-0 sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-gray-800 w-full max-w-md rounded-t-[2.5rem] sm:rounded-[2rem] overflow-hidden shadow-2xl"
      >
        {/* Header gradiente */}
        <div className="bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 px-6 pt-8 pb-6 text-white relative">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-white/20 rounded-full">
            <X className="w-4 h-4 text-white" />
          </button>

          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mb-3">
            <Gift className="w-7 h-7 text-white" />
          </div>

          <h2 className="text-xl font-bold mb-1">Indique e ganhe!</h2>
          <p className="text-white/80 text-sm">
            {discountPercent > 0
              ? `Você já tem ${discountPercent}% de desconto com ${activeCount} indicado${activeCount > 1 ? 's' : ''}!`
              : "Indique amigos e ganhe até 100% de desconto"}
          </p>

          {/* Barra de progresso */}
          <div className="mt-4">
            <div className="flex justify-between text-xs text-white/70 mb-1.5">
              <span>{activeCount}/4 indicados ativos</span>
              {discountPercent < 100 && <span>Próximo: {nextDiscount}% com {nextCount} indicado{nextCount > 1 ? 's' : ''}</span>}
              {discountPercent === 100 && <span>🎉 100% grátis!</span>}
            </div>
            <div className="w-full bg-white/20 rounded-full h-2">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min((activeCount / 4) * 100, 100)}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="bg-white rounded-full h-2"
              />
            </div>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="px-6 py-5 space-y-4">

          {/* Código */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Seu código de indicação</p>
            <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700 rounded-2xl p-4">
              <span className="text-2xl font-bold text-orange-500 tracking-widest flex-1 text-center">
                {referralCode || '...'}
              </span>
              <button onClick={copyCode} className="p-2.5 bg-orange-100 dark:bg-orange-900/30 rounded-xl">
                <Copy className="w-4 h-4 text-orange-600" />
              </button>
            </div>
          </div>

          {/* Tabela rápida */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { n: 1, p: 25 },
              { n: 2, p: 50 },
              { n: 3, p: 75 },
              { n: 4, p: 100 },
            ].map(({ n, p }) => (
              <div key={n} className={`rounded-xl p-2.5 text-center ${activeCount >= n ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-gray-50 dark:bg-gray-700'}`}>
                <p className={`text-sm font-bold ${activeCount >= n ? 'text-emerald-600' : 'text-gray-400'}`}>{p}%</p>
                <p className="text-xs text-gray-400 mt-0.5">{n} amigo{n > 1 ? 's' : ''}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-400 text-center">
            * Desconto aplicado após o indicado pagar a 1ª mensalidade
          </p>

          {/* Botões */}
          <button onClick={shareLink}
            className="w-full flex items-center justify-center gap-2 py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-2xl font-bold text-base shadow-lg shadow-orange-200 dark:shadow-none">
            <Share2 className="w-5 h-5" />
            Compartilhar convite
          </button>

          <Link to={createPageUrl("Referrals")} onClick={onClose}
            className="w-full flex items-center justify-center gap-2 py-3 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-2xl font-medium text-sm">
            <Users className="w-4 h-4" />
            Ver todos os meus indicados
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </motion.div>
    </motion.div>
  );
}