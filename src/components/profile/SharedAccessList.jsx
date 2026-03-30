// src/components/profile/SharedAccessList.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, Clock, Check, XCircle, UserPlus, Users, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';
import ShareFinancesModal from './ShareFinancesModal';

const relationshipLabels = {
  'Esposo(a)': 'Esposo(a)',
  'Namorado(a)': 'Namorado(a)',
  'Noivo(a)': 'Noivo(a)',
  'Irmão(ã)': 'Irmão(ã)',
  'Pai/Mãe': 'Pai/Mãe',
  'Filho(a)': 'Filho(a)',
  'Outro': 'Outro',
  // fallback para os valores antigos em snake_case, se existirem
  esposo_a: 'Esposo(a)',
  namorado_a: 'Namorado(a)',
  noivo_a: 'Noivo(a)',
  irmao_a: 'Irmão(ã)',
  pai_mae: 'Pai/Mãe',
  filho_a: 'Filho(a)',
  outro: 'Outro',
};

const statusConfig = {
  pending: {
    Icon: Clock,
    label: 'Aguardando',
    badge: 'bg-amber-100 text-amber-700',
    row: 'border-l-4 border-l-amber-400',
  },
  accepted: {
    Icon: Check,
    label: 'Ativo',
    badge: 'bg-emerald-100 text-emerald-700',
    row: 'border-l-4 border-l-emerald-400',
  },
  rejected: {
    Icon: XCircle,
    label: 'Recusado',
    badge: 'bg-red-100 text-red-600',
    row: 'border-l-4 border-l-red-300',
  },
};

// ── Tab de filtro ────────────────────────────────────────────
function TabBar({ active, setActive, counts }) {
  const tabs = [
    { key: 'all',      label: 'Todos'     },
    { key: 'accepted', label: 'Ativos'    },
    { key: 'pending',  label: 'Pendentes' },
    { key: 'rejected', label: 'Recusados' },
  ];
  return (
    <div className="flex gap-1 px-4 py-3 border-b border-gray-100 bg-gray-50">
      {tabs.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => setActive(key)}
          className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
            active === key
              ? 'bg-white shadow text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {label}
          {counts[key] > 0 && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              active === key ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-500'
            }`}>
              {counts[key]}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Card de um compartilhamento ──────────────────────────────
function ShareCard({ share, onDelete, isDeleting }) {
  const [confirming, setConfirming] = useState(false);
  const cfg = statusConfig[share.status] || statusConfig.pending;
  const { Icon } = cfg;

  const handleDelete = () => {
    if (!confirming) { setConfirming(true); return; }
    onDelete(share.id);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className={`mx-4 mb-3 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden ${cfg.row}`}
    >
      <div className="p-4">
        {/* Linha superior: email + badge + delete */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 text-sm truncate">
              {share.shared_with_email}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {relationshipLabels[share.relationship_type] || share.relationship_type || '—'}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>
              <Icon className="w-3 h-3" />
              {cfg.label}
            </span>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              title={confirming ? 'Clique novamente para confirmar' : 'Remover'}
              className={`p-1.5 rounded-lg transition-colors ${
                confirming
                  ? 'bg-red-500 text-white'
                  : 'hover:bg-red-50 text-gray-400 hover:text-red-500'
              }`}
            >
              {confirming ? (
                <AlertCircle className="w-4 h-4" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Permissões */}
        {share.permissions && (
          <div className="flex flex-wrap gap-1 mt-2">
            {share.permissions.view_transactions && (
              <Tag>Ver transações</Tag>
            )}
            {share.permissions.add_transactions && (
              <Tag>Adicionar</Tag>
            )}
            {share.permissions.edit_transactions && (
              <Tag>Editar</Tag>
            )}
            {share.permissions.delete_transactions && (
              <Tag color="red">Deletar</Tag>
            )}
            {share.permissions.view_accounts && (
              <Tag>Ver contas</Tag>
            )}
            {share.permissions.manage_accounts && (
              <Tag color="red">Gerenciar contas</Tag>
            )}
          </div>
        )}

        {/* Data */}
        <p className="text-[10px] text-gray-300 mt-2">
          Enviado em {new Date(share.created_at).toLocaleDateString('pt-BR')}
        </p>

        {/* Aviso de confirmação */}
        <AnimatePresence>
          {confirming && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2 text-xs text-red-500 font-medium"
            >
              Clique no ícone novamente para confirmar a remoção.{' '}
              <button
                onClick={() => setConfirming(false)}
                className="underline text-gray-400"
              >
                Cancelar
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function Tag({ children, color = 'gray' }) {
  const colors = {
    gray: 'bg-gray-100 text-gray-500',
    red:  'bg-red-50 text-red-400',
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${colors[color]}`}>
      {children}
    </span>
  );
}

