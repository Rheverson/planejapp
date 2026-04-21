import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Clock, Check, XCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

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
  esposo_a: "Esposo(a)", namorado_a: "Namorado(a)", noivo_a: "Noivo(a)",
  irmao_a: "Irmão(ã)", pai_mae: "Pai/Mãe", filho_a: "Filho(a)", outro: "Outro",
  "Esposo(a)": "Esposo(a)", "Namorado(a)": "Namorado(a)", "Noivo(a)": "Noivo(a)",
  "Irmão(ã)": "Irmão(ã)", "Pai/Mãe": "Pai/Mãe", "Filho(a)": "Filho(a)", "Outro": "Outro",
};

export default function PendingInvites({ onClose }) {
  const { user } = useAuth();
  const dark = useIsDark();
  const queryClient = useQueryClient();

  // Tokens de cor
  const bg      = dark ? "#060709"                : "#ffffff";
  const cardBg  = dark ? "#0c0e13"                : "#ffffff";
  const sep     = dark ? "rgba(255,255,255,0.06)" : "rgba(17,24,39,0.06)";
  const text    = dark ? "#e8edf5"                : "#0f172a";
  const muted   = dark ? "#6b7a96"                : "#64748b";
  const permBg  = dark ? "rgba(37,99,235,0.08)"  : "rgba(37,99,235,0.05)";
  const permTxt = dark ? "#60a5fa"                : "#1d4ed8";
  const hoverBg = dark ? "rgba(255,255,255,0.02)" : "#f8fafc";

  const { data: pendingInvites = [], isLoading } = useQuery({
    queryKey: ["pendingInvites", user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      const { data: invites, error } = await supabase
        .from("shared_access")
        .select("id, status, created_at, shared_with_email, relationship_type, permissions, owner_id")
        .eq("shared_with_email", user.email)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!invites?.length) return [];

      const ownerIds = [...new Set(invites.map(i => i.owner_id).filter(Boolean))];
      const ownersMap = {};
      await Promise.all(ownerIds.map(async (ownerId) => {
        const { data } = await supabase.rpc("get_user_by_id", { user_id_input: ownerId });
        if (data?.[0]) ownersMap[ownerId] = data[0];
      }));
      return invites.map(invite => ({ ...invite, owner: ownersMap[invite.owner_id] || null }));
    },
    enabled: !!user?.email,
  });

  const acceptMutation = useMutation({
    mutationFn: async (shareId) => {
      const { error } = await supabase.from("shared_access").update({ status: "accepted" }).eq("id", shareId).eq("shared_with_email", user.email);
      if (error) throw error;
      await supabase.from("notifications").update({ status: "read", read_at: new Date().toISOString() }).eq("shared_access_id", shareId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pendingInvites"] });
      queryClient.invalidateQueries({ queryKey: ["pendingInvitesCount"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Convite aceito!");
    },
    onError: (err) => toast.error("Erro ao aceitar convite: " + err.message),
  });

  const rejectMutation = useMutation({
    mutationFn: async (shareId) => {
      const { error } = await supabase.from("shared_access").update({ status: "rejected" }).eq("id", shareId).eq("shared_with_email", user.email);
      if (error) throw error;
      await supabase.from("notifications").update({ status: "read", read_at: new Date().toISOString() }).eq("shared_access_id", shareId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pendingInvites"] });
      queryClient.invalidateQueries({ queryKey: ["pendingInvitesCount"] });
      toast.success("Convite recusado!");
    },
    onError: (err) => toast.error("Erro ao recusar convite: " + err.message),
  });

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        style={{ background: bg, border: `0.5px solid ${sep}`, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 -8px 40px rgba(0,0,0,0.2)" }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px 14px", borderBottom: `0.5px solid ${sep}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: dark ? "rgba(245,158,11,0.12)" : "rgba(245,158,11,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Clock size={17} color="#f59e0b" />
            </div>
            <h2 style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontWeight: 800, fontSize: "1rem", color: text, letterSpacing: "-0.02em", margin: 0 }}>
              Convites Pendentes
            </h2>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: dark ? "rgba(255,255,255,0.06)" : "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={15} color={muted} />
          </button>
        </div>

        {/* Lista */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {isLoading ? (
            <div style={{ padding: 40, textAlign: "center", color: muted }}>
              <Clock size={36} color={dark ? "rgba(255,255,255,0.1)" : "#e2e8f0"} style={{ margin: "0 auto 12px", display: "block" }} />
              <p style={{ fontSize: "0.82rem" }}>Buscando convites...</p>
            </div>
          ) : pendingInvites.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: muted }}>
              <Clock size={36} color={dark ? "rgba(255,255,255,0.1)" : "#e2e8f0"} style={{ margin: "0 auto 12px", display: "block" }} />
              <p style={{ fontSize: "0.82rem" }}>Nenhum convite pendente</p>
            </div>
          ) : (
            pendingInvites.map((invite, index) => (
              <motion.div key={invite.id || index}
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                style={{ padding: "14px 20px", borderBottom: `0.5px solid ${sep}`, transition: "background .15s" }}
                onMouseEnter={e => e.currentTarget.style.background = hoverBg}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                {/* Info do dono */}
                <div style={{ marginBottom: 10 }}>
                  <p style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontWeight: 700, fontSize: "0.9rem", color: text, marginBottom: 3 }}>
                    {invite.owner?.full_name || invite.owner?.email || "Usuário desconhecido"}
                  </p>
                  <p style={{ fontSize: "0.72rem", color: muted }}>
                    Compartilhar como: <strong style={{ color: text }}>{relationshipLabels[invite.relationship_type] || invite.relationship_type || "Outro"}</strong>
                  </p>
                  <p style={{ fontSize: "0.65rem", color: dark ? "rgba(255,255,255,0.2)" : "#cbd5e1", marginTop: 3 }}>
                    {new Date(invite.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>

                {/* Permissões */}
                {invite.permissions && (
                  <div style={{ background: permBg, borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
                    <p style={{ fontSize: "0.65rem", fontWeight: 700, color: permTxt, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Permissões solicitadas
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                      {[
                        [invite.permissions.view_transactions,  "Ver transações"],
                        [invite.permissions.add_transactions,   "Adicionar transações"],
                        [invite.permissions.edit_transactions,  "Editar transações"],
                        [invite.permissions.delete_transactions,"Deletar transações"],
                        [invite.permissions.view_accounts,      "Ver contas"],
                        [invite.permissions.manage_accounts,    "Gerenciar contas"],
                      ].filter(([v]) => v).map(([, label]) => (
                        <span key={label} style={{ fontSize: "0.68rem", color: permTxt }}>✓ {label}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Botões */}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => invite.id && rejectMutation.mutate(invite.id)}
                    disabled={rejectMutation.isPending || !invite.id}
                    style={{
                      flex: 1, height: 38, borderRadius: 10, border: `1px solid ${dark ? "rgba(232,93,93,0.3)" : "#fecaca"}`,
                      background: dark ? "rgba(232,93,93,0.08)" : "#fef2f2",
                      color: dark ? "#e85d5d" : "#dc2626",
                      fontFamily: "'Cabinet Grotesk', sans-serif", fontWeight: 700, fontSize: "0.8rem",
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                      opacity: rejectMutation.isPending ? 0.5 : 1,
                    }}>
                    <XCircle size={14} /> Recusar
                  </button>
                  <button
                    onClick={() => invite.id && acceptMutation.mutate(invite.id)}
                    disabled={acceptMutation.isPending || !invite.id}
                    style={{
                      flex: 1, height: 38, borderRadius: 10, border: "none",
                      background: "linear-gradient(135deg,#10b981,#059669)",
                      color: "#ffffff",
                      fontFamily: "'Cabinet Grotesk', sans-serif", fontWeight: 700, fontSize: "0.8rem",
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                      boxShadow: "0 0 14px rgba(16,185,129,0.3)",
                      opacity: acceptMutation.isPending ? 0.5 : 1,
                    }}>
                    <Check size={14} /> Aceitar
                  </button>
                </div>
              </motion.div>
            ))
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
  );
}