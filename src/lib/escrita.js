// ============================================================
// Escrita verificada
//
// O app dizia "Atualizado!" sem olhar se alguma linha mudou. Quando a
// RLS bloqueia — convidado sem permissão, registro de outro usuário,
// linha já apagada em outra aba — o PostgREST não devolve erro: devolve
// zero linhas. O toast de sucesso aparecia igual, e o usuário ficava
// achando que gravou.
//
// Aqui toda escrita passa a distinguir três desfechos:
//
//   erro do banco      -> lança o erro original (mensagemDeErro traduz)
//   nenhuma linha      -> lança NadaAfetado, com frase específica
//   uma ou mais linhas -> devolve as linhas
// ============================================================

/** Escrita que não encontrou nada para alterar. Não é falha técnica. */
export class NadaAfetado extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = "NadaAfetado";
    // Marca lida por `mensagemDeErro` para não traduzir de novo.
    this.jaEmPortugues = true;
  }
}

/**
 * Executa uma escrita do Supabase conferindo o efeito.
 *
 * @param consulta  o builder já montado (update/delete com os filtros)
 * @param aviso     o que dizer quando nada foi afetado
 *
 * O `.select("id")` pede ao PostgREST as linhas atingidas. Só o `id`
 * porque o corpo não interessa — o que importa é a contagem.
 */
export async function escreverVerificando(consulta, aviso) {
  const { data, error } = await consulta.select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new NadaAfetado(
      aviso || "Nada foi alterado. O item pode ter sido removido ou você não tem permissão.",
    );
  }
  return data;
}

/** Frases prontas, para as mensagens não divergirem entre telas. */
export const AVISOS = {
  transacaoAusente:
    "Não encontrei esse lançamento. Ele pode ter sido removido em outro dispositivo.",
  transacaoSemPermissao:
    "Nada foi alterado — você não tem permissão para editar lançamentos deste perfil.",
  contaAusente:
    "Não encontrei essa conta. Ela pode ter sido removida em outro dispositivo.",
  metaAusente:
    "Não encontrei essa meta. Ela pode ter sido removida em outro dispositivo.",
  cartaoAusente:
    "Não encontrei esse cartão. Ele pode ter sido removido em outro dispositivo.",
  recorrenciaAusente:
    "Nenhum lançamento da recorrência foi alterado. Eles podem já ter sido removidos.",
  compartilhamentoAusente:
    "Este convite não está mais disponível. Ele pode ter sido cancelado.",
};
