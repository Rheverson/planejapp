import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";

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

export function useNotificationListener() {
  const { user } = useAuth();
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [lastCapture, setLastCapture] = useState(null);
  const [isAvailable, setIsAvailable] = useState(false);

  // Verifica se o plugin Capacitor está disponível (só no APK)
  useEffect(() => {
    const checkAvailability = async () => {
      try {
        const { Plugins } = await import("@capacitor/core");
        if (Plugins?.NotificationListener) {
          setIsAvailable(true);
          const { granted } = await Plugins.NotificationListener.isPermissionGranted();
          setPermissionGranted(granted);
        }
      } catch {
        // Rodando no browser — plugin não disponível
        setIsAvailable(false);
      }
    };
    checkAvailability();
  }, []);

  // Pede permissão ao usuário
  const requestPermission = useCallback(async () => {
    try {
      const { Plugins } = await import("@capacitor/core");
      await Plugins.NotificationListener.requestPermission();
      // Android abre a tela de configurações — verifica depois
      setTimeout(async () => {
        const { granted } = await Plugins.NotificationListener.isPermissionGranted();
        setPermissionGranted(granted);
      }, 3000);
    } catch (err) {
      console.error("Erro ao pedir permissão:", err);
    }
  }, []);

  // Processa notificação capturada e salva no Supabase
  const processNotification = useCallback(async (notification) => {
    if (!user?.id) return;

    const { title = "", body = "", packageName = "" } = notification;

    // Filtra apenas apps bancários
    const bankApps = [
      "com.nu.production",       // Nubank
      "br.com.intermedium",      // Inter
      "com.itau",                // Itaú
      "com.bradesco",            // Bradesco
      "br.com.bb.android",       // Banco do Brasil
      "br.com.santander.way",    // Santander
      "com.picpay",              // PicPay
      "br.com.recarga",          // RecargaPay
    ];

    if (!bankApps.some(app => packageName.includes(app.split(".")[1] || app))) {
      // Tenta extrair mesmo sem app conhecido se tiver "R$"
      if (!body.includes("R$") && !title.includes("R$")) return;
    }

    const extracted = extractAmount(`${title} ${body}`);
    if (!extracted || !extracted.amount || extracted.amount <= 0) return;
    if (extracted.amount > 50000) return; // Valor suspeito

    const description = extractDescription(title, body);
    const today = new Date().toISOString().split("T")[0];

    // Salva no Supabase
    const { error } = await supabase.from("transactions").insert([{
      user_id: user.id,
      description,
      amount: extracted.amount,
      type: extracted.type,
      category: extracted.type === "income" ? "salário" : "outros",
      date: today,
      is_realized: true,
      notes: `Capturado automaticamente via ${extracted.bank}`,
    }]);

    if (!error) {
      setLastCapture({ description, amount: extracted.amount, type: extracted.type });
      // Dispara evento para atualizar o Home
      window.dispatchEvent(new CustomEvent("transactionCaptured", {
        detail: { description, amount: extracted.amount, type: extracted.type }
      }));
    }
  }, [user]);

  // Escuta notificações vindas do plugin nativo
  useEffect(() => {
    if (!isAvailable || !permissionGranted) return;

    let cleanup;
    const setup = async () => {
      try {
        const { Plugins } = await import("@capacitor/core");
        const listener = await Plugins.NotificationListener.addListener(
          "notificationReceived",
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