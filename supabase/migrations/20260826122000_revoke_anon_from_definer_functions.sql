-- ============================================================
-- FASE 1 — Revogação nominal do papel `anon`
--
-- O Supabase aplica ALTER DEFAULT PRIVILEGES concedendo EXECUTE
-- diretamente a anon/authenticated nas funções do schema public.
-- Por isso `REVOKE ... FROM PUBLIC` sozinho não fecha o acesso:
-- é preciso revogar nominalmente do papel.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.calculate_financial_score(uuid, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_by_id(uuid)                  FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_referred_email(uuid)              FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_shared_goals(uuid)                FROM anon;
REVOKE EXECUTE ON FUNCTION public.pode_acessar_perfil(uuid)             FROM anon;

-- Funções de trigger: não devem ser chamáveis pela API REST por ninguém.
REVOKE EXECUTE ON FUNCTION public.handle_new_user()         FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_engagement()       FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_goals()            FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_negative_balance() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_upcoming_bills()   FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_weekly_summary()   FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.save_quiz_lead()          FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_lead_score()       FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.calculate_financial_score(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_by_id(uuid)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_referred_email(uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_goals(uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_by_email(text)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_referral_code(text)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.pode_acessar_perfil(uuid)             TO authenticated;

-- validate_promo_code é intencionalmente pública: o PromoPage roda deslogado.
GRANT EXECUTE ON FUNCTION public.validate_promo_code(text) TO anon, authenticated;
