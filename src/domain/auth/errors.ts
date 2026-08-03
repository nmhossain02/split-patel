export type AuthFailureKind = 'cancelled' | 'offline' | 'configuration' | 'disabled' | 'provider';

export type AuthFailure = {
  kind: AuthFailureKind;
  message: string | null;
};

const errorCode = (error: unknown): string => {
  if (!error || typeof error !== 'object' || !('code' in error)) return '';
  return typeof error.code === 'string' ? error.code : '';
};

export const classifyAuthFailure = (error: unknown): AuthFailure => {
  const code = errorCode(error);
  if ([
    'auth/popup-closed-by-user',
    'auth/cancelled-popup-request',
    'auth/user-cancelled',
    'SIGN_IN_CANCELLED',
  ].includes(code)) return { kind: 'cancelled', message: null };
  if (['auth/network-request-failed', 'NETWORK_ERROR'].includes(code)) {
    return { kind: 'offline', message: 'You appear to be offline. Reconnect and try again.' };
  }
  if ([
    'auth/invalid-api-key',
    'auth/operation-not-allowed',
    'auth/unauthorized-domain',
    'DEVELOPER_ERROR',
  ].includes(code)) {
    return { kind: 'configuration', message: 'Google sign-in is not configured for this app build.' };
  }
  if (code === 'auth/user-disabled') {
    return { kind: 'disabled', message: 'This account is disabled. Contact support if this is unexpected.' };
  }
  return { kind: 'provider', message: 'Unable to sign in with Google. Try again.' };
};
