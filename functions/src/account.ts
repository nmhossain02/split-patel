import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

const callableOptions = {
  region: 'us-west1',
  timeoutSeconds: 15,
  memory: '256MiB' as const,
  maxInstances: 20,
  concurrency: 40,
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true',
};

const optionalString = (value: unknown, maximum: number): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? [...trimmed].slice(0, maximum).join('') : null;
};

export const provisionAccount = onCall(callableOptions, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.');
  const { uid, token } = request.auth;
  const email = optionalString(token.email, 320);
  const displayName = optionalString(token.name, 100) ?? 'SplitPatel user';
  const photoURL = optionalString(token.picture, 2_048);
  const firestore = getFirestore();
  const userReference = firestore.doc(`users/${uid}`);
  const profileReference = firestore.doc(`profiles/${uid}`);

  await firestore.runTransaction(async transaction => {
    const [user, profile] = await transaction.getAll(userReference, profileReference);
    if (user.data()?.accountStatus === 'disabled' || profile.data()?.status === 'disabled') {
      throw new HttpsError('permission-denied', 'This account has been disabled.');
    }
    transaction.set(userReference, {
      email,
      emailNormalized: email?.toLocaleLowerCase('en-US') ?? null,
      accountStatus: user.data()?.accountStatus ?? 'active',
      preferences: user.data()?.preferences ?? { locale: 'en-US', defaultCurrency: null },
      createdAt: user.exists ? user.data()?.createdAt : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      schemaVersion: 1,
    });
    transaction.set(profileReference, {
      displayName,
      photoURL,
      status: profile.data()?.status ?? 'active',
      updatedAt: FieldValue.serverTimestamp(),
      schemaVersion: 1,
    });
  });

  return { uid, displayName, photoURL };
});
