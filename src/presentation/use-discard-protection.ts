import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { requestConfirmation } from './confirmation';

export const useDiscardProtection = (
  enabled: boolean,
  subject: string,
): void => {
  const navigation = useNavigation();
  usePreventRemove(enabled, event => {
    requestConfirmation({
      title: `Discard ${subject}?`,
      message: 'Your unsaved entries will be lost.',
      confirmLabel: 'Discard',
      destructive: true,
      onConfirm: () => navigation.dispatch(event.data.action),
    });
  });
};
