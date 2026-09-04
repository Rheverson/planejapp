-- Separar quem ENTROU no trial de quem PAGOU depois dele.
--
-- `checkout_concluido` hoje significa "entrou no trial": no modelo PLG o
-- cartao e exigido na entrada, mas a primeira cobranca so acontece 7
-- dias depois. Sem um evento proprio, um funil de 100 checkouts
-- concluidos e 3 pagamentos parece 100% de conversao.

alter table public.eventos_plano
  drop constraint if exists eventos_plano_evento_valido;

alter table public.eventos_plano
  add constraint eventos_plano_evento_valido check (
    evento in ('paywall_visto','checkout_iniciado','checkout_concluido',
               'plano_mudou','trial_convertido')
  );

alter table public.eventos_plano
  drop constraint if exists eventos_plano_coerente;

alter table public.eventos_plano
  add constraint eventos_plano_coerente check (
    case evento
      when 'paywall_visto'      then recurso is not null
      when 'checkout_iniciado'  then checkout_session_id is not null
      when 'checkout_concluido' then checkout_session_id is not null
      -- A assinatura e a chave: e por ela que se sabe QUAL trial virou
      -- pagamento, e e ela que impede contar duas vezes.
      when 'trial_convertido'   then stripe_subscription_id is not null
      when 'plano_mudou'        then plano_anterior is not null
                                 and plano_novo is not null
                                 and plano_anterior <> plano_novo
                                 and motivo is not null
      else false
    end
  );

-- Uma conversao por assinatura. O Stripe reentrega, e a fatura de
-- renovacao do mes 2 tem o mesmo `billing_reason` da primeira cobranca
-- real -- sem esta trava, cada mes pago viraria uma "conversao de
-- trial" nova e a metrica inflaria sozinha.
create unique index if not exists eventos_plano_trial_unico
  on public.eventos_plano (stripe_subscription_id)
  where evento = 'trial_convertido' and stripe_subscription_id is not null;
