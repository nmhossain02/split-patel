import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import LoginScreen from '../LoginScreen';
import { onGoogleButtonPress } from '../../services/auth';

// Mock the auth service
jest.mock('../../services/auth', () => ({
  onGoogleButtonPress: jest.fn(),
  devSignIn: jest.fn(),
}));

// Mock the @react-native-firebase/auth module
jest.mock('@react-native-firebase/auth', () => () => ({
  signOut: jest.fn(),
}));

describe('LoginScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders the login button and calls the login function on press', async () => {
    jest.mocked(onGoogleButtonPress).mockResolvedValue(null);
    const { getByText } = render(<LoginScreen />);

    const loginButton = getByText('Sign in with Google');
    expect(loginButton).toBeTruthy();

    fireEvent.press(loginButton);

    await waitFor(() => expect(onGoogleButtonPress).toHaveBeenCalledTimes(1));
  });

  it('prevents duplicate provider flows while sign-in is pending', async () => {
    let finish: (() => void) | undefined;
    jest.mocked(onGoogleButtonPress).mockImplementation(() => new Promise(resolve => {
      finish = () => resolve(null);
    }));
    const { getByText } = render(<LoginScreen />);
    fireEvent.press(getByText('Sign in with Google'));
    fireEvent.press(getByText('Signing in...'));
    expect(onGoogleButtonPress).toHaveBeenCalledTimes(1);
    finish?.();
    await waitFor(() => expect(getByText('Sign in with Google')).toBeTruthy());
  });

  it('shows a stable offline message and permits retry', async () => {
    jest.mocked(onGoogleButtonPress)
      .mockRejectedValueOnce({ code: 'auth/network-request-failed', credential: 'private' })
      .mockResolvedValueOnce(null);
    const { getByRole, getByText } = render(<LoginScreen />);
    fireEvent.press(getByText('Sign in with Google'));
    await waitFor(() => expect(getByRole('alert')).toHaveTextContent(
      'You appear to be offline. Reconnect and try again.',
    ));
    expect(getByRole('alert')).not.toHaveTextContent('private');
    fireEvent.press(getByText('Sign in with Google'));
    await waitFor(() => expect(onGoogleButtonPress).toHaveBeenCalledTimes(2));
  });

  it('offers an explicit retry when account provisioning failed', () => {
    const retry = jest.fn();
    const { getByText } = render(
      <LoginScreen initialErrorMessage="Account setup failed." onRetryProvisioning={retry} />,
    );
    fireEvent.press(getByText('Retry account setup'));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
