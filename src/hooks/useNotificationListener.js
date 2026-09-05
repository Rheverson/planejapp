import { useEffect, useState, useCallback } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { App as AppNativo } from "@capacitor/app";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import { montarLancamentoCapturado } from "@/domain/captura";

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

/**
 * "2026-09-05" no fuso do aparelho.
 *
 * `toISOString()` é UTC: um Pix às 22h de sexta em Brasília já é sábado
 * lá, e o lançamento cairia no dia seguinte — bem no fim do mês, cairia
 * no mês seguinte. É o mesmo erro que já corrigimos no Finn.
 */
export function paraDataLocal(quando) {
  const d = quando instanceof Date ? quando : new Date(quando);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

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
      // O Java agora responde o que REALMENTE aconteceu. Antes ele dizia
      // `opened: true` sempre — inclusive quando não abria nada — e o
      // usuário tocava e ficava sem pista nenhuma.
      const r = await NotificationListener.requestPermission();

      if (r?.alreadyEnabled) {
        // Já estava ligado e o app é que estava desatualizado.
        setPermissionGranted(true);
        toast.success("A captura automática já está ativa.");
        return;
      }
      if (r?.opened === false) {
        toast.error(
          "Não consegui abrir as configurações do Android. "
          + "Vá em Ajustes › Notificações › Acesso a notificações e ligue o PlanejeApp.",
        );
        return;
      }
      if (r?.via === "app_details") {
        // Plano B: caiu na tela de detalhes do app, não na lista certa.
        toast.info("Toque em “Notificações” e ative o acesso do PlanejeApp.");
      }
    } catch (err) {
      console.error("[captura] falha ao pedir permissão:", err?.message);
      toast.error("Não consegui abrir as configurações. Tente pelos Ajustes do Android.");
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

  // ============================================================
  // Da notificação ao lançamento.
  //
  // Este hook NÃO decide mais o que a operação significa. Ele reúne o
  // contexto (contas, cartões, nome do titular), entrega a
  // `montarLancamentoCapturado` — que fala a língua de `financas.js` —
  // e grava o que voltar. Quando o domínio diz "não sei", nada é
  // criado: um gasto inventado é pior do que um gasto que faltou.
  // ============================================================
  const processNotification = useCallback(async (notification) => {
    if (!user?.id) return;

    const {
      package: pacoteNativo = "", packageName = "",
      title = "", text = "", body = "",
      amount: valorNativo,
      description: descricaoNativa,
      bank: bancoNativo,
      key: chaveNativa,
      timestamp,
    } = notification;

    const pacote = pacoteNativo || packageName;
    const texto = [title, text || body, descricaoNativa].filter(Boolean).join(" ");

    const bancoConhecido = bancoDoPacote(pacote);
    if (!bancoConhecido && !texto.includes("R$")) return;

    const extraido = extractAmount(texto);
    const valor = Number(valorNativo) > 0 ? Number(valorNativo) : extraido?.amount;
    if (!valor || valor <= 0) {
      console.warn("[captura] sem valor reconhecido:", texto.slice(0, 80));
      return;
    }
    if (valor > 50000) {
      console.warn("[captura] valor acima do teto, ignorado:", valor);
      return;
    }

    const banco = bancoConhecido || bancoNativo || "Banco";

    // ── A data é a da NOTIFICAÇÃO, não a de agora ─────────
    //
    // Uma captura que ficou na fila é recolhida quando o app abre — que
    // pode ser dois dias depois. Usar `new Date()` jogaria o Pix de
    // sexta para o domingo, e o fechamento do mês sairia errado quando
    // a virada pega no meio.
    const quando = Number(timestamp) > 0 ? new Date(Number(timestamp)) : new Date();
    const data = paraDataLocal(quando);

    // ── A chave que sobrevive à atualização do texto ──────
    //
    // `sbn.getKey()` é o mesmo para todas as ATUALIZAÇÕES da mesma
    // notificação. O dia entra junto porque o Android reaproveita id
    // depois que a notificação é dispensada.
    const chave = `${chaveNativa || `${pacote}|${valor}`}|${data}`;

    // Trava em memória: evita ida ao banco no caso mais comum, que é a
    // atualização chegar segundos depois. A trava DEFINITIVA é o índice
    // único `transactions_captura_unica`, que sobrevive a reinício.
    if (jaCapturada(chave, Number(timestamp) || Date.now())) {
      console.warn("[captura] repetida, ignorada:", chave.slice(0, 60));
      return;
    }

    // ── Contexto para o domínio decidir ───────────────────
    const [{ data: contas }, { data: cartoes }, { data: perfil }] = await Promise.all([
      supabase.from("accounts").select("id, name, type, is_active").eq("user_id", user.id),
      supabase.from("credit_cards").select("id, name, closing_day, expense_date_mode, is_active")
        .eq("user_id", user.id),
      supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    ]);

    const resultado = montarLancamentoCapturado({
      banco, texto, valor, data, chave,
      contas: contas || [],
      cartoes: cartoes || [],
      nomeUsuario: perfil?.full_name,
    });

    if (resultado.revisao) {
      // NÃO cria nada. O motor antigo virava despesa aqui.
      const { motivo, detalhe } = resultado.revisao;
      console.warn("[captura] mandado para revisão:", { motivo, detalhe, banco, valor, texto });
      toast.info(
        `Vi ${valor.toFixed(2).replace(".", ",")} no ${banco}, mas não tenho certeza de como lançar. `
        + "Registre manualmente.",
      );
      return;
    }

    const { lancamento, operacao } = resultado;

    const { error } = await supabase.from("transactions").insert([{
      user_id: user.id,
      ...lancamento,
    }]);

    if (error) {
      // 23505 = o índice único barrou: a mesma notificação já virou
      // lançamento numa sessão anterior. Esperado, não é falha.
      if (error.code === "23505") {
        console.log("[captura] já registrada antes, ignorada:", chave.slice(0, 60));
        return;
      }
      console.error("[captura] insert recusado pelo banco", {
        codigo: error.code, mensagem: error.message, detalhe: error.details,
        operacao, valor, banco,
      });
      toast.error(
        `Não consegui registrar ${valor.toFixed(2).replace(".", ",")} do ${banco}. `
        + "Lance manualmente.",
      );
      return;
    }

    setLastCapture({ description: lancamento.description, amount: valor, type: lancamento.type });
    window.dispatchEvent(new CustomEvent("transactionCaptured", {
      detail: { description: lancamento.description, amount: valor, type: lancamento.type },
    }));
  }, [user]);

  // ── Recolhe o que foi capturado com o app fechado ───────
  //
  // O serviço nativo roda mesmo sem o app aberto — que é o caso comum:
  // a pessoa está no app do banco fazendo o Pix. Quando não há ponte
  // para o JavaScript, a transação fica guardada em disco pelo Android.
  // Aqui ela é recolhida e processada como se tivesse chegado ao vivo.
  //
  // Roda ao abrir E ao voltar do segundo plano, porque a captura pode
  // ter acontecido enquanto o app estava minimizado.
  const recolherPendentes = useCallback(async () => {
    if (!isAvailable || !user?.id) return;
    try {
      const { pendentes } = await NotificationListener.drainPending();
      if (!Array.isArray(pendentes) || !pendentes.length) return;
      console.log(`[captura] ${pendentes.length} transação(ões) capturada(s) com o app fechado`);
      for (const p of pendentes) {
        await processNotification(p);
      }
    } catch (err) {
      console.warn("[captura] não consegui recolher a fila:", err?.message);
    }
  }, [isAvailable, user?.id, processNotification]);

  useEffect(() => { recolherPendentes(); }, [recolherPendentes]);

  useEffect(() => {
    if (!isAvailable) return;
    let ouvinte;
    AppNativo.addListener("appStateChange", ({ isActive }) => {
      if (isActive) recolherPendentes();
    }).then((l) => { ouvinte = l; }).catch(() => {});
    return () => ouvinte?.remove?.();
  }, [isAvailable, recolherPendentes]);

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