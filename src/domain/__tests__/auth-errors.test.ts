import { classifyAuthFailure } from '../auth/errors';

describe('authentication error classification', () => {
  test.each([
    ['auth/popup-closed-by-user', 'cancelled', null],
    ['auth/network-request-failed', 'offline', 'You appear to be offline. Reconnect and try again.'],
    ['auth/unauthorized-domain', 'configuration', 'Google sign-in is not configured for this app build.'],
    ['auth/user-disabled', 'disabled', 'This account is disabled. Contact support if this is unexpected.'],
    ['auth/unknown', 'provider', 'Unable to sign in with Google. Try again.'],
  ])('classifies %s without exposing SDK details', (code, kind, message) => {
    expect(classifyAuthFailure({ code, token: 'must-not-appear' })).toEqual({ kind, message });
  });
});
