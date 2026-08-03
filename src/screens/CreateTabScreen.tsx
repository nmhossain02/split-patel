import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { createTabCommand } from '../services/commands';
import { createIdempotencyKey } from '../application/idempotency';
import { classifyCommandFailure } from '../application/command-failure';

const currencies = ['USD', 'CAD', 'EUR', 'GBP', 'INR', 'AUD', 'NZD', 'JPY'];

const CreateTabScreen = () => {
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [pending, setPending] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => createIdempotencyKey('create-tab'));
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage('Tab name is required.');
      return;
    }
    if (pending) {
      return;
    }
    setPending(true);
    setErrorMessage(null);
    try {
      const tab = await createTabCommand({ name: trimmedName, currency, idempotencyKey });
      setIdempotencyKey(createIdempotencyKey('create-tab'));
      setUnknownOutcome(false);
      router.replace({ pathname: '/tabs/[id]', params: { id: tab.id } });
    } catch (error) {
      const failure = classifyCommandFailure(error, 'tab creation');
      setUnknownOutcome(failure.kind === 'unknown_outcome');
      setErrorMessage(failure.message);
    } finally {
      setPending(false);
    }
  };

  return (
    <View style={styles.container}>
      {errorMessage ? <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text> : null}
      <TextInput
        accessibilityLabel="Tab name"
        style={styles.input}
        placeholder="Tab Name"
        value={name}
        onChangeText={setName}
        autoFocus
        maxLength={160}
        returnKeyType="done"
        onSubmitEditing={handleSave}
        editable={!unknownOutcome}
      />
      <Text style={styles.label}>Currency</Text>
      <View style={styles.currencyList}>
        {currencies.map(option => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: currency === option }}
            aria-checked={currency === option}
            key={option}
            disabled={unknownOutcome}
            onPress={() => setCurrency(option)}
            style={[styles.currency, currency === option && styles.selectedCurrency]}
          >
            <Text style={currency === option ? styles.selectedCurrencyText : undefined}>{option}</Text>
          </Pressable>
        ))}
      </View>
      {unknownOutcome ? <Text style={styles.unknown}>
        Do not change this draft. Resolve creation status with the same command.
      </Text> : null}
      <Button title={pending ? 'Saving...' : unknownOutcome ? 'Resolve creation status' : 'Save'} disabled={pending} onPress={handleSave} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  input: {
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 20,
    minHeight: 44,
    paddingHorizontal: 10,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  currencyList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  currency: {
    borderColor: '#888',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  selectedCurrency: {
    backgroundColor: '#1867c0',
    borderColor: '#1867c0',
  },
  selectedCurrencyText: {
    color: 'white',
    fontWeight: '600',
  },
  unknown: { backgroundColor: '#fff4ce', marginBottom: 12, padding: 12 },
  error: { backgroundColor: '#fde8e8', color: '#9b1c1c', marginBottom: 12, padding: 12 },
});

export default CreateTabScreen;
