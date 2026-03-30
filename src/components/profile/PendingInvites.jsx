// src/components/profile/PendingInvites.jsx - VERSÃO FINAL COM DEBUG

import React from 'react';
import { motion } from 'framer-motion';
import { X, Clock, Check, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
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

export default function PendingInvites({ onClose }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: pendingInvites = [], isLoading } = useQuery({
    queryKey: ['pendingInvites', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];

      const { data: invites, error: invitesError } = await supabase
        .from('shared_access')
        .select(`
          id,
          status,
          created_at,
          shared_with_email,
          relationship_type,
          permissions,
          owner_id
        `)
        .eq('shared_with_email', user.email)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (invitesError) throw invitesError;

      if (!invites?.length) return [];

      const ownerIds = [...new Set(invites.map(i => i.owner_id).filter(Boolean))];

      const ownersMap = {};
      await Promise.all(
        ownerIds.map(async (ownerId) => {
          const { data } = await supabase
            .rpc('get_user_by_id', { user_id_input: ownerId });
          if (data?.[0]) ownersMap[ownerId] = data[0];
        })
      );

      return invites.map(invite => ({
        ...invite,
        owner: ownersMap[invite.owner_id] || null
      }));
    },
    enabled: !!user?.email,
  });

const acceptMutation = useMutation({
  mutationFn: async (shareId) => {
    console.log('[ACCEPT] Atualizando shared_access diretamente...');

    const { error: updateError } = await supabase
      .from('shared_access')
      .update({ status: 'accepted' })
      .eq('id', shareId)
      .eq('shared_with_email', user.email);  // segurança extra contra atualização errada

    if (updateError) {
      console.error('[ACCEPT] Erro no update:', updateError);
      throw updateError;
    }

    console.log('[ACCEPT] Atualizando notification...');
    const { error: notifError } = await supabase
      .from('notifications')
      .update({ status: 'read', read_at: new Date().toISOString() })
      .eq('shared_access_id', shareId);

    if (notifError) throw notifError;

    console.log('[ACCEPT] Sucesso');
  },
  onSuccess: () => {
    console.log('[ACCEPT] onSuccess → invalidando');
    queryClient.invalidateQueries({ queryKey: ['pendingInvites'] });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['pendingInvitesCount'] });
    toast.success('Convite aceito!');
  },
  onError: (err) => {
    console.error('[ACCEPT] Erro final:', err);
    toast.error('Erro ao aceitar convite', { description: err.message });
  }
});

const rejectMutation = useMutation({
  mutationFn: async (shareId) => {
    console.log('[REJECT] Atualizando shared_access diretamente...');

    const { error: updateError } = await supabase
      .from('shared_access')
      .update({ status: 'rejected' })
      .eq('id', shareId)
      .eq('shared_with_email', user.email);

    if (updateError) {
      console.error('[REJECT] Erro no update:', updateError);
      throw updateError;
    }

    const { error: notifError } = await supabase
      .from('notifications')
      .update({ status: 'read', read_at: new Date().toISOString() })
      .eq('shared_access_id', shareId);

    if (notifError) throw notifError;

    console.log('[REJECT] Sucesso');
  },
  onSuccess: () => {
    console.log('[REJECT] onSuccess → invalidando');
    queryClient.invalidateQueries({ queryKey: ['pendingInvites'] });
    // ... mesmas invalidações
    toast.success('Convite recusado!');
  },
  onError: (err) => {
    console.error('[REJECT] Erro final:', err);
    toast.error('Erro ao recusar convite', { description: err.message });
  }
});

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Convites Pendentes</h2>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-full">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-8 text-center">
              <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3 animate-spin" />
              <p className="text-gray-500">Buscando convites...</p>
            </div>
          ) : pendingInvites.length === 0 ? (
            <div className="p-8 text-center">
              <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Nenhum convite pendente</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {pendingInvites.map((invite, index) => {
                const inviteId = invite.id;
                console.log(`🎯 Convite #${index}:`, invite);           // ← DEBUG 1
                console.log(`   ID usado:`, inviteId);                 // ← DEBUG 2

                return (
                  <motion.div
                    key={inviteId || index}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="mb-3">
                      <p className="font-semibold text-gray-900">
                        {invite.owner?.full_name || invite.owner?.email || 'Usuário desconhecido'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Quer compartilhar como: <strong>{relationshipLabels[invite.relationship_type] || 'Outro'}</strong>
                      </p>
                      <p className="text-xs text-gray-400 mt-2">
                        {new Date(invite.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>

                    <div className="bg-blue-50 rounded-lg p-3 mb-4 text-xs space-y-1">
                      <p className="font-medium text-blue-900">Permissões solicitadas:</p>
                      <div className="grid grid-cols-2 gap-1 text-blue-800">
                        {invite.permissions?.view_transactions && <span>✓ Ver transações</span>}
                        {invite.permissions?.add_transactions && <span>✓ Adicionar transações</span>}
                        {invite.permissions?.edit_transactions && <span>✓ Editar transações</span>}
                        {invite.permissions?.delete_transactions && <span>✓ Deletar transações</span>}
                        {invite.permissions?.view_accounts && <span>✓ Ver contas</span>}
                        {invite.permissions?.manage_accounts && <span>✓ Gerenciar contas</span>}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          console.log('🛑 CLICOU RECUSAR - ID:', inviteId);
                          if (!inviteId) {
                            toast.error('ID do convite inválido');
                            return;
                          }
                          rejectMutation.mutate(inviteId);
                        }}
                        disabled={rejectMutation.isLoading || !inviteId}
                        className="flex-1 h-9 rounded-lg text-xs"
                      >
                        <XCircle className="w-3 h-3 mr-1" /> Recusar
                      </Button>

                      <Button
                        size="sm"
                        onClick={() => {
                          console.log('✅ CLICOU ACEITAR - ID:', inviteId);
                          if (!inviteId) {
                            toast.error('ID do convite inválido');
                            return;
                          }
                          acceptMutation.mutate(inviteId);
                        }}
                        disabled={acceptMutation.isLoading || !inviteId}
                        className="flex-1 h-9 rounded-lg text-xs bg-green-600 hover:bg-green-700"
                      >
                        <Check className="w-3 h-3 mr-1" /> Aceitar
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 px-6 py-4 border-t border-gray-100 bg-white">
          <Button onClick={onClose} className="w-full h-12 rounded-xl font-semibold bg-blue-600 hover:bg-blue-700">
            Fechar
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}