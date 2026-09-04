import React from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { usePlano } from "@/lib/usePlano";

// ============================================================
// Cobrança que falhou: aviso, não porta trancada.
//
// Antes, `past_due` e `unpaid` batiam num muro no App.jsx — o app
// inteiro virava uma tela de pagamento. É a pior hora possível para
// isso: se o cartão falhou, a pessoa pode estar justamente sem dinheiro,
// e é aí que um app de controle financeiro mais serve.
//
// Hoje ela cai no Free como qualquer outro (a regra é a mesma nos três
// lugares: `temAcessoPro`, `plano_do_usuario` no banco e o espelho do
// backend). O que ela perde é o Pro, não o app. Este banner é a
// cobrança: diz o que aconteceu, o que mudou e para onde ir.
// ============================================================

export default function AvisoPagamento() {
  const { pagamentoFalhou, ehPro, carregando } = usePlano();
  if (carregando || !pagamentoFalhou) return null;

  // Um fundador continua Pro mesmo com a cobrança falhando, então
  // dizer "seu plano foi alterado" seria mentira para ele.
  const texto = ehPro
    ? "Seu último pagamento falhou. Atualize seu cartão para manter o Pro."
    : "Seu último pagamento falhou e seu plano foi alterado para o Free. Atualize seu cartão para restaurar os limites do Pro.";

  return (
    <motion.div
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      role="alert"
    >
      <Link
        to="/PlanPage"
        aria-label="Atualizar forma de pagamento"
        style={{ textDecoration: "none", display: "block" }}
      >
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px",
          background: "linear-gradient(135deg,#b45309,#92400e)",
          fontFamily: "'Outfit',sans-serif",
        }}>
          <AlertTriangle size={16} color="#fff" style={{ flexShrink: 0 }} />
          <span style={{
            flex: 1, color: "#fff", fontSize: "0.76rem",
            lineHeight: 1.35, fontWeight: 600,
          }}>
            {texto}
          </span>
          <ChevronRight size={16} color="rgba(255,255,255,0.8)" style={{ flexShrink: 0 }} />
        </div>
      </Link>
    </motion.div>
  );
}
