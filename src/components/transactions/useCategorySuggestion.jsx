import { useState, useEffect, useCallback, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Padrões padrão para bootstrap inicial
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

  // Buscar padrões do usuário
  const { data: userPatterns = [] } = useQuery({
    queryKey: ['categoryPatterns'],
    queryFn: () => base44.entities.CategoryPattern.list()
  });

  // Mutation para salvar/atualizar padrão
  const saveMutation = useMutation({
    mutationFn: async ({ keyword, category, type }) => {
      // Verificar se já existe
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

  // Combinar padrões padrão com padrões do usuário
  const combinedPatterns = useMemo(() => {
    const patterns = { ...defaultPatterns[transactionType] };
    
    // Padrões do usuário têm prioridade
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

  // Função para encontrar sugestão
  const findSuggestion = useCallback((desc) => {
    if (!desc || desc.length < 2) {
      setSuggestion(null);
      setConfidence(0);
      return;
    }

    const normalizedDesc = desc.toLowerCase().trim();
    let bestMatch = null;
    let bestConfidence = 0;

    // Buscar correspondência
    Object.entries(combinedPatterns).forEach(([keyword, value]) => {
      if (normalizedDesc.includes(keyword)) {
        const isObject = typeof value === 'object';
        const cat = isObject ? value.category : value;
        const conf = isObject ? value.confidence : 0.7;
        
        // Priorizar matches mais longos e padrões do usuário
        const matchScore = keyword.length / normalizedDesc.length;
        const finalConf = isObject && value.userDefined ? 
          Math.min(conf + 0.2, 1) : conf;
        
        if (finalConf > bestConfidence || 
            (finalConf === bestConfidence && keyword.length > (bestMatch?.length || 0))) {
          bestMatch = cat;
          bestConfidence = finalConf;
        }
      }
    });

    setSuggestion(bestMatch);
    setConfidence(bestConfidence);
  }, [combinedPatterns]);

  // Efeito para atualizar sugestão quando descrição muda
  useEffect(() => {
    const timer = setTimeout(() => {
      findSuggestion(description);
    }, 300);

    return () => clearTimeout(timer);
  }, [description, findSuggestion]);

  // Função para confirmar categoria (aprende com a escolha)
  const confirmCategory = useCallback((category, desc) => {
    if (!desc || desc.length < 3) return;

    // Extrair palavras-chave significativas
    const words = desc.toLowerCase().split(' ').filter(w => w.length >= 3);
    
    if (words.length > 0) {
      // Salvar a descrição completa como padrão
      saveMutation.mutate({
        keyword: desc.toLowerCase().trim(),
        category,
        type: transactionType
      });

      // Também salvar a primeira palavra significativa
      if (words[0] !== desc.toLowerCase().trim()) {
        saveMutation.mutate({
          keyword: words[0],
          category,
          type: transactionType
        });
      }
    }
  }, [saveMutation, transactionType]);

  return {
    suggestion,
    confidence,
    confirmCategory,
    isLoading: saveMutation.isPending
  };
}