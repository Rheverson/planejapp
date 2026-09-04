-- ============================================================
-- O único caminho de escrita do cliente — e ele escreve UM tipo só.
--
-- `paywall_visto` nasce no navegador: é a única etapa do funil que o
-- backend não presencia. Isso não pode virar "o cliente escreve na
-- tabela de eventos": bastaria um POST para fabricar uma conversão.
--
-- A função é SECURITY DEFINER e:
--   - tira a identidade de `auth.uid()`, NUNCA de parâmetro (é a
--     primeira regra do projeto; ver `pode_acessar_perfil` como molde);
--   - grava `evento` FIXO — não há como pedir `checkout_concluido`;
--   - só aceita recurso que exista de fato em `planos_limites`;
--   - deduplica por janela, porque re-render e reload não são encontros
--     novos com o limite.
--
-- O que isto NÃO impede, e é honesto dizer: alguém que assine de
-- verdade pode, antes, chamar a RPC com outro recurso e rotular mal a
-- PRÓPRIA conversão. Não fabrica conversão (essa vem do webhook) e não
-- alcança outro usuário — degrada só a atribuição da própria linha, ao
-- custo de pagar R$ 12,90.
-- ============================================================

create or replace function public.registrar_paywall_visto(p_recurso text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  -- Sem sessão não há evento. Silencioso: telemetria não pode derrubar
  -- a tela do usuário nem por erro nem por exceção.
  if v_user is null then
    return;
  end if;

  -- Recurso precisa ser um dos que o sistema realmente limita. Fecha a
  -- porta para lixo em coluna de agrupamento de BI.
  if p_recurso is null or not exists (
    select 1 from public.planos_limites l where l.recurso = p_recurso
  ) then
    return;
  end if;

  -- Janela de 5 minutos: mesma pessoa, mesmo recurso, mesmo encontro.
  -- Existe para matar duplicação MECÂNICA (re-render, reload, retry),
  -- não para amostrar. Encontro de verdade em outra hora conta de novo.
  if exists (
    select 1 from public.eventos_plano e
     where e.user_id = v_user
       and e.evento  = 'paywall_visto'
       and e.recurso = p_recurso
       and e.ocorrido_em > now() - interval '5 minutes'
  ) then
    return;
  end if;

  insert into public.eventos_plano (user_id, evento, recurso)
  values (v_user, 'paywall_visto', p_recurso);
end;
$$;

comment on function public.registrar_paywall_visto(text) is
  'Registra que o usuário do JWT viu o paywall de um recurso. Evento '
  'fixo e recurso validado: não serve para gravar outro tipo de evento.';

revoke all on function public.registrar_paywall_visto(text) from public, anon;
grant execute on function public.registrar_paywall_visto(text) to authenticated;