// ── Componente principal ─────────────────────────────────────
export default function SharedAccessList({ onClose }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('all');
  const [showNewInvite, setShowNewInvite] = useState(false);

  // Busca direto do Supabase (sem base44)
  const { data: shares = [], isLoading } = useQuery({
    queryKey: ['sharedAccess', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shared_access')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Delete via Supabase
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('shared_access')
        .delete()
        .eq('id', id)
        .eq('owner_id', user.id); // segurança: só dono pode deletar
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sharedAccess'] });
      queryClient.invalidateQueries({ queryKey: ['pendingInvitesCount'] });
      toast.success('Compartilhamento removido!');
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  // Envio de novo convite (mesma lógica do Profile.jsx)
  const handleShare = async (formData) => {
    const payload = {
      owner_id: user.id,
      shared_with_email: formData.shared_with_email.toLowerCase().trim(),
      relationship_type: formData.relationship_type,
      status: 'pending',
      permissions: formData.permissions,
    };

    const { error } = await supabase
      .from('shared_access')
      .insert([payload]);

    if (error) {
      if (error.code === '23505') throw new Error('Você já convidou este e-mail.');
      throw error;
    }

    queryClient.invalidateQueries({ queryKey: ['sharedAccess'] });
    queryClient.invalidateQueries({ queryKey: ['pendingInvitesCount'] });
    toast.success('Convite enviado!');
    setShowNewInvite(false);
  };

  // Filtragem por aba
  const filtered = activeTab === 'all' ? shares : shares.filter(s => s.status === activeTab);

  const counts = {
    all:      shares.length,
    accepted: shares.filter(s => s.status === 'accepted').length,
    pending:  shares.filter(s => s.status === 'pending').length,
    rejected: shares.filter(s => s.status === 'rejected').length,
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-500" />
              <h2 className="text-lg font-bold text-gray-900">Compartilhamentos</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowNewInvite(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-full transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" /> Novo convite
              </button>
              <button
                onClick={onClose}
                className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <TabBar active={activeTab} setActive={setActiveTab} counts={counts} />

          {/* Lista */}
          <div className="flex-1 overflow-y-auto pt-3 pb-2">
            {isLoading ? (
              <div className="p-10 text-center text-gray-400 text-sm">Carregando...</div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center">
                <Users className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">
                  {activeTab === 'all'
                    ? 'Nenhum compartilhamento ainda'
                    : `Nenhum compartilhamento ${statusConfig[activeTab]?.label?.toLowerCase() || ''}`}
                </p>
                {activeTab === 'all' && (
                  <button
                    onClick={() => setShowNewInvite(true)}
                    className="mt-3 text-xs text-blue-500 underline"
                  >
                    Enviar primeiro convite
                  </button>
                )}
              </div>
            ) : (
              <AnimatePresence>
                {filtered.map((share) => (
                  <ShareCard
                    key={share.id}
                    share={share}
                    onDelete={(id) => deleteMutation.mutate(id)}
                    isDeleting={deleteMutation.isPending}
                  />
                ))}
              </AnimatePresence>
            )}
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100">
            <Button
              onClick={onClose}
              className="w-full h-12 rounded-xl font-semibold bg-blue-600 hover:bg-blue-700"
            >
              Fechar
            </Button>
          </div>
        </motion.div>
      </motion.div>

      {/* Modal de novo convite — abre por cima */}
      <AnimatePresence>
        {showNewInvite && (
          <ShareFinancesModal
            onSubmit={handleShare}
            onClose={() => setShowNewInvite(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}