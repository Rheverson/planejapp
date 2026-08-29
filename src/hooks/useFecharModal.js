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
// ── Trava de rolagem: estado GLOBAL, contado ────────────────
//
// O `body` é um só. A versão anterior salvava e restaurava o estilo por
// instância do gancho, o que funciona com um modal e quebra com dois:
//
//   modal A monta  → guarda {position:""}      → trava
//   modal B monta  → guarda {position:"fixed"} → trava de novo
//   modal A fecha  → restaura ""               → destrava cedo demais
//   modal B fecha  → restaura "fixed"          → TRAVA PARA SEMPRE
//
// A Home empilha dois de propósito: o convite "Indique e ganhe" abre
// sozinho 3s depois de montar e pode cair por cima do formulário de
// transação. Fechados nessa ordem, o `body` ficava `position: fixed` e
// a página parava de rolar — na Home e em Transações — até recarregar.
//
// Contando quantos estão de pé, só o primeiro trava e só o último
// restaura. O estado original é guardado uma vez, não por instância.
let modaisAbertos = 0;
let estiloOriginal = null;

function travarFundo() {
  modaisAbertos += 1;
  if (modaisAbertos > 1) return; // outro modal já travou

  const posicao = window.scrollY;
  estiloOriginal = {
    overflow: document.body.style.overflow,
    position: document.body.style.position,
    top: document.body.style.top,
    width: document.body.style.width,
    posicao,
  };
  document.body.style.overflow = "hidden";
  document.body.style.position = "fixed";
  document.body.style.top = `-${posicao}px`;
  document.body.style.width = "100%";
}

function destravarFundo() {
  modaisAbertos = Math.max(0, modaisAbertos - 1);
  if (modaisAbertos > 0 || !estiloOriginal) return; // ainda tem modal de pé

  document.body.style.overflow = estiloOriginal.overflow;
  document.body.style.position = estiloOriginal.position;
  document.body.style.top = estiloOriginal.top;
  document.body.style.width = estiloOriginal.width;
  window.scrollTo(0, estiloOriginal.posicao);
  estiloOriginal = null;
}

export function useFecharModal(aberto, aoFechar) {
  // Saídas de teclado e do botão voltar. Dependem de `aoFechar`, que os
  // chamadores passam como arrow inline — este efeito remonta a cada
  // render do pai, e tudo bem: registrar ouvinte é barato.
  useEffect(() => {
    if (!aberto) return;

    const teclado = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        aoFechar?.();
      }
    };
    window.addEventListener("keydown", teclado);

    let ouvinte;
    if (Capacitor.isNativePlatform()) {
      ouvinte = CapacitorApp.addListener("backButton", () => aoFechar?.());
    }

    return () => {
      window.removeEventListener("keydown", teclado);
      if (ouvinte) Promise.resolve(ouvinte).then((o) => o?.remove?.());
    };
  }, [aberto, aoFechar]);

  // A trava depende SÓ de `aberto`. Se dependesse de `aoFechar` ela
  // seria desfeita e refeita a cada render do pai, e o `window.scrollTo`
  // da limpeza faria a página pular sozinha.
  useEffect(() => {
    if (!aberto) return;
    travarFundo();
    return destravarFundo;
  }, [aberto]);
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
  // Lista suspensa (Select). O Radix a renderiza num portal preso ao
  // <body> -- irmao do modal, nao filho dele -- entao ela nao herda a
  // camada do modal e precisa de um numero proprio, acima dele.
  //
  // Com o z-50 que vinha do shadcn a lista era pintada ATRAS da folha do
  // modal: medido com elementFromPoint sobre uma opcao, quem estava por
  // cima era um <input> do proprio formulario. Como o Radix desliga o
  // pointer-events do resto da pagina, o toque ate chegava na opcao --
  // as cegas, sem a lista aparecer. Quem abre lista de dentro de modal
  // fica por cima.
  //
  // So virou problema quando o modal subiu de 50 para 1000 (467ef59,
  // para vencer o modal de indicacao em 999). Antes os dois empatavam em
  // 50 e o portal ganhava por vir depois no DOM.
  listaSuspensa: 1200,
};
