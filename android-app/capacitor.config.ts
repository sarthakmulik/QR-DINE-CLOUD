import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.qrdinecloud.android',
  appName: 'QR Dine Cloud',
  webDir: 'www',
  server: {
    url: 'https://qr-dine-cloud.vercel.app',
    cleartext: true
  }
};

export default config;
