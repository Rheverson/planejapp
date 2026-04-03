import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRightLeft, Check } from 'lucide-react';
import { useSharedProfile } from '@/lib/SharedProfileContext';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';

const relationshipLabels = {
  'Esposo(a)': "Esposo(a)",
  'Namorado(a)': "Namorado(a)",
  'Noivo(a)': "Noivo(a)",
  'Irmão(ã)': "Irmão(ã)",
  'Pai/Mãe': "Pai/Mãe",
  'Filho(a)': "Filho(a)",
  'Outro': "Outro",
  // fallback para os valores antigos em snake_case
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

  // ✅ CORRIGIDO: Busca shares accepted E os nomes dos donos
  const { data: acceptedShares = [] } = useQuery({
    queryKey: ['acceptedShares', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      
      const { data, error } = await supabase
        .from('shared_access')
        .select('*')
        .eq('shared_with_email', user.email)
        .eq('status', 'accepted');

      if (error) {
        console.error('Erro ao buscar shares:', error);
        return [];
      }

      if (!data || data.length === 0) return [];

      // ✅ NOVO: Busca os nomes dos donos
      const ownerIds = [...new Set(data.map(s => s.owner_id).filter(Boolean))];
      const ownersMap = {};

      await Promise.all(
        ownerIds.map(async (ownerId) => {
          const { data: ownerData } = await supabase
            .rpc('get_user_by_id', { user_id_input: ownerId });
          if (ownerData?.[0]) {
            ownersMap[ownerId] = ownerData[0].full_name || ownerData[0].email;
          }
        })
      );

      // ✅ NOVO: Adiciona o nome ao objeto share
      return data.map(share => ({
        ...share,
        owner_name: ownersMap[share.owner_id] || `Usuário ${share.owner_id.slice(0, 8)}`
      }));
    },
    enabled: !!user?.email
  });

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0];

  console.log('📱 acceptedShares:', acceptedShares); // DEBUG

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
                          console.log('🔄 Switching to profile:', share); // DEBUG
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
                          {/* ✅ CORRIGIDO: Agora mostra o nome correto */}
                          <p className="font-semibold text-sm">
                            {share.owner_name}
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