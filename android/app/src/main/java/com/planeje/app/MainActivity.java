package com.planeje.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import java.util.ArrayList;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registra o plugin de notificações bancárias
        registerPlugin(NotificationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
