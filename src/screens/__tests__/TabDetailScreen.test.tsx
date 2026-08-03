import React from 'react';
import { act, render } from '@testing-library/react-native';
import TabDetailScreen from '../TabDetailScreen';
import {
  subscribeToBalances,
  subscribeToExpenses,
  subscribeToSettlements,
} from '@/services/firestore';
import { ExpenseSummary, SettlementSummary } from '@/domain/history/types';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'tab-1' }),
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('@/hooks/useTabContext', () => ({
  useTabContext: () => ({
    loading: false,
    errorMessage: null,
    tab: {
      id: 'tab-1', name: 'Summer trip', currency: 'USD', status: 'active', createdBy: 'alex',
      ownerIds: ['alex'], memberIds: ['alex', 'blair'], memberCount: 2, revision: 1,
      lastActivityAt: '2026-08-02T12:00:00.000Z',
    },
    memberships: [
      { tabId: 'tab-1', userId: 'alex', role: 'owner', state: 'active', revision: 1 },
      { tabId: 'tab-1', userId: 'blair', role: 'member', state: 'active', revision: 1 },
    ],
    profileById: new Map([
      ['alex', { id: 'alex', displayName: 'Alex', photoURL: null, status: 'active' }],
      ['blair', { id: 'blair', displayName: 'Blair', photoURL: null, status: 'active' }],
    ]),
    loadProfiles: jest.fn(),
  }),
}));
jest.mock('@/services/firestore', () => ({
  getMoreExpenses: jest.fn(),
  getMoreSettlements: jest.fn(),
  subscribeToBalances: jest.fn(),
  subscribeToExpenses: jest.fn(),
  subscribeToSettlements: jest.fn(),
}));

let balancesData: (balances: { memberId: string; netMinor: number }[]) => void;
let expensesData: (expenses: ExpenseSummary[], metadata: { fromCache: boolean }) => void;
let settlementsData: (settlements: SettlementSummary[], metadata: { fromCache: boolean }) => void;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(subscribeToBalances).mockImplementation((_tabId, onData) => {
    balancesData = onData;
    return jest.fn();
  });
  jest.mocked(subscribeToExpenses).mockImplementation((_tabId, onData) => {
    expensesData = onData;
    return jest.fn();
  });
  jest.mocked(subscribeToSettlements).mockImplementation((_tabId, onData) => {
    settlementsData = onData;
    return jest.fn();
  });
});

it('distinguishes loading, cached empty history, and zero balances', () => {
  const view = render(<TabDetailScreen />);
  expect(view.getByText('Loading expenses...')).toBeTruthy();
  expect(view.getByText('Loading settlements...')).toBeTruthy();

  act(() => {
    balancesData([]);
    expensesData([], { fromCache: true });
    settlementsData([], { fromCache: true });
  });
  expect(view.getByText('Showing saved financial activity while offline.')).toBeTruthy();
  expect(view.getByText('No expenses yet.')).toBeTruthy();
  expect(view.getByText('No settlements yet.')).toBeTruthy();
  expect(view.getAllByText('settled USD 0.00')).toHaveLength(2);
});

it('renders explicit debt labels and deterministic payment suggestions', () => {
  const view = render(<TabDetailScreen />);
  act(() => {
    balancesData([
      { memberId: 'alex', netMinor: 3000 },
      { memberId: 'blair', netMinor: -3000 },
    ]);
    expensesData([], { fromCache: false });
    settlementsData([], { fromCache: false });
  });
  expect(view.getByText('is owed USD 30.00')).toBeTruthy();
  expect(view.getByText('owes USD 30.00')).toBeTruthy();
  expect(view.getByText('Blair pays Alex USD 30.00')).toBeTruthy();
});
