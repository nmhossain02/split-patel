import {
  initializeAppCheck,
  ReactNativeFirebaseAppCheckProvider,
} from '@react-native-firebase/app-check';

let initialization: Promise<unknown> | null = null;

export const ensureAppCheck = (): Promise<unknown> => {
  if (!initialization) {
    const provider = new ReactNativeFirebaseAppCheckProvider();
    provider.configure({
      android: { provider: __DEV__ ? 'debug' : 'playIntegrity' },
      apple: { provider: __DEV__ ? 'debug' : 'appAttestWithDeviceCheckFallback' },
      isTokenAutoRefreshEnabled: true,
    });
    initialization = initializeAppCheck(undefined, {
      provider,
      isTokenAutoRefreshEnabled: true,
    });
  }
  return initialization;
};
