-- ============================================================
-- O desempate com memoria.
--
-- O usuario tem duas contas "Nubank" (a dele e a da Jeniffer) e tres
-- cartoes. Uma notificacao do pacote com.nu.production casa com as duas
-- contas — e o dominio, corretamente, se recusa a chutar. So que o
-- resultado era um beco sem saida: um toast, e a captura evaporava.
--
-- Duas tabelas resolvem isso, e elas fazem coisas diferentes de
-- proposito:
--
--   capturas_pendentes   a PERGUNTA. A notificacao guardada crua,
--                        esperando a resposta do humano.
--   captura_roteamento   a RESPOSTA, valendo para sempre.
--
-- Por que a notificacao NAO vira transacao "pendente" em transactions:
-- um lancamento sem conta, ou com conta chutada, entra em todo calculo
-- de `financas.js` — saldo, KPI, projecao, taxa de poupanca. Foi
-- exatamente essa a licao da Fase 7: nao escrever palpite na tabela que
-- vira dinheiro na tela. Uma pendente descartada e um DELETE de algo
-- que nunca contou; uma transacao errada exige consertar saldo.
-- ============================================================

-- ── A memoria ────────────────────────────────────────────────
--
-- A chave e (usuario, PACOTE, tipo de destino).
--
-- Por que o pacote e nao o texto: o pacote e o unico sinal estavel. O
-- texto o banco reescreve quando quer; o nome da conta o usuario
-- renomeia quando quer. `com.nu.production` e o mesmo hoje e daqui a um
-- ano.
--
-- Por que O APARELHO desempata: a notificacao do Nubank chegou NESTE
-- celular, do app logado NESTA conta. A conta da Jeniffer existe no
-- PlanejeApp porque ele acompanha o dinheiro dela — mas ela nao notifica
-- aqui. O par (aparelho, pacote) ja e a resposta; so falta perguntar uma
-- vez qual e.
--
-- Por que `tipo_destino` entra na chave: o MESMO pacote emite os dois
-- assuntos. Um Pix do Nubank e conta; uma compra no credito do Nubank e
-- cartao. Uma regra so por pacote faria os dois brigarem pela mesma
-- linha.
create table if not exists public.captura_roteamento (
  user_id        uuid not null references auth.users(id) on delete cascade,
  pacote         text not null,
  tipo_destino   text not null check (tipo_destino in ('conta', 'cartao')),
  account_id     uuid references public.accounts(id) on delete cascade,
  credit_card_id uuid references public.credit_cards(id) on delete cascade,
  criada_em      timestamptz not null default now(),
  usada_em       timestamptz,
  primary key (user_id, pacote, tipo_destino),

  -- O destino tem que combinar com o tipo. Sem isso daria para gravar
  -- tipo 'conta' apontando para cartao, e o roteamento silenciosamente
  -- nao encontraria nada.
  constraint captura_roteamento_destino_coerente check (
    (tipo_destino = 'conta'  and account_id is not null and credit_card_id is null)
    or
    (tipo_destino = 'cartao' and credit_card_id is not null and account_id is null)
  )
);

comment on table public.captura_roteamento is
  'Para onde vao as notificacoes de um pacote de banco, quando o nome '
  'nao desempata sozinho. Escrita quando o usuario responde uma captura '
  'pendente. ON DELETE CASCADE no destino: conta apagada mata a regra, '
  'em vez de rotear para um fantasma.';

alter table public.captura_roteamento enable row level security;

drop policy if exists captura_roteamento_dono on public.captura_roteamento;
create policy captura_roteamento_dono
  on public.captura_roteamento for all
  using (user_id = (select auth.uid()))
  -- A chave estrangeira garante que a conta EXISTE, nao que ela e sua.
  -- Sem estes EXISTS, daria para criar uma regra apontando para a conta
  -- de outra pessoa.
  with check (
    user_id = (select auth.uid())
    and (account_id is null or exists (
      select 1 from public.accounts a
      where a.id = account_id and a.user_id = (select auth.uid())))
    and (credit_card_id is null or exists (
      select 1 from public.credit_cards c
      where c.id = credit_card_id and c.user_id = (select auth.uid())))
  );

-- ── A pergunta ───────────────────────────────────────────────
--
-- Guarda a NOTIFICACAO, nao um lancamento pela metade. Assim, na hora
-- de resolver, `montarLancamentoCapturado` roda de novo, inteira, com a
-- escolha do usuario no lugar do empate — um caminho so constroi
-- lancamento. E uma pendente parada de ontem se beneficia de qualquer
-- melhoria que o classificador receber amanha.
create table if not exists public.capturas_pendentes (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,

  -- A MESMA chave de `transactions.captura_chave`. O Android reemite a
  -- notificacao a cada atualizacao do texto; sem o unique abaixo, a
  -- caixa encheria de copias da mesma pergunta.
  captura_chave  text not null,

  pacote         text,
  banco          text,
  texto          text,
  valor          numeric(12,2) not null check (valor > 0),
  data           date not null,

  -- O INSTANTE da notificacao. E ele que a conciliacao usa quando a
  -- pendente for resolvida — horas depois. Usar `now()` na resolucao
  -- procuraria o outro lado da transferencia na janela errada, nao
  -- acharia nada, e creditaria o destino duas vezes.
  capturada_em   timestamptz not null,

  motivo         text not null,
  detalhe        text,
  -- Os candidatos que o dominio ja tinha em maos, para a tela oferecer
  -- os provaveis antes da lista inteira.
  opcoes         uuid[],

  criada_em      timestamptz not null default now(),
  resolucao      text check (resolucao in ('lancada', 'descartada')),
  resolvida_em   timestamptz,
  transaction_id uuid references public.transactions(id) on delete set null,

  unique (user_id, captura_chave),

  constraint capturas_pendentes_resolucao_coerente check (
    (resolucao is null and resolvida_em is null)
    or (resolucao is not null and resolvida_em is not null)
  )
);

comment on table public.capturas_pendentes is
  'Notificacoes capturadas que o dominio nao soube rotear sozinho, '
  'esperando uma escolha do usuario. Linha resolvida NAO e apagada: e o '
  'unique (user_id, captura_chave) que impede a mesma notificacao de '
  'voltar a perguntar depois de ja ter sido respondida.';

-- Indice PARCIAL: a caixa so le o que esta em aberto. As resolvidas
-- ficam para historico e nunca sao varridas.
create index if not exists capturas_pendentes_abertas
  on public.capturas_pendentes (user_id, capturada_em desc)
  where resolvida_em is null;

-- O ON DELETE SET NULL acima varre esta tabela a cada transacao
-- apagada, e transacao se apaga o tempo todo.
create index if not exists capturas_pendentes_transacao
  on public.capturas_pendentes (transaction_id)
  where transaction_id is not null;

alter table public.capturas_pendentes enable row level security;

drop policy if exists capturas_pendentes_dono on public.capturas_pendentes;
create policy capturas_pendentes_dono
  on public.capturas_pendentes for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
