import React, { useMemo, useState } from 'react';
import { Button, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { createIdempotencyKey } from '@/application/idempotency';
import { parseMajorAmount } from '@/domain/money/money';
import { DomainValidationError } from '@/domain/shared/errors';
import { useTabContext } from '@/hooks/useTabContext';
import { createSettlementCommand } from '@/services/commands';
import { classifyCommandFailure } from '@/application/command-failure';
import { useDiscardProtection } from '@/presentation/use-discard-protection';

export default function CreateSettlementScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const tabId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();
  const context = useTabContext(tabId);
  const memberIds = useMemo(() => context.memberships.map(item => item.userId).sort(), [context.memberships]);
  const [fromMemberId, setFromMemberId] = useState<string | null>(null);
  const [toMemberId, setToMemberId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<'cash' | 'bank' | 'venmo' | 'paypal' | 'cash_app' | 'other'>('other');
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => createIdempotencyKey('settlement'));
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [allowExit, setAllowExit] = useState(false);
  useDiscardProtection(dirty && !allowExit, 'settlement');
  const name = (memberId: string) => context.profileById.get(memberId)?.displayName ?? 'Unavailable user';

  const submit = async () => {
    if (!tabId || !context.tab || !fromMemberId || !toMemberId || pending) {
      setErrorMessage('Choose who paid and who received the payment.');
      return;
    }
    try {
      const amountMinor = parseMajorAmount(amount, context.tab.currency);
      setPending(true);
      setErrorMessage(null);
      await createSettlementCommand({
        tabId,
        idempotencyKey,
        draft: {
          currency: context.tab.currency,
          fromMemberId,
          toMemberId,
          amountMinor,
          occurredAt: `${date}T12:00:00.000Z`,
          method,
          note: note.trim() || null,
        },
      });
      setIdempotencyKey(createIdempotencyKey('settlement'));
      setUnknownOutcome(false);
      setDirty(false);
      setAllowExit(true);
      setTimeout(() => router.back(), 0);
    } catch (error) {
      if (error instanceof DomainValidationError) {
        setUnknownOutcome(false);
        setErrorMessage(error.issues[0]?.message ?? error.message);
      } else {
        const failure = classifyCommandFailure(error, 'settlement');
        setUnknownOutcome(failure.kind === 'unknown_outcome');
        setErrorMessage(failure.message);
      }
    } finally {
      setPending(false);
    }
  };

  if (context.loading) return <Text style={styles.message}>Loading settlement form...</Text>;
  if (!context.tab) return <Text accessibilityRole="alert" style={styles.message}>{context.errorMessage}</Text>;

  const memberPicker = (label: string, selected: string | null, select: (id: string) => void) => (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {memberIds.map(memberId => (
          <Pressable key={memberId} accessibilityRole="radio" accessibilityState={{ checked: selected === memberId }} aria-checked={selected === memberId}
            style={[styles.chip, selected === memberId && styles.selectedChip]} onPress={() => select(memberId)}>
            <Text style={selected === memberId ? styles.selectedText : undefined}>{name(memberId)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Record external payment</Text>
      <Text style={styles.help}>SplitPatel records this payment but does not transfer or verify money.</Text>
      {errorMessage ? <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text> : null}
      {unknownOutcome ? <Text accessibilityLiveRegion="assertive" style={styles.unknown}>
        Do not change this draft. Use Resolve payment status to retry the same command safely.
      </Text> : null}
      <View pointerEvents={unknownOutcome ? 'none' : 'auto'} style={styles.form}>
      {memberPicker('Paid by', fromMemberId, value => { setDirty(true); setFromMemberId(value); })}
      {memberPicker('Received by', toMemberId, value => { setDirty(true); setToMemberId(value); })}
      <Text style={styles.label}>Amount in {context.tab.currency}</Text>
      <TextInput accessibilityLabel="Settlement amount" style={styles.input} keyboardType="decimal-pad"
        value={amount} onChangeText={value => { setDirty(true); setAmount(value); }}
        placeholder="0.00" editable={!unknownOutcome} />
      <Text style={styles.label}>Payment date</Text>
      <TextInput accessibilityLabel="Settlement date" style={styles.input} value={date}
        onChangeText={value => { setDirty(true); setDate(value); }} placeholder="YYYY-MM-DD"
        autoCapitalize="none" editable={!unknownOutcome} />
      <Text style={styles.label}>Method</Text>
      <View style={styles.chips}>
        {(['cash', 'bank', 'venmo', 'paypal', 'cash_app', 'other'] as const).map(option => (
          <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: method === option }} aria-checked={method === option}
            style={[styles.chip, method === option && styles.selectedChip]} onPress={() => {
              setDirty(true); setMethod(option);
            }}>
            <Text style={method === option ? styles.selectedText : undefined}>{option.replace('_', ' ')}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Note (optional)</Text>
      <TextInput accessibilityLabel="Settlement note" style={styles.input} value={note}
        onChangeText={value => { setDirty(true); setNote(value); }} maxLength={480}
        placeholder="Reference or reminder" editable={!unknownOutcome} />
      </View>
      <View style={styles.submit}><Button title={pending ? 'Recording...' : unknownOutcome ? 'Resolve payment status' : 'Record payment'} disabled={pending} onPress={submit} /></View>
      <Button title="Cancel" disabled={pending} color="#666" onPress={() => router.back()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12, padding: 20, paddingBottom: 48 },
  heading: { fontSize: 25, fontWeight: '700' },
  help: { color: '#555', lineHeight: 20, marginBottom: 8 },
  label: { fontSize: 16, fontWeight: '600', marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { borderColor: '#777', borderRadius: 18, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 12, paddingVertical: 9 },
  selectedChip: { backgroundColor: '#1867c0', borderColor: '#1867c0' },
  selectedText: { color: 'white', fontWeight: '600' },
  input: { borderColor: '#888', borderRadius: 8, borderWidth: 1, minHeight: 44, paddingHorizontal: 12 },
  submit: { marginTop: 16 },
  error: { backgroundColor: '#fde8e8', color: '#9b1c1c', padding: 12 },
  unknown: { backgroundColor: '#fff4ce', padding: 12 },
  form: { gap: 12 },
  message: { padding: 24, textAlign: 'center' },
});
