-- ============================================================
-- FASE 1 — Contenção de segurança: RLS
-- Itens 1.1 a 1.6 do AUDITORIA.md
-- ============================================================

-- ── 1.1 profiles: remove leitura pública ────────────────────
-- A policy "Perfis visíveis publicamente" (SELECT USING true) expunha
-- email, full_name, phone, phone_number, referral_code, payday e o JSONB
-- ai_insights de TODOS os usuários para qualquer anônimo.
-- Todo o app lê apenas o próprio perfil (.eq("id", user.id)),
-- o que já é coberto pela policy profiles_own.
DROP POLICY IF EXISTS "Perfis visíveis publicamente" ON public.profiles;

-- ── 1.2 promo_codes: cria a via segura de validação ─────────
-- O fechamento da tabela em si vai na migration seguinte, depois que
-- o PromoPage.jsx já estiver publicado usando esta função.
-- Validação pública passa a ser feita por esta função, que devolve
-- apenas o veredito e a quantidade de dias — nunca a lista de códigos.
-- Respeita is_multiuse (códigos reutilizáveis não são bloqueados por is_used).
CREATE OR REPLACE FUNCTION public.validate_promo_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v promo_codes%ROWTYPE;
BEGIN
  IF p_code IS NULL OR length(btrim(p_code)) = 0 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  SELECT * INTO v FROM promo_codes WHERE code = upper(btrim(p_code)) LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  IF v.expires_at IS NOT NULL AND v.expires_at < now() THEN
    RETURN jsonb_build_object('status', 'expired');
  END IF;

  IF COALESCE(v.is_multiuse, false) = false AND COALESCE(v.is_used, false) = true THEN
    RETURN jsonb_build_object('status', 'used');
  END IF;

  RETURN jsonb_build_object(
    'status',      'valid',
    'trial_days',  v.trial_days,
    'description', v.description
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_promo_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_promo_code(text) TO anon, authenticated;

-- ── 1.4 event_leads: telefones deixam de ser públicos ───────
-- A policy leads_select_auth (USING true, role public) permitia que
-- qualquer anônimo lesse os telefones capturados no evento.
-- O INSERT anônimo continua, pois o quiz depende dele.
DROP POLICY IF EXISTS leads_select_auth ON public.event_leads;

CREATE POLICY event_leads_service_read ON public.event_leads
  FOR SELECT
  USING ((SELECT auth.role()) = 'service_role');

-- ── 1.5 quiz: bloqueia DELETE anônimo ───────────────────────
-- O quiz é operado sem login (host e jogadores usam a chave anônima),
-- então SELECT/INSERT/UPDATE precisam continuar abertos.
-- DELETE não é usado por nenhuma das duas páginas e permitia
-- apagar sessões, jogadores e respostas em andamento.
DROP POLICY IF EXISTS quiz_sessions_all ON public.quiz_sessions;
DROP POLICY IF EXISTS quiz_players_all  ON public.quiz_players;
DROP POLICY IF EXISTS quiz_answers_all  ON public.quiz_answers;

CREATE POLICY quiz_sessions_read   ON public.quiz_sessions FOR SELECT USING (true);
CREATE POLICY quiz_sessions_write  ON public.quiz_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY quiz_sessions_update ON public.quiz_sessions FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY quiz_players_read    ON public.quiz_players  FOR SELECT USING (true);
CREATE POLICY quiz_players_write   ON public.quiz_players  FOR INSERT WITH CHECK (true);
CREATE POLICY quiz_players_update  ON public.quiz_players  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY quiz_answers_read    ON public.quiz_answers  FOR SELECT USING (true);
CREATE POLICY quiz_answers_write   ON public.quiz_answers  FOR INSERT WITH CHECK (true);

-- ── 1.6 search_path das funções de trigger do quiz ──────────
CREATE OR REPLACE FUNCTION public.save_quiz_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.event_leads (phone, name, source, participated_at)
  VALUES (NEW.phone, NEW.nickname, 'quiz-evento', NOW())
  ON CONFLICT (phone) DO UPDATE SET
    name = COALESCE(EXCLUDED.name, event_leads.name),
    participated_at = NOW();
  RETURN NEW;
END;
$$;

-- ── public_users: tabela vazia com leitura anônima ──────────
DROP POLICY IF EXISTS "Permitir busca de email por convidados"  ON public.public_users;
DROP POLICY IF EXISTS "Permitir verificação de e-mail anonima"  ON public.public_users;

CREATE POLICY public_users_service_only ON public.public_users
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');
