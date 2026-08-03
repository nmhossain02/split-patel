import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Button, Text } from 'react-native';
import { AuthProvider, useAuth } from '../useAuth';
import { subscribeToAuthState } from '@/services/auth';
import { provisionAccount } from '@/services/commands';
import { AuthUser } from '@/domain/auth/types';

jest.mock('@/services/auth', () => ({ subscribeToAuthState: jest.fn() }));
jest.mock('@/services/commands', () => ({ provisionAccount: jest.fn() }));

let authListener: (user: AuthUser | null) => void;

const Probe = () => {
  const auth = useAuth();
  return (
    <>
      <Text testID="state">{auth.loading ? 'loading' : auth.user?.uid ?? auth.errorMessage ?? 'signed-out'}</Text>
      <Button title="Retry provisioning" onPress={auth.retryProvisioning} />
    </>
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(subscribeToAuthState).mockImplementation(listener => {
    authListener = listener;
    return jest.fn();
  });
});

it('does not expose an authenticated user until provisioning succeeds', async () => {
  jest.mocked(provisionAccount).mockResolvedValue({ uid: 'alex' });
  const view = render(<AuthProvider><Probe /></AuthProvider>);
  expect(view.getByTestId('state')).toHaveTextContent('loading');

  await act(async () => authListener({ uid: 'alex', displayName: 'Alex', email: 'alex@example.test', photoURL: null }));
  await waitFor(() => expect(view.getByTestId('state')).toHaveTextContent('alex'));
  expect(provisionAccount).toHaveBeenCalledTimes(1);
});

it('preserves the authenticated candidate and retries failed provisioning', async () => {
  jest.mocked(provisionAccount)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ uid: 'alex' });
  const view = render(<AuthProvider><Probe /></AuthProvider>);

  await act(async () => authListener({ uid: 'alex', displayName: 'Alex', email: 'alex@example.test', photoURL: null }));
  await waitFor(() => expect(view.getByTestId('state')).toHaveTextContent(
    'Your account could not be prepared. Check your connection and retry account setup.',
  ));
  fireEvent.press(view.getByText('Retry provisioning'));
  await waitFor(() => expect(view.getByTestId('state')).toHaveTextContent('alex'));
  expect(provisionAccount).toHaveBeenCalledTimes(2);
});

it('invalidates an in-flight candidate when Firebase signs out', async () => {
  let completeProvisioning: ((value: { uid: string }) => void) | undefined;
  jest.mocked(provisionAccount).mockImplementation(() => new Promise(resolve => {
    completeProvisioning = resolve;
  }));
  const view = render(<AuthProvider><Probe /></AuthProvider>);
  act(() => authListener({ uid: 'alex', displayName: 'Alex', email: 'alex@example.test', photoURL: null }));
  act(() => authListener(null));
  act(() => completeProvisioning?.({ uid: 'alex' }));
  await waitFor(() => expect(view.getByTestId('state')).toHaveTextContent('signed-out'));
});
