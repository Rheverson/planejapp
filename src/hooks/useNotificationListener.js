import { useEffect, useState, useCallback } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { App as AppNativo } from "@capacitor/app";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";

// ============================================================
// O plugin nativo, registrado como o Capacitor 8 exige.
//
// O hook fazia `const { Plugins } = await import("@capacitor/core")` e
// lia `Plugins.NotificationListener`. Esse objeto `Plugins` FOI REMOVIDO
// do Capacitor na versão 3 — o projeto está na 8. Ele era `undefined`,
// então:
//
//   - `isAvailable` nunca virava true, e o banner que pede a permissão
//     de leitura de notificações NUNCA aparecia na tela;
//   - `requestPermission()` estourava e o catch engolia;
//   - o ouvinte jamais era registrado.
//
// Era por isso que, mesmo com o serviço nativo compilado e funcionando,
// o app nunca pedia nada e nunca capturava nada.
const NotificationListener = registerPlugin("NotificationListener");

// Padrões de extração para bancos brasileiros
const BANK_PATTERNS = [
  // Nubank - compra no crédito
  { regex: /Nubank.*compra.*R\$\s*([\d.,]+)/i, type: "expense", bank: "Nubank" },
  { regex: /compra aprovada.*R\$\s*([\d.,]+)/i, type: "expense", bank: "Nubank" },
  // Nubank - PIX enviado
  { regex: /Pix enviado.*R\$\s*([\d.,]+)/i, type: "expense", bank: "Nubank" },
  // Nubank - PIX recebido
  { regex: /Pix recebido.*R\$\s*([\d.,]+)/i, type: "income", bank: "Nubank" },
  // Nubank - débito
  { regex: /D[eé]bito.*R\$\s*([\d.,]+)/i, type: "expense", bank: "Nubank" },
  // Inter
  { regex: /Inter.*transferência.*R\$\s*([\d.,]+)/i, type: "expense", bank: "Inter" },
  { regex: /Inter.*recebeu.*R\$\s*([\d.,]+)/i, type: "income", bank: "Inter" },
  // Genérico
  { regex: /R\$\s*([\d.,]+)/i, type: "expense", bank: "Banco" },
];

// Extrai o valor de uma string de notificação
function extractAmount(text) {
  for (const pattern of BANK_PATTERNS) {
    const match = text.match(pattern.regex);
    if (match) {
      const raw = match[1].replace(/\./g, "").replace(",", ".");
      return { amount: parseFloat(raw), type: pattern.type, bank: pattern.bank };
    }
  }
  return null;
}

// Extrai a descrição (quem/onde)
function extractDescription(title, body) {
  // Tenta pegar o nome do estabelecimento ou pessoa
  const full = `${title} ${body}`;
  const match = full.match(/(?:no|em|para|de)\s+([A-Z][a-zA-Z\s]{2,30})/);
  return match ? match[1].trim() : title || "Transação automática";
}

// ============================================================
// De qual banco veio a notificacao.
//
// O `bank` que sai do regex e pobre: qualquer coisa que nao seja Nubank
// ou Inter cai no padrao generico e vira "Banco". O `packageName` diz a
// verdade — e e ele que permite casar a captura com a conta certa do
// usuario, alem de escrever uma nota honesta.
// ============================================================
const BANCOS_POR_PACOTE = {
  "com.nu.production":      "Nubank",
  "br.com.intermedium":     "Inter",
  "com.itau":               "Itau",
  "com.bradesco":           "Bradesco",
  "br.com.bb.android":      "Banco do Brasil",
  "br.com.santander":       "Santander",
  "com.picpay":             "PicPay",
  "com.caixa":              "Caixa",
  "br.com.recarga":         "RecargaPay",
  "com.mercadopago":        "Mercado Pago",
};

/** Sem acento, minusculo: "Itaú" e "itau" precisam casar. */
export function normalizar(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function bancoDoPacote(packageName) {
  const chave = Object.keys(BANCOS_POR_PACOTE)
    .find((pkg) => String(packageName || "").includes(pkg));
  return chave ? BANCOS_POR_PACOTE[chave] : null;
}

/**
 * Em qual conta o lancamento capturado entra.
 *
 * O banco exige `account_id` ou `credit_card_id` (CHECK
 * `transactions_precisa_de_origem`), e a notificacao nao diz nada sobre
 * conta. Entao:
 *
 *   1. tenta casar o nome do banco com o nome de uma conta do usuario —
 *      quem tem "Nubank" cadastrado recebe ali;
 *   2. senao, cai na conta mais antiga, que na pratica e a principal.
 *
 * Contas de INVESTIMENTO ficam fora dos dois caminhos: um gasto de
 * mercado caindo na caixinha estraga o calculo de aporte, e conta de
 * investimento diz onde o dinheiro esta, nao o que foi feito com ele.
 *
 * Devolve `null` quando o usuario nao tem conta nenhuma — e aí nao ha
 * onde lancar, e quem chama avisa.
 */
export async function escolherConta(userId, banco) {
  const { data: contas, error } = await supabase
    .from("accounts")
    .select("id, name, type, is_active, created_at")
    .eq("user_id", userId)
    .neq("type", "investment")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[captura] nao consegui ler as contas:", error.message);
    return null;
  }

  // `is_active` pode ser nulo em linha antiga, e nulo e ativa.
  const ativas = (contas || []).filter((c) => c.is_active !== false);
  if (!ativas.length) return null;

  if (banco) {
    const alvo = normalizar(banco);
    const porNome = ativas.find((c) => {
      const nome = normalizar(c.name);
      return nome.includes(alvo) || alvo.includes(nome);
    });
    if (porNome) return porNome;
  }

  return ativas[0];
}

