import { Alert, Platform } from 'react-native';

export type Confirmation = {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
};

export const requestConfirmation = (confirmation: Confirmation): void => {
  if (Platform.OS === 'web') {
    if (typeof globalThis.confirm === 'function'
      && globalThis.confirm(`${confirmation.title}\n\n${confirmation.message}`)) {
      confirmation.onConfirm();
    }
    return;
  }
  Alert.alert(confirmation.title, confirmation.message, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: confirmation.confirmLabel,
      style: confirmation.destructive ? 'destructive' : 'default',
      onPress: confirmation.onConfirm,
    },
  ]);
};
