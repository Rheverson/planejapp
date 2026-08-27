import React from "react";

/**
 * Placeholder de carregamento.
 *
 * As telas principais não tinham estado de carregamento: abriam
 * mostrando "R$ 0,00" e KPIs zerados antes de preencher — leitura
 * assustadora num app de finanças.
 */
export function Skeleton({ width = "100%", height = 16, radius = 8, style, dark }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "block",
        width,
        height,
        borderRadius: radius,
        background: dark
          ? "linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.10) 37%, rgba(255,255,255,0.05) 63%)"
          : "linear-gradient(90deg, rgba(17,24,39,0.05) 25%, rgba(17,24,39,0.09) 37%, rgba(17,24,39,0.05) 63%)",
        backgroundSize: "400% 100%",
        animation: "planeje-skeleton 1.4s ease infinite",
        ...style,
      }}
    />
  );
}

/** Bloco com a estrutura de um KPI: rótulo curto + número grande. */
export function SkeletonKPI({ dark }) {
  return (
    <div
      style={{
        background: dark ? "rgba(255,255,255,0.03)" : "#ffffff",
        border: `1px solid ${dark ? "rgba(255,255,255,0.06)" : "rgba(17,24,39,0.04)"}`,
        borderRadius: 16,
        padding: "14px 14px 14px 18px",
      }}
    >
      <Skeleton width={64} height={8} radius={4} dark={dark} style={{ marginBottom: 10 }} />
      <Skeleton width="70%" height={20} radius={6} dark={dark} />
    </div>
  );
}

/** Linha com a estrutura de uma transação: ícone, texto e valor. */
export function SkeletonLinha({ dark }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0" }}>
      <Skeleton width={36} height={36} radius={12} dark={dark} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Skeleton width="55%" height={11} radius={4} dark={dark} style={{ marginBottom: 7 }} />
        <Skeleton width="35%" height={9} radius={4} dark={dark} />
      </div>
      <Skeleton width={68} height={13} radius={4} dark={dark} style={{ flexShrink: 0 }} />
    </div>
  );
}

/** A animação vive aqui para não depender de CSS global. */
export function SkeletonKeyframes() {
  return (
    <style>{`
      @keyframes planeje-skeleton {
        0%   { background-position: 100% 50%; }
        100% { background-position: 0 50%; }
      }
      @media (prefers-reduced-motion: reduce) {
        @keyframes planeje-skeleton { 0%, 100% { background-position: 50% 50%; } }
      }
    `}</style>
  );
}
