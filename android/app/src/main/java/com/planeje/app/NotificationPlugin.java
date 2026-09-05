package com.planeje.app;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.provider.Settings;
import android.text.TextUtils;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;

@CapacitorPlugin(name = "NotificationListener")
public class NotificationPlugin extends Plugin {

    private static final String TAG_PLUGIN = "NotificationPlugin";

    private static NotificationPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    // Chamado pelo JavaScript para verificar se tem permissão
    @PluginMethod
    public void isPermissionGranted(PluginCall call) {
        boolean granted = isNotificationListenerEnabled();
        JSObject result = new JSObject();
        result.put("granted", granted);
        call.resolve(result);
    }

    /**
     * Abre a tela do Android onde se concede o acesso a notificacoes.
     *
     * ANTES: respondia `opened: true` SEMPRE, mesmo quando nao abria
     * nada — e havia dois caminhos em que nada abria:
     *
     *   1. a permissao ja estava concedida, entao o `if` era pulado e o
     *      JS continuava mostrando o banner de "ative aqui";
     *   2. a ROM nao tem a tela padrao (acontece em fabricante que
     *      customiza), `startActivity` lancava ActivityNotFoundException,
     *      e do lado do JS isso virava um console.error invisivel no
     *      celular.
     *
     * Nos dois casos o usuario tocava e nao acontecia nada, sem nenhuma
     * pista do porque. Agora a resposta diz o que houve, e ha um plano B.
     */
    @PluginMethod
    public void requestPermission(PluginCall call) {
        JSObject result = new JSObject();

        if (isNotificationListenerEnabled()) {
            result.put("opened", false);
            result.put("alreadyEnabled", true);
            call.resolve(result);
            return;
        }

        result.put("alreadyEnabled", false);

        if (abrir(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))) {
            result.put("opened", true);
            result.put("via", "listener_settings");
            call.resolve(result);
            return;
        }

        // Plano B: a tela de detalhes do proprio app. Nao leva direto ao
        // switch, mas coloca a pessoa a um toque dele — melhor do que o
        // nada de antes.
        Intent detalhes = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        detalhes.setData(Uri.parse("package:" + getContext().getPackageName()));
        if (abrir(detalhes)) {
            result.put("opened", true);
            result.put("via", "app_details");
            call.resolve(result);
            return;
        }

        result.put("opened", false);
        result.put("via", "nenhuma");
        call.resolve(result);
    }

    /** Tenta abrir e diz se conseguiu, em vez de deixar estourar. */
    private boolean abrir(Intent intent) {
        try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            return true;
        } catch (ActivityNotFoundException | SecurityException e) {
            Log.w(TAG_PLUGIN, "nao consegui abrir " + intent.getAction() + ": " + e.getMessage());
            return false;
        }
    }

    // Verifica se o listener está ativo nas configurações do Android
    private boolean isNotificationListenerEnabled() {
        String pkgName = getContext().getPackageName();
        String flat = Settings.Secure.getString(
            getContext().getContentResolver(),
            "enabled_notification_listeners"
        );
        if (!TextUtils.isEmpty(flat)) {
            String[] names = flat.split(":");
            for (String name : names) {
                if (name.contains(pkgName)) return true;
            }
        }
        return false;
    }

    // ============================================================
    // Entrega da transacao capturada
    //
    // O servico de notificacoes roda mesmo com o app fechado — e e
    // justamente esse o caso comum: a pessoa esta no app do banco
    // fazendo o Pix, nao no PlanejeApp.
    //
    // Antes, quando `instance` era nula (sem UI aberta), o evento
    // simplesmente sumia. A captura falhava exatamente quando mais
    // importava, e sem deixar rastro.
    //
    // Agora sao dois caminhos: entrega ao vivo quando ha ponte, e fila
    // em disco quando nao ha. O app recolhe a fila ao abrir.
    // ============================================================

    private static final String PREFS = "captura_pendente";
    private static final String CHAVE = "transacoes";

    /** Devolve false quando nao havia ponte para entregar. */
    public static boolean sendNotification(JSObject data) {
        if (instance == null) return false;
        // `true` = retem o evento ate alguem escutar. A UI pode estar de
        // pe sem o ouvinte do JS ainda registrado.
        instance.notifyListeners("bankTransaction", data, true);
        return true;
    }

    /** Guarda a transacao para o app recolher na proxima abertura. */
    public static void guardarPendente(Context ctx, JSObject data) {
        try {
            SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray fila = new JSONArray(prefs.getString(CHAVE, "[]"));
            // Teto para o caso de o app ficar semanas sem abrir: guardar
            // sem limite viraria uma fila infinita em disco.
            if (fila.length() >= 50) return;
            fila.put(data);
            prefs.edit().putString(CHAVE, fila.toString()).apply();
        } catch (JSONException e) {
            Log.w(TAG_PLUGIN, "nao consegui guardar a transacao: " + e.getMessage());
        }
    }

    /** O app chama ao abrir: devolve o que ficou guardado e limpa. */
    @PluginMethod
    public void drainPending(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String bruto = prefs.getString(CHAVE, "[]");
        // Limpa ANTES de responder: se o app cair no meio do
        // processamento, o pior e perder uma captura — melhor do que
        // relancar o mesmo gasto na proxima abertura, e de novo, e de
        // novo.
        prefs.edit().remove(CHAVE).apply();

        JSObject result = new JSObject();
        try {
            result.put("pendentes", new JSONArray(bruto));
        } catch (JSONException e) {
            result.put("pendentes", new JSONArray());
        }
        call.resolve(result);
    }
}
