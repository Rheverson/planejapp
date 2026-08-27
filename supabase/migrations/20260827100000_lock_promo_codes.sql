-- Item 1.2 / 1.3: fecha a tabela de códigos promocionais.
-- Aplicada só depois que o PromoPage publicado passou a usar
-- validate_promo_code(), que devolve apenas o veredito.
DROP POLICY IF EXISTS promo_codes_public_read    ON public.promo_codes;
DROP POLICY IF EXISTS promo_codes_read           ON public.promo_codes;
DROP POLICY IF EXISTS promo_codes_service_update ON public.promo_codes;
DROP POLICY IF EXISTS promo_codes_service_write  ON public.promo_codes;

CREATE POLICY promo_codes_service_only ON public.promo_codes
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');
