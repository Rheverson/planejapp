import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const defaultPatterns = {
  expense: {
    // ALIMENTAÇÃO
    "mercado": "alimentação",
    "supermercado": "alimentação",
    "hipermercado": "alimentação",
    "minimercado": "alimentação",
    "mercearia": "alimentação",
    "sacolão": "alimentação",
    "hortifruti": "alimentação",
    "açougue": "alimentação",
    "peixaria": "alimentação",
    "padaria": "alimentação",
    "panificadora": "alimentação",
    "confeitaria": "alimentação",
    "sorveteria": "alimentação",
    "restaurante": "alimentação",
    "lanchonete": "alimentação",
    "hamburger": "alimentação",
    "hamburguer": "alimentação",
    "pizza": "alimentação",
    "pizzaria": "alimentação",
    "sushi": "alimentação",
    "japonês": "alimentação",
    "japonesa": "alimentação",
    "churrasco": "alimentação",
    "churrascaria": "alimentação",
    "self service": "alimentação",
    "marmita": "alimentação",
    "lanche": "alimentação",
    "snack": "alimentação",
    "café": "alimentação",
    "cafeteria": "alimentação",
    "starbucks": "alimentação",
    "mcdonalds": "alimentação",
    "mc donalds": "alimentação",
    "burger king": "alimentação",
    "subway": "alimentação",
    "bob's": "alimentação",
    "kfc": "alimentação",
    "dominos": "alimentação",
    "pizza hut": "alimentação",
    "ifood": "alimentação",
    "uber eats": "alimentação",
    "rappi": "alimentação",
    "delivery": "alimentação",
    "alimentação": "alimentação",
    "alimento": "alimentação",
    "comida": "alimentação",
    "bebida": "alimentação",
    "cerveja": "alimentação",
    "vinho": "alimentação",
    "boteco": "alimentação",
    "bar ": "alimentação",
    "bares": "alimentação",

    // MORADIA
    "aluguel": "moradia",
    "aluguer": "moradia",
    "condomínio": "moradia",
    "condominio": "moradia",
    "iptu": "moradia",
    "luz": "moradia",
    "energia elétrica": "moradia",
    "conta de luz": "moradia",
    "enel": "moradia",
    "cemig": "moradia",
    "copel": "moradia",
    "celpe": "moradia",
    "coelba": "moradia",
    "água": "moradia",
    "saneamento": "moradia",
    "sabesp": "moradia",
    "copasa": "moradia",
    "embasa": "moradia",
    "gás": "moradia",
    "gás encanado": "moradia",
    "comgas": "moradia",
    "gas natural": "moradia",
    "faxina": "moradia",
    "diarista": "moradia",
    "empregada": "moradia",
    "limpeza": "moradia",
    "reforma": "moradia",
    "manutenção": "moradia",
    "pintura": "moradia",
    "encanador": "moradia",
    "eletricista": "moradia",
    "dedetização": "moradia",
    "mobília": "moradia",
    "mobiliário": "moradia",
    "móvel": "moradia",
    "sofá": "moradia",
    "cama": "moradia",
    "colchão": "moradia",
    "geladeira": "moradia",
    "fogão": "moradia",
    "máquina de lavar": "moradia",
    "microondas": "moradia",
    "ar condicionado": "moradia",
    "financiamento imóvel": "moradia",
    "parcela imovel": "moradia",
    "hipoteca": "moradia",

    // TRANSPORTE
    "uber": "transporte",
    "99pop": "transporte",
    "99 taxi": "transporte",
    "táxi": "transporte",
    "taxi": "transporte",
    "ônibus": "transporte",
    "onibus": "transporte",
    "metrô": "transporte",
    "metro": "transporte",
    "trem": "transporte",
    "brt": "transporte",
    "van escolar": "transporte",
    "combustível": "transporte",
    "gasolina": "transporte",
    "etanol": "transporte",
    "álcool combustível": "transporte",
    "diesel": "transporte",
    "posto de combustível": "transporte",
    "posto gasolina": "transporte",
    "abastecimento": "transporte",
    "estacionamento": "transporte",
    "parking": "transporte",
    "pedágio": "transporte",
    "pedagio": "transporte",
    "autoban": "transporte",
    "concessionária estrada": "transporte",
    "multa de trânsito": "transporte",
    "ipva": "transporte",
    "seguro auto": "transporte",
    "seguro carro": "transporte",
    "seguro veículo": "transporte",
    "manutenção carro": "transporte",
    "revisão carro": "transporte",
    "troca de óleo": "transporte",
    "oficina": "transporte",
    "borracharia": "transporte",
    "pneu": "transporte",
    "funilaria": "transporte",
    "detran": "transporte",
    "emplacamento": "transporte",
    "licenciamento": "transporte",
    "passagem aérea": "transporte",
    "passagem": "transporte",
    "bilhete único": "transporte",
    "cartão transporte": "transporte",
    "bicicleta": "transporte",
    "patinete": "transporte",
    "mototaxi": "transporte",

    // SAÚDE
    "farmácia": "saúde",
    "farmacia": "saúde",
    "drogaria": "saúde",
    "droga raia": "saúde",
    "drogasil": "saúde",
    "ultrafarma": "saúde",
    "pacheco": "saúde",
    "remédio": "saúde",
    "remedio": "saúde",
    "medicamento": "saúde",
    "vitamina": "saúde",
    "suplemento": "saúde",
    "médico": "saúde",
    "medico": "saúde",
    "consulta médica": "saúde",
    "consulta": "saúde",
    "dentista": "saúde",
    "odontológico": "saúde",
    "ortodontia": "saúde",
    "plano de saúde": "saúde",
    "plano saude": "saúde",
    "unimed": "saúde",
    "amil": "saúde",
    "bradesco saude": "saúde",
    "sulamerica saude": "saúde",
    "hapvida": "saúde",
    "notredame": "saúde",
    "exame": "saúde",
    "laboratório": "saúde",
    "laboratorio": "saúde",
    "raio x": "saúde",
    "ressonância": "saúde",
    "ultrassom": "saúde",
    "fisioterapia": "saúde",
    "fisioterapeuta": "saúde",
    "psicólogo": "saúde",
    "psicologo": "saúde",
    "psiquiatra": "saúde",
    "terapia": "saúde",
    "nutricionista": "saúde",
    "cirurgia": "saúde",
    "hospital": "saúde",
    "pronto socorro": "saúde",
    "upa": "saúde",
    "vacina": "saúde",
    "academia": "saúde",
    "smart fit": "saúde",
    "bodytech": "saúde",
    "bluefit": "saúde",
    "total pass": "saúde",
    "pilates": "saúde",
    "yoga": "saúde",
    "crossfit": "saúde",
    "personal trainer": "saúde",
    "personal": "saúde",
    "musculação": "saúde",

    // EDUCAÇÃO
    "escola": "educação",
    "colégio": "educação",
    "colegio": "educação",
    "faculdade": "educação",
    "universidade": "educação",
    "usp": "educação",
    "unicamp": "educação",
    "puc": "educação",
    "anhanguera": "educação",
    "unip": "educação",
    "estácio": "educação",
    "mensalidade escolar": "educação",
    "mensalidade faculdade": "educação",
    "curso": "educação",
    "cursinho": "educação",
    "inglês": "educação",
    "ingles": "educação",
    "espanhol": "educação",
    "idioma": "educação",
    "wizard": "educação",
    "ccaa": "educação",
    "culture english": "educação",
    "livro": "educação",
    "livros": "educação",
    "apostila": "educação",
    "material escolar": "educação",
    "papelaria": "educação",
    "livraria": "educação",
    "udemy": "educação",
    "coursera": "educação",
    "alura": "educação",
    "rocketseat": "educação",
    "treinamento": "educação",
    "capacitação": "educação",
    "pós graduação": "educação",
    "pós-graduação": "educação",
    "mba": "educação",
    "intercâmbio": "educação",

    // LAZER
    "cinema": "lazer",
    "cinemark": "lazer",
    "cinesystem": "lazer",
    "teatro": "lazer",
    "show": "lazer",
    "concert": "lazer",
    "festival": "lazer",
    "parque": "lazer",
    "parque aquático": "lazer",
    "zoológico": "lazer",
    "museu": "lazer",
    "exposição": "lazer",
    "ingresso": "lazer",
    "ticketmaster": "lazer",
    "sympla": "lazer",
    "eventbrite": "lazer",
    "balada": "lazer",
    "boate": "lazer",
    "clube": "lazer",
    "piscina": "lazer",
    "viagem": "lazer",
    "passeio": "lazer",
    "turismo": "lazer",
    "hotel": "lazer",
    "pousada": "lazer",
    "hostel": "lazer",
    "airbnb": "lazer",
    "booking": "lazer",
    "jogo": "lazer",
    "game": "lazer",
    "playstation": "lazer",
    "xbox": "lazer",
    "steam": "lazer",
    "nintendo": "lazer",
    "esporte": "lazer",
    "futebol": "lazer",
    "tênis": "lazer",
    "natação": "lazer",

    // STREAMING E ASSINATURAS
    "netflix": "streaming",
    "amazon prime": "streaming",
    "prime video": "streaming",
    "disney plus": "streaming",
    "disney+": "streaming",
    "hbo max": "streaming",
    "max ": "streaming",
    "globoplay": "streaming",
    "paramount": "streaming",
    "apple tv": "streaming",
    "crunchyroll": "streaming",
    "mubi": "streaming",
    "dazn": "streaming",
    "espn": "streaming",
    "telecine": "streaming",
    "spotify": "streaming",
    "deezer": "streaming",
    "apple music": "streaming",
    "youtube premium": "streaming",
    "youtube music": "streaming",
    "tidal": "streaming",

    // ASSINATURAS
    "assinatura": "assinaturas",
    "mensalidade": "assinaturas",
    "plano mensal": "assinaturas",
    "adobe": "assinaturas",
    "microsoft 365": "assinaturas",
    "office 365": "assinaturas",
    "google one": "assinaturas",
    "icloud": "assinaturas",
    "dropbox": "assinaturas",
    "notion": "assinaturas",
    "figma": "assinaturas",
    "canva": "assinaturas",
    "antivírus": "assinaturas",
    "vpn": "assinaturas",
    "chatgpt": "assinaturas",
    "claude": "assinaturas",
    "midjourney": "assinaturas",
    "lastpass": "assinaturas",
    "1password": "assinaturas",
    "duolingo": "assinaturas",
    "headspace": "assinaturas",
    "calm": "assinaturas",
    "linkedin premium": "assinaturas",

    // TELEFONE
    "celular": "telefone",
    "telefone": "telefone",
    "tim": "telefone",
    "claro": "telefone",
    "vivo": "telefone",
    "oi ": "telefone",
    "nextel": "telefone",
    "plano celular": "telefone",
    "recarga": "telefone",
    "conta telefone": "telefone",
    "internet móvel": "telefone",
    "dados móveis": "telefone",

    // INTERNET
    "internet": "internet",
    "banda larga": "internet",
    "fibra": "internet",
    "wi-fi": "internet",
    "wifi": "internet",
    "net ": "internet",
    "vivo fibra": "internet",
    "claro net": "internet",
    "oi fibra": "internet",
    "sky": "internet",

    // COMPRAS
    "amazon": "compras",
    "mercado livre": "compras",
    "shopee": "compras",
    "aliexpress": "compras",
    "magazine luiza": "compras",
    "magalu": "compras",
    "casas bahia": "compras",
    "ponto frio": "compras",
    "americanas": "compras",
    "submarino": "compras",
    "extra ": "compras",
    "carrefour": "compras",
    "walmart": "compras",
    "shein": "compras",
    "renner": "compras",
    "c&a": "compras",
    "riachuelo": "compras",
    "lojas": "compras",
    "eletrônico": "compras",
    "eletronico": "compras",
    "notebook": "compras",
    "computador": "compras",
    "celular compra": "compras",
    "smartphone": "compras",
    "acessório": "compras",
    "fone": "compras",
    "headphone": "compras",

    // ROUPAS
    "roupa": "roupas",
    "roupas": "roupas",
    "camisa": "roupas",
    "camiseta": "roupas",
    "calça": "roupas",
    "vestido": "roupas",
    "blusa": "roupas",
    "jaqueta": "roupas",
    "casaco": "roupas",
    "sapato": "roupas",
    "tênis calçado": "roupas",
    "sandália": "roupas",
    "meia": "roupas",
    "cueca": "roupas",
    "calcinha": "roupas",
    "sutiã": "roupas",
    "pijama": "roupas",
    "zara": "roupas",
    "h&m": "roupas",
    "farm": "roupas",
    "arezzo": "roupas",
    "reserva": "roupas",

    // BELEZA
    "salão": "beleza",
    "cabeleireiro": "beleza",
    "cabelereiro": "beleza",
    "barbearia": "beleza",
    "barba": "beleza",
    "corte de cabelo": "beleza",
    "manicure": "beleza",
    "pedicure": "beleza",
    "estética": "beleza",
    "estetica": "beleza",
    "maquiagem": "beleza",
    "cosmético": "beleza",
    "cosmetico": "beleza",
    "perfume": "beleza",
    "shampoo": "beleza",
    "condicionador": "beleza",
    "creme": "beleza",
    "hidratante": "beleza",
    "boticário": "beleza",
    "natura": "beleza",
    "avon": "beleza",
    "o boticario": "beleza",
    "sephora": "beleza",
    "depilação": "beleza",
    "depilacao": "beleza",
    "bronzeamento": "beleza",
    "spa": "beleza",
    "massagem": "beleza",

    // PET
    "pet shop": "pet",
    "petshop": "pet",
    "veterinário": "pet",
    "veterinario": "pet",
    "ração": "pet",
    "racao": "pet",
    "ração gato": "pet",
    "ração cachorro": "pet",
    "banho e tosa": "pet",
    "tosa": "pet",
    "remédio animal": "pet",
    "vacina animal": "pet",
    "plano pet": "pet",
    "petz": "pet",
    "cobasi": "pet",
    "abrigo animal": "pet",

    // PRESENTES E DOAÇÕES
    "presente": "presente",
    "gift": "presente",
    "aniversário": "presente",
    "natal": "presente",
    "casamento presente": "presente",
    "chá de bebê": "presente",
    "doação": "doação",
    "doacao": "doação",
    "caridade": "doação",
    "ong": "doação",
    "instituição": "doação",
    "dízimo": "doação",
    "dizimo": "doação",
    "oferta": "doação",
    "igreja": "doação",

    // CARTÃO DE CRÉDITO
    "fatura": "cartão de crédito",
    "fatura cartão": "cartão de crédito",
    "cartão de crédito": "cartão de crédito",
    "cartao credito": "cartão de crédito",
    "nubank fatura": "cartão de crédito",
    "itaú fatura": "cartão de crédito",
    "bradesco fatura": "cartão de crédito",
    "c6 fatura": "cartão de crédito",
    "inter fatura": "cartão de crédito",
    "pagamento fatura": "cartão de crédito",

    // IMPOSTOS E TAXAS
    "imposto": "impostos",
    "tributo": "impostos",
    "taxa": "impostos",
    "ir ": "impostos",
    "irpf": "impostos",
    "irpj": "impostos",
    "imposto de renda": "impostos",
    "receita federal": "impostos",
    "simples nacional": "impostos",
    "mei ": "impostos",
    "das ": "impostos",
    "inss": "impostos",
    "contribuição": "impostos",
    "iof": "impostos",
    "iss": "impostos",
    "icms": "impostos",
    "multa": "impostos",
    "juros atraso": "impostos",
    "tarifa bancária": "impostos",
    "tarifa banco": "impostos",
    "anuidade": "impostos",
    "anuidade cartão": "impostos",

    // VIAGEM
    "passagem aerea": "viagem",
    "voo": "viagem",
    "latam": "viagem",
    "gol ": "viagem",
    "azul ": "viagem",
    "tap ": "viagem",
    "emirates": "viagem",
    "ryanair": "viagem",
    "hotel": "viagem",
    "hospedagem": "viagem",
    "airbnb viagem": "viagem",
    "booking hotel": "viagem",
    "trivago": "viagem",
    "decolar": "viagem",
    "hurb": "viagem",
    "mala": "viagem",
    "bagagem": "viagem",
    "passaporte": "viagem",
    "visto": "viagem",
    "câmbio": "viagem",
    "dólar": "viagem",
    "euro": "viagem",
    "seguro viagem": "viagem",

    // RESTAURANTE
    "jantar": "restaurante",
    "almoço": "restaurante",
    "almoco": "restaurante",
    "brunch": "restaurante",
    "rodízio": "restaurante",
    "rodizio": "restaurante",
    "buffet": "restaurante",
    "self-service": "restaurante",
    "comida japonesa": "restaurante",
    "comida italiana": "restaurante",
    "comida árabe": "restaurante",
    "cantina": "restaurante",
    "bistrô": "restaurante",
    "bistro": "restaurante",
    "doceria": "restaurante",

    // ENERGIA (separado de moradia para quando é categoria específica)
    "conta de energia": "energia",
    "conta energia": "energia",
    "cpfl": "energia",
    "eletropaulo": "energia",
    "light ": "energia",
    "coelce": "energia",

    // ÁGUA (separado)
    "conta de água": "água",
    "conta agua": "água",
    "caesb": "água",
    "cagece": "água",
    "caema": "água",
  },

  income: {
    // SALÁRIO
    "salário": "salário",
    "salario": "salário",
    "pagamento salário": "salário",
    "holerite": "salário",
    "folha de pagamento": "salário",
    "pro labore": "salário",
    "pró-labore": "salário",
    "remuneração": "salário",
    "13 salário": "salário",
    "13º": "salário",
    "férias": "salário",
    "ferias": "salário",
    "rescisão": "salário",
    "fgts": "salário",
    "adiantamento": "salário",
    "vale": "salário",

    // FREELANCE
    "freelance": "freelance",
    "freela": "freelance",
    "projeto": "freelance",
    "serviço prestado": "freelance",
    "consultoria": "freelance",
    "honorários": "freelance",
    "honorarios": "freelance",
    "trabalho extra": "freelance",
    "bico": "freelance",
    "autônomo": "freelance",
    "autonomo": "freelance",
    "mei recebimento": "freelance",
    "nota fiscal": "freelance",

    // COMISSÃO E BÔNUS
    "comissão": "comissão",
    "comissao": "comissão",
    "bônus": "bônus",
    "bonus": "bônus",
    "premiação": "bônus",
    "premiacao": "bônus",
    "gratificação": "bônus",
    "gratificacao": "bônus",
    "ppr": "bônus",
    "plr": "bônus",
    "participação nos lucros": "bônus",
    "incentivo": "bônus",
    "meta batida": "bônus",

    // ALUGUEL RECEBIDO
    "aluguel recebido": "aluguel recebido",
    "aluguel imovel": "aluguel recebido",
    "locação": "aluguel recebido",
    "locacao": "aluguel recebido",
    "renda aluguel": "aluguel recebido",
    "airbnb recebido": "aluguel recebido",

    // DIVIDENDOS E INVESTIMENTOS
    "dividendo": "dividendos",
    "dividendos": "dividendos",
    "jcp": "dividendos",
    "juros sobre capital": "dividendos",
    "rendimento": "dividendos",
    "rendimentos": "dividendos",
    "cdi": "dividendos",
    "selic": "dividendos",
    "juros": "dividendos",
    "resgate": "dividendos",
    "aplicação rendimento": "dividendos",
    "fii rendimento": "dividendos",
    "fundo imobiliário": "dividendos",
    "tesouro rendimento": "dividendos",
    "cdb rendimento": "dividendos",

    // VENDA
    "venda": "venda",
    "vendido": "venda",
    "vendi": "venda",
    "mercado livre venda": "venda",
    "olx venda": "venda",
    "enjoei": "venda",
    "shopee venda": "venda",
    "loja online": "venda",
    "e-commerce": "venda",

    // REEMBOLSO
    "reembolso": "reembolso",
    "ressarcimento": "reembolso",
    "devolução": "reembolso",
    "devolvido": "reembolso",
    "estorno": "reembolso",
    "chargeback": "reembolso",
    "cashback": "reembolso",
    "reembolso empresa": "reembolso",
    "reembolso plano": "reembolso",

    // PRESENTE RECEBIDO
    "presente recebido": "presente recebido",
    "aniversário recebido": "presente recebido",
    "gift recebido": "presente recebido",
    "pix recebido": "presente recebido",
    "transferência recebida": "presente recebido",

    // OUTROS
    "pensão": "outros",
    "pensao": "outros",
    "aposentadoria": "outros",
    "previdência social": "outros",
    "benefício": "outros",
    "beneficio": "outros",
    "bolsa família": "outros",
    "auxílio": "outros",
    "auxilio": "outros",
    "indenização": "outros",
    "indenizacao": "outros",
    "herança": "outros",
    "heranca": "outros",
    "sorteio": "outros",
    "prêmio": "outros",
    "premio": "outros",
    "loteria": "outros",
  },

  investment: {
    "tesouro": "tesouro direto",
    "tesouro direto": "tesouro direto",
    "tesouro selic": "tesouro direto",
    "tesouro ipca": "tesouro direto",
    "tesouro prefixado": "tesouro direto",
    "cdb": "cdb",
    "certificado de depósito": "cdb",
    "lci": "renda fixa",
    "lca": "renda fixa",
    "cri": "renda fixa",
    "cra": "renda fixa",
    "debenture": "renda fixa",
    "debênture": "renda fixa",
    "renda fixa": "renda fixa",
    "ação": "ações",
    "acoes": "ações",
    "ações": "ações",
    "bolsa": "ações",
    "b3": "ações",
    "bovespa": "ações",
    "stock": "ações",
    "fii": "fiis",
    "fundo imobiliário": "fiis",
    "fundo imobiliario": "fiis",
    "fiis": "fiis",
    "bitcoin": "criptomoedas",
    "btc": "criptomoedas",
    "ethereum": "criptomoedas",
    "eth": "criptomoedas",
    "crypto": "criptomoedas",
    "cripto": "criptomoedas",
    "criptomoeda": "criptomoedas",
    "previdência": "previdência",
    "previdencia": "previdência",
    "pgbl": "previdência",
    "vgbl": "previdência",
    "fundo de investimento": "renda fixa",
    "fundo multimercado": "renda fixa",
    "fundo ações": "ações",
    "etf": "ações",
    "bdr": "ações",
  }
};

