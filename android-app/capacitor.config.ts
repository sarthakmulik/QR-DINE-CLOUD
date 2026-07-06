import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.qrdinecloud.android',
  appName: 'QR Dine Cloud',
  webDir: 'www',
  server: {
    url: 'https://qr-dine-cloud.vercel.app',
    cleartext: true
  },
  android: {
    webContentsDebuggingEnabled: false,
    appendUserAgent: "QRDineApp"
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
