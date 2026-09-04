-- Quem já estava aqui não esbarra em limite nenhum.
--
-- POR QUE TABELA PRÓPRIA, E NÃO UMA FLAG EM `profiles`
--
-- `profiles` é gravável pelo cliente (policy ALL na própria linha,
-- GRANT de UPDATE). Uma coluna `is_founder` ali seria auto-promoção a
-- PRO com um PATCH — exatamente o P0 que acabamos de fechar em
-- `subscriptions`. Não vale repetir o erro num lugar novo.
--
-- POR QUE NÃO CRIAR ASSINATURAS VITALÍCIAS
--
-- Seria poluir de novo a tabela que passamos rodadas auditando: 36
-- linhas `active` sem contrapartida no Stripe é precisamente a
-- confusão que o levantamento anterior teve que desfazer. Além disso
-- travaria o `create-checkout` ("você já possui uma assinatura ativa"),
-- impedindo o fundador de assinar de verdade se um dia quiser.
--
-- Tabela própria: o cliente lê (para a interface poder dizer
-- "Fundador"), nunca escreve. Conceder é inserir; revogar é apagar.

create table if not exists public.usuarios_fundadores (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  motivo    text        not null default 'early adopter — anterior ao Free/Pro',
  criado_em timestamptz not null default now()
);

comment on table public.usuarios_fundadores is
  'Usuários com acesso PRO vitalício, sem passar pelo Stripe. Somente '
  'leitura para o cliente: se fosse gravável, seria auto-promoção a PRO.';

alter table public.usuarios_fundadores enable row level security;

drop policy if exists fundadores_leitura_propria on public.usuarios_fundadores;
create policy fundadores_leitura_propria
  on public.usuarios_fundadores for select
  using (user_id = (select auth.uid()));

revoke insert, update, delete, truncate on public.usuarios_fundadores from anon, authenticated;

-- ── Os que já estavam aqui ──────────────────────────────────────────
-- Todos os usuários existentes no momento desta migration. Quem entrar
-- depois começa no Free.
insert into public.usuarios_fundadores (user_id)
select id from auth.users
 where email not like '%@teste.invalid'
on conflict (user_id) do nothing;

-- ── A regra de plano, em SQL ────────────────────────────────────────
--
-- ATENÇÃO: esta função é a TERCEIRA implementação da regra de acesso.
-- As outras duas são `temAcessoPro` em src/domain/assinatura.js e o
-- espelho que o backend usa. Não dá para importar JS aqui, e o trigger
-- precisa decidir dentro do banco.
--
-- As três precisam concordar. Mudou uma, mude as outras — é a mesma
-- disciplina de `financas.js` / `_shared/financeiro.ts`, que já
-- funcionou. As duas grafias de cancelado entram porque o banco tem as
-- duas gravadas historicamente.
create or replace function public.plano_do_usuario(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when exists (
      select 1 from public.usuarios_fundadores f where f.user_id = p_user
    ) then 'pro'
    when exists (
      select 1 from public.subscriptions s
       where s.user_id = p_user
         and (
           s.status in ('active', 'trialing')
           or (s.status in ('cancelled', 'canceled')
               and s.current_period_end is not null
               and s.current_period_end > now())
         )
    ) then 'pro'
    else 'free'
  end;
$$;

comment on function public.plano_do_usuario(uuid) is
  'Plano efetivo do usuário. Espelho SQL de `temAcessoPro` '
  '(src/domain/assinatura.js) mais a isenção dos fundadores. As três '
  'implementações da regra precisam concordar.';

/**
 * Limite de um recurso para o plano do usuário.
 * null = ilimitado (e é o que o trigger usa para liberar).
 */
create or replace function public.limite_do_usuario(p_user uuid, p_recurso text)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select l.limite
    from public.planos_limites l
   where l.plano = public.plano_do_usuario(p_user)
     and l.recurso = p_recurso;
$$;

comment on function public.limite_do_usuario(uuid, text) is
  'Teto do recurso para o plano do usuário. null = ilimitado.';
