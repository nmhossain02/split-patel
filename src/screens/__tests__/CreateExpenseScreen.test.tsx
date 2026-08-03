import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import CreateExpenseScreen from '../CreateExpenseScreen';
import { createExpenseCommand } from '@/services/commands';

const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'tab-1' }),
  useRouter: () => ({ back: mockBack }),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000001' }));
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
jest.mock('@/services/firestore', () => ({ getExpenseDetail: jest.fn() }));
jest.mock('@/presentation/use-discard-protection', () => ({ useDiscardProtection: jest.fn() }));
jest.mock('@/services/commands', () => ({
  createExpenseCommand: jest.fn(),
  editExpenseCommand: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

it('locks an unknown-outcome draft and resolves it with the same idempotency key', async () => {
  jest.mocked(createExpenseCommand)
    .mockRejectedValueOnce({ code: 'functions/deadline-exceeded' })
    .mockResolvedValueOnce({} as never);
  const view = render(<CreateExpenseScreen />);

  await waitFor(() => expect(view.getByLabelText('Amount paid by Alex')).toBeTruthy());
  fireEvent.changeText(view.getByLabelText('Expense description'), 'Dinner');
  fireEvent.changeText(view.getByLabelText('Amount paid by Alex'), '10.00');
  fireEvent.changeText(view.getByLabelText('Item 1 description'), 'Meal');
  fireEvent.changeText(view.getByLabelText('Item 1 amount'), '10.00');
  fireEvent.press(view.getByText('Save expense'));

  await waitFor(() => expect(view.getByText('Resolve save status')).toBeTruthy());
  expect(view.getByLabelText('Expense description').props.editable).toBe(false);
  expect(view.getByRole('alert')).toHaveTextContent(
    'The expense may have completed, but confirmation was interrupted. The form is locked so retry can safely resolve the same command.',
  );
  const originalKey = jest.mocked(createExpenseCommand).mock.calls[0][0].idempotencyKey;

  fireEvent.press(view.getByText('Resolve save status'));
  await waitFor(() => expect(createExpenseCommand).toHaveBeenCalledTimes(2));
  expect(jest.mocked(createExpenseCommand).mock.calls[1][0].idempotencyKey).toBe(originalKey);
  await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
});
