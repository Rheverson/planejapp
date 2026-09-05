-- O INSTANTE da notificacao, para conciliar os dois lados.
--
-- Uma transferencia entre bancos gera DUAS notificacoes, de dois apps,
-- para um unico movimento de dinheiro:
--
--   Itau   "Pix enviado ... R$ 1,00"
--   Nubank "Transferencia recebida ... R$ 1,00"
--
-- Sem conciliar, o Nubank e creditado DUAS vezes: uma pela
-- transferencia e outra pela entrada. E o mes ganha uma receita que nao
-- existiu.
--
-- Para casar os dois lados preciso do INSTANTE, e `date` e so o dia.
-- Casar por dia criaria falso positivo obvio: mandar R$ 50 para alguem
-- e receber R$ 50 de outra pessoa no mesmo dia viraria "transferencia
-- interna".
--
-- `created_at` tambem nao serve: com a fila, uma captura ao vivo e uma
-- recolhida horas depois teriam `created_at` distantes mesmo sendo do
-- mesmo segundo real.

alter table public.transactions
  add column if not exists captura_em timestamptz;

comment on column public.transactions.captura_em is
  'Instante da notificacao que originou o lancamento (timestamp do Android). Usado para casar os dois lados de uma transferencia entre bancos. Nulo em lancamento manual.';

-- Indice PARCIAL: so linhas capturadas. As 852 manuais ficam de fora,
-- entao ele nasce vazio e cresce so com a captura. A consulta da
-- conciliacao e uma janela de 5 minutos por usuario.
create index if not exists transactions_captura_janela
  on public.transactions (user_id, captura_em)
  where captura_chave is not null;
