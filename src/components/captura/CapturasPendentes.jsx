import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { HelpCircle, X, Wallet, CreditCard, ArrowLeftRight, Check, Trash2 } from "lucide-react";
import { useIsDark } from "@/design/useTheme";
import { useFecharModal, CAMADAS } from "@/hooks/useFecharModal";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { campoDaEscolha } from "@/domain/captura";
import { useCapturasPendentes } from "@/hooks/useCapturasPendentes";
import { vibrar } from "@/lib/vibrar";

// ============================================================
// "Vi esse dinheiro, mas não sei onde ele entra."
//
// O usuário tem duas contas "Nubank" — a dele e a da Jeniffer. Uma
// notificação do pacote `com.nu.production` casa com as duas, e o
// domínio corretamente se recusa a chutar. Só que até agora o resultado
// era um beco sem saída: um toast que sumia em três segundos, e a
// captura evaporava.
//
// Esta tela é a saída. Ela faz UMA pergunta objetiva, oferece os
// candidatos prováveis antes da lista inteira, e — a parte que importa
// — guarda a resposta. A pergunta é feita uma vez na vida do aparelho.
//
// A caixa NÃO é um inbox de tudo que deu errado. Só entra aqui o que uma
// escolha de destino resolve. "Não entendi a notificação" não vira uma
// lista de contas para escolher, então continua sendo um aviso e nada
// mais — oferecer uma pergunta sem resposta possível é pior do que não
// perguntar.
// ============================================================

const PERGUNTAS = {
  conta_indefinida: {
    titulo: "De qual conta é esse movimento?",
    icone: Wallet,
    cor: "#1d4ed8",
    memoria: (banco) => `Sempre usar essa conta para o ${banco}`,
  },
  cartao_indefinido: {
    titulo: "Em qual cartão foi essa compra?",
    icone: CreditCard,
    cor: "#8b5cf6",
    memoria: (banco) => `Sempre usar esse cartão para o ${banco}`,
  },
  transferencia_sem_destino: {
    titulo: "Para qual das suas contas você transferiu?",
    icone: ArrowLeftRight,
    cor: "#2ecc8a",
    memoria: null, // Muda a cada Pix — memorizar rotearia todas para cá.
  },
};

const moeda = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

export default function CapturasPendentes() {
  const dark = useIsDark();
  const { pendentes, resolver, descartar } = useCapturasPendentes();
  const [aberto, setAberto] = useState(false);

  if (!pendentes.length) return null;

  const texto = pendentes.length === 1
    ? "1 captura esperando você"
    : `${pendentes.length} capturas esperando você`;

  return (
    <>
      <motion.button
        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        onClick={() => { vibrar.toque(); setAberto(true); }}
        style={{
          width: "100%", textAlign: "left", cursor: "pointer",
          background: dark ? "rgba(245,158,11,0.10)" : "rgba(245,158,11,0.10)",
          border: "1px solid rgba(245,158,11,0.35)",
          borderRadius: 16, padding: "13px 15px", marginBottom: 14,
          display: "flex", alignItems: "center", gap: 12,
          fontFamily: "'Outfit',sans-serif",
        }}
      >
        <div style={{
          width: 34, height: 34, borderRadius: 10, flexShrink: 0,
          background: "rgba(245,158,11,0.18)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <HelpCircle size={18} color="#f59e0b" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 800,
            fontSize: "0.92rem", color: dark ? "#e8edf5" : "#0f172a",
          }}>
            {texto}
          </div>
          <div style={{ fontSize: "0.78rem", color: dark ? "#6b7a96" : "#64748b", marginTop: 1 }}>
            Vi o valor, mas não sei em qual conta lançar
          </div>
        </div>
        <span style={{
          background: "#f59e0b", color: "#fff", borderRadius: 999,
          padding: "3px 10px", fontSize: "0.78rem", fontWeight: 800,
          fontFamily: "'Cabinet Grotesk',sans-serif",
        }}>
          {pendentes.length}
        </span>
      </motion.button>

      {aberto && (
        <ModalDesempate
          pendente={pendentes[0]}
          restantes={pendentes.length - 1}
          resolver={resolver}
          descartar={descartar}
          onFechar={() => setAberto(false)}
        />
      )}
    </>
  );
}

