-- FASE 3 (2ª auditoria, achado R-1): quiz_players expunha `phone` e
-- `nickname` a qualquer anônimo. Fechar event_leads não bastou — o
-- telefone também vive aqui, e a página do host chegava a exibi-lo na TV.
--
-- Defesa em duas camadas, sem view privilegiada:
--   1. a view do placar não toca em `phone`;
--   2. GRANT por coluna exclui `phone` da tabela, então nem select=*,
--      nem select=phone, nem filtro/ordenação por phone passam.

DROP VIEW IF EXISTS public.quiz_placar;

CREATE VIEW public.quiz_placar
WITH (security_invoker = true) AS
SELECT
  id,
  session_id,
  COALESCE(NULLIF(btrim(nickname), ''), 'Jogador ' || upper(substr(id::text, 1, 4))) AS nome,
  score,
  joined_at
FROM public.quiz_players;

COMMENT ON VIEW public.quiz_placar IS
  'Placar público do quiz. Não lê a coluna phone em momento algum.';

REVOKE ALL ON public.quiz_placar FROM PUBLIC;
GRANT SELECT ON public.quiz_placar TO anon, authenticated;

DROP POLICY IF EXISTS quiz_players_read         ON public.quiz_players;
DROP POLICY IF EXISTS quiz_players_service_read ON public.quiz_players;

CREATE POLICY quiz_players_read ON public.quiz_players
  FOR SELECT USING (true);

REVOKE SELECT ON public.quiz_players FROM anon, authenticated;
GRANT SELECT (id, session_id, nickname, score, joined_at)
  ON public.quiz_players TO anon, authenticated;

GRANT INSERT (id, session_id, phone, nickname, score) ON public.quiz_players TO anon, authenticated;
GRANT UPDATE (score, nickname) ON public.quiz_players TO anon, authenticated;
