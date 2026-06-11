import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';

/**
 * Firebase backend for BetFree (project bettrmind-ba10a).
 *
 * All app data lives in Cloud Firestore so every installed device shares the
 * same accounts, trigger-app list and suggestion queue: whatever the admin
 * blocks reflects on every user's phone.
 */
const firebaseConfig = {
  apiKey: 'AIzaSyD7tybMNUeWDrNym1cPdg5Lty4TB1Ilz8w',
  authDomain: 'bettrmind-ba10a.firebaseapp.com',
  projectId: 'bettrmind-ba10a',
  storageBucket: 'bettrmind-ba10a.firebasestorage.app',
  messagingSenderId: '982350304314',
  appId: '1:982350304314:web:0a424a05b62197a27b5103',
  measurementId: 'G-7TJTZB2KDS',
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// React Native's networking can't keep Firestore's WebChannel streaming open
// reliably, so force long-polling (the documented RN workaround).
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});
