package com.planeje.app;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class BankNotificationService extends NotificationListenerService {

    private static final String TAG = "BankNotifService";

    // Bancos suportados (package names)
    private static final String[] BANK_PACKAGES = {
        "com.nu.production",              // Nubank
        "com.itau",                       // Itaú
        "br.com.bradesco",               // Bradesco
        "br.com.bb.android",             // Banco do Brasil
        "br.com.santander.benio",        // Santander
        "com.c6bank.app",                // C6 Bank
        "br.com.intermedium",            // Inter
        "com.picpay",                    // PicPay
        "br.com.meiorapagamentos",       // Mercado Pago
        "br.com.originalbank",           // Original
        "com.caixa.tem",                 // Caixa Tem
        "br.gov.caixa.facil",            // Caixa
    };

    // Padrões para extrair valor (R$ 50,00 / R$50.00 / 50,00)
    private static final Pattern VALUE_PATTERN = Pattern.compile(
        "R\\$\\s*([\\d]+(?:[.,][\\d]{3})*(?:[.,][\\d]{2}))",
        Pattern.CASE_INSENSITIVE
    );

    // Padrões para identificar tipo
    private static final String[] EXPENSE_KEYWORDS = {
        "compra", "pagamento", "pago", "debitado", "débito",
        "transferência enviada", "pix enviado", "saque", "cobrança"
    };
    private static final String[] INCOME_KEYWORDS = {
        "recebeu", "recebido", "creditado", "crédito", "depósito",
        "transferência recebida", "pix recebido", "estorno"
    };

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        String packageName = sbn.getPackageName();

        if (!isBankNotification(packageName)) return;

        Notification notification = sbn.getNotification();
        Bundle extras = notification.extras;

        String title = extras.getCharSequence(Notification.EXTRA_TITLE) != null
            ? extras.getCharSequence(Notification.EXTRA_TITLE).toString() : "";
        String text = extras.getCharSequence(Notification.EXTRA_TEXT) != null
            ? extras.getCharSequence(Notification.EXTRA_TEXT).toString() : "";
        String bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT) != null
            ? extras.getCharSequence(Notification.EXTRA_BIG_TEXT).toString() : "";

        String fullText = (title + " " + text + " " + bigText).toLowerCase();

        Log.d(TAG, "Notificação bancária: [" + packageName + "] " + title + " | " + text);

        // Extrai valor
        double value = extractValue(fullText);
        if (value <= 0) return;

        // Identifica tipo
        String type = detectType(fullText);

        // Extrai descrição
        String description = extractDescription(title, text);

        // Monta objeto para enviar ao JavaScript
        JSObject data = new JSObject();
        data.put("bank", getBankName(packageName));
        data.put("package", packageName);
        data.put("title", title);
        data.put("text", text);
        data.put("amount", value);
        data.put("type", type);           // "expense" | "income" | "unknown"
        data.put("description", description);
        data.put("timestamp", System.currentTimeMillis());

        // Envia para o plugin Capacitor
        NotificationPlugin.sendNotification(data);
    }

    private boolean isBankNotification(String packageName) {
        for (String pkg : BANK_PACKAGES) {
            if (pkg.equals(packageName)) return true;
        }
        return false;
    }

    private double extractValue(String text) {
        Matcher matcher = VALUE_PATTERN.matcher(text);
        if (matcher.find()) {
            String raw = matcher.group(1)
                .replace(".", "")
                .replace(",", ".");
            try {
                return Double.parseDouble(raw);
            } catch (NumberFormatException e) {
                return 0;
            }
        }
        return 0;
    }

    private String detectType(String text) {
        for (String kw : EXPENSE_KEYWORDS) {
            if (text.contains(kw)) return "expense";
        }
        for (String kw : INCOME_KEYWORDS) {
            if (text.contains(kw)) return "income";
        }
        return "unknown";
    }

    private String extractDescription(String title, String text) {
        // Tenta pegar o estabelecimento/pessoa da notificação
        if (title != null && !title.isEmpty()) return title;
        if (text != null && text.length() > 3) return text.substring(0, Math.min(60, text.length()));
        return "Transação bancária";
    }

    private String getBankName(String packageName) {
        switch (packageName) {
            case "com.nu.production":         return "Nubank";
            case "com.itau":                  return "Itaú";
            case "br.com.bradesco":           return "Bradesco";
            case "br.com.bb.android":         return "Banco do Brasil";
            case "br.com.santander.benio":    return "Santander";
            case "com.c6bank.app":            return "C6 Bank";
            case "br.com.intermedium":        return "Inter";
            case "com.picpay":                return "PicPay";
            case "br.com.meiorapagamentos":   return "Mercado Pago";
            default:                          return packageName;
        }
    }
}
