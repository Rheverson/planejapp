-- ============================================================
-- FASE 1 — Fecha o restante das funções expostas em /rest/v1/rpc
--
-- Duas lacunas que só apareceram na verificação:
--   1. O ACL "=X" (PUBLIC) continuava presente em várias funções,
--      então revogar apenas de `anon` não bastava.
--   2. Cinco funções não apareceram no advisor por não serem
--      SECURITY DEFINER, mas seguiam chamáveis pela API REST.
--      A pior delas: cleanup_expired_otps(), que apagava os OTPs
--      pendentes de todos os usuários.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.get_shared_goals(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_shared_goals(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.cleanup_expired_otps()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_whatsapp_limit(text)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_recurring_transactions() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_referral_code()          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_public_users()               FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_user()         FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_quiz_lead()          FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_lead_score()       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_engagement()       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_goals()            FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_negative_balance() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_upcoming_bills()   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_weekly_summary()   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_realize_transactions() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.send_push_notification(uuid, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_financial_score(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_by_id(uuid)         FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_by_email(text)      FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_referred_email(uuid)     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_referral_code(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pode_acessar_perfil(uuid)    FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.calculate_financial_score(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_by_id(uuid)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_by_email(text)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_referred_email(uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_referral_code(text)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.pode_acessar_perfil(uuid)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_promo_code(text)             TO anon, authenticated;
