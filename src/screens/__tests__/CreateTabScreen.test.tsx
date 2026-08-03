import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import CreateTabScreen from '../CreateTabScreen';
import { createTabCommand } from '@/services/commands';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock('@/services/commands', () => ({
  createTabCommand: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

it('locks an unknown-outcome tab draft and retries with the same command key', async () => {
  jest.mocked(createTabCommand)
    .mockRejectedValueOnce({ code: 'functions/unavailable' })
    .mockResolvedValueOnce({ id: 'tab-1' } as never);
  const view = render(<CreateTabScreen />);

  fireEvent.changeText(view.getByLabelText('Tab name'), 'Summer trip');
  fireEvent.press(view.getByText('Save'));

  await waitFor(() => expect(view.getByText('Resolve creation status')).toBeTruthy());
  expect(view.getByLabelText('Tab name').props.editable).toBe(false);
  const originalKey = jest.mocked(createTabCommand).mock.calls[0][0].idempotencyKey;

  fireEvent.press(view.getByText('Resolve creation status'));
  await waitFor(() => expect(createTabCommand).toHaveBeenCalledTimes(2));
  expect(jest.mocked(createTabCommand).mock.calls[1][0].idempotencyKey).toBe(originalKey);
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({
    pathname: '/tabs/[id]',
    params: { id: 'tab-1' },
  }));
});
