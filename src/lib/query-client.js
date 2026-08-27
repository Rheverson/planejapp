import { QueryClient } from "@tanstack/react-query";

/**
 * Tempos de vida do cache por tipo de dado.
 *
 * Antes tudo usava o padrão (staleTime 0), então cada navegação entre
 * abas remontava a página e refazia todas as consultas: ir Home →
 * Transações → Home custava seis requisições.
 */
export const STALE = {
  /** Muda a cada lançamento. */
  transacoes: 30 * 1000,
  /** Muda pouco: contas, cartões, categorias, orçamentos, metas. */
  cadastros: 5 * 60 * 1000,
  /** Praticamente estático dentro da sessão. */
  perfil: 10 * 60 * 1000,
};

export const queryClientInstance = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: STALE.transacoes,
      gcTime: 10 * 60 * 1000,
    },
  },
});
