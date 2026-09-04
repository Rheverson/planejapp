-- Compartilhamento e exclusivo do Pro (limite 0 no Free).
--
-- Mesma trava dos outros quatro recursos: no banco, porque
-- `shared_access` aceita escrita do dono e um POST direto no PostgREST
-- passaria por cima de qualquer validacao na tela.
--
-- Conta convites que ainda valem: um recusado nao ocupa vaga, senao
-- quem foi recusado uma vez ficaria sem poder convidar outra pessoa.
create or replace function public.limite_compartilhamento() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare v_atual integer;
begin
  select count(*) into v_atual
    from public.shared_access
   where owner_id = new.owner_id
     and coalesce(status, 'pending') <> 'rejected';
  perform public.exige_limite(new.owner_id, 'compartilhamento', v_atual);
  return new;
end $$;

drop trigger if exists compartilhamento_respeita_o_plano on public.shared_access;
create trigger compartilhamento_respeita_o_plano
  before insert on public.shared_access
  for each row execute function public.limite_compartilhamento();

comment on function public.limite_compartilhamento() is
  'Compartilhar e exclusivo do Pro. Conta convites que ainda valem.';
