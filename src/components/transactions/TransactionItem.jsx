import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ShoppingCart, Home, Car, Utensils, Heart, Briefcase,
  GraduationCap, Plane, Gift, DollarSign, Clock, CheckCircle2,
  Copy, Pencil, Trash2, CheckCheck, ArrowLeftRight
} from "lucide-react";
import DuplicarModal from "@/components/common/DuplicarModal";

const categoryIcons = {
  alimentacao: Utensils, moradia: Home, transporte: Car,
  saude: Heart, trabalho: Briefcase, educacao: GraduationCap,
  lazer: Plane, compras: ShoppingCart, presentes: Gift,
  salario: DollarSign, outros: DollarSign,
};

const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function parseDate(dateStr) {
  return new Date(dateStr + "T12:00:00");
}

function useIsDark() {
  const [dark, setDark] = useState(() => localStorage.getItem("darkMode") === "true");
  useEffect(() => {
    const h = (e) => setDark(e.detail);
    window.addEventListener("darkModeChange", h);
    return () => window.removeEventListener("darkModeChange", h);
  }, []);
  return dark;
}

export default function TransactionItem({ transaction, accounts = [], delay = 0, onRegistrar, onDuplicar, onEdit, onDelete }) {
  const dark = useIsDark();
  const [showDuplicar, setShowDuplicar] = useState(false);

  const isTransfer = transaction.type === "transfer";
  const isIncome   = transaction.type === "income";
  const isRealized = transaction.is_realized !== false;

  const Icon = isTransfer
    ? ArrowLeftRight
    : categoryIcons[transaction.category?.toLowerCase()] || DollarSign;

  const account         = accounts.find(a => a.id === transaction.account_id);
  const transferAccount = accounts.find(a => a.id === transaction.transfer_account_id);
  const accountLabel    = isTransfer && account && transferAccount
    ? `${account.name} → ${transferAccount.name}`
    : account?.name || null;

  // ── Tokens idênticos ao Accounts.jsx ─────────────────────
  // dark:  cardBg #0c0e13, borda rgba(255,255,255,0.07)
  // light: cardBg #ffffff,  borda rgba(17,24,39,0.07)
  const cardBg   = dark ? "#0c0e13" : "#ffffff";
  const cardBrd  = dark ? "rgba(255,255,255,0.07)" : "rgba(17,24,39,0.07)";
  const divider  = dark ? "rgba(255,255,255,0.05)" : "rgba(17,24,39,0.05)";
  const textC    = dark ? "#e8edf5" : "#0f172a";
  const mutedC   = dark ? "#6b7a96" : "#64748b";
  const actionBg = dark ? "rgba(255,255,255,0.04)" : "#f8fafc";
  const actionBrd = dark ? "rgba(255,255,255,0.06)" : "rgba(17,24,39,0.07)";
  const shadow   = dark ? "none" : "0 1px 3px rgba(17,24,39,0.04), 0 2px 8px rgba(17,24,39,0.04)";

  // ── Cores por tipo ───────────────────────────────────────
  const tc = isTransfer
    ? { iconBg: dark ? "rgba(37,99,235,0.12)"  : "rgba(37,99,235,0.08)",  iconC: dark ? "#60a5fa" : "#2563eb", amtC: dark ? "#60a5fa" : "#2563eb", prefix: "⇄" }
    : isIncome
      ? { iconBg: dark ? "rgba(5,150,105,0.12)"  : "rgba(5,150,105,0.08)",  iconC: dark ? "#2ecc8a" : "#059669", amtC: dark ? "#2ecc8a" : "#059669", prefix: "+" }
      : { iconBg: dark ? "rgba(220,38,38,0.12)"  : "rgba(220,38,38,0.08)",  iconC: dark ? "#e85d5d" : "#dc2626", amtC: dark ? "#e85d5d" : "#dc2626", prefix: "-" };

  const hasActions = onRegistrar || onDuplicar || onEdit || onDelete;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, delay }}
        style={{
          background: cardBg,
          border: `1px solid ${cardBrd}`,
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: shadow,
          opacity: isRealized ? 1 : 0.72,
          fontFamily: "'Outfit',sans-serif",
        }}
      >
        {/* Linha principal */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" }}>
          <div style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, background: tc.iconBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon size={16} color={tc.iconC} strokeWidth={2} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
              <p style={{ fontWeight: 600, fontSize: "0.85rem", color: textC, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {transaction.description}
              </p>
              {!isRealized
                ? <Clock size={11} color="#f59e0b" style={{ flexShrink: 0 }} />
                : <CheckCircle2 size={11} color={dark ? "#2ecc8a" : "#059669"} style={{ flexShrink: 0 }} />
              }
            </div>
            <p style={{ fontSize: "0.7rem", color: mutedC, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {format(parseDate(transaction.date), "dd 'de' MMM", { locale: ptBR })}
              {!isTransfer && transaction.category && ` · ${transaction.category}`}
              {accountLabel && ` · ${accountLabel}`}
            </p>
          </div>
          <span style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 700, fontSize: "0.9rem", color: tc.amtC, flexShrink: 0, letterSpacing: "-0.02em" }}>
            {tc.prefix} {fmt(transaction.amount)}
          </span>
        </div>

        {/* Barra de ações */}
        {hasActions && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, padding: "5px 12px 8px", borderTop: `1px solid ${divider}` }}>
            {!isRealized && onRegistrar && (
              <motion.button whileTap={{ scale: 0.92 }} onClick={() => onRegistrar(transaction)}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 9, border: "none", cursor: "pointer", background: dark ? "rgba(37,99,235,0.12)" : "rgba(37,99,235,0.08)" }}>
                <CheckCheck size={13} color={dark ? "#60a5fa" : "#2563eb"} />
                <span style={{ fontSize: "0.72rem", fontWeight: 600, color: dark ? "#60a5fa" : "#2563eb" }}>Registrar</span>
              </motion.button>
            )}
            {onDuplicar && !isTransfer && (
              <motion.button whileTap={{ scale: 0.9 }} onClick={() => setShowDuplicar(true)}
                style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${actionBrd}`, background: actionBg, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <Copy size={13} color={mutedC} />
              </motion.button>
            )}
            {onEdit && !isTransfer && (
              <motion.button whileTap={{ scale: 0.9 }} onClick={() => onEdit(transaction)}
                style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${actionBrd}`, background: actionBg, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <Pencil size={13} color={mutedC} />
              </motion.button>
            )}
            {onDelete && (
              <motion.button whileTap={{ scale: 0.9 }} onClick={() => onDelete(transaction.id)}
                style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: dark ? "rgba(220,38,38,0.1)" : "rgba(220,38,38,0.07)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <Trash2 size={13} color={dark ? "#e85d5d" : "#dc2626"} />
              </motion.button>
            )}
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {showDuplicar && (
          <DuplicarModal
            subtitulo={`${transaction.description} · ${fmt(transaction.amount)}`}
            onConfirm={(meses) => { onDuplicar?.(transaction, meses); setShowDuplicar(false); }}
            onClose={() => setShowDuplicar(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}