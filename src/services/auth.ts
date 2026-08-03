import { GoogleSignin } from '@react-native-google-signin/google-signin';
import auth from '@react-native-firebase/auth';
import { AuthUser } from '@/domain/auth/types';

const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
if (!googleWebClientId) {
  throw new Error('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is required for native Google sign-in.');
}

GoogleSignin.configure({
  webClientId: googleWebClientId,
});

export const onGoogleButtonPress = async (): Promise<AuthUser | null> => {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();

  if (response.type !== 'success') {
    return null;
  }

  const { idToken } = response.data;
  if (!idToken) {
    throw new Error('Google Sign-In did not return an ID token.');
  }

  const googleCredential = auth.GoogleAuthProvider.credential(idToken);
  const userCredential = await auth().signInWithCredential(googleCredential);
  const { user } = userCredential;

  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoURL,
  };
};

export const signOut = async (): Promise<void> => {
  await auth().signOut();
  try {
    await GoogleSignin.signOut();
  } catch {
    // Firebase is the application session authority. Google cleanup is best effort.
  }
};

export const subscribeToAuthState = (
  listener: (user: AuthUser | null) => void,
): (() => void) => auth().onAuthStateChanged(user => listener(user ? {
  uid: user.uid,
  displayName: user.displayName,
  email: user.email,
  photoURL: user.photoURL,
} : null));

export const devSignIn = async (_email: string, _password: string, _displayName: string): Promise<void> => {
  throw new Error('Emulator sign-in is available on web only.');
};
