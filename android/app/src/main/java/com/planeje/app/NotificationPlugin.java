package com.planeje.app;

import android.content.Intent;
import android.provider.Settings;
import android.text.TextUtils;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NotificationListener")
public class NotificationPlugin extends Plugin {

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

    // Chamado pelo JavaScript para abrir configurações de permissão
    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (!isNotificationListenerEnabled()) {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        JSObject result = new JSObject();
        result.put("opened", true);
        call.resolve(result);
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
