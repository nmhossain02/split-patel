import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import TabListScreen from '../TabListScreen';
import {
  getOwnTabBalances,
  subscribeToInvitations,
  subscribeToTabs,
} from '@/services/firestore';
import { TabSummary } from '@/domain/tabs/types';

jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'alex', displayName: 'Alex', email: 'alex@example.test', photoURL: null },
  }),
}));
jest.mock('@/services/auth', () => ({ signOut: jest.fn() }));
jest.mock('@/services/commands', () => ({ acceptInvitationCommand: jest.fn() }));
jest.mock('@/services/firestore', () => ({
  getMoreTabs: jest.fn(),
  getOwnTabBalances: jest.fn(),
  subscribeToInvitations: jest.fn(),
  subscribeToTabs: jest.fn(),
}));

const tab: TabSummary = {
  id: 'tab-1', name: 'Summer trip', currency: 'USD', status: 'active', createdBy: 'alex',
  ownerIds: ['alex'], memberIds: ['alex', 'blair'], memberCount: 2, revision: 1,
  lastActivityAt: '2026-08-02T12:00:00.000Z',
};

let tabsData: (tabs: TabSummary[], metadata: { fromCache: boolean }) => void;
let tabsError: () => void;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(subscribeToTabs).mockImplementation((onData, onError) => {
    tabsData = onData;
    tabsError = () => onError?.(new Error('offline'));
    return jest.fn();
  });
  jest.mocked(subscribeToInvitations).mockImplementation(onData => {
    onData([]);
    return jest.fn();
  });
  jest.mocked(getOwnTabBalances).mockResolvedValue(new Map([['tab-1', 1234]]));
});

it('distinguishes loading, cached data, and the signed-in member balance', async () => {
  const view = render(<TabListScreen />);
  expect(view.getByText('Loading tabs...')).toBeTruthy();

  act(() => tabsData([tab], { fromCache: true }));
  expect(view.getByText('Showing saved tabs while offline.')).toBeTruthy();
  expect(view.getByText('USD · 2 members')).toBeTruthy();
  await waitFor(() => expect(view.getByText('You are owed USD 12.34')).toBeTruthy());
});

it('shows a retry action after a subscription failure', () => {
  const view = render(<TabListScreen />);
  act(() => tabsError());
  expect(view.getByRole('alert')).toHaveTextContent(
    'Unable to load tabs. Check your connection and try again.',
  );
  fireEvent.press(view.getByText('Try loading tabs again'));
  expect(subscribeToTabs).toHaveBeenCalledTimes(2);
});

it('loads archived tabs only after selecting the archived filter', () => {
  const view = render(<TabListScreen />);
  fireEvent.press(view.getByText('Archived tabs'));
  expect(subscribeToTabs).toHaveBeenLastCalledWith(
    expect.any(Function), expect.any(Function), 'archived',
  );
});
