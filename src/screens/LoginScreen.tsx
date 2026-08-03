import React, { useEffect, useState } from 'react';
import { View, Button, StyleSheet, Text, TextInput } from 'react-native';
import { devSignIn, onGoogleButtonPress } from '../services/auth';
import { classifyAuthFailure } from '../domain/auth/errors';

type LoginScreenProps = {
  initialErrorMessage?: string | null;
  onRetryProvisioning?: () => void;
};

const LoginScreen = ({ initialErrorMessage = null, onRetryProvisioning }: LoginScreenProps) => {
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialErrorMessage);
  const [devEmail, setDevEmail] = useState('alex@example.test');
  const [devName, setDevName] = useState('Alex');

  useEffect(() => setErrorMessage(initialErrorMessage), [initialErrorMessage]);

  const handleGoogleSignIn = async () => {
    if (pending) {
      return;
    }

    setPending(true);
    setErrorMessage(null);
    try {
      await onGoogleButtonPress();
    } catch (error) {
      setErrorMessage(classifyAuthFailure(error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>SplitPatel</Text>
      {errorMessage ? <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text> : null}
      <Button
        color="#0b5cad"
        title={pending ? 'Signing in...' : 'Sign in with Google'}
        disabled={pending}
        onPress={handleGoogleSignIn}
      />
      {initialErrorMessage && onRetryProvisioning ? (
        <View style={styles.retry}>
          <Button title="Retry account setup" disabled={pending} onPress={onRetryProvisioning} />
        </View>
      ) : null}
      {__DEV__ && process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === 'true' ? (
        <View style={styles.devPanel}>
          <Text style={styles.devTitle}>Local emulator identity</Text>
          <TextInput accessibilityLabel="Test display name" style={styles.input} value={devName} onChangeText={setDevName} />
          <TextInput accessibilityLabel="Test email" style={styles.input} value={devEmail} onChangeText={setDevEmail}
            autoCapitalize="none" keyboardType="email-address" />
          <Button color="#0b5cad" title="Sign in to local emulator" disabled={pending} onPress={async () => {
            if (pending) return;
            setPending(true); setErrorMessage(null);
            try { await devSignIn(devEmail.trim(), 'local-test-password', devName.trim()); }
            catch { setErrorMessage('Local emulator sign-in failed.'); }
            finally { setPending(false); }
          }} />
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    marginBottom: 24,
  },
  error: {
    color: '#b00020',
    marginBottom: 16,
    paddingHorizontal: 24,
    textAlign: 'center',
  },
  devPanel: { borderTopColor: '#ccc', borderTopWidth: 1, gap: 8, marginTop: 28, paddingTop: 18, width: 300 },
  devTitle: { fontSize: 16, fontWeight: '600' },
  input: { borderColor: '#888', borderRadius: 8, borderWidth: 1, minHeight: 44, paddingHorizontal: 12 },
  retry: { marginTop: 12 },
});

export default LoginScreen;
