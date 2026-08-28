// ============================================================
// Tradução de erros técnicos para linguagem de usuário
//
// O app exibia `toast.error("Erro: " + err.message)` em cerca de vinte
// pontos, jogando na tela mensagens do PostgREST em inglês, com código
// — "duplicate key value violates unique constraint ...".
// ============================================================

const POR_CODIGO = {
  // Postgres
  "23505": "Esse registro já existe.",
  "23503": "Não foi possível concluir: este item está vinculado a outro registro.",
  "23514": "Algum valor está fora do permitido. Confira os campos e tente de novo.",
  "23502": "Preencha todos os campos obrigatórios.",
  "22P02": "Algum valor está em formato inválido.",
  "42501": "Você não tem permissão para fazer isso.",
  // PostgREST
  PGRST116: "Registro não encontrado.",
  PGRST301: "Sua sessão expirou. Entre novamente.",
};

const POR_TRECHO = [
  [/duplicate key|already exists/i, "Esse registro já existe."],
  [/violates row-level security|permission denied/i, "Você não tem permissão para fazer isso."],
  [/violates check constraint .*amount_positivo/i, "O valor precisa ser maior que zero."],
  [/violates check constraint .*contas_distintas/i, "A conta de origem e a de destino precisam ser diferentes."],
  // Conta que paga a fatura de um cartão: o banco barra de propósito,
  // porque um cartão sem conta de débito não sabe de onde pagar.
  [/violates foreign key.*credit_cards_account_id/i,
   "Esta conta paga a fatura de um cartão. Desvincule o cartão antes de excluir a conta."],
  [/violates foreign key/i, "Este item está vinculado a outro registro e não pode ser alterado assim."],
  [/date\/time field value out of range|invalid input syntax for type date/i, "A data informada não existe."],
  [/JWT expired|invalid token|session/i, "Sua sessão expirou. Entre novamente."],
  [/Failed to fetch|NetworkError|network/i, "Sem conexão. Verifique sua internet e tente de novo."],
  [/rate limit|too many/i, "Muitas tentativas seguidas. Aguarde um instante."],
  [/Invalid login credentials/i, "E-mail ou senha incorretos."],
  [/Email not confirmed/i, "Confirme seu e-mail para continuar."],
  [/não autorizado|not authorized|unauthorized/i, "Você precisa entrar novamente para fazer isso."],
];

/**
 * Devolve uma frase em português para o erro.
 * `contexto` vira o começo da frase quando nada específico casa —
 * ex.: mensagemDeErro(err, "salvar a transação").
 */
export function mensagemDeErro(erro, contexto) {
  if (!erro) return "Algo não saiu como esperado. Tente de novo.";

  // Escrita que não afetou linha nenhuma já chega com a frase pronta
  // e específica (ver src/lib/escrita.js). Traduzir de novo só pioraria.
  if (erro.jaEmPortugues && erro.message) return erro.message;

  const codigo = erro.code ?? erro?.error?.code;
  if (codigo && POR_CODIGO[codigo]) return POR_CODIGO[codigo];

  const texto = [erro.message, erro.details, erro.hint, erro.error_description]
    .filter(Boolean)
    .join(" ");

  for (const [padrao, frase] of POR_TRECHO) {
    if (padrao.test(texto)) return frase;
  }

  return contexto
    ? `Não foi possível ${contexto}. Tente de novo.`
    : "Algo não saiu como esperado. Tente de novo.";
}
