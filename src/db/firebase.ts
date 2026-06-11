import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';

/**
 * Firebase backend for BetFree (project bettrmind-ba10a).
 *
 * All app data lives in Cloud Firestore so every installed device shares the
 * same accounts, trigger-app list and suggestion queue: whatever the admin
 * blocks reflects on every user's phone.
 */
// Loaded from .env locally and from EAS environment variables on EAS Build.
// EXPO_PUBLIC_ vars are inlined into the JS bundle at build time, so a
// missing one means the bundle was built without its .env — fail loudly.
const firebaseConfig = {
  apiKey: requireEnv('EXPO_PUBLIC_FIREBASE_API_KEY', process.env.EXPO_PUBLIC_FIREBASE_API_KEY),
  authDomain: requireEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN', process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN),
  projectId: requireEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID', process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID),
  storageBucket: requireEnv('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET', process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: requireEnv('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
  appId: requireEnv('EXPO_PUBLIC_FIREBASE_APP_ID', process.env.EXPO_PUBLIC_FIREBASE_APP_ID),
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID ?? '',
};

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name} — copy .env.example to .env (local) or set it as an EAS environment variable (builds).`
    );
  }
  return value;
}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// React Native's networking can't keep Firestore's WebChannel streaming open
// reliably, so force long-polling (the documented RN workaround).
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});
