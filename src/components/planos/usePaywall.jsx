import React, { useCallback, useState } from "react";
import PaywallModal from "./PaywallModal";
import { erroDeLimite } from "@/domain/limites";

// ============================================================
// O paywall em dois caminhos, e os dois precisam existir.
//
//  1. ANTES: a tela sabe que não cabe mais um e abre o convite sem
//     deixar a pessoa preencher um formulário à toa.
//
//  2. DEPOIS: alguém contornou a interface — DevTools, Postman, uma
//     aba antiga com dado velho — e o trigger do banco barrou. O erro
//     que volta é `LIMITE_PLANO:contas:2/2`. Sem interceptar, o usuário
//     veria isso cru num toast.
//
// O segundo caminho não é hipótese: a trava real está no banco de
// propósito, então essa mensagem VAI aparecer sempre que a tela e o
// banco discordarem. Tratá-la é o que faz a experiência ser a mesma
// pelos dois lados.
// ============================================================

export function usePaywall() {
  const [alvo, setAlvo] = useState(null);

  const abrir = useCallback((recurso, atual, limite) => {
    setAlvo({ recurso, atual, limite });
  }, []);

  const fechar = useCallback(() => setAlvo(null), []);

  /**
   * Reconhece o erro do trigger e abre o paywall.
   * Devolve true se era limite de plano — o chamador usa isso para
   * NÃO mostrar o toast de erro genérico por cima.
   */
  const tratarErro = useCallback((erro) => {
    const limite = erroDeLimite(erro);
    if (!limite) return false;
    setAlvo(limite);
    return true;
  }, []);

  const paywall = alvo ? (
    <PaywallModal
      recurso={alvo.recurso}
      atual={alvo.atual}
      limite={alvo.limite}
      onClose={fechar}
    />
  ) : null;

  return { abrir, fechar, tratarErro, paywall, aberto: !!alvo };
}

/**
 * Aviso discreto de "está acabando".
 *
 * Aparece só no último item antes do teto. Antes disso é ruído; depois
 * disso o lugar é o paywall.
 */
export function AvisoDeLimite({ situacao, texto }) {
  if (!situacao?.ultimo) return null;
  return (
    <p style={{
      fontSize: "0.72rem", color: "#d97706", marginTop: 6,
      fontFamily: "'Outfit',sans-serif",
    }}>
      {texto ?? `Último do plano gratuito — você está usando ${situacao.atual} de ${situacao.limite}.`}
    </p>
  );
}
