import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, Clock, Check, XCircle, UserPlus, Users, AlertCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';
import ShareFinancesModal from './ShareFinancesModal';

function useIsDark() {
  const [dark, setDark] = useState(() =>
    localStorage.getItem("darkMode") === "true" ||
    document.documentElement.classList.contains("dark")
  );
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains("dark"))
    );
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    const h = (e) => setDark(e.detail);
    window.addEventListener("darkModeChange", h);
    return () => { obs.disconnect(); window.removeEventListener("darkModeChange", h); };
  }, []);
  return dark;
}

const relationshipLabels = {
  'Esposo(a)': 'Esposo(a)', 'Namorado(a)': 'Namorado(a)', 'Noivo(a)': 'Noivo(a)',
  'Irmão(ã)': 'Irmão(ã)', 'Pai/Mãe': 'Pai/Mãe', 'Filho(a)': 'Filho(a)', 'Outro': 'Outro',
  esposo_a: 'Esposo(a)', namorado_a: 'Namorado(a)', noivo_a: 'Noivo(a)',
  irmao_a: 'Irmão(ã)', pai_mae: 'Pai/Mãe', filho_a: 'Filho(a)', outro: 'Outro',
};

function TabBar({ active, setActive, counts, dark }) {
  const tabs = [
    { key: 'all', label: 'Todos' }, { key: 'accepted', label: 'Ativos' },
    { key: 'pending', label: 'Pendentes' }, { key: 'rejected', label: 'Recusados' },
  ];
  return (
    <div style={{ display: "flex", gap: 4, padding: "10px 16px", borderBottom: `0.5px solid ${dark ? "rgba(255,255,255,0.06)" : "rgba(17,24,39,0.06)"}`, background: dark ? "#0c0e13" : "#f8fafc" }}>
      {tabs.map(({ key, label }) => {
        const isActive = active === key;
        return (
          <button key={key} onClick={() => setActive(key)} style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
            padding: "6px 4px", borderRadius: 10, border: "none", cursor: "pointer",
            fontSize: "0.72rem", fontWeight: 600, fontFamily: "'Outfit', sans-serif",
            background: isActive ? (dark ? "#12151c" : "#ffffff") : "transparent",
            color: isActive ? (dark ? "#60a5fa" : "#1d4ed8") : (dark ? "#6b7a96" : "#64748b"),
            boxShadow: isActive ? (dark ? "none" : "0 1px 4px rgba(0,0,0,0.08)") : "none",
            transition: "all .2s",
          }}>
            {label}
            {counts[key] > 0 && (
              <span style={{
                fontSize: "0.6rem", fontWeight: 700, padding: "1px 5px", borderRadius: 999,
                background: isActive ? (dark ? "rgba(96,165,250,0.15)" : "rgba(29,78,216,0.1)") : (dark ? "rgba(255,255,255,0.06)" : "#e5e7eb"),
                color: isActive ? (dark ? "#60a5fa" : "#1d4ed8") : (dark ? "#6b7a96" : "#64748b"),
              }}>{counts[key]}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Tag({ children, color = 'gray', dark }) {
  const styles = {
    gray: { bg: dark ? "rgba(255,255,255,0.06)" : "#f1f5f9", color: dark ? "#6b7a96" : "#64748b" },
    red:  { bg: dark ? "rgba(232,93,93,0.1)"    : "#fef2f2", color: dark ? "#e85d5d" : "#dc2626" },
  };
  const s = styles[color] || styles.gray;
  return (
    <span style={{ fontSize: "0.62rem", padding: "2px 8px", borderRadius: 999, fontWeight: 500, background: s.bg, color: s.color }}>
      {children}
    </span>
  );
}

function ShareCard({ share, onDelete, isDeleting, dark }) {
  const [confirming, setConfirming] = useState(false);

  const statusMap = {
    pending:  { icon: Clock,    label: "Aguardando", barColor: "#f59e0b", badgeBg: dark ? "rgba(245,158,11,0.12)" : "#fffbeb", badgeColor: "#f59e0b" },
    accepted: { icon: Check,    label: "Ativo",      barColor: "#10b981", badgeBg: dark ? "rgba(16,185,129,0.12)" : "#f0fdf4", badgeColor: "#10b981" },
    rejected: { icon: XCircle,  label: "Recusado",   barColor: "#ef4444", badgeBg: dark ? "rgba(239,68,68,0.12)"  : "#fef2f2", badgeColor: "#ef4444" },
  };
  const s = statusMap[share.status] || statusMap.pending;
  const Icon = s.icon;

  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }}
      style={{
        margin: "0 14px 10px",
        background: dark ? "#0c0e13" : "#ffffff",
        border: `1px solid ${dark ? "rgba(255,255,255,0.07)" : "rgba(17,24,39,0.05)"}`,
        borderRadius: 14, overflow: "hidden",
        borderLeft: `3px solid ${s.barColor}`,
        boxShadow: dark ? "none" : "0 1px 4px rgba(17,24,39,0.04)",
      }}>
      <div style={{ padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontWeight: 700, fontSize: "0.85rem", color: dark ? "#e8edf5" : "#0f172a", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {share.shared_with_email}
            </p>
            <p style={{ fontSize: "0.7rem", color: dark ? "#6b7a96" : "#64748b" }}>
              {relationshipLabels[share.relationship_type] || share.relationship_type || "—"}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.68rem", fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: s.badgeBg, color: s.badgeColor }}>
              <Icon size={11} /> {s.label}
            </span>
            <button onClick={() => { if (!confirming) { setConfirming(true); return; } onDelete(share.id); }}
              disabled={isDeleting}
              style={{
                width: 28, height: 28, borderRadius: 8, border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: confirming ? "#ef4444" : (dark ? "rgba(255,255,255,0.06)" : "#f1f5f9"),
                transition: "all .2s",
              }}>
              {confirming ? <AlertCircle size={14} color="#fff" /> : <Trash2 size={14} color={dark ? "#6b7a96" : "#94a3b8"} />}
            </button>
          </div>
        </div>

        {share.permissions && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
            {share.permissions.view_transactions  && <Tag dark={dark}>Ver transações</Tag>}
            {share.permissions.add_transactions   && <Tag dark={dark}>Adicionar</Tag>}
            {share.permissions.edit_transactions  && <Tag dark={dark}>Editar</Tag>}
            {share.permissions.delete_transactions && <Tag color="red" dark={dark}>Deletar</Tag>}
            {share.permissions.view_accounts      && <Tag dark={dark}>Ver contas</Tag>}
            {share.permissions.manage_accounts    && <Tag color="red" dark={dark}>Gerenciar contas</Tag>}
          </div>
        )}

        <p style={{ fontSize: "0.6rem", color: dark ? "rgba(255,255,255,0.2)" : "#cbd5e1" }}>
          Enviado em {new Date(share.created_at).toLocaleDateString("pt-BR")}
        </p>

        <AnimatePresence>
          {confirming && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              style={{ marginTop: 6, fontSize: "0.7rem", color: "#ef4444", fontWeight: 500 }}>
              Clique no ícone novamente para confirmar.{" "}
              <button onClick={() => setConfirming(false)} style={{ background: "none", border: "none", cursor: "pointer", color: dark ? "#6b7a96" : "#94a3b8", textDecoration: "underline", fontSize: "0.7rem" }}>
                Cancelar
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default function SharedAccessList({ onClose }) {
  const { user } = useAuth();
  const dark = useIsDark();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab]     = useState("all");
  const [showNewInvite, setShowNewInvite] = useState(false);

  const bg     = dark ? "#060709"                : "#ffffff";
  const cardBg = dark ? "#0c0e13"                : "#ffffff";
  const sep    = dark ? "rgba(255,255,255,0.06)" : "rgba(17,24,39,0.06)";
  const text   = dark ? "#e8edf5"                : "#0f172a";
  const muted  = dark ? "#6b7a96"                : "#64748b";

  const { data: shares = [], isLoading } = useQuery({
    queryKey: ["sharedAccess", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("shared_access").select("*").eq("owner_id", user.id).order("created_at", { ascending: false });
      if (error) throw error; return data;
    },
    enabled: !!user?.id,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("shared_access").delete().eq("id", id).eq("owner_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["sharedAccess"] }); queryClient.invalidateQueries({ queryKey: ["pendingInvitesCount"] }); toast.success("Compartilhamento removido!"); },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const handleShare = async (formData) => {
    const { error } = await supabase.from("shared_access").insert([{
      owner_id: user.id,
      shared_with_email: formData.shared_with_email.toLowerCase().trim(),
      relationship_type: formData.relationship_type,
      status: "pending",
      permissions: formData.permissions,
    }]);
    if (error) {
      if (error.code === "23505") throw new Error("Você já convidou este e-mail.");
      throw error;
    }
    queryClient.invalidateQueries({ queryKey: ["sharedAccess"] });
    queryClient.invalidateQueries({ queryKey: ["pendingInvitesCount"] });
    toast.success("Convite enviado!");
    setShowNewInvite(false);
  };

  const filtered = activeTab === "all" ? shares : shares.filter(s => s.status === activeTab);
  const counts = {
    all: shares.length,
    accepted: shares.filter(s => s.status === "accepted").length,
    pending:  shares.filter(s => s.status === "pending").length,
    rejected: shares.filter(s => s.status === "rejected").length,
  };

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
        onClick={onClose}>
        <motion.div
          initial={{ y: "100%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          style={{ background: bg, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 -8px 40px rgba(0,0,0,0.2)", border: `0.5px solid ${sep}` }}>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px 14px", borderBottom: `0.5px solid ${sep}`, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: dark ? "rgba(37,99,235,0.12)" : "rgba(37,99,235,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Users size={17} color="#2563eb" />
              </div>
              <h2 style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontWeight: 800, fontSize: "1rem", color: text, letterSpacing: "-0.02em", margin: 0 }}>
                Compartilhamentos
              </h2>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={() => setShowNewInvite(true)} style={{
                display: "flex", alignItems: "center", gap: 5, fontSize: "0.72rem", fontWeight: 700,
                color: "#2563eb", background: dark ? "rgba(37,99,235,0.12)" : "rgba(37,99,235,0.08)",
                border: "none", borderRadius: 999, padding: "6px 12px", cursor: "pointer",
                fontFamily: "'Cabinet Grotesk', sans-serif",
              }}>
                <UserPlus size={13} /> Novo convite
              </button>
              <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: dark ? "rgba(255,255,255,0.06)" : "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <X size={15} color={muted} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <TabBar active={activeTab} setActive={setActiveTab} counts={counts} dark={dark} />

          {/* Lista */}
          <div style={{ flex: 1, overflowY: "auto", paddingTop: 12, paddingBottom: 8 }}>
            {isLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: muted, fontSize: "0.82rem" }}>Carregando...</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center" }}>
                <Users size={40} color={dark ? "rgba(255,255,255,0.08)" : "#e2e8f0"} style={{ margin: "0 auto 12px" }} />
                <p style={{ fontSize: "0.82rem", color: muted }}>
                  {activeTab === "all" ? "Nenhum compartilhamento ainda" : `Nenhum ${statusMap?.[activeTab]?.label?.toLowerCase() || ""}`}
                </p>
                {activeTab === "all" && (
                  <button onClick={() => setShowNewInvite(true)} style={{ marginTop: 8, fontSize: "0.72rem", color: "#2563eb", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                    Enviar primeiro convite
                  </button>
                )}
              </div>
            ) : (
              <AnimatePresence>
                {filtered.map((share) => (
                  <ShareCard key={share.id} share={share} dark={dark}
                    onDelete={(id) => deleteMutation.mutate(id)}
                    isDeleting={deleteMutation.isPending} />
                ))}
              </AnimatePresence>
            )}
          </div>

          {/* Footer */}
          <div style={{ flexShrink: 0, padding: "12px 20px 28px", borderTop: `0.5px solid ${sep}` }}>
            <button onClick={onClose} style={{
              width: "100%", height: 46, borderRadius: 12, border: "none",
              background: "linear-gradient(135deg,#1d4ed8,#3730a3)",
              color: "#ffffff", fontFamily: "'Cabinet Grotesk', sans-serif",
              fontWeight: 800, fontSize: "0.95rem", cursor: "pointer",
              boxShadow: "0 0 20px rgba(29,78,216,0.3)",
            }}>Fechar</button>
          </div>
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {showNewInvite && (
          <ShareFinancesModal onSubmit={handleShare} onClose={() => setShowNewInvite(false)} />
        )}
      </AnimatePresence>
    </>
  );
}