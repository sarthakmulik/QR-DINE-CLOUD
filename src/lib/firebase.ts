import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import serviceAccount from '../../firebase-adminsdk.json';

if (!getApps().length) {
  try {
    initializeApp({
      credential: cert(serviceAccount as any)
    });
  } catch (error) {
    console.error('Firebase admin initialization error', error);
  }
}

export const messaging = getMessaging();
