import React from "react";
import { motion } from "framer-motion";
import { X, Check, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useIsDark } from "@/design/useTheme";
import { useFecharModal, CAMADAS } from "@/hooks/useFecharModal";

// ============================================================
// O paywall é um convite, não um beco sem saída.
//
// Por isso ele diz o que a pessoa estava tentando fazer, quanto ela já
// usou, e o que muda se assinar — nessa ordem. Um modal que só diz
// "faça upgrade" perde a venda porque não conecta com o que a pessoa
// queria naquele segundo.
//
// E é sempre fechável: quem não quer assinar agora continua usando o
// app. O plano Free precisa dar conta de entender o que entra, o que
// sai e quanto sobra — se o paywall atrapalhar isso, ele está errado.
// ============================================================

/** Como cada recurso se apresenta quando o limite bate. */
const RECURSOS = {
  contas: {
    titulo: "Você chegou às suas contas do plano gratuito",
    frase: (l) => `O plano gratuito acompanha ${l} ${l === 1 ? "conta" : "contas"}.`,
    ganho: "Contas ilimitadas — banco, carteira, caixinha, o que precisar",
  },
  cartoes: {
    titulo: "Mais um cartão é coisa do Pro",
    frase: (l) => `O plano gratuito acompanha ${l} ${l === 1 ? "cartão" : "cartões"}.`,
    ganho: "Cartões ilimitados, com fatura de cada um",
  },
  metas: {
    titulo: "Uma meta de cada vez, no plano gratuito",
    frase: (l) => `O plano gratuito acompanha ${l} ${l === 1 ? "meta" : "metas"}.`,
    ganho: "Metas ilimitadas, para separar cada objetivo",
  },
  transacoes_mes: {
    titulo: "Você registrou bastante coisa este mês",
    frase: (l) => `O plano gratuito registra ${l} lançamentos por mês.`,
    ganho: "Lançamentos ilimitados, todo mês",
    extra: "No mês que vem sua cota volta ao normal.",
  },
  finn_mensagens_mes: {
    titulo: "O Finn precisa de uma pausa por aqui",
    frase: (l) => `O plano gratuito tem ${l} conversas com o Finn por mês.`,
    ganho: "300 conversas por mês com o Finn",
    extra: "No mês que vem sua cota volta ao normal.",
  },
  compartilhamento: {
    titulo: "Compartilhar finanças é do Pro",
    frase: () => "Convide quem divide as contas com você.",
    ganho: "Compartilhe com quem você quiser, com permissão que você escolhe",
  },
  recorrencias: {
    titulo: "Lançamento que se repete é do Pro",
    frase: () => "Aluguel, salário, assinatura — lança uma vez e pronto.",
    ganho: "Recorrências automáticas, sem lançar de novo todo mês",
  },
  relatorio_historico: {
    titulo: "O histórico completo é do Pro",
    frase: () => "No plano gratuito você acompanha o mês corrente.",
    ganho: "Todo o histórico, mês a mês, com comparação",
  },
};

const GANHOS_GERAIS = [
  "Lançamentos, contas e cartões sem limite",
  "Finn liberado para conversar sobre suas finanças",
  "Compartilhamento com quem divide as contas",
  "Relatórios com todo o histórico",
];

export default function PaywallModal({ recurso, atual, limite, onClose }) {
  const dark = useIsDark();
  const navigate = useNavigate();
  useFecharModal(true, onClose);

  const info = RECURSOS[recurso] ?? {
    titulo: "Isso é do plano Pro",
    frase: () => "Esse recurso faz parte do PlanejApp Pro.",
    ganho: "Acesso completo ao app",
  };

  const fundo = dark ? "#0c0e13" : "#ffffff";
  const texto = dark ? "#e8edf5" : "#0f172a";
  const suave = dark ? "#6b7a96" : "#64748b";

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(6px)", zIndex: CAMADAS.modal,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <motion.div
        initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label={info.titulo}
        style={{
          background: fundo, borderRadius: "24px 24px 0 0", width: "100%",
          maxWidth: 480, maxHeight: "90vh", overflowY: "auto",
          fontFamily: "'Outfit',sans-serif", paddingBottom: 24,
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 10 }}>
          <div style={{ width: 36, height: 4, borderRadius: 999,
                        background: dark ? "rgba(255,255,255,0.1)" : "rgba(17,24,39,0.1)" }} />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 12px 0" }}>
          <button onClick={onClose} aria-label="Fechar"
            style={{ background: "none", border: "none", padding: 6, cursor: "pointer" }}>
            <X size={18} color={suave} />
          </button>
        </div>

        <div style={{ padding: "0 22px" }}>
          <div style={{
            width: 44, height: 44, borderRadius: 14, marginBottom: 14,
            background: "rgba(124,58,237,0.12)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Sparkles size={22} color="#8b5cf6" />
          </div>

          <h2 style={{
            fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 800,
            fontSize: "1.25rem", color: texto, letterSpacing: "-0.02em", marginBottom: 8,
          }}>
            {info.titulo}
          </h2>

          <p style={{ fontSize: "0.86rem", color: suave, lineHeight: 1.5, marginBottom: 4 }}>
            {info.frase(limite)}
            {typeof atual === "number" && typeof limite === "number" && limite > 0 && (
              <> Você está usando {atual} de {limite}.</>
            )}
          </p>
          {info.extra && (
            <p style={{ fontSize: "0.78rem", color: suave, marginBottom: 16 }}>{info.extra}</p>
          )}

          <div style={{
            background: dark ? "rgba(124,58,237,0.08)" : "rgba(124,58,237,0.05)",
            border: "1px solid rgba(124,58,237,0.2)", borderRadius: 16,
            padding: 16, margin: "18px 0",
          }}>
            <p style={{ fontSize: "0.7rem", fontWeight: 700, color: "#8b5cf6",
                        textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
              Com o Pro
            </p>
            {[info.ganho, ...GANHOS_GERAIS.filter((g) => g !== info.ganho)].slice(0, 4).map((g) => (
              <div key={g} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
                <Check size={15} color="#2ecc8a" style={{ flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: "0.83rem", color: texto }}>{g}</span>
              </div>
            ))}
          </div>

          <button
            // `/subscribe` e nao `/PlanPage`: a PlanPage e a tela de
            // GERIR uma assinatura que existe (trocar cartao, cancelar).
            // Mandar um Free para la e oferecer o botao de cancelar a
            // quem nunca assinou.
            onClick={() => {
              // Carrega o gatilho ate o checkout. Vale so para esta aba
              // e some ao fechar — e o backend ainda confere contra o
              // `paywall_visto` que ELE gravou, entao um valor velho ou
              // adulterado nao vira atribuicao.
              try {
                sessionStorage.setItem("paywall_recurso", recurso ?? "");
              } catch { /* aba anonima, armazenamento bloqueado */ }
              onClose?.();
              navigate("/subscribe");
            }}
            style={{
              width: "100%", height: 50, borderRadius: 14, border: "none", cursor: "pointer",
              background: "linear-gradient(135deg,#7c3aed,#6d28d9)", color: "#fff",
              fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 800, fontSize: "0.95rem",
            }}
          >
            Ver o plano Pro
          </button>

          {/* Sempre há saída. Quem não quer assinar agora continua usando. */}
          <button
            onClick={onClose}
            style={{
              width: "100%", height: 42, marginTop: 8, background: "none", border: "none",
              color: suave, fontSize: "0.85rem", cursor: "pointer", fontFamily: "'Outfit',sans-serif",
            }}
          >
            Agora não
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