// ============================================================
// A mesma notificacao chegando duas vezes.
//
// `onNotificationPosted` dispara na POSTAGEM e em cada ATUALIZACAO da
// notificacao. O banco atualiza a dele o tempo todo (some o "processando",
// entra o nome do estabelecimento), e cada atualizacao chega aqui como um
// evento novo.
//
// Num app de dinheiro, lancar o mesmo gasto duas vezes nao e bug menor:
// e o tipo de erro que faz desinstalar. A assinatura e o conteudo inteiro
// da notificacao — pacote, titulo, texto e valor. Duas notificacoes
// IDENTICAS em menos de 90 segundos sao a mesma; duas compras iguais de
// verdade, com um minuto e meio de intervalo, sao raras o bastante para
// valer o troco.
//
// Fica no modulo, nao no componente: o hook remonta a cada troca de tela
// e um estado interno perderia a memoria justamente entre as duas
// entregas.
export const JANELA_REPETICAO = 90 * 1000;
const vistas = new Map();

export function jaCapturada(assinatura, agora) {
  for (const [chave, quando] of vistas) {
    if (agora - quando > JANELA_REPETICAO) vistas.delete(chave);
  }
  if (vistas.has(assinatura)) return true;
  vistas.set(assinatura, agora);
  return false;
}

