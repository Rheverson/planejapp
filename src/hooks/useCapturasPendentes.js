import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { resolverPendente, descartarPendente } from "@/lib/captura";
import { vibrar } from "@/lib/vibrar";

// ============================================================
// A caixa de capturas que precisam de uma resposta.
//
// A consulta usa o índice PARCIAL `capturas_pendentes_abertas`, que só
// indexa `resolvida_em is null`. As respondidas ficam guardadas para
// histórico — e para impedir que a mesma notificação volte a perguntar —
// sem nunca serem varridas.
// ============================================================

export const CHAVE_PENDENTES = "capturas-pendentes";

export function useCapturasPendentes() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const chave = [CHAVE_PENDENTES, user?.id];

  const { data: pendentes = [], isLoading } = useQuery({
    queryKey: chave,
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("capturas_pendentes")
        .select("*")
        .eq("user_id", user.id)
        .is("resolvida_em", null)
        .order("capturada_em", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // A captura acontece FORA do React: o plugin nativo entrega a
  // notificação ao hook de captura, que grava a pendência direto. Sem
  // este aviso, a caixa só apareceria no próximo refetch — e a pessoa
  // acabou de ver o toast dizendo que tem algo esperando.
  useEffect(() => {
    if (!user?.id) return undefined;
    const atualizar = () => queryClient.invalidateQueries({ queryKey: [CHAVE_PENDENTES, user.id] });
    window.addEventListener("capturaPendente", atualizar);
    return () => window.removeEventListener("capturaPendente", atualizar);
  }, [queryClient, user?.id]);

  const invalidarTudo = () => {
    queryClient.invalidateQueries({ queryKey: [CHAVE_PENDENTES, user?.id] });
    // Saldo e KPIs mudam no mesmo instante: a resolução acabou de criar
    // (ou promover) uma transação de verdade.
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
  };

  const resolver = useMutation({
    mutationFn: ({ pendente, escolha, memorizar }) =>
      resolverPendente({ userId: user.id, pendente, escolha, memorizar })
        .then((r) => { if (r.erro) throw r.erro; return r; }),
    onSuccess: (r) => {
      invalidarTudo();
      if (r.acao === "outra_pergunta") {
        // A resposta revelou a próxima pergunta. Nada foi lançado
        // ainda, e a pendência continua na caixa com o novo empate.
        vibrar.toque();
        toast.info("Quase lá — só falta me dizer para onde foi.");
        return;
      }
      vibrar.sucesso();
      if (r.acao === "promover" || r.acao === "transferir") {
        // O EFEITO DOMINÓ: a resposta destravou o outro lado, que já
        // estava gravado, e o par virou uma transferência só.
        toast.success("Juntei com o outro lado: virou transferência entre suas contas.");
        return;
      }
      if (r.acao === "descartar" || r.acao === "repetida") {
        toast.success("Esse dinheiro já estava registrado.");
        return;
      }
      toast.success("Lançamento registrado.");
    },
    onError: (e) => {
      vibrar.erro();
      toast.error(e?.message || "Não consegui registrar. Tente pelo formulário.");
    },
  });

  const descartar = useMutation({
    mutationFn: (pendente) =>
      descartarPendente({ userId: user.id, pendente })
        .then((r) => { if (r.erro) throw r.erro; return r; }),
    onSuccess: () => {
      vibrar.remocao();
      queryClient.invalidateQueries({ queryKey: [CHAVE_PENDENTES, user?.id] });
    },
    onError: (e) => {
      vibrar.erro();
      toast.error(e?.message || "Não consegui descartar.");
    },
  });

  return { pendentes, isLoading, resolver, descartar };
}
