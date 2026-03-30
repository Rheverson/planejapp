import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Check, X, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

const relationshipLabels = {
  esposo_a: "Esposo(a)",
  namorado_a: "Namorado(a)",
  noivo_a: "Noivo(a)",
  irmao_a: "Irmão(ã)",
  pai_mae: "Pai/Mãe",
  filho_a: "Filho(a)",
  outro: "Outro"
};

export default function NotificationCenter() {
  const { user } = useAuth();
  const [showNotifications, setShowNotifications] = useState(false);
  const queryClient = useQueryClient();

  // Buscar notificações pendentes
  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('notifications')
        .select(`
          id,
          shared_access_id,
          status,
          created_at,
          shared_access:shared_access_id (
            id,
            shared_with_email,
            relationship_type,
            permissions,
            owner_id
          )
        `)
        .eq('user_id', user?.id)
        .eq('status', 'unread')
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!user?.id,
    refetchInterval: 5000 // Atualizar a cada 5 segundos
  });

  // Aceitar convite
  const acceptMutation = useMutation({
    mutationFn: async (notificationId) => {
      const notification = notifications.find(n => n.id === notificationId);
      
      // Atualizar status do SharedAccess para 'accepted'
      await base44.entities.SharedAccess.update(notification.shared_access_id, {
        status: 'accepted'
      });

      // Marcar notificação como lida
      await supabase
        .from('notifications')
        .update({ status: 'read', read_at: new Date().toISOString() })
        .eq('id', notificationId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['sharedAccess'] });
      toast.success('Convite aceito!');
    },
    onError: () => {
      toast.error('Erro ao aceitar convite');
    }
  });

  // Rejeitar convite
  const rejectMutation = useMutation({
    mutationFn: async (notificationId) => {
      const notification = notifications.find(n => n.id === notificationId);
      
      // Atualizar status do SharedAccess para 'rejected'
      await base44.entities.SharedAccess.update(notification.shared_access_id, {
        status: 'rejected'
      });

      // Marcar notificação como lida
      await supabase
        .from('notifications')
        .update({ status: 'read', read_at: new Date().toISOString() })
        .eq('id', notificationId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['sharedAccess'] });
      toast.success('Convite recusado');
    },
    onError: () => {
      toast.error('Erro ao recusar convite');
    }
  });

  const unreadCount = notifications.length;

  return (
    <>
      {/* Botão de Notificações */}
      <button
        onClick={() => setShowNotifications(!showNotifications)}
        className="relative p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
        aria-label="Notificações"
      >
        <Bell className="w-6 h-6 text-gray-600 dark:text-gray-300" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Painel de Notificações */}
      <AnimatePresence>
        {showNotifications && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNotifications(false)}
              className="fixed inset-0 z-40"
            />

            {/* Painel */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-16 right-0 w-96 max-h-96 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl z-50 overflow-y-auto border border-gray-200 dark:border-gray-700"
            >
              {notifications.length === 0 ? (
                <div className="p-8 text-center">
                  <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 dark:text-gray-400">Nenhuma notificação</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {notifications.map((notification) => (
                    <motion.div
                      key={notification.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
                          <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 dark:text-white text-sm">
                            Novo compartilhamento
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            <strong>{notification.shared_access.shared_with_email}</strong> quer compartilhar suas finanças como <strong>{relationshipLabels[notification.shared_access.relationship_type]}</strong>
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                            {new Date(notification.created_at).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => rejectMutation.mutate(notification.id)}
                          disabled={rejectMutation.isPending}
                          className="flex-1 h-8 rounded-lg text-xs"
                        >
                          <X className="w-3 h-3 mr-1" /> Recusar
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => acceptMutation.mutate(notification.id)}
                          disabled={acceptMutation.isPending}
                          className="flex-1 h-8 rounded-lg text-xs bg-green-600 hover:bg-green-700"
                        >
                          <Check className="w-3 h-3 mr-1" /> Aceitar
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
