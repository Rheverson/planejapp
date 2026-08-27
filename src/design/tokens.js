// ============================================================
// Tokens visuais do PlanejeApp
//
// A auditoria encontrou 91 cores hexadecimais distintas e 16 valores de
// border-radius espalhados por 40 arquivos, cada um redeclarando suas
// próprias variáveis no corpo do componente. Havia quatro tons de
// "fundo claro da página", seis verdes para "entrou dinheiro" e quatro
// vermelhos para "saiu".
//
// Aqui ficam os valores canônicos. Componentes novos devem usar
// `useTheme()`; os antigos vão migrando.
// ============================================================

/** Escala de raio — antes eram 16 valores avulsos. */
export const raio = {
  pequeno: 8,
  padrao: 12,
  card: 16,
  modal: 24,
  pill: 999,
};

/** Escala de espaçamento (múltiplos de 2, em px). */
export const espaco = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
};

/** Escala tipográfica, em rem. */
export const texto = {
  rotulo: "0.62rem",   // maiúsculo, com letter-spacing
  minimo: "0.7rem",
  corpo: "0.82rem",
  destaque: "0.88rem",
  titulo: "1.05rem",
  numero: "1.35rem",
  saldo: "clamp(2.2rem, 8vw, 3rem)",
};

export const fonte = {
  titulo: "'Cabinet Grotesk', 'Outfit', system-ui, sans-serif",
  corpo: "'Outfit', system-ui, -apple-system, sans-serif",
};

/** Gradiente-assinatura do produto: FAB, botão do Finn, banners. */
export const gradienteMarca = "linear-gradient(135deg,#1d4ed8,#3730a3)";

const claro = {
  fundo: "#f1f4f9",
  superficie: "#ffffff",
  superficie2: "#f8fafc",
  borda: "rgba(17,24,39,0.06)",
  texto: "#0f172a",
  textoSuave: "#5b6472",
  primaria: "#1d4ed8",
  link: "#1d4ed8",
  positivo: "#059669",
  negativo: "#dc2626",
  alerta: "#b45309",
  info: "#1d4ed8",
  sombra: "0 1px 2px rgba(17,24,39,0.03), 0 4px 16px rgba(17,24,39,0.04)",
  entrada: "#f8fafc",
  bordaEntrada: "rgba(17,24,39,0.1)",
};

const escuro = {
  fundo: "#060709",
  superficie: "#0c0e13",
  superficie2: "#12151c",
  borda: "rgba(255,255,255,0.07)",
  texto: "#e8edf5",
  textoSuave: "#8794a8",
  primaria: "#60a5fa",
  link: "#60a5fa",
  positivo: "#2ecc8a",
  negativo: "#e85d5d",
  alerta: "#fbbf24",
  info: "#60a5fa",
  sombra: "none",
  entrada: "#12151c",
  bordaEntrada: "rgba(255,255,255,0.08)",
};

/** Paleta do tema. `escuro` é booleano. */
export function paleta(estaEscuro) {
  return estaEscuro ? escuro : claro;
}

export const temas = { claro, escuro };