function ModalDesempate({ pendente, restantes, resolver, descartar, onFechar }) {
  const dark = useIsDark();
  const { user } = useAuth();
  const [escolha, setEscolha] = useState(null);
  const [memorizar, setMemorizar] = useState(true);
  const [verTodas, setVerTodas] = useState(false);
  useFecharModal(true, onFechar);

  const campo = campoDaEscolha(pendente.motivo);
  const pergunta = PERGUNTAS[pendente.motivo] || PERGUNTAS.conta_indefinida;
  const Icone = pergunta.icone;
  const ehCartao = campo === "cartao";

  const { data: destinos = [] } = useQuery({
    queryKey: [ehCartao ? "credit_cards" : "accounts", user?.id, "desempate"],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from(ehCartao ? "credit_cards" : "accounts")
        .select("id, name, type, is_active")
        .eq("user_id", user.id);
      return (data || []).filter((d) => d.is_active !== false
        && (ehCartao || d.type !== "investment"));
    },
  });

  // Os prováveis primeiro. `opcoes` é o que o domínio já tinha em mãos
  // quando desistiu — as duas contas que casaram com "Nubank", por
  // exemplo. A lista inteira fica atrás de um toque, para o caso de o
  // banco ter sido lido errado.
  const { provaveis, resto } = useMemo(() => {
    const ids = new Set(pendente.opcoes || []);
    if (!ids.size) return { provaveis: destinos, resto: [] };
    return {
      provaveis: destinos.filter((d) => ids.has(d.id)),
      resto: destinos.filter((d) => !ids.has(d.id)),
    };
  }, [destinos, pendente.opcoes]);

  const fundo = dark ? "#0c0e13" : "#ffffff";
  const texto = dark ? "#e8edf5" : "#0f172a";
  const suave = dark ? "#6b7a96" : "#64748b";
  const borda = dark ? "rgba(255,255,255,0.10)" : "rgba(17,24,39,0.10)";
  const ocupado = resolver.isPending || descartar.isPending;

  const confirmar = () => {
    if (!escolha) return;
    vibrar.toque();
    resolver.mutate(
      { pendente, escolha, memorizar: memorizar && !!pergunta.memoria },
      { onSuccess: (r) => { if (r.acao !== "outra_pergunta") fecharSeUltima(); } },
    );
  };

  const fecharSeUltima = () => {
    setEscolha(null);
    setVerTodas(false);
    if (!restantes) onFechar();
  };

  const opcao = (item) => (
    <Opcao
      key={item.id} item={item} cor={pergunta.cor}
      ativo={escolha === item.id} dark={dark} texto={texto} borda={borda}
      onEscolher={() => { vibrar.toque(); setEscolha(item.id); }}
    />
  );

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      onClick={onFechar}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(6px)", zIndex: CAMADAS.modal,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <motion.div
        initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label={pergunta.titulo}
        style={{
          background: fundo, borderRadius: "24px 24px 0 0", width: "100%",
          maxWidth: 480, maxHeight: "92vh", overflowY: "auto",
          fontFamily: "'Outfit',sans-serif", paddingBottom: 22,
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 10 }}>
          <div style={{ width: 36, height: 4, borderRadius: 999, background: borda }} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between",
                      alignItems: "center", padding: "6px 14px 0 22px" }}>
          <span style={{ fontSize: "0.75rem", color: suave }}>
            {restantes > 0 ? `+${restantes} depois desta` : "Última"}
          </span>
          <button onClick={onFechar} aria-label="Fechar"
            style={{ background: "none", border: "none", padding: 6, cursor: "pointer" }}>
            <X size={18} color={suave} />
          </button>
        </div>

        <div style={{ padding: "0 22px" }}>
          {/* O fato, antes da pergunta: o que exatamente o banco avisou. */}
          <div style={{
            background: dark ? "rgba(255,255,255,0.04)" : "#f8fafc",
            border: `1px solid ${borda}`, borderRadius: 15,
            padding: "14px 15px", marginBottom: 18,
          }}>
            <div style={{
              fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 800,
              fontSize: "1.5rem", color: texto, letterSpacing: "-0.02em",
            }}>
              {moeda(pendente.valor)}
            </div>
            <div style={{ fontSize: "0.8rem", color: suave, marginTop: 3 }}>
              {pendente.banco || "Banco"} · {format(parseISO(pendente.capturada_em), "d 'de' MMMM, HH:mm", { locale: ptBR })}
            </div>
            {pendente.texto && (
              <div style={{
                fontSize: "0.78rem", color: suave, marginTop: 8,
                paddingTop: 8, borderTop: `1px solid ${borda}`, lineHeight: 1.4,
              }}>
                “{pendente.texto.slice(0, 140)}”
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10, flexShrink: 0,
              background: `${pergunta.cor}1f`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Icone size={16} color={pergunta.cor} />
            </div>
            <h2 style={{
              fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 800,
              fontSize: "1.05rem", color: texto, letterSpacing: "-0.02em", lineHeight: 1.25,
            }}>
              {pergunta.titulo}
            </h2>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            {provaveis.map(opcao)}

            {!!resto.length && !verTodas && (
              <button
                onClick={() => { vibrar.toque(); setVerTodas(true); }}
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: "8px 0",
                  color: suave, fontSize: "0.82rem", fontFamily: "'Outfit',sans-serif",
                  textAlign: "left",
                }}
              >
                Não é nenhuma dessas — ver {ehCartao ? "todos os cartões" : "todas as contas"}
              </button>
            )}
            {verTodas && resto.map(opcao)}
          </div>

          {/* A memória. Marcada por padrão porque é o que a pessoa quer
              em quase todos os casos — mas visível e desmarcável, senão
              o app aprende uma regra sem avisar. */}
          {pergunta.memoria && pendente.pacote && (
            <button
              onClick={() => { vibrar.toque(); setMemorizar((m) => !m); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                background: "none", border: "none", cursor: "pointer",
                padding: "4px 0 14px", textAlign: "left",
                fontFamily: "'Outfit',sans-serif",
              }}
            >
              <span style={{
                width: 19, height: 19, borderRadius: 6, flexShrink: 0,
                border: `1.5px solid ${memorizar ? pergunta.cor : borda}`,
                background: memorizar ? pergunta.cor : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {memorizar && <Check size={13} color="#fff" strokeWidth={3} />}
              </span>
              <span style={{ fontSize: "0.83rem", color: memorizar ? texto : suave }}>
                {pergunta.memoria(pendente.banco || "esse banco")}
              </span>
            </button>
          )}

          <button
            onClick={confirmar}
            disabled={!escolha || ocupado}
            style={{
              width: "100%", height: 50, borderRadius: 14, border: "none",
              cursor: escolha && !ocupado ? "pointer" : "not-allowed",
              background: escolha
                ? `linear-gradient(135deg,${pergunta.cor},${pergunta.cor}cc)`
                : (dark ? "rgba(255,255,255,0.07)" : "#e2e8f0"),
              color: escolha ? "#fff" : suave,
              fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 800, fontSize: "0.95rem",
              opacity: ocupado ? 0.6 : 1,
            }}
          >
            {ocupado ? "Registrando…" : "Confirmar e lançar"}
          </button>

          <button
            onClick={() => {
              vibrar.toque();
              descartar.mutate(pendente, { onSuccess: fecharSeUltima });
            }}
            disabled={ocupado}
            style={{
              width: "100%", height: 42, marginTop: 6, background: "none", border: "none",
              color: suave, fontSize: "0.85rem", cursor: "pointer",
              fontFamily: "'Outfit',sans-serif",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            <Trash2 size={14} /> Não é meu — descartar
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Uma conta ou cartao para escolher. Fora do render do modal de proposito:
    componente redefinido a cada render remonta a arvore inteira a cada toque. */
function Opcao({ item, cor, ativo, dark, texto, borda, onEscolher }) {
  return (
    <button
      onClick={onEscolher}
      style={{
        width: "100%", textAlign: "left", cursor: "pointer",
        background: ativo ? `${cor}1a` : (dark ? "rgba(255,255,255,0.03)" : "#f8fafc"),
        border: `1.5px solid ${ativo ? cor : borda}`,
        borderRadius: 13, padding: "13px 14px",
        display: "flex", alignItems: "center", gap: 10,
        fontFamily: "'Outfit',sans-serif",
      }}
    >
      <span style={{ flex: 1, fontSize: "0.9rem", fontWeight: ativo ? 700 : 500, color: texto }}>
        {item.name}
      </span>
      {ativo && <Check size={17} color={cor} />}
    </button>
  );
}
