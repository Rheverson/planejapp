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

    // Bancos suportados, casados por PREFIXO.
    //
    // Antes a comparacao era `pkg.equals(packageName)` — igualdade
    // exata — sobre uma lista com varios nomes errados:
    //
    //   "br.com.bradesco"          o app e "com.bradesco"
    //   "br.com.santander.benio"   o atual e "com.santander.app"
    //   "br.com.meiorapagamentos"  nao existe; o Mercado Pago e
    //                              "com.mercadopago.wallet"
    //   "br.gov.caixa.facil"       a CAIXA e "br.com.gabba.Caixa"
    //
    // Ou seja: varios bancos NUNCA seriam reconhecidos, e a notificacao
    // era descartada sem deixar rastro. Prefixo tambem cobre as
    // variantes que os bancos publicam ("com.itau.iti",
    // "com.nu.production.debug").
    private static final String[] BANK_PACKAGES = {
        "com.nu",                   // Nubank (com.nu.production)
        "com.itau",                 // Itau, iti
        "com.bradesco",             // Bradesco
        "br.com.bradesco",          // variante antiga
        "br.com.bb",                // Banco do Brasil
        "com.santander",            // Santander
        "br.com.santander",         // variante antiga
        "com.c6bank",               // C6
        "br.com.intermedium",       // Inter
        "com.picpay",               // PicPay
        "com.mercadopago",          // Mercado Pago
        "br.com.gabba.Caixa",       // CAIXA
        "com.caixa",                // Caixa Tem
        "br.gov.caixa",             // variantes da Caixa
        "br.com.original",          // Original
        "com.nubank",               // variante
        "br.com.willbank",          // Will
        "com.neon",                 // Neon
        "br.com.bancopan",          // Pan
        "com.xp.investimentos",     // XP
        "br.com.btgpactual",        // BTG
        "com.paypal.android",       // PayPal
        "br.com.sicredi",           // Sicredi
        "com.sicoob",               // Sicoob
        "br.com.banrisul",          // Banrisul
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
        Log.d(TAG, "notificacao de banco recebida: " + packageName);

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
        if (value <= 0) {
            // Descarte silencioso era a regra aqui. Sem log, uma
            // notificacao com formato novo sumia sem deixar pista.
            Log.w(TAG, "sem valor reconhecido em [" + packageName + "] " + fullText);
            return;
        }

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

        // Envia para o plugin Capacitor.
        //
        // Se o app nao estiver aberto, `instance` e nula e o evento se
        // perdia PARA SEMPRE — justamente no caso mais comum: a pessoa
        // esta no app do banco fazendo o Pix, nao no PlanejeApp. A
        // captura ia embora exatamente quando mais importava.
        //
        // Agora, quando nao ha ponte, a transacao fica guardada e o app
        // recolhe na proxima vez que abrir.
        if (!NotificationPlugin.sendNotification(data)) {
            Log.d(TAG, "app fechado — guardando para a proxima abertura");
            NotificationPlugin.guardarPendente(this, data);
        }
    }

    private boolean isBankNotification(String packageName) {
        if (packageName == null) return false;
        for (String pkg : BANK_PACKAGES) {
            if (packageName.startsWith(pkg)) return true;
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
