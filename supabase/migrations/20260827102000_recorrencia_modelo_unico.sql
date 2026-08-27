-- Achado N4 + item 2.14: unifica o modelo de recorrência.
--
-- Conviviam dois motores: o trigger trg_generate_recurring (liga as
-- ocorrências por recurring_parent_id), acionado quando a linha entrava
-- com is_recurring = true — o caminho da Home; e o gerador em JS, que usa
-- recurring_group_id — o caminho da tela de Transações. Só o segundo
-- permite "editar todos os seguintes".

-- 1. Cada família antiga recebe um recurring_group_id comum.
DO $$
DECLARE pai record; grupo uuid;
BEGIN
  FOR pai IN
    SELECT id FROM public.transactions
    WHERE is_recurring = true AND recurring_parent_id IS NULL AND recurring_group_id IS NULL
  LOOP
    grupo := gen_random_uuid();
    UPDATE public.transactions SET recurring_group_id = grupo
     WHERE id = pai.id OR recurring_parent_id = pai.id;
  END LOOP;
END $$;

-- 2. Filhos cujo pai já não existe.
DO $$
DECLARE orfao record; grupo uuid;
BEGIN
  FOR orfao IN
    SELECT DISTINCT recurring_parent_id AS pid FROM public.transactions
    WHERE recurring_parent_id IS NOT NULL AND recurring_group_id IS NULL
  LOOP
    grupo := gen_random_uuid();
    UPDATE public.transactions SET recurring_group_id = grupo
     WHERE recurring_parent_id = orfao.pid AND recurring_group_id IS NULL;
  END LOOP;
END $$;

-- 3. Desliga o motor antigo.
ALTER TABLE public.transactions DISABLE TRIGGER trg_generate_recurring;

COMMENT ON FUNCTION public.generate_recurring_transactions() IS
  'Motor de recorrência legado (recurring_parent_id). Desativado em 27/08/2026.';
