import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const defaultPatterns = {
  expense: {
    "mercado": "alimentação",
    "supermercado": "alimentação",
    "restaurante": "alimentação",
    "ifood": "alimentação",
    "uber eats": "alimentação",
    "padaria": "alimentação",
    "lanche": "alimentação",
    "aluguel": "moradia",
    "condomínio": "moradia",
    "luz": "moradia",
    "energia": "moradia",
    "água": "moradia",
    "internet": "moradia",
    "gás": "moradia",
    "uber": "transporte",
    "99": "transporte",
    "combustível": "transporte",
    "gasolina": "transporte",
    "estacionamento": "transporte",
    "farmácia": "saúde",
    "médico": "saúde",
    "consulta": "saúde",
    "plano de saúde": "saúde",
    "academia": "saúde",
    "curso": "educação",
    "escola": "educação",
    "faculdade": "educação",
    "livro": "educação",
    "netflix": "lazer",
    "spotify": "lazer",
    "cinema": "lazer",
    "viagem": "lazer",
    "shopping": "compras",
    "roupa": "compras",
    "presente": "compras"
  },
  income: {
    "salário": "salário",
    "salario": "salário",
    "pagamento": "salário",
    "freelance": "freelance",
    "projeto": "freelance",
    "serviço": "freelance",
    "comissão": "comissão",
    "bônus": "comissão",
    "rendimento": "investimentos",
    "dividendo": "investimentos",
    "juros": "investimentos",
    "presente": "presente",
    "reembolso": "outros"
  }
};

export function useCategorySuggestion(description, transactionType) {
  const [suggestion, setSuggestion] = useState(null);
  const [confidence, setConfidence] = useState(0);
  const queryClient = useQueryClient();

  const { data: userPatterns = [] } = useQuery({
    queryKey: ['categoryPatterns'],
    queryFn: () => base44.entities.CategoryPattern.list(),
    // Evita re-fetch desnecessário que causava o loop
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ keyword, category, type }) => {
      const existing = userPatterns.find(
        p => p.keyword.toLowerCase() === keyword.toLowerCase() && p.transaction_type === type
      );
      if (existing) {
        return base44.entities.CategoryPattern.update(existing.id, {
          category,
          usage_count: (existing.usage_count || 1) + 1,
          confidence: Math.min((existing.confidence || 1) + 0.1, 1)
        });
      } else {
        return base44.entities.CategoryPattern.create({
          keyword,
          category,
          transaction_type: type,
          confidence: 0.6,
          usage_count: 1
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categoryPatterns'] });
    }
  });

  // Guarda combinedPatterns em ref para não ser dependência do useEffect
  const combinedPatternsRef = useRef({});
  combinedPatternsRef.current = useMemo(() => {
    const patterns = { ...(defaultPatterns[transactionType] || {}) };
    userPatterns
      .filter(p => p.transaction_type === transactionType)
      .forEach(p => {
        patterns[p.keyword.toLowerCase()] = {
          category: p.category,
          confidence: p.confidence || 1,
          userDefined: true
        };
      });
    return patterns;
  }, [userPatterns, transactionType]);

  // useEffect depende só de description — sem funções como dependência
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!description || description.length < 2) {
        setSuggestion(null);
        setConfidence(0);
        return;
      }

      const normalizedDesc = description.toLowerCase().trim();
      let bestMatch = null;
      let bestConfidence = 0;

      Object.entries(combinedPatternsRef.current).forEach(([keyword, value]) => {
        if (normalizedDesc.includes(keyword)) {
          const isObject = typeof value === "object";
          const cat  = isObject ? value.category : value;
          const conf = isObject ? value.confidence : 0.7;
          const finalConf = isObject && value.userDefined
            ? Math.min(conf + 0.2, 1)
            : conf;

          if (
            finalConf > bestConfidence ||
            (finalConf === bestConfidence && keyword.length > (bestMatch?.length || 0))
          ) {
            bestMatch = cat;
            bestConfidence = finalConf;
          }
        }
      });

      setSuggestion(bestMatch);
      setConfidence(bestConfidence);
    }, 300);

    return () => clearTimeout(timer);
  }, [description]); // ← só description, sem findSuggestion/combinedPatterns

  const confirmCategory = useCallback((category, desc) => {
    if (!desc || desc.length < 3) return;
    const words = desc.toLowerCase().split(" ").filter(w => w.length >= 3);
    if (words.length > 0) {
      saveMutation.mutate({
        keyword: desc.toLowerCase().trim(),
        category,
        type: transactionType
      });
      if (words[0] !== desc.toLowerCase().trim()) {
        saveMutation.mutate({ keyword: words[0], category, type: transactionType });
      }
    }
  }, [transactionType]); // removido saveMutation das deps para estabilizar

  return { suggestion, confidence, confirmCategory, isLoading: saveMutation.isPending };
}