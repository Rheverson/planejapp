import React, { useState } from "react";
import { motion } from "framer-motion";
import { X, Sparkles, Shield, Zap, Check, ChevronRight } from "lucide-react";
import { useIsDark } from "@/design/useTheme";
import { useFecharModal, CAMADAS } from "@/hooks/useFecharModal";
import { vibrar } from "@/lib/vibrar";

// ============================================================
// O convite para ligar a captura automática.
//
// Era um banner de uma linha no topo: "⚡ Toque para ativar captura
// automática de transações". Pedia a permissão MAIS invasiva do Android
// — ler todas as notificações do aparelho — com quatorze palavras e
// nenhuma explicação. Quem lê isso e concede está confiando às cegas;
// quem lê e não concede está certo.
//
// Três telas, porque são três perguntas diferentes na cabeça de quem
// decide, nesta ordem:
//
//   1. o que eu ganho?      (o gasto entra sozinho)
//   2. o que vocês veem?    (só banco, só valor, nada mais)
//   3. como eu ligo?        (o passo a passo do Android)
//
// A ordem importa: começar pela permissão é pedir antes de oferecer.
//
// E tem saída em todas as telas. "Agora não" é uma resposta legítima —
// o app funciona inteiro sem isso, e insistir só ensina a fechar
// qualquer coisa que apareça.
// ============================================================

const TELAS = [
  {
    icone: Zap,
    cor: "#f59e0b",
    titulo: "Seus gastos entram sozinhos",
    texto:
      "Quando o banco avisa uma compra ou um Pix, o PlanejeApp registra na hora — "
      + "sem você digitar nada.",
    pontos: [
      "Compra no cartão, Pix enviado e recebido, débito",
      "Nubank, Itaú, Bradesco, BB, Santander, Inter, PicPay e Caixa",
      "Cai na conta certa, se você tiver o banco cadastrado",
    ],
  },
  {
    icone: Shield,
    cor: "#2ecc8a",
    titulo: "O que o app lê, e o que não lê",
    texto:
      "Para isso o Android pede acesso às notificações. É uma permissão ampla, "
      + "então vale dizer exatamente o que fazemos com ela.",
    pontos: [
      "Só notificações de aplicativos de banco — o resto é descartado",
      "Só o valor, o tipo e o nome do estabelecimento",
      "Nada é enviado para terceiros, e você pode desligar quando quiser",
    ],
  },
  {
    icone: Sparkles,
    cor: "#8b5cf6",
    titulo: "Faltam dois toques",
    texto:
      "O Android abre a lista de aplicativos com acesso a notificações. "
      + "Encontre o PlanejeApp e ligue a chave.",
    pontos: [
      "Toque em “Abrir configurações” aqui embaixo",
      "Procure PlanejeApp na lista",
      "Ligue a chave e volte — o app reconhece sozinho",
    ],
  },
];

export default function ConviteCaptura({ aberto, onAtivar, onFechar }) {
  const dark = useIsDark();
  const [passo, setPasso] = useState(0);
  useFecharModal(aberto, onFechar);

  if (!aberto) return null;

  const tela = TELAS[passo];
  const Icone = tela.icone;
  const ultima = passo === TELAS.length - 1;

  const fundo = dark ? "#0c0e13" : "#ffffff";
  const texto = dark ? "#e8edf5" : "#0f172a";
  const suave = dark ? "#6b7a96" : "#64748b";

  const avancar = () => {
    vibrar.toque();
    if (ultima) onAtivar();
    else setPasso((p) => p + 1);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onFechar}
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
        role="dialog" aria-modal="true" aria-label={tela.titulo}
        style={{
          background: fundo, borderRadius: "24px 24px 0 0", width: "100%",
          maxWidth: 480, maxHeight: "92vh", overflowY: "auto",
          fontFamily: "'Outfit',sans-serif", paddingBottom: 22,
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 10 }}>
          <div style={{ width: 36, height: 4, borderRadius: 999,
                        background: dark ? "rgba(255,255,255,0.1)" : "rgba(17,24,39,0.1)" }} />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 12px 0" }}>
          <button onClick={onFechar} aria-label="Fechar"
            style={{ background: "none", border: "none", padding: 6, cursor: "pointer" }}>
            <X size={18} color={suave} />
          </button>
        </div>

        <div style={{ padding: "0 22px" }}>
          {/* Sem `AnimatePresence mode="wait"` de propósito.
              Com ele, o filho novo só monta depois de o antigo TERMINAR
              de sair — e os pontinhos e o botão, que estão fora daqui,
              já refletiam o passo seguinte. Resultado: o botão dizia
              "Abrir configurações" com o texto da primeira tela ainda na
              frente. Se a animação de saída não completa (aba em
              segundo plano, `prefers-reduced-motion`), o conteúdo
              congela para sempre.

              O `key` sozinho remonta o bloco e refaz a entrada. Não há
              o que esperar. */}
          <div>
            <motion.div
              key={passo}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.18 }}
            >
              <div style={{
                width: 46, height: 46, borderRadius: 14, marginBottom: 15,
                background: `${tela.cor}1f`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icone size={22} color={tela.cor} />
              </div>

              <h2 style={{
                fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 800,
                fontSize: "1.28rem", color: texto, letterSpacing: "-0.02em",
                marginBottom: 9, lineHeight: 1.2,
              }}>
                {tela.titulo}
              </h2>

              <p style={{ fontSize: "0.87rem", color: suave, lineHeight: 1.5, marginBottom: 18 }}>
                {tela.texto}
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 22 }}>
                {tela.pontos.map((ponto) => (
                  <div key={ponto} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                    <Check size={15} color={tela.cor} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span style={{ fontSize: "0.84rem", color: texto, lineHeight: 1.45 }}>
                      {ponto}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Onde estou nas três telas */}
          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 16 }}>
            {TELAS.map((t, i) => (
              <div key={t.titulo} style={{
                height: 4, borderRadius: 999,
                width: i === passo ? 22 : 7,
                background: i === passo ? tela.cor : (dark ? "rgba(255,255,255,0.14)" : "rgba(17,24,39,0.12)"),
                transition: "width .2s, background .2s",
              }} />
            ))}
          </div>

          <button
            onClick={avancar}
            style={{
              width: "100%", height: 50, borderRadius: 14, border: "none", cursor: "pointer",
              background: `linear-gradient(135deg,${tela.cor},${tela.cor}cc)`, color: "#fff",
              fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 800, fontSize: "0.95rem",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            {ultima ? "Abrir configurações" : "Continuar"}
            {!ultima && <ChevronRight size={17} />}
          </button>

          {/* Sempre há saída. O app funciona inteiro sem isso. */}
          <button
            onClick={onFechar}
            style={{
              width: "100%", height: 42, marginTop: 6, background: "none", border: "none",
              color: suave, fontSize: "0.85rem", cursor: "pointer", fontFamily: "'Outfit',sans-serif",
            }}
          >
            {ultima ? "Agora não" : "Deixar para depois"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
