package com.planeje.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import android.text.TextUtils;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

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

    // Chamado pelo BankNotificationService quando detecta transação bancária
    // Envia o evento para o JavaScript via Capacitor
    public static void sendNotification(JSObject data) {
        if (instance != null) {
            instance.notifyListeners("bankTransaction", data);
        }
    }
}
