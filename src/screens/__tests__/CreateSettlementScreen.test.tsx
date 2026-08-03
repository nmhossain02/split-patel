import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import CreateSettlementScreen from '../CreateSettlementScreen';
import { createSettlementCommand } from '@/services/commands';

const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'tab-1' }),
  useRouter: () => ({ back: mockBack }),
}));
jest.mock('@/presentation/use-discard-protection', () => ({ useDiscardProtection: jest.fn() }));
jest.mock('@/services/commands', () => ({
  createSettlementCommand: jest.fn(),
}));
jest.mock('@/hooks/useTabContext', () => ({
  useTabContext: () => ({
    loading: false,
    errorMessage: null,
    tab: {
      id: 'tab-1', name: 'Trip', currency: 'USD', status: 'active', createdBy: 'alex',
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
  }),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

it('locks an unknown-outcome settlement and resolves it with the same command key', async () => {
  jest.mocked(createSettlementCommand)
    .mockRejectedValueOnce({ code: 'functions/deadline-exceeded' })
    .mockResolvedValueOnce({} as never);
  const view = render(<CreateSettlementScreen />);

  fireEvent.press(view.getAllByText('Alex')[0]);
  fireEvent.press(view.getAllByText('Blair')[1]);
  fireEvent.changeText(view.getByLabelText('Settlement amount'), '30.00');
  fireEvent.press(view.getByText('Record payment'));

  await waitFor(() => expect(view.getByText('Resolve payment status')).toBeTruthy());
  expect(view.getByLabelText('Settlement amount').props.editable).toBe(false);
  const originalKey = jest.mocked(createSettlementCommand).mock.calls[0][0].idempotencyKey;

  fireEvent.press(view.getByText('Resolve payment status'));
  await waitFor(() => expect(createSettlementCommand).toHaveBeenCalledTimes(2));
  expect(jest.mocked(createSettlementCommand).mock.calls[1][0].idempotencyKey).toBe(originalKey);
  await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
});
