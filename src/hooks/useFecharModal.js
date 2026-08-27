import { useEffect } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

/**
 * Dá a um modal as saídas que o usuário espera ter.
 *
 * Os bottom sheets do app eram feitos à mão e só fechavam por dois
 * caminhos: o X e o toque no fundo. Faltavam a tecla Esc no desktop e o
 * botão voltar do Android — que, no APK, saía da tela inteira em vez de
 * apenas fechar o modal.
 *
 * Também trava a rolagem do fundo enquanto o modal está aberto, para a
 * página de trás não deslizar junto no celular.
 */
export function useFecharModal(aberto, aoFechar) {
  useEffect(() => {
    if (!aberto) return;

    // ── Esc ──
    const teclado = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        aoFechar?.();
      }
    };
    window.addEventListener("keydown", teclado);

    // ── Botão voltar do Android (APK) ──
    let ouvinte;
    if (Capacitor.isNativePlatform()) {
      ouvinte = CapacitorApp.addListener("backButton", () => aoFechar?.());
    }

    // ── Trava a rolagem do fundo, preservando a posição ──
    const posicao = window.scrollY;
    const estiloAnterior = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
    };
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${posicao}px`;
    document.body.style.width = "100%";

    return () => {
      window.removeEventListener("keydown", teclado);
      if (ouvinte) Promise.resolve(ouvinte).then((o) => o?.remove?.());

      document.body.style.overflow = estiloAnterior.overflow;
      document.body.style.position = estiloAnterior.position;
      document.body.style.top = estiloAnterior.top;
      document.body.style.width = estiloAnterior.width;
      window.scrollTo(0, posicao);
    };
  }, [aberto, aoFechar]);
}

/**
 * Camadas de empilhamento do app, num lugar só.
 *
 * A navegação inferior e os formulários de transação estavam ambos em
 * z-index 50. Como a navegação é renderizada depois no Layout, ela
 * ganhava o empate e cobria o rodapé do modal em telas baixas.
 */
export const CAMADAS = {
  navegacao: 50,
  cartaoFlutuante: 40,
  modal: 1000,
  avisoDoSistema: 1100,
};
