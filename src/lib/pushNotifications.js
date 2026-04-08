import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';

export async function initPushNotifications() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    // Checar permissão atual antes de pedir
    let permStatus = await PushNotifications.checkPermissions();

    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') {
      console.warn('Push permission denied');
      return;
    }

    await PushNotifications.removeAllListeners();
    await PushNotifications.register();

    PushNotifications.addListener('registration', async (token) => {
      console.log('Push token:', token.value);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Deletar tokens antigos deste usuário e inserir o novo
      await supabase
        .from('push_tokens')
        .delete()
        .eq('user_id', user.id)
        .neq('token', token.value);

      await supabase.from('push_tokens').upsert({
        user_id: user.id,
        token: token.value,
        platform: Capacitor.getPlatform(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,token' });
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('Push registration error:', JSON.stringify(err));
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push recebido:', JSON.stringify(notification));
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('Push clicado:', JSON.stringify(action));
    });

  } catch (err) {
    console.error('Push init error:', err?.message || err);
  }
}