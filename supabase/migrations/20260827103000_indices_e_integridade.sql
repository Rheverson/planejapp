-- FASE 5 (5.3/5.5) e FASE 6 (6.2/6.3/6.4)

-- ── 5.3 Índices para as 13 chaves estrangeiras sem cobertura ──
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_id            ON public.ai_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_category_patterns_user_id   ON public.category_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_cc_invoices_user_id         ON public.credit_card_invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_cc_invoices_payment_tx      ON public.credit_card_invoices(payment_transaction_id);
CREATE INDEX IF NOT EXISTS idx_credit_cards_account_id     ON public.credit_cards(account_id);
CREATE INDEX IF NOT EXISTS idx_notifications_shared_access ON public.notifications(shared_access_id);
CREATE INDEX IF NOT EXISTS idx_promo_codes_used_by         ON public.promo_codes(used_by);
CREATE INDEX IF NOT EXISTS idx_quiz_answers_player         ON public.quiz_answers(player_id);
CREATE INDEX IF NOT EXISTS idx_quiz_answers_session        ON public.quiz_answers(session_id);
CREATE INDEX IF NOT EXISTS idx_quiz_players_session        ON public.quiz_players(session_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id       ON public.referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_pending_user_id    ON public.whatsapp_pending(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_usage_user_id      ON public.whatsapp_usage(user_id);

-- ── 6.3 transfer_account_id não tinha FK nem índice ──
CREATE INDEX IF NOT EXISTS idx_transactions_transfer_account
  ON public.transactions(transfer_account_id) WHERE transfer_account_id IS NOT NULL;

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_transfer_account_id_fkey;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_transfer_account_id_fkey
  FOREIGN KEY (transfer_account_id) REFERENCES public.accounts(id) ON DELETE SET NULL;

-- ── 6.2 valor precisa ser positivo ──
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_amount_positivo;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_amount_positivo CHECK (amount > 0);

-- ── 6.4 transferência não pode ter origem igual ao destino ──
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_transferencia_contas_distintas;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_transferencia_contas_distintas
  CHECK (type <> 'transfer' OR transfer_account_id IS NULL OR account_id IS NULL
         OR account_id <> transfer_account_id);

-- ── 5.5 policies que reavaliavam auth.*() por linha ──
DROP POLICY IF EXISTS phone_otps_owner ON public.phone_otps;
CREATE POLICY phone_otps_owner ON public.phone_otps FOR ALL USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS notification_log_owner ON public.notification_log;
CREATE POLICY notification_log_owner ON public.notification_log FOR ALL USING (user_id = (SELECT auth.uid()));

-- ── o indicado também precisa enxergar a própria indicação ──
DROP POLICY IF EXISTS referrals_own ON public.referrals;
CREATE POLICY referrals_own ON public.referrals FOR ALL
  USING (referrer_id = (SELECT auth.uid()) OR referred_id = (SELECT auth.uid()));
