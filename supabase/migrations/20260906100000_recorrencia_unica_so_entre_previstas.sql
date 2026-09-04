-- O indice de recorrencia estava proibindo pagamento legitimo.
--
-- `idx_recorrencia_sem_duplicata` foi criado (20260827110000) para
-- barrar GERACAO duplicada: o motor nao pode criar duas ocorrencias da
-- mesma serie na mesma data. Mas ele foi escrito sobre TODAS as linhas
-- da serie, inclusive as realizadas — e realizada nao e ocorrencia, e
-- fato.
--
-- O que quebrou, em producao: registrar realizacao PARCIAL de uma
-- previsao recorrente. O fluxo muda a data da linha original para a
-- data do pagamento e cria uma nova previsao com o restante. Se ja
-- houver outro pagamento da mesma serie naquele dia, o UPDATE esbarra
-- no indice e volta 409. Foi exatamente o caso: "Mercado" de R$ 684
-- prevista para 30/09, realizada parcialmente em 03/09, onde ja existia
-- outro "Mercado" de R$ 22 da mesma serie.
--
-- Duas compras de mercado no mesmo dia sao normais. Duas PREVISOES da
-- mesma serie no mesmo dia e que nao sao — e e so isso que o motor pode
-- produzir por engano, porque ele grava sempre `is_realized = false`
-- (ver `gerarOcorrenciasRecorrentes` em src/domain/financas.js).
--
-- O indice passa a valer so entre previsoes. A protecao continua
-- exatamente onde ela mira; o que sai e a proibicao de registrar a
-- realidade.
--
-- Conferido antes de aplicar: 0 previsoes com (grupo, data) repetida.

drop index if exists public.idx_recorrencia_sem_duplicata;

create unique index idx_recorrencia_sem_duplicata
  on public.transactions (recurring_group_id, date)
  where recurring_group_id is not null and is_realized = false;

comment on index public.idx_recorrencia_sem_duplicata is
  'Uma PREVISAO por data dentro de cada serie recorrente. Faz a geracao repetida falhar em vez de duplicar lancamentos. Nao alcanca linhas realizadas: dois pagamentos da mesma serie no mesmo dia sao legitimos.';
