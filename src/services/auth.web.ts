import { FirebaseError } from 'firebase/app';
import { createUserWithEmailAndPassword, GoogleAuthProvider, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, updateProfile } from 'firebase/auth';
import { auth } from './firebase.web';
import { AuthUser } from '@/domain/auth/types';

const provider = new GoogleAuthProvider();

export const onGoogleButtonPress = async (): Promise<AuthUser | null> => {
  let result;
  try {
    result = await signInWithPopup(auth, provider);
  } catch (error) {
    if (error instanceof FirebaseError && [
      'auth/popup-closed-by-user',
      'auth/cancelled-popup-request',
      'auth/user-cancelled',
    ].includes(error.code)) return null;
    throw error;
  }
  const { user } = result;

  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoURL,
  };
};

export const signOut = async (): Promise<void> => {
  await auth.signOut();
};

export const subscribeToAuthState = (
  listener: (user: AuthUser | null) => void,
): (() => void) => onAuthStateChanged(auth, user => listener(user ? {
  uid: user.uid,
  displayName: user.displayName,
  email: user.email,
  photoURL: user.photoURL,
} : null));

export const devSignIn = async (email: string, password: string, displayName: string): Promise<void> => {
  if (!__DEV__ || process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS !== 'true') {
    throw new Error('Emulator sign-in is disabled.');
  }
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    if (!(error instanceof FirebaseError)
      || !['auth/invalid-credential', 'auth/user-not-found'].includes(error.code)) throw error;
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(result.user, { displayName });
    await result.user.getIdToken(true);
  }
};