export function useNotificationListener() {
  const { user } = useAuth();
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [lastCapture, setLastCapture] = useState(null);
  const [isAvailable, setIsAvailable] = useState(false);

  /** Pergunta ao Android se a permissão está concedida. */
  const conferirPermissao = useCallback(async () => {
    try {
      const { granted } = await NotificationListener.isPermissionGranted();
      setPermissionGranted(!!granted);
      return !!granted;
    } catch {
      return false;
    }
  }, []);

  // O plugin só existe no APK. `registerPlugin` devolve um proxy que
  // aceita a chamada em qualquer lugar e estoura na hora de executar —
  // então não basta ele existir: é preciso PERGUNTAR e ver se responde.
  useEffect(() => {
    const checar = async () => {
      if (!Capacitor.isNativePlatform() ||
          !Capacitor.isPluginAvailable("NotificationListener")) {
        setIsAvailable(false);
        return;
      }
      try {
        const { granted } = await NotificationListener.isPermissionGranted();
        setIsAvailable(true);
        setPermissionGranted(!!granted);
      } catch (err) {
        console.warn("[captura] plugin nativo não respondeu:", err?.message);
        setIsAvailable(false);
      }
    };
    checar();
  }, []);

  // Pede permissão ao usuário
  const requestPermission = useCallback(async () => {
    try {
      await NotificationListener.requestPermission();
    } catch (err) {
      console.error("[captura] não consegui abrir as configurações:", err?.message);
    }
  }, []);

  // ── Quando o app volta, confere de novo ─────────────────
  //
  // `requestPermission` abre a tela de configurações do ANDROID e o app
  // vai para segundo plano. Antes havia um `setTimeout` de 3 segundos
  // para reconferir — que é chute: quem leva 10s para achar o PlanejeApp
  // na lista de "acesso a notificações" voltava com o app achando que a
  // permissão não foi dada.
  //
  // O sinal certo é o app voltar ao primeiro plano.
  useEffect(() => {
    if (!isAvailable) return;
    let ouvinte;
    AppNativo.addListener("appStateChange", ({ isActive }) => {
      if (isActive) conferirPermissao();
    }).then((l) => { ouvinte = l; }).catch(() => {});
    return () => ouvinte?.remove?.();
  }, [isAvailable, conferirPermissao]);

  // Processa notificação capturada e salva no Supabase
  const processNotification = useCallback(async (notification) => {
    if (!user?.id) return;

    // ── O que o plugin nativo REALMENTE manda ───────────────
    //
    // `BankNotificationService` envia `package`, `text`, e já vem com
    // `amount`, `type` e `description` extraídos em Java. Este hook lia
    // `packageName` e `body` — nomes que não existem no payload — e
    // reextraía tudo de um texto que nunca recebia.
    //
    // Os dois nomes são aceitos para o caso de o lado nativo mudar.
    const {
      package: pacoteNativo = "",
      packageName = "",
      title = "",
      text = "",
      body = "",
      amount: valorNativo,
      type: tipoNativo,
      description: descricaoNativa,
      bank: bancoNativo,
      timestamp,
    } = notification;

    const pacote = pacoteNativo || packageName;
    const texto = text || body;

    // Filtra apenas apps bancários. A lista de pacotes agora vive em
    // BANCOS_POR_PACOTE — antes eram duas listas que podiam divergir.
    const bancoConhecido = bancoDoPacote(pacote);
    if (!bancoConhecido) {
      // App desconhecido: só segue se a notificação falar em dinheiro.
      if (!texto.includes("R$") && !title.includes("R$")) return;
    }

    // O Java já fez a extração. O regex daqui vira RESERVA, para quando
    // o nativo não reconhecer o formato — e não o caminho principal,
    // como era antes.
    const extraido = extractAmount(`${title} ${texto}`);
    const valor = Number(valorNativo) > 0 ? Number(valorNativo) : extraido?.amount;
    if (!valor || valor <= 0) return;
    if (valor > 50000) return; // Valor suspeito

    const tipo = tipoNativo === "expense" || tipoNativo === "income"
      ? tipoNativo
      : (extraido?.type || "expense");

    const extracted = { amount: valor, type: tipo, bank: extraido?.bank || "Banco" };
    const description = descricaoNativa || extractDescription(title, texto);

    // ── A mesma notificação, de novo ────────────────────────
    const assinatura = `${pacote}|${title}|${texto}|${valor}`;
    if (jaCapturada(assinatura, Number(timestamp) || Date.now())) {
      console.warn("[captura] notificação repetida ignorada:", assinatura.slice(0, 60));
      return;
    }

    const today = new Date().toISOString().split("T")[0];

    // ── Em qual conta isso entra ────────────────────────────
    //
    // O banco EXIGE conta ou cartão (CHECK
    // `transactions_precisa_de_origem`). Este insert não mandava nem um
    // nem outro: toda captura era rejeitada, e como o código só olhava
    // o caminho de sucesso, falhava em silêncio — sem lançamento, sem
    // banner, sem aviso. O usuário nunca soube.
    const banco = bancoConhecido || bancoNativo || extracted.bank;
    const conta = await escolherConta(user.id, banco);

    if (!conta) {
      console.error("[captura] usuário sem conta ativa; lançamento descartado", {
        banco, valor: extracted.amount,
      });
      toast.error("Cadastre uma conta para o app registrar seus gastos sozinho.");
      return;
    }

    // Salva no Supabase
    const { error } = await supabase.from("transactions").insert([{
      user_id: user.id,
      account_id: conta.id,
      description,
      amount: extracted.amount,
      type: extracted.type,
      category: extracted.type === "income" ? "salário" : "outros",
      date: today,
      is_realized: true,
      notes: `Capturado automaticamente via ${banco}`,
    }]);

    if (error) {
      // Falhar calado num app de dinheiro é pior do que falhar. Quem não
      // sabe que a captura não aconteceu não lança à mão, e o mês fecha
      // errado.
      console.error("[captura] insert recusado pelo banco", {
        codigo: error.code,
        mensagem: error.message,
        detalhe: error.details,
        conta: conta.id,
        valor: extracted.amount,
        banco,
      });
      toast.error(
        `Não consegui registrar ${extracted.type === "income" ? "a entrada" : "o gasto"} `
        + `de R$ ${extracted.amount.toFixed(2).replace(".", ",")} do ${banco}. `
        + "Lance manualmente.",
      );
      return;
    }

    setLastCapture({ description, amount: extracted.amount, type: extracted.type });
    // Dispara evento para atualizar o Home
    window.dispatchEvent(new CustomEvent("transactionCaptured", {
      detail: { description, amount: extracted.amount, type: extracted.type }
    }));
  }, [user]);

  // Escuta notificações vindas do plugin nativo
  useEffect(() => {
    if (!isAvailable || !permissionGranted) return;

    let cleanup;
    const setup = async () => {
      try {
        // "bankTransaction" é o nome que `NotificationPlugin.java`
        // emite. O hook escutava "notificationReceived", que o lado
        // nativo nunca dispara — o ouvinte existia e jamais era
        // chamado. Era este o motivo de a captura não funcionar nem
        // depois de a permissão ser concedida.
        const listener = await NotificationListener.addListener(
          "bankTransaction",
          processNotification
        );
        cleanup = () => listener.remove();
      } catch (err) {
        console.error("Erro ao escutar notificações:", err);
      }
    };
    setup();
    return () => cleanup?.();
  }, [isAvailable, permissionGranted, processNotification]);

  return { permissionGranted, requestPermission, lastCapture, isAvailable };
}