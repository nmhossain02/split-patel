const requiredVariables = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
  'EXPO_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY',
];

const missingVariables = requiredVariables.filter((name) => !process.env[name]?.trim());

if (process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === 'true') {
  throw new Error('Production exports cannot enable Firebase emulators.');
}

if (missingVariables.length > 0) {
  throw new Error(`Production export is missing required variables: ${missingVariables.join(', ')}`);
}

console.log('Production environment check passed.');
