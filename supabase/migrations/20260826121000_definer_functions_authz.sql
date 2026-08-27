-- ============================================================
-- FASE 1 — Contenção de segurança: funções SECURITY DEFINER
-- Itens 1.7 a 1.13 do AUDITORIA.md
--
-- Problema: 14 funções SECURITY DEFINER eram executáveis por `anon`.
-- As que recebem o alvo por parâmetro não verificavam quem estava
-- chamando, permitindo ler dados de qualquer usuário pelo UUID.
-- O molde correto já existia no projeto: get_shared_goals().
-- ============================================================

-- ── Helper: o chamador é o dono, ou tem compartilhamento aceito? ──
CREATE OR REPLACE FUNCTION public.pode_acessar_perfil(p_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      auth.uid() = p_owner_id
      OR EXISTS (
        SELECT 1 FROM public.shared_access
        WHERE owner_id = p_owner_id
          AND shared_with_email = auth.email()
          AND status = 'accepted'
      )
    );
$$;

REVOKE ALL ON FUNCTION public.pode_acessar_perfil(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pode_acessar_perfil(uuid) TO authenticated;

-- ── 1.7 calculate_financial_score ───────────────────────────
-- Antes: qualquer um passava um p_user_id e recebia receita, despesa,
-- saldo, aportes e taxa de poupança daquele usuário.
CREATE OR REPLACE FUNCTION public.calculate_financial_score(p_user_id uuid, p_month date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_income         NUMERIC := 0;
  v_expense        NUMERIC := 0;
  v_invested       NUMERIC := 0;
  v_withdrawn      NUMERIC := 0;
  v_net_invested   NUMERIC := 0;
  v_savings_rate   NUMERIC := 0;
  v_score          INTEGER := 0;
  v_score_savings  INTEGER := 0;
  v_score_control  INTEGER := 0;
  v_score_planning INTEGER := 0;
  v_start          DATE;
  v_end            DATE;
  v_inv_ids        UUID[];
  v_bank_ids       UUID[];
  v_categorized    INTEGER;
  v_total_exp      INTEGER;
  v_planned        INTEGER;
BEGIN
  -- ✅ AUTORIZAÇÃO: só o dono ou quem tem compartilhamento aceito
  IF NOT public.pode_acessar_perfil(p_user_id) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  v_start := date_trunc('month', p_month)::date;
  v_end   := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;

  SELECT ARRAY_AGG(id) INTO v_inv_ids  FROM accounts WHERE user_id = p_user_id AND type = 'investment';
  SELECT ARRAY_AGG(id) INTO v_bank_ids FROM accounts WHERE user_id = p_user_id AND type != 'investment';

  SELECT
    COALESCE(SUM(CASE WHEN t.type='income'  THEN t.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN t.type='expense' THEN t.amount ELSE 0 END), 0)
  INTO v_income, v_expense
  FROM transactions t
  WHERE t.user_id = p_user_id
    AND t.date BETWEEN v_start AND v_end
    AND t.type != 'transfer'
    AND t.is_realized IS DISTINCT FROM false
    AND (v_inv_ids IS NULL OR t.account_id != ALL(v_inv_ids));

  IF v_inv_ids IS NOT NULL THEN
    SELECT COALESCE(SUM(t.amount), 0) INTO v_invested
    FROM transactions t
    WHERE t.user_id = p_user_id
      AND t.date BETWEEN v_start AND v_end
      AND t.type = 'income'
      AND t.is_realized IS DISTINCT FROM false
      AND t.account_id = ANY(v_inv_ids);

    SELECT COALESCE(SUM(t.amount), 0) + v_invested INTO v_invested
    FROM transactions t
    WHERE t.user_id = p_user_id
      AND t.date BETWEEN v_start AND v_end
      AND t.type = 'transfer'
      AND t.is_realized IS DISTINCT FROM false
      AND t.transfer_account_id = ANY(v_inv_ids);

    SELECT COALESCE(SUM(t.amount), 0) INTO v_withdrawn
    FROM transactions t
    WHERE t.user_id = p_user_id
      AND t.date BETWEEN v_start AND v_end
      AND t.type = 'expense'
      AND t.is_realized IS DISTINCT FROM false
      AND t.account_id = ANY(v_inv_ids);

    SELECT COALESCE(SUM(t.amount), 0) + v_withdrawn INTO v_withdrawn
    FROM transactions t
    WHERE t.user_id = p_user_id
      AND t.date BETWEEN v_start AND v_end
      AND t.type = 'transfer'
      AND t.is_realized IS DISTINCT FROM false
      AND t.account_id = ANY(v_inv_ids)
      AND (v_bank_ids IS NOT NULL AND t.transfer_account_id = ANY(v_bank_ids));
  END IF;

  v_net_invested := GREATEST(0, v_invested - v_withdrawn);

  IF v_income > 0 THEN
    v_savings_rate := ROUND((v_net_invested / v_income * 100)::numeric, 1);
  END IF;

  v_score_savings := CASE
    WHEN v_savings_rate >= 20 THEN 40
    WHEN v_savings_rate >= 10 THEN 30
    WHEN v_savings_rate >= 5  THEN 18
    WHEN v_savings_rate > 0   THEN 8
    ELSE 0
  END;

  SELECT
    COUNT(*) FILTER (WHERE category IS NOT NULL AND category NOT IN ('outros', '')),
    COUNT(*)
  INTO v_categorized, v_total_exp
  FROM transactions t
  WHERE t.user_id = p_user_id
    AND t.date BETWEEN v_start AND v_end
    AND t.type = 'expense'
    AND t.is_realized IS DISTINCT FROM false
    AND (v_inv_ids IS NULL OR t.account_id != ALL(v_inv_ids));

  IF v_total_exp > 0 THEN
    v_score_control := ROUND((v_categorized::numeric / v_total_exp * 30))::integer;
  ELSE
    v_score_control := 15;
  END IF;

  SELECT COUNT(*) INTO v_planned
  FROM transactions t
  WHERE t.user_id = p_user_id
    AND t.date BETWEEN v_start AND v_end
    AND t.is_realized = false;

  v_score_planning := CASE
    WHEN v_planned >= 5 THEN 30
    WHEN v_planned >= 3 THEN 20
    WHEN v_planned >= 1 THEN 10
    ELSE 0
  END;

  v_score := LEAST(100, v_score_savings + v_score_control + v_score_planning);

  RETURN jsonb_build_object(
    'score',         v_score,
    'savings_rate',  v_savings_rate,
    'income',        v_income,
    'expense',       v_expense,
    'balance',       v_income - v_expense,
    'invested',      v_net_invested,
    'withdrawn',     v_withdrawn,
    'breakdown', jsonb_build_object(
      'poupança',     v_score_savings,
      'controle',     v_score_control,
      'planejamento', v_score_planning
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.calculate_financial_score(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_financial_score(uuid, date) TO authenticated;

-- ── 1.9 get_user_by_id ──────────────────────────────────────
-- Usada por ProfileSwitcher e PendingInvites para mostrar de quem é
-- o perfil compartilhado. Passa a exigir vínculo e devolve o nome.
-- DROP necessário: a assinatura de retorno ganha a coluna full_name.
DROP FUNCTION IF EXISTS public.get_user_by_id(uuid);

CREATE OR REPLACE FUNCTION public.get_user_by_id(user_id_input uuid)
RETURNS TABLE(id uuid, email text, full_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  -- O próprio usuário, alguém que compartilhou comigo,
  -- ou alguém com quem eu compartilhei.
  IF NOT (
    auth.uid() = user_id_input
    OR EXISTS (
      SELECT 1 FROM public.shared_access
      WHERE (owner_id = user_id_input AND shared_with_email = auth.email())
         OR (owner_id = auth.uid()   AND shared_with_email = (
              SELECT au.email FROM auth.users au WHERE au.id = user_id_input
            ))
    )
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  SELECT au.id, au.email::TEXT, p.full_name
  FROM auth.users au
  LEFT JOIN public.profiles p ON p.id = au.id
  WHERE au.id = user_id_input
  LIMIT 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_user_by_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_by_id(uuid) TO authenticated;

-- ── 1.10 get_referred_email ─────────────────────────────────
-- Só o indicador enxerga o e-mail de quem ele indicou.
CREATE OR REPLACE FUNCTION public.get_referred_email(referred_uuid uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.referrals
    WHERE referred_id = referred_uuid AND referrer_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT au.email::text INTO v_email FROM auth.users au WHERE au.id = referred_uuid;
  RETURN v_email;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_referred_email(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_referred_email(uuid) TO authenticated;

-- ── 1.8 get_user_by_email ───────────────────────────────────
-- Continua disponível para autenticados (necessária no convite de
-- compartilhamento), mas deixa de ser executável por anônimos.
REVOKE ALL ON FUNCTION public.get_user_by_email(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_by_email(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_by_email(text) TO authenticated;

-- ── 1.11 validate_referral_code ─────────────────────────────
REVOKE ALL ON FUNCTION public.validate_referral_code(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_referral_code(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.validate_referral_code(text) TO authenticated;

-- ── 1.12 auto_realize_transactions ──────────────────────────
-- Fazia UPDATE global, sem filtro de usuário, e era chamável por anônimo.
-- Só o cron (postgres/service_role) precisa dela.
REVOKE ALL ON FUNCTION public.auto_realize_transactions() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_realize_transactions() FROM anon, authenticated;

-- ── 1.13 send_push_notification ─────────────────────────────
REVOKE ALL ON FUNCTION public.send_push_notification(uuid, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.send_push_notification(uuid, text, text, jsonb) FROM anon, authenticated;

-- ── Triggers e funções internas: fora do alcance da API ─────
REVOKE ALL ON FUNCTION public.handle_new_user()          FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_engagement()        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_goals()             FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_negative_balance()  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_upcoming_bills()    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_weekly_summary()    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_quiz_lead()           FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_lead_score()        FROM PUBLIC;

-- ── 1.6 search_path em update_lead_score ────────────────────
ALTER FUNCTION public.update_lead_score() SET search_path TO 'public';

-- get_shared_goals já valida corretamente; só limita o acesso anônimo.
REVOKE EXECUTE ON FUNCTION public.get_shared_goals(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_shared_goals(uuid) TO authenticated;
