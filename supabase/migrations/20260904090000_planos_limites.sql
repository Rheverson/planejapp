-- Os limites de cada plano, no banco e não no código.
--
-- POR QUE NO BANCO. Limite em constante exige deploy para mudar um
-- número — e testar preço e limite é justamente o que se faz sem
-- release. O código traz o padrão; esta tabela sobrepõe. A leitura é
-- pública porque o app precisa saber o que oferecer; a escrita não
-- existe para o cliente.
--
-- `limite is null` significa ILIMITADO. Zero significa bloqueado.
-- São coisas diferentes: o Free tem 0 recorrências (não pode) e o Pro
-- tem null (quantas quiser).

create table if not exists public.planos_limites (
  plano   text    not null check (plano in ('free', 'pro')),
  recurso text    not null,
  limite  integer          check (limite is null or limite >= 0),
  primary key (plano, recurso)
);

comment on table public.planos_limites is
  'Limites por plano. `limite` nulo = ilimitado; zero = recurso '
  'bloqueado. Somente leitura para o cliente — quem escreve é o '
  'backend com service_role.';

comment on column public.planos_limites.limite is
  'null = ilimitado. 0 = recurso indisponível no plano. Um número = teto.';

-- ── Os números aprovados ────────────────────────────────────────────
--
-- Free precisa ser útil de verdade: quem não consegue mapear o mês não
-- chega a ver a sobra, e sem ver a sobra não assina. 100 lançamentos
-- cobrem um mês real com PIX; 2 contas atendem quem separa pessoa
-- física de MEI.
--
-- Compartilhamento e recorrência ficam em zero de propósito: são as
-- funções que criam dependência e não custam entrega.
insert into public.planos_limites (plano, recurso, limite) values
  ('free', 'contas',                2),
  ('free', 'cartoes',               1),
  ('free', 'transacoes_mes',      100),
  ('free', 'metas',                 1),
  ('free', 'finn_mensagens_mes',   10),
  ('free', 'compartilhamento',      0),
  ('free', 'recorrencias',          0),
  ('free', 'relatorio_historico',   0),

  ('pro',  'contas',             null),
  ('pro',  'cartoes',            null),
  ('pro',  'transacoes_mes',     null),
  ('pro',  'metas',              null),
  ('pro',  'finn_mensagens_mes',  300),
  ('pro',  'compartilhamento',   null),
  ('pro',  'recorrencias',       null),
  ('pro',  'relatorio_historico',null)
on conflict (plano, recurso) do update set limite = excluded.limite;

-- Leitura livre para quem está logado: o app precisa saber o que
-- oferecer e o que já não cabe. Escrita, nenhuma.
alter table public.planos_limites enable row level security;

drop policy if exists planos_limites_leitura on public.planos_limites;
create policy planos_limites_leitura
  on public.planos_limites for select
  using (true);

revoke insert, update, delete, truncate on public.planos_limites from anon, authenticated;
