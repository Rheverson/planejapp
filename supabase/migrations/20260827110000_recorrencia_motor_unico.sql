-- FASE 4: uma única fonte de verdade para recorrência.
--
-- Existiam três geradores com modelos de dados diferentes:
--   1. trigger trg_generate_recurring (recurring_parent_id) — desativado
--   2. gerarOcorrenciasRecorrentes no app (recurring_group_id) — o motor
--   3. Edge Function create-recurring, usada pelo Finn — gravava
--      is_recurring = true e nenhum group_id
--
-- (3) foi removida de produção; o Finn passou a usar (2).
-- Aqui fica a barreira no banco contra geração duplicada.
-- Verificado antes de aplicar: 0 grupos com data repetida.
CREATE UNIQUE INDEX IF NOT EXISTS idx_recorrencia_sem_duplicata
  ON public.transactions (recurring_group_id, date)
  WHERE recurring_group_id IS NOT NULL;

COMMENT ON INDEX public.idx_recorrencia_sem_duplicata IS
  'Uma ocorrência por data dentro de cada série recorrente. Faz a geração repetida falhar em vez de duplicar lançamentos.';

COMMENT ON INDEX public.idx_unique_recurring IS
  'Legado do motor por recurring_parent_id. Nenhum caminho atual grava is_recurring = true; mantido pelo histórico.';
