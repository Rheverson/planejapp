import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';

export async function initPushNotifications() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') return;

    await PushNotifications.register();

    PushNotifications.addListener('registration', async (token) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('push_tokens').upsert({
        user_id: user.id,
        token: token.value,
        platform: 'android',
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id, token' });
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('Push error:', err.error);
    });

    PushNotifications.addListener('pushNotificationReceived', () => {});
    PushNotifications.addListener('pushNotificationActionPerformed', () => {});

  } catch (err) {
    console.error('Push init error:', err.message);
  }
}