import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';

export async function initPushNotifications() {
  console.log('🔔 initPushNotifications chamado');
  console.log('📱 isNativePlatform:', Capacitor.isNativePlatform());
  console.log('🖥️ Platform:', Capacitor.getPlatform());

  if (!Capacitor.isNativePlatform()) {
    console.log('❌ Não é nativo, saindo...');
    return;
  }

  try {
    console.log('📋 Solicitando permissão...');
    const permission = await PushNotifications.requestPermissions();
    console.log('✅ Permissão resultado:', JSON.stringify(permission));

    if (permission.receive !== 'granted') {
      console.log('❌ Permissão negada');
      return;
    }

    console.log('📝 Registrando no FCM...');
    await PushNotifications.register();

    PushNotifications.addListener('registration', async (token) => {
      console.log('🎯 Token FCM recebido:', token.value);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('❌ Usuário não encontrado');
        return;
      }

      const { error } = await supabase.from('push_tokens').upsert({
        user_id: user.id,
        token: token.value,
        platform: 'android',
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id, token' });

      if (error) console.error('❌ Erro ao salvar token:', error);
      else console.log('✅ Token salvo no Supabase!');
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('❌ Erro no registro FCM:', JSON.stringify(err));
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('📬 Notificação recebida:', JSON.stringify(notification));
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('👆 Notificação clicada:', JSON.stringify(action));
    });

  } catch (err) {
    console.error('💥 Erro inesperado:', err);
  }
}