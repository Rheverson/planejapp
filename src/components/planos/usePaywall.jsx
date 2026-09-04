import React, { useCallback, useRef, useState } from "react";
import PaywallModal from "./PaywallModal";
import { erroDeLimite } from "@/domain/limites";
import { supabase } from "@/lib/supabase";

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
//
// ── E é aqui que o funil é medido ───────────────────────────
//
// Os treze pontos que abrem paywall no app passam todos por este hook.
// Por isso a telemetria mora AQUI e em nenhum outro lugar: instrumentar
// as treze telas daria treze chances de esquecer uma, e um funil com
// buraco mede o buraco.
// ============================================================

export function usePaywall() {
  const [alvo, setAlvo] = useState(null);

  // Qual recurso já foi registrado nesta abertura. `abrir` e
  // `tratarErro` são manipuladores de evento, então re-render não passa
  // por aqui — este ref cobre o resto: cinco toques seguidos no mesmo
  // botão, ou uma mutation que erra duas vezes com o modal aberto.
  // A janela de 5 minutos da RPC é a segunda trava, no banco.
  const registrado = useRef(null);

  const registrar = useCallback((recurso) => {
    if (!recurso || registrado.current === recurso) return;
    registrado.current = recurso;
    // Sem await e sem throw: telemetria não pode atrasar nem derrubar a
    // tela. Se a chamada falhar, falta uma linha no relatório — e o
    // usuário não fica sabendo de nada.
    Promise.resolve(
      supabase.rpc("registrar_paywall_visto", { p_recurso: recurso }),
    ).catch(() => {});
  }, []);

  const abrir = useCallback((recurso, atual, limite) => {
    registrar(recurso);
    setAlvo({ recurso, atual, limite });
  }, [registrar]);

  const fechar = useCallback(() => {
    // Liberado para o próximo encontro de verdade. Encontro em outra
    // hora conta de novo; o mesmo encontro, não.
    registrado.current = null;
    setAlvo(null);
  }, []);

  /**
   * Reconhece o erro do trigger e abre o paywall.
   * Devolve true se era limite de plano — o chamador usa isso para
   * NÃO mostrar o toast de erro genérico por cima.
   */
  const tratarErro = useCallback((erro) => {
    const limite = erroDeLimite(erro);
    if (!limite) return false;
    registrar(limite.recurso);
    setAlvo(limite);
    return true;
  }, [registrar]);

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
 *
 * NÃO registra evento: quem ainda cabe não esbarrou em nada, e contar
 * isso como `paywall_visto` inflaria o topo do funil com gente que
 * nunca foi barrada.
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
