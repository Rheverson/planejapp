import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRightLeft, Check } from 'lucide-react';
import { useSharedProfile } from '@/lib/SharedProfileContext';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';

const relationshipLabels = {
  esposo_a: "Esposo(a)",
  namorado_a: "Namorado(a)",
  noivo_a: "Noivo(a)",
  irmao_a: "Irmão(ã)",
  pai_mae: "Pai/Mãe",
  filho_a: "Filho(a)",
  outro: "Outro"
};

export default function ProfileSwitcher() {
  const { user } = useAuth();
  const { activeProfile, switchProfile, switchToOwnProfile, isViewingSharedProfile } = useSharedProfile();
  const [showMenu, setShowMenu] = useState(false);

  const { data: acceptedShares = [] } = useQuery({
    queryKey: ['acceptedShares', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      
      const { data, error } = await supabase
        .from('shared_access')
        .select('*')
        .eq('shared_with_email', user.email)
        .eq('status', 'accepted');

      if (error) return [];

      // ✅ IMPORTANTE: Já temos owner_id na tabela!
      return data || [];
    },
    enabled: !!user?.email
  });

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0];

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        <ArrowRightLeft className="w-5 h-5 text-blue-600" />
        <span className="text-sm font-medium text-gray-900 dark:text-white">
          {isViewingSharedProfile ? 'Perfil Compartilhado' : 'Meu Perfil'}
        </span>
      </button>

      <AnimatePresence>
        {showMenu && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMenu(false)}
              className="fixed inset-0 z-40"
            />

            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-12 right-0 w-64 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl z-50 border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              <div className="p-4 space-y-2">
                {/* Seu Perfil */}
                <button
                  onClick={() => {
                    switchToOwnProfile();
                    setShowMenu(false);
                  }}
                  className={`w-full text-left px-4 py-3 rounded-xl transition-colors flex items-center justify-between ${
                    !isViewingSharedProfile
                      ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white'
                  }`}
                >
                  <div>
                    <p className="font-semibold text-sm">{userName}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Seu perfil</p>
                  </div>
                  {!isViewingSharedProfile && <Check className="w-4 h-4" />}
                </button>

                {/* Perfis Compartilhados */}
                {acceptedShares.length > 0 && (
                  <>
                    <div className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                      Compartilhados com você
                    </div>
                    {acceptedShares.map((share) => (
                      <button
                        key={share.id}
                        onClick={() => {
                          // ✅ CORRIGIDO: Passa o objeto share completo
                          // Agora inclui owner_id que vem direto do banco!
                          switchProfile(share);
                          setShowMenu(false);
                        }}
                        className={`w-full text-left px-4 py-3 rounded-xl transition-colors flex items-center justify-between ${
                          isViewingSharedProfile && activeProfile?.id === share.id
                            ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white'
                        }`}
                      >
                        <div>
                          {/* ✅ NOVO: Busca o nome do dono de forma melhor */}
                          <p className="font-semibold text-sm">
                            {share.owner_name || `Usuário ${share.owner_id.slice(0, 8)}`}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {relationshipLabels[share.relationship_type] || share.relationship_type}
                          </p>
                        </div>
                        {isViewingSharedProfile && activeProfile?.id === share.id && (
                          <Check className="w-4 h-4" />
                        )}
                      </button>
                    ))}
                  </>
                )}

                {acceptedShares.length === 0 && (
                  <div className="px-4 py-6 text-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Nenhum perfil compartilhado com você ainda
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}