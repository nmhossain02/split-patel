import { Alert, Platform } from 'react-native';
import { requestConfirmation } from '../confirmation';

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
});

it('uses a browser confirmation and runs only an accepted action', () => {
  const originalPlatform = Platform.OS;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  const originalConfirm = globalThis.confirm;
  const action = jest.fn();
  globalThis.confirm = jest.fn(() => false);
  requestConfirmation({ title: 'Title', message: 'Message', confirmLabel: 'Continue', onConfirm: action });
  expect(action).not.toHaveBeenCalled();
  jest.mocked(globalThis.confirm).mockReturnValue(true);
  requestConfirmation({ title: 'Title', message: 'Message', confirmLabel: 'Continue', onConfirm: action });
  expect(action).toHaveBeenCalledTimes(1);
  globalThis.confirm = originalConfirm;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
});

it('uses a native alert with an explicit confirmation callback', () => {
  const action = jest.fn();
  requestConfirmation({
    title: 'Delete?', message: 'This cannot be undone.', confirmLabel: 'Delete', destructive: true,
    onConfirm: action,
  });
  const buttons = jest.mocked(Alert.alert).mock.calls[0][2];
  expect(buttons?.[1]).toEqual(expect.objectContaining({ text: 'Delete', style: 'destructive' }));
  buttons?.[1].onPress?.();
  expect(action).toHaveBeenCalledTimes(1);
});