// Mapeia para garantir compatibilidade com categorias do banco
const categoryAliases = {
  "alimentação": "alimentação",
  "moradia": "moradia",
  "transporte": "transporte",
  "saúde": "saúde",
  "educação": "educação",
  "lazer": "lazer",
  "streaming": "streaming",
  "assinaturas": "assinaturas",
  "telefone": "telefone",
  "internet": "internet",
  "compras": "compras",
  "roupas": "roupas",
  "beleza": "beleza",
  "pet": "pet",
  "presente": "presente",
  "doação": "doação",
  "cartão de crédito": "cartão de crédito",
  "impostos": "impostos",
  "viagem": "viagem",
  "restaurante": "restaurante",
  "energia": "energia",
  "água": "água",
};

export function useCategorySuggestion(description, transactionType) {
  const [suggestion, setSuggestion] = useState(null);
  const [confidence, setConfidence] = useState(0);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: userPatterns = [] } = useQuery({
    queryKey: ['categoryPatterns', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('category_patterns')
        .select('*')
        .eq('user_id', user.id);
      if (error) return [];
      return data;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ keyword, category, type }) => {
      if (!user?.id) return;
      const existing = userPatterns.find(
        p => p.keyword?.toLowerCase() === keyword.toLowerCase() && p.transaction_type === type
      );
      if (existing) {
        const { error } = await supabase.from('category_patterns').update({
          category,
          usage_count: (existing.usage_count || 1) + 1,
          confidence: Math.min((existing.confidence || 0.6) + 0.1, 1)
        }).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('category_patterns').insert([{
          user_id: user.id,
          keyword,
          category,
          transaction_type: type,
          confidence: 0.6,
          usage_count: 1
        }]);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categoryPatterns', user?.id] })
  });

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
      let bestKeywordLength = 0;

      Object.entries(combinedPatternsRef.current).forEach(([keyword, value]) => {
        if (normalizedDesc.includes(keyword.toLowerCase())) {
          const isObject = typeof value === "object";
          const cat = isObject ? value.category : value;
          const conf = isObject ? value.confidence : 0.7;
          const finalConf = isObject && value.userDefined ? Math.min(conf + 0.2, 1) : conf;

          // Prioriza: maior confiança, depois keyword mais longa (mais específica)
          if (
            finalConf > bestConfidence ||
            (finalConf === bestConfidence && keyword.length > bestKeywordLength)
          ) {
            bestMatch = cat;
            bestConfidence = finalConf;
            bestKeywordLength = keyword.length;
          }
        }
      });

      setSuggestion(bestMatch);
      setConfidence(bestConfidence);
    }, 300);

    return () => clearTimeout(timer);
  }, [description]);

  const confirmCategory = useCallback((category, desc) => {
    if (!desc || desc.length < 3) return;
    const keyword = desc.toLowerCase().trim();
    saveMutation.mutate({ keyword, category, type: transactionType });
    // Também salva palavras individuais relevantes
    const words = keyword.split(" ").filter(w => w.length >= 4);
    if (words.length > 0 && words[0] !== keyword) {
      saveMutation.mutate({ keyword: words[0], category, type: transactionType });
    }
  }, [transactionType]);

  return { suggestion, confidence, confirmCategory, isLoading: saveMutation.isPending };
}