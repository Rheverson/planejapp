-- FASE 5 (5.4) + correção de um buraco no compartilhamento.
--
-- 1. `accounts` e `transactions` tinham duas policies permissivas por
--    comando (a própria + a compartilhada), avaliadas em toda consulta.
-- 2. `transactions` só tinha policy compartilhada para SELECT e INSERT.
--    Um convidado com permissão de editar ou excluir batia na RLS: o
--    UPDATE afetava zero linhas e o app ainda exibia "Atualizado!".
--    As permissões edit_transactions e delete_transactions não funcionavam.

CREATE OR REPLACE FUNCTION public.tem_permissao_compartilhada(p_owner_id uuid, p_permissao text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shared_access
    WHERE owner_id = p_owner_id
      AND shared_with_email = (SELECT auth.email())
      AND status = 'accepted'
      AND COALESCE((permissions ->> p_permissao)::boolean, false) = true
  );
$$;

REVOKE ALL ON FUNCTION public.tem_permissao_compartilhada(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tem_permissao_compartilhada(uuid, text) TO authenticated;

DROP POLICY IF EXISTS accounts_own           ON public.accounts;
DROP POLICY IF EXISTS accounts_shared_select ON public.accounts;
DROP POLICY IF EXISTS accounts_shared_insert ON public.accounts;
DROP POLICY IF EXISTS accounts_shared_update ON public.accounts;
DROP POLICY IF EXISTS accounts_shared_delete ON public.accounts;

CREATE POLICY accounts_select ON public.accounts FOR SELECT
  USING (user_id = (SELECT auth.uid()) OR public.tem_permissao_compartilhada(user_id, 'view_accounts'));
CREATE POLICY accounts_insert ON public.accounts FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()) OR public.tem_permissao_compartilhada(user_id, 'manage_accounts'));
CREATE POLICY accounts_update ON public.accounts FOR UPDATE
  USING (user_id = (SELECT auth.uid()) OR public.tem_permissao_compartilhada(user_id, 'manage_accounts'));
CREATE POLICY accounts_delete ON public.accounts FOR DELETE
  USING (user_id = (SELECT auth.uid()) OR public.tem_permissao_compartilhada(user_id, 'manage_accounts'));

DROP POLICY IF EXISTS transactions_own           ON public.transactions;
DROP POLICY IF EXISTS transactions_shared_select ON public.transactions;
DROP POLICY IF EXISTS transactions_shared_insert ON public.transactions;

CREATE POLICY transactions_select ON public.transactions FOR SELECT
  USING (user_id = (SELECT auth.uid()) OR public.tem_permissao_compartilhada(user_id, 'view_transactions'));
CREATE POLICY transactions_insert ON public.transactions FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()) OR public.tem_permissao_compartilhada(user_id, 'add_transactions'));
CREATE POLICY transactions_update ON public.transactions FOR UPDATE
  USING (user_id = (SELECT auth.uid()) OR public.tem_permissao_compartilhada(user_id, 'edit_transactions'));
CREATE POLICY transactions_delete ON public.transactions FOR DELETE
  USING (user_id = (SELECT auth.uid()) OR public.tem_permissao_compartilhada(user_id, 'delete_transactions'));
