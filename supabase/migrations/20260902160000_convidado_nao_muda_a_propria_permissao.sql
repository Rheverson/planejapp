-- O convidado aceita ou recusa o convite. Não escolhe o que pode fazer.
--
-- ACHADO (P1, varredura de 02/09/2026). A policy `shared_access_guest_update`
-- é `FOR UPDATE USING (shared_with_email = auth.email())` — ela acerta QUEM
-- pode mexer na linha, e não diz nada sobre QUAIS COLUNAS. Só que a mesma
-- linha guarda as permissões do convidado:
--
--   view_transactions, add_transactions, edit_transactions,
--   delete_transactions, view_accounts, manage_accounts
--
-- Comprovado com JWT real. Convidado com acesso só de leitura:
--
--   PATCH /rest/v1/shared_access?shared_with_email=eq.<ele mesmo>
--        {"delete_transactions":true,"manage_accounts":true,
--         "edit_transactions":true,"status":"accepted"}
--   -> HTTP 200
--
--   antes:  view=true, edit=false, delete=false, manage=false, status=pending
--   depois: view=true, edit=true,  delete=true,  manage=true,  status=accepted
--
-- Quem foi convidado para OLHAR as finanças de alguém passava a poder
-- APAGAR. Escalada de privilégio sobre dado financeiro de terceiro.
--
-- POR QUE UM TRIGGER, E NÃO POLICY OU GRANT
--
-- RLS não restringe coluna: `WITH CHECK` enxerga só a linha nova, nunca a
-- antiga, então não dá para exprimir "só o status pode ter mudado".
--
-- GRANT de coluna (`GRANT UPDATE (status)`) restringe por PAPEL, e dono e
-- convidado são o mesmo papel `authenticated` — bloquearia também o dono,
-- que precisa poder ajustar as permissões que concedeu.
--
-- Comparar OLD com NEW é justamente o que um trigger faz. SECURITY INVOKER
-- de propósito: ele não precisa de privilégio nenhum, só ler as duas
-- versões da linha.
--
-- O fluxo legítimo continua: `PendingInvites.jsx` faz
-- `update({status:"accepted"})` e `update({status:"rejected"})`, e nada mais.

create or replace function public.shared_access_convidado_so_muda_status()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- O backend (service_role) e o dono da linha seguem sem restrição.
  if (select auth.role()) = 'service_role' or (select auth.uid()) = old.owner_id then
    return new;
  end if;

  -- Daqui para baixo é o convidado. Só o status pode mudar.
  if new.owner_id           is distinct from old.owner_id
  or new.shared_with_email  is distinct from old.shared_with_email
  or new.relationship_type  is distinct from old.relationship_type
  or new.permissions        is distinct from old.permissions
  or new.view_transactions  is distinct from old.view_transactions
  or new.add_transactions   is distinct from old.add_transactions
  or new.edit_transactions  is distinct from old.edit_transactions
  or new.delete_transactions is distinct from old.delete_transactions
  or new.view_accounts      is distinct from old.view_accounts
  or new.manage_accounts    is distinct from old.manage_accounts
  then
    raise exception 'convidado só pode aceitar ou recusar o convite'
      using errcode = '42501';
  end if;

  -- E só para os dois valores que o fluxo de convite usa.
  if new.status is distinct from old.status
     and new.status not in ('accepted', 'rejected') then
    raise exception 'status inválido para convidado'
      using errcode = '42501';
  end if;

  return new;
end $$;

drop trigger if exists shared_access_convidado_so_status on public.shared_access;

create trigger shared_access_convidado_so_status
  before update on public.shared_access
  for each row
  execute function public.shared_access_convidado_so_muda_status();

comment on function public.shared_access_convidado_so_muda_status() is
  'Impede que o convidado altere as próprias permissões. Ele só aceita ou '
  'recusa o convite; o dono continua livre. Ver migration 20260902160000.';
