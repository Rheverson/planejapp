import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.planeje.app',
  appName: 'PlanejeApp',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;