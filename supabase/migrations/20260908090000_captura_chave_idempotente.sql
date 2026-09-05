-- Idempotencia da captura automatica, no banco.
--
-- A trava de duplicidade vivia num Map em memoria, com janela de 90s e
-- assinatura montada com o TEXTO da notificacao. Dois furos:
--
--   1. o Android chama `onNotificationPosted` na postagem E em cada
--      atualizacao, e o banco atualiza a dele ("processando" ->
--      "Pix enviado para Joao"). Texto diferente, assinatura diferente,
--      trava nao pegava: dois lancamentos do mesmo dinheiro;
--   2. memoria morre com o processo. Fila recolhida depois de reiniciar
--      nao tinha com o que comparar.
--
-- `sbn.getKey()` do Android e estavel entre atualizacoes da MESMA
-- notificacao (pacote + id + tag + usuario). E o identificador certo, e
-- agora ele chega ate aqui.
--
-- A unicidade e por (user_id, captura_chave): a mesma notificacao nao
-- vira duas transacoes nem depois de reinstalar o app. Parcial porque
-- lancamento manual tem a coluna nula, e nulo nao colide com nulo.

alter table public.transactions
  add column if not exists captura_chave text;

comment on column public.transactions.captura_chave is
  'Chave estavel da notificacao que originou o lancamento (sbn.getKey do Android + dia). Nula em lancamento manual. Non-nula tambem marca a transacao como capturada automaticamente.';

create unique index if not exists transactions_captura_unica
  on public.transactions (user_id, captura_chave)
  where captura_chave is not null;
