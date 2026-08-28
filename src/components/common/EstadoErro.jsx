// ============================================================
// Estado de erro de carregamento
//
// Quando uma query falhava, as telas não diziam nada: a lista ficava
// vazia e os totais apareciam como R$ 0,00 — indistinguível de "você
// não tem nada". Num app financeiro isso é pior do que um erro visível,
// porque o usuário acredita no zero.
//
// Aqui o erro é dito em português, com um botão que realmente repete a
// busca (recebe o `refetch` da própria query).
// ============================================================

import React from "react";
import { RefreshCw, WifiOff } from "lucide-react";
import { useIsDark } from "@/design/useTheme";
import { mensagemDeErro } from "@/lib/erros";

export default function EstadoErro({ erro, aoTentarDeNovo, tentando = false, compacto = false }) {
  const dark = useIsDark();
  const semRede = /Failed to fetch|NetworkError|network/i.test(
    [erro?.message, erro?.details].filter(Boolean).join(" "),
  );
  const Icone = semRede ? WifiOff : RefreshCw;

  return (
    <div
      role="alert"
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", textAlign: "center", gap: 10,
        padding: compacto ? "20px 16px" : "36px 20px",
        background: dark ? "#0c0e13" : "#ffffff",
        border: `1px solid ${dark ? "#1e2430" : "#e8edf5"}`,
        borderRadius: 16,
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 12,
        background: dark ? "rgba(239,68,68,0.12)" : "rgba(239,68,68,0.08)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icone size={19} color="#ef4444" />
      </div>

      <div>
        <p style={{
          fontSize: "0.9rem", fontWeight: 600,
          color: dark ? "#e8edf5" : "#0f172a", marginBottom: 3,
        }}>
          {semRede ? "Sem conexão" : "Não consegui carregar"}
        </p>
        <p style={{
          fontSize: "0.78rem", color: dark ? "#6b7a96" : "#64748b",
          maxWidth: 300, lineHeight: 1.45,
        }}>
          {semRede
            ? "Verifique sua internet e tente de novo."
            : mensagemDeErro(erro, "carregar seus dados")}
        </p>
      </div>

      {aoTentarDeNovo && (
        <button
          onClick={() => aoTentarDeNovo()}
          disabled={tentando}
          style={{
            minHeight: 44, padding: "0 18px", borderRadius: 12,
            border: "none", cursor: tentando ? "default" : "pointer",
            background: "#1d4ed8", color: "#ffffff",
            fontSize: "0.82rem", fontWeight: 600,
            fontFamily: "'Outfit',sans-serif",
            display: "flex", alignItems: "center", gap: 7,
            opacity: tentando ? 0.6 : 1,
          }}
        >
          <RefreshCw size={14} style={tentando ? { animation: "girar 1s linear infinite" } : undefined} />
          {tentando ? "Tentando…" : "Tentar novamente"}
        </button>
      )}

      <style>{"@keyframes girar { to { transform: rotate(360deg) } }"}</style>
    </div>
  );
}
