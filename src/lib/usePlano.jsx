import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { temAcessoPro, pagamentoFalhou } from "@/domain/assinatura";
import {
  planoDoUsuario, podeCriar, limiteDe, recursoDisponivel, tabelaDeLimites,
} from "@/domain/limites";

// ============================================================
// O plano do usuário e o que ele ainda pode criar.
//
// Isto NÃO é a trava. Quem impede a criação são os triggers no banco
// (migration 20260904093000): as tabelas aceitam escrita do dono, então
// um POST direto no PostgREST passaria por cima de qualquer JavaScript.
//
// O que mora aqui é o que a interface precisa para avisar ANTES e
// abrir o paywall na hora certa, em vez de deixar a pessoa preencher um
// formulário inteiro para bater num erro no fim.
// ============================================================

/**
 * Plano efetivo do usuário, com os limites que valem para ele.
 *
 * Três consultas, todas com `staleTime` alto: plano não muda a cada
 * clique, e a tabela de limites praticamente nunca muda. Sem isso, cada
 * tela que pergunta "cabe mais um?" viraria uma ida ao banco.
 */
export function usePlano() {
  const { user } = useAuth();

  const { data: assinatura, isLoading: carregandoAssinatura } = useQuery({
    queryKey: ["subscription", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("subscriptions").select("*")
        .eq("user_id", user.id).maybeSingle();
      return data;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const { data: ehFundador = false, isLoading: carregandoFundador } = useQuery({
    queryKey: ["fundador", user?.id],
    queryFn: async () => {
      // A tabela é somente leitura para o cliente — se fosse gravável,
      // seria auto-promoção a PRO.
      const { count } = await supabase.from("usuarios_fundadores")
        .select("user_id", { count: "exact", head: true }).eq("user_id", user.id);
      return (count ?? 0) > 0;
    },
    enabled: !!user?.id,
    staleTime: 60 * 60 * 1000,
  });

  const { data: limitesDoBanco } = useQuery({
    queryKey: ["planos_limites"],
    queryFn: async () => {
      const { data } = await supabase.from("planos_limites").select("plano, recurso, limite");
      return tabelaDeLimites(data);
    },
    staleTime: 60 * 60 * 1000,
  });

  const plano = planoDoUsuario({
    temAcesso: temAcessoPro(assinatura),
    ehFundador,
  });

  return {
    plano,
    ehPro: plano === "pro",
    ehFundador,
    // Para o aviso de cobrança. Quem está em `past_due`/`unpaid` já cai
    // em `free` pelo `plano` acima — isto aqui só diz POR QUE caiu, que
    // é o que o banner precisa para falar de cartão em vez de vender.
    pagamentoFalhou: pagamentoFalhou(assinatura),
    limitesDoBanco: limitesDoBanco ?? null,
    carregando: carregandoAssinatura || carregandoFundador,
    limiteDe: (recurso) => limiteDe(plano, recurso, limitesDoBanco ?? null),
    disponivel: (recurso) => recursoDisponivel(plano, recurso, limitesDoBanco ?? null),
  };
}

/**
 * "Cabe mais um <recurso>?", já com o plano do usuário resolvido.
 *
 * `atual` é a contagem que a tela JÁ tem em mãos — a Carteira já
 * carregou as contas, Metas já carregou as metas. Nenhuma consulta
 * nova: o custo aqui é zero.
 *
 * Devolve o quadro inteiro porque "última meta do plano Free" e "você
 * atingiu o limite" são frases diferentes, e as duas saem daqui.
 */
export function useLimite(recurso, atual = 0) {
  const { plano, ehPro, ehFundador, limitesDoBanco, carregando } = usePlano();
  const situacao = podeCriar({ plano, recurso, atual, limitesDoBanco });
  return { ...situacao, plano, ehPro, ehFundador, carregando };
}
