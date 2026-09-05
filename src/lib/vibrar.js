import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

// ============================================================
// Retorno tátil.
//
// É o que separa "site aberto no celular" de "app". Confirmar um gasto
// sem sentir nada é a diferença entre achar que salvou e ter certeza.
//
// TRÊS REGRAS, e as três importam mais que a vibração em si:
//
//  1. NUNCA derruba a ação. Um `await` aqui atrasaria o salvamento, e
//     uma exceção o cancelaria. Tudo é disparado sem esperar e com o
//     erro engolido: no pior caso a pessoa não sente nada, e o
//     lançamento entra do mesmo jeito.
//
//  2. A INTENÇÃO fica no nome, não no tipo do Capacitor. As telas
//     chamam `vibrar.sucesso()`, não `Haptics.notification({ type:
//     NotificationType.Success })`. Se amanhã trocarmos a intensidade
//     de "salvou", muda aqui e vale em toda parte — em vez de caçar
//     `ImpactStyle` espalhado por dez arquivos, que foi exatamente o
//     que aconteceu com as cores.
//
//  3. INTENSIDADES DIFERENTES para coisas diferentes. Um toque de botão
//     e um "gasto registrado" não podem dar a mesma sensação: se tudo
//     vibra igual, o corpo para de distinguir e o retorno vira ruído.
// ============================================================

/**
 * Dispara e esquece.
 *
 * No navegador o plugin cai na Vibration API, que a maioria dos desktops
 * não implementa — e aí não faz nada, sem erro. Não há guarda de
 * plataforma de propósito: no Chrome do Android, que é onde muita gente
 * usa antes de instalar o APK, a vibração funciona e é bem-vinda.
 */
function disparar(chamada) {
  // Recebe uma FUNÇÃO, não a promessa já criada.
  //
  // `disparar(Haptics.impact(...))` parece equivalente e não é: o
  // argumento é avaliado ANTES da chamada, então um plugin que estoura
  // de forma síncrona — ausente, sem implementação nativa — escapa
  // deste try e derruba a mutation inteira. Trocar um gasto registrado
  // por uma vibração seria o pior negócio possível.
  try {
    Promise.resolve(chamada()).catch(() => {});
  } catch {
    /* plugin ausente: silêncio é o comportamento certo */
  }
}

export const vibrar = {
  /** Toque em botão, abrir um modal, trocar de aba. O mais leve. */
  toque: () => disparar(() => Haptics.impact({ style: ImpactStyle.Light })),

  /** Algo foi gravado: lançamento criado, meta salva, fatura paga. */
  sucesso: () => disparar(() => Haptics.notification({ type: NotificationType.Success })),

  /**
   * Algo saiu da lista.
   *
   * Mais firme que o toque porque remoção é irreversível na cabeça de
   * quem fez — a mão precisa registrar que aconteceu. Vai valer também
   * para o swipe-para-excluir da Fase 3.
   */
  remocao: () => disparar(() => Haptics.impact({ style: ImpactStyle.Medium })),

  /** A ação falhou. Acompanha o toast, não o substitui. */
  erro: () => disparar(() => Haptics.notification({ type: NotificationType.Error })),

  /**
   * O limite do plano barrou.
   *
   * Nem sucesso nem erro: nada quebrou, a pessoa só esbarrou no teto.
   * Um aviso curto, sem o duplo pulso de falha.
   */
  aviso: () => disparar(() => Haptics.impact({ style: ImpactStyle.Light })),
};

export default vibrar;
