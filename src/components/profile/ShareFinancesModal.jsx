import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X, Users, Mail, Check, AlertCircle, Loader2, ChevronDown } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";

const RELATIONSHIP_TYPES = [
  "Esposo(a)", "Namorado(a)", "Noivo(a)", "Irmão(ã)", "Pai/Mãe", "Filho(a)", "Outro"
];

function useIsDark() {
  const [dark, setDark] = useState(() => {
    // Lê localStorage E classe do documento para garantir sincronia
    return localStorage.getItem("darkMode") === "true" ||
           document.documentElement.classList.contains("dark");
  });
  useEffect(() => {
    // Observa mudanças de classe no <html> para pegar qualquer forma de toggle
    const observer = new MutationObserver(() => {
      setDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    // Também escuta o evento customizado
    const h = (e) => setDark(e.detail);
    window.addEventListener("darkModeChange", h);
    return () => {
      observer.disconnect();
      window.removeEventListener("darkModeChange", h);
    };
  }, []);
  return dark;
}

function PermissionRow({ title, description, checked, onChange, disabled, dark }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", justifyContent: "space-between",
      gap: 16, padding: "12px 0",
      borderBottom: `0.5px solid ${dark ? "rgba(255,255,255,0.05)" : "rgba(17,24,39,0.05)"}`,
    }}>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: "0.82rem", fontWeight: 600, color: dark ? "#e8edf5" : "#0f172a", marginBottom: 2 }}>{title}</p>
        <p style={{ fontSize: "0.7rem", color: dark ? "#6b7a96" : "#64748b" }}>{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

export default function ShareFinancesModal({ onSubmit, onClose }) {
  const { user } = useAuth();
  const dark = useIsDark();
  const [loading, setLoading]               = useState(false);
  const [emailCheckLoading, setEmailCheckLoading] = useState(false);
  const [emailExists, setEmailExists]       = useState(null);
  const [formData, setFormData]             = useState({
    shared_with_email: "",
    relationship_type: "",
    permissions: {
      view_transactions: true,
      add_transactions: true,
      edit_transactions: false,
      delete_transactions: false,
      view_accounts: true,
      manage_accounts: false,
    },
  });

  // Tokens de cor
  const bg      = dark ? "#0c0e13"                : "#ffffff";
  const border  = dark ? "rgba(255,255,255,0.08)" : "rgba(17,24,39,0.08)";
  const sep     = dark ? "rgba(255,255,255,0.06)" : "rgba(17,24,39,0.06)";
  const text    = dark ? "#e8edf5"                : "#0f172a";
  const muted   = dark ? "#6b7a96"                : "#64748b";
  const inputBg = dark ? "#12151c"                : "#f8fafc";
  const inputBrd= dark ? "rgba(255,255,255,0.1)"  : "rgba(17,24,39,0.1)";
  const subBg   = dark ? "#12151c"                : "#f8fafc";

  const checkEmailExists = async (email) => {
    try {
      setEmailCheckLoading(true);
      const { data, error } = await supabase.rpc("get_user_by_email", { email_input: email.trim().toLowerCase() });
      if (error) { setEmailExists(false); return; }
      setEmailExists(data && data.length > 0);
    } catch { setEmailExists(false); }
    finally { setEmailCheckLoading(false); }
  };

  const handleEmailChange = async (e) => {
    const val = e.target.value;
    setFormData(prev => ({ ...prev, shared_with_email: val }));
    if (val.includes("@") && val.length > 5) await checkEmailExists(val);
    else setEmailExists(null);
  };

  const updatePermission = (key, value) =>
    setFormData(prev => ({ ...prev, permissions: { ...prev.permissions, [key]: value } }));

  const handleSubmit = async () => {
    if (!formData.shared_with_email || !formData.relationship_type) {
      toast.error("Preencha todos os campos obrigatórios"); return;
    }
    if (emailExists !== true) {
      toast.error("O e-mail digitado não possui uma conta ativa"); return;
    }
    if (formData.shared_with_email.toLowerCase() === user?.email?.toLowerCase()) {
      toast.error("Você não pode compartilhar com você mesmo"); return;
    }
    setLoading(true);
    try {
      await onSubmit({
        shared_with_email: formData.shared_with_email.toLowerCase().trim(),
        relationship_type: formData.relationship_type,
        permissions: formData.permissions,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const isFormValid =
    formData.shared_with_email &&
    formData.relationship_type &&
    emailExists === true &&
    formData.shared_with_email.toLowerCase() !== user?.email?.toLowerCase() &&
    !loading;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", zIndex: 999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: bg, border: `0.5px solid ${border}`,
          borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480,
          maxHeight: "92vh", display: "flex", flexDirection: "column",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.2)",
        }}
      >
        {/* Header */}
        <div style={{ padding: "18px 20px 14px", borderBottom: `0.5px solid ${sep}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: dark ? "rgba(37,99,235,0.12)" : "rgba(37,99,235,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Users size={18} color="#2563eb" />
            </div>
            <div>
              <h2 style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontWeight: 800, fontSize: "1rem", color: text, letterSpacing: "-0.02em", margin: 0 }}>
                Compartilhar finanças
              </h2>
              <p style={{ fontSize: "0.7rem", color: muted, margin: 0 }}>Convide alguém para ver suas finanças</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: dark ? "rgba(255,255,255,0.06)" : "#f1f5f9", border: "none", borderRadius: 8, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={15} color={muted} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>

          {/* Email */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: "0.65rem", fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>
              E-mail do convidado <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <div style={{ position: "relative" }}>
              <Mail size={15} color={muted} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
              <input
                type="email"
                placeholder="exemplo@email.com"
                value={formData.shared_with_email}
                onChange={handleEmailChange}
                disabled={loading}
                style={{
                  width: "100%", height: 44, paddingLeft: 38, paddingRight: 40,
                  background: inputBg, border: `1px solid ${emailExists === false ? "#ef4444" : emailExists === true ? "#10b981" : inputBrd}`,
                  borderRadius: 12, color: text, fontSize: "0.88rem",
                  fontFamily: "'Outfit', sans-serif", outline: "none", boxSizing: "border-box",
                  transition: "border-color .2s",
                }}
              />
              <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)" }}>
                {emailCheckLoading && <Loader2 size={16} color="#2563eb" style={{ animation: "spin 1s linear infinite" }} />}
                {!emailCheckLoading && emailExists === true  && <Check size={16} color="#10b981" />}
                {!emailCheckLoading && emailExists === false && <AlertCircle size={16} color="#ef4444" />}
              </div>
            </div>
            {emailExists === false && (
              <p style={{ fontSize: "0.68rem", color: "#ef4444", fontWeight: 500, marginTop: 5 }}>
                Este usuário ainda não possui conta no app.
              </p>
            )}
            {emailExists === true && (
              <p style={{ fontSize: "0.68rem", color: "#10b981", fontWeight: 500, marginTop: 5 }}>
                ✓ Usuário encontrado!
              </p>
            )}
          </div>

          {/* Relacionamento */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: "0.65rem", fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>
              Tipo de relacionamento <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <div style={{ position: "relative" }}>
              <select
                value={formData.relationship_type}
                onChange={(e) => setFormData(prev => ({ ...prev, relationship_type: e.target.value }))}
                disabled={loading}
                style={{
                  width: "100%", height: 44, padding: "0 36px 0 14px",
                  background: inputBg, border: `1px solid ${inputBrd}`,
                  borderRadius: 12, color: formData.relationship_type ? text : muted,
                  fontSize: "0.88rem", fontFamily: "'Outfit', sans-serif",
                  outline: "none", appearance: "none", boxSizing: "border-box", cursor: "pointer",
                }}
              >
                <option value="" disabled>Selecione...</option>
                {RELATIONSHIP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <ChevronDown size={15} color={muted} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            </div>
          </div>

          {/* Permissões */}
          <div>
            <label style={{ fontSize: "0.65rem", fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 10 }}>
              Permissões de acesso
            </label>
            <div style={{ background: subBg, borderRadius: 14, padding: "0 14px", border: `1px solid ${dark ? "rgba(255,255,255,0.05)" : "rgba(17,24,39,0.05)"}` }}>
              <PermissionRow
                title="Ver transações e contas"
                description="Permite visualizar extratos e saldos"
                checked={formData.permissions.view_transactions}
                onChange={(v) => updatePermission("view_transactions", v)}
                disabled={loading} dark={dark}
              />
              <PermissionRow
                title="Adicionar registros"
                description="Permite criar novas receitas ou despesas"
                checked={formData.permissions.add_transactions}
                onChange={(v) => updatePermission("add_transactions", v)}
                disabled={loading} dark={dark}
              />
              <div style={{ padding: "12px 0" }}>
                <PermissionRow
                  title="Editar registros"
                  description="Permite editar transações existentes"
                  checked={formData.permissions.edit_transactions}
                  onChange={(v) => updatePermission("edit_transactions", v)}
                  disabled={loading} dark={dark}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 20px 28px", borderTop: `0.5px solid ${sep}`, display: "flex", gap: 10, flexShrink: 0 }}>
          <button onClick={onClose} disabled={loading} style={{
            flex: 1, height: 46, borderRadius: 12, border: `1px solid ${inputBrd}`,
            background: "transparent", color: muted, fontSize: "0.88rem", fontWeight: 600,
            fontFamily: "'Cabinet Grotesk', sans-serif", cursor: "pointer",
          }}>
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={!isFormValid} style={{
            flex: 2, height: 46, borderRadius: 12, border: "none",
            background: isFormValid ? "linear-gradient(135deg,#1d4ed8,#3730a3)" : (dark ? "rgba(255,255,255,0.06)" : "#f1f5f9"),
            color: isFormValid ? "#ffffff" : muted,
            fontSize: "0.9rem", fontWeight: 800,
            fontFamily: "'Cabinet Grotesk', sans-serif",
            cursor: isFormValid ? "pointer" : "not-allowed",
            boxShadow: isFormValid ? "0 0 20px rgba(29,78,216,0.3)" : "none",
            transition: "all .2s",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            {loading ? (
              <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Enviando...</>
            ) : "Compartilhar"}
          </button>
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </motion.div>
    </motion.div>
  );
}