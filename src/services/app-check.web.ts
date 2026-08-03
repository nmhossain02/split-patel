import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { app } from './firebase.web';

let initialization: Promise<unknown> | null = null;

export const ensureAppCheck = (): Promise<unknown> => {
  if (!initialization) {
    initialization = Promise.resolve().then(() => {
      if (__DEV__) return null;
      const siteKey = process.env.EXPO_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY;
      if (!siteKey) throw new Error('EXPO_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY is required for production web builds.');
      return initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(siteKey),
        isTokenAutoRefreshEnabled: true,
      });
    });
  }
  return initialization;
};
