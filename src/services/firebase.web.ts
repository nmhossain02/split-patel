import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

const useEmulators = __DEV__ && process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === 'true';

const requiredConfig = (name: string, value: string | undefined, emulatorValue: string): string => {
  if (value) return value;
  if (useEmulators) return emulatorValue;
  throw new Error(`${name} is required outside the local Firebase emulator flow.`);
};

const firebaseConfig = {
  apiKey: requiredConfig('EXPO_PUBLIC_FIREBASE_API_KEY', process.env.EXPO_PUBLIC_FIREBASE_API_KEY, 'demo-api-key'),
  authDomain: requiredConfig('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN', process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN, 'localhost'),
  projectId: requiredConfig('EXPO_PUBLIC_FIREBASE_PROJECT_ID', process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID, 'split-patel'),
  storageBucket: requiredConfig('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET', process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET, 'split-patel.invalid'),
  messagingSenderId: requiredConfig('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, '000000000000'),
  appId: requiredConfig('EXPO_PUBLIC_FIREBASE_APP_ID', process.env.EXPO_PUBLIC_FIREBASE_APP_ID, '1:000000000000:web:emulator'),
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8085);
}
