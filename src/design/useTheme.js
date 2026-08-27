import { useEffect, useState } from "react";
import { paleta, raio, espaco, texto, fonte, gradienteMarca } from "./tokens";

const EVENTO = "darkModeChange";
const CHAVE = "darkMode";

function lerPreferencia() {
  try {
    if (localStorage.getItem(CHAVE) !== null) {
      return localStorage.getItem(CHAVE) === "true";
    }
  } catch { /* modo privado */ }
  if (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) {
    return true;
  }
  return false;
}

/**
 * Tema atual do app.
 *
 * Substitui as 17 cópias de `useIsDark` que existiam pelo projeto, em
 * duas variantes divergentes — uma só escutava o evento customizado,
 * a outra também observava a classe do <html> com MutationObserver.
 * Esta faz as duas coisas.
 */
export function useTheme() {
  const [escuro, setEscuro] = useState(lerPreferencia);

  useEffect(() => {
    const aoTrocar = (e) => setEscuro(Boolean(e.detail));
    window.addEventListener(EVENTO, aoTrocar);

    const observador = new MutationObserver(() =>
      setEscuro(document.documentElement.classList.contains("dark"))
    );
    observador.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      window.removeEventListener(EVENTO, aoTrocar);
      observador.disconnect();
    };
  }, []);

  return {
    escuro,
    cor: paleta(escuro),
    raio,
    espaco,
    texto,
    fonte,
    gradienteMarca,
  };
}

/** Só o booleano, para quem ainda usa o formato antigo. */
export function useIsDark() {
  return useTheme().escuro;
}

/** Alterna o tema e avisa quem estiver escutando. */
export function alternarTema(proximo) {
  const valor = typeof proximo === "boolean" ? proximo : !lerPreferencia();
  try { localStorage.setItem(CHAVE, String(valor)); } catch { /* modo privado */ }
  document.documentElement.classList.toggle("dark", valor);
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: valor }));
  return valor;
}
