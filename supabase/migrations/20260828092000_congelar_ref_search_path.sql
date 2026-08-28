-- Corrige regressão: `congelar_ref` ficou sem search_path fixo.
--
-- A migration do índice legível endureceu `atribuir_ref` (SECURITY
-- DEFINER com search_path travado) e deixou esta passar. O advisor
-- aponta como "Function Search Path Mutable": sem search_path fixo, o
-- caminho de busca de esquemas vem de quem chama, e uma função ou
-- operador plantado num esquema anterior pode ser executado no lugar do
-- pretendido.
--
-- Esta é SECURITY INVOKER, então o risco é menor que o de `atribuir_ref`
-- — mas ela roda em todo UPDATE de transactions, accounts e goals, o
-- que a torna um alvo conveniente demais para deixar solta.
--
-- Só o search_path muda; o corpo é o mesmo já em produção.

create or replace function public.congelar_ref()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.ref := old.ref;
  return new;
end $$;
