import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { createExpenseCommand, editExpenseCommand } from '@/services/commands';
import { createIdempotencyKey } from '@/application/idempotency';
import { buildExpenseDraft, ExpenseContributionInput, ExpenseLineInput } from '@/presentation/expense-form';
import { useTabContext } from '@/hooks/useTabContext';
import { DomainValidationError } from '@/domain/shared/errors';
import { getExpenseDetail } from '@/services/firestore';
import { formatMinorAmount, minorAmountInput, parseMajorAmount, sumMinorAmounts } from '@/domain/money/money';
import { classifyCommandFailure } from '@/application/command-failure';
import { useDiscardProtection } from '@/presentation/use-discard-protection';

const today = () => new Date().toISOString().slice(0, 10);
const newLine = (participantIds: string[]): ExpenseLineInput => ({
  id: `item_${randomUUID()}`,
  description: '',
  amount: '',
  participantIds,
  allocationMode: 'equal',
  shares: {},
});

export default function CreateExpenseScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const { expenseId: expenseIdParam } = useLocalSearchParams<{ expenseId?: string | string[] }>();
  const tabId = Array.isArray(id) ? id[0] : id;
  const expenseId = Array.isArray(expenseIdParam) ? expenseIdParam[0] : expenseIdParam;
  const router = useRouter();
  const context = useTabContext(tabId);
  const memberIds = useMemo(() => context.memberships.map(item => item.userId).sort(), [context.memberships]);
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState(today);
  const [contributions, setContributions] = useState<ExpenseContributionInput[]>([]);
  const [items, setItems] = useState<ExpenseLineInput[]>([]);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => createIdempotencyKey('expense'));
  const [expectedRevision, setExpectedRevision] = useState<number | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(!!expenseId);
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [allowExit, setAllowExit] = useState(false);

  useDiscardProtection(dirty && !allowExit, 'expense');

  useEffect(() => {
    if (expenseId || memberIds.length === 0 || contributions.length > 0) return;
    setContributions(memberIds.map(memberId => ({ memberId, amount: '' })));
    setItems([newLine(memberIds)]);
  }, [contributions.length, expenseId, memberIds]);

  useEffect(() => {
    if (!tabId || !expenseId || !context.tab) return;
    let active = true;
    getExpenseDetail(tabId, expenseId).then(expense => {
      if (!active) return;
      if (!expense || expense.status === 'voided') {
        setErrorMessage('This expense is unavailable or cannot be edited.');
      } else {
        setDescription(expense.description);
        setExpenseDate(expense.expenseDate);
        setExpectedRevision(expense.revision);
        setContributions(memberIds.map(memberId => ({
          memberId,
          amount: expense.contributions.find(item => item.memberId === memberId)
            ? minorAmountInput(expense.contributions.find(item => item.memberId === memberId)!.amountMinor, expense.currency)
            : '',
        })));
        setItems(expense.items.map(item => ({
          id: item.id,
          description: item.description,
          amount: minorAmountInput(item.amountMinor, expense.currency),
          participantIds: item.allocations.map(allocation => allocation.memberId),
          allocationMode: 'exact',
          shares: Object.fromEntries(item.allocations.map(allocation => [
            allocation.memberId, minorAmountInput(allocation.amountMinor, expense.currency),
          ])),
        })));
      }
      setLoadingExisting(false);
    }).catch(() => {
      if (active) {
        setErrorMessage('The expense could not be loaded.');
        setLoadingExisting(false);
      }
    });
    return () => { active = false; };
  }, [context.tab, expenseId, memberIds, tabId]);

  const memberName = (memberId: string) => context.profileById.get(memberId)?.displayName ?? 'Unavailable user';
  const updateItem = (index: number, update: Partial<ExpenseLineInput>) => {
    setDirty(true);
    setItems(previous => previous.map((item, itemIndex) => itemIndex === index ? { ...item, ...update } : item));
  };
  const toggleParticipant = (index: number, memberId: string) => {
    const item = items[index];
    const participantIds = item.participantIds.includes(memberId)
      ? item.participantIds.filter(id => id !== memberId)
      : [...item.participantIds, memberId].sort();
    updateItem(index, { participantIds });
  };
  const updateShare = (index: number, memberId: string, value: string) => {
    updateItem(index, { shares: { ...items[index].shares, [memberId]: value } });
  };
  const moveItem = (index: number, offset: -1 | 1) => {
    setDirty(true);
    setItems(previous => {
      const destination = index + offset;
      if (destination < 0 || destination >= previous.length) return previous;
      const next = [...previous];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  };
  const totals = useMemo(() => {
    if (!context.tab) return null;
    try {
      const paid = sumMinorAmounts(contributions
        .filter(item => item.amount.trim() && item.amount.trim() !== '0')
        .map(item => parseMajorAmount(item.amount, context.tab!.currency)));
      const allocated = sumMinorAmounts(items
        .filter(item => item.amount.trim())
        .map(item => parseMajorAmount(item.amount, context.tab!.currency)));
      return { paid, allocated };
    } catch {
      return null;
    }
  }, [context.tab, contributions, items]);

  const submit = async () => {
    if (!tabId || !context.tab || pending) return;
    setErrorMessage(null);
    let draft;
    try {
      draft = buildExpenseDraft({
        description,
        currency: context.tab.currency,
        expenseDate,
        contributions,
        items,
        activeMemberIds: memberIds,
      });
    } catch (error) {
      const message = error instanceof DomainValidationError
        ? error.issues[0]?.message ?? error.message
        : 'Check every amount and participant selection.';
      setErrorMessage(message);
      return;
    }
    setPending(true);
    try {
      if (expenseId && expectedRevision) {
        await editExpenseCommand({ tabId, expenseId, expectedRevision, idempotencyKey, draft });
      } else {
        await createExpenseCommand({ tabId, idempotencyKey, draft });
      }
      setIdempotencyKey(createIdempotencyKey('expense'));
      setUnknownOutcome(false);
      setDirty(false);
      setAllowExit(true);
      setTimeout(() => router.back(), 0);
    } catch (error) {
      const failure = classifyCommandFailure(error, 'expense');
      setUnknownOutcome(failure.kind === 'unknown_outcome');
      setErrorMessage(failure.message);
    } finally {
      setPending(false);
    }
  };

  if (context.loading || loadingExisting) return <Text style={styles.message}>Loading expense form...</Text>;
  if (!context.tab) return <Text accessibilityRole="alert" style={styles.message}>{context.errorMessage}</Text>;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>{expenseId ? 'Edit expense' : 'New expense'}</Text>
      <Text style={styles.currency}>Amounts are in {context.tab.currency}</Text>
      {errorMessage || context.errorMessage
        ? <Text accessibilityRole="alert" style={styles.error}>{errorMessage ?? context.errorMessage}</Text>
        : null}
      {unknownOutcome ? (
        <Text accessibilityLiveRegion="assertive" style={styles.unknown}>
          Do not change this draft. Use Resolve save status to retry the same command safely.
        </Text>
      ) : null}
      <View pointerEvents={unknownOutcome ? 'none' : 'auto'} style={styles.form}>
      <Text style={styles.label}>Description</Text>
      <TextInput accessibilityLabel="Expense description" style={styles.input} value={description}
        onChangeText={value => { setDirty(true); setDescription(value); }} maxLength={240}
        placeholder="Dinner" editable={!unknownOutcome} />
      <Text style={styles.label}>Date</Text>
      <TextInput accessibilityLabel="Expense date" style={styles.input} value={expenseDate}
        onChangeText={value => { setDirty(true); setExpenseDate(value); }} placeholder="YYYY-MM-DD"
        autoCapitalize="none" editable={!unknownOutcome} />

      <Text style={styles.section}>Who paid?</Text>
      {contributions.map((contribution, index) => (
        <View key={contribution.memberId} style={styles.amountRow}>
          <Text style={styles.memberName}>{memberName(contribution.memberId)}</Text>
          <TextInput
            accessibilityLabel={`Amount paid by ${memberName(contribution.memberId)}`}
            style={[styles.input, styles.amountInput]}
            value={contribution.amount}
            onChangeText={amount => {
              setDirty(true);
              setContributions(previous => previous.map((item, itemIndex) =>
                itemIndex === index ? { ...item, amount } : item));
            }}
            keyboardType="decimal-pad"
            placeholder="0.00"
            editable={!unknownOutcome}
          />
        </View>
      ))}

      <Text style={styles.section}>Items and splits</Text>
      {items.map((item, index) => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.cardTitle}>Item {index + 1}</Text>
          <TextInput accessibilityLabel={`Item ${index + 1} description`} style={styles.input}
            value={item.description} onChangeText={value => updateItem(index, { description: value })}
            placeholder="Food and tip" maxLength={240} editable={!unknownOutcome} />
          <TextInput accessibilityLabel={`Item ${index + 1} amount`} style={styles.input}
            value={item.amount} onChangeText={value => updateItem(index, { amount: value })}
            keyboardType="decimal-pad" placeholder="0.00" editable={!unknownOutcome} />
          <Text style={styles.label}>Split method</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel={`Item ${index + 1} split method`}
            style={styles.chips}>
            {(['equal', 'exact', 'percentage', 'weighted'] as const).map(mode => {
              const selected = (item.allocationMode ?? 'equal') === mode;
              return (
                <Pressable key={mode} accessibilityRole="radio" accessibilityState={{ checked: selected }}
                  aria-checked={selected} onPress={() => updateItem(index, { allocationMode: mode })}
                  style={[styles.chip, selected && styles.selectedChip]}>
                  <Text style={selected ? styles.selectedChipText : undefined}>
                    {mode === 'percentage' ? 'Percent' : mode[0].toUpperCase() + mode.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.label}>Participants</Text>
          <View style={styles.chips}>
            {memberIds.map(memberId => {
              const selected = item.participantIds.includes(memberId);
              return (
                <Pressable key={memberId} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} aria-checked={selected}
                  onPress={() => toggleParticipant(index, memberId)}
                  style={[styles.chip, selected && styles.selectedChip]}>
                  <Text style={selected ? styles.selectedChipText : undefined}>{memberName(memberId)}</Text>
                </Pressable>
              );
            })}
          </View>
          {(item.allocationMode ?? 'equal') !== 'equal' && item.participantIds.map(memberId => (
            <View key={`share-${memberId}`} style={styles.amountRow}>
              <Text style={styles.memberName}>{memberName(memberId)}</Text>
              <TextInput
                accessibilityLabel={`Item ${index + 1} ${item.allocationMode} share for ${memberName(memberId)}`}
                style={[styles.input, styles.amountInput]}
                value={item.shares?.[memberId] ?? ''}
                onChangeText={value => updateShare(index, memberId, value)}
                keyboardType="decimal-pad"
                placeholder={item.allocationMode === 'percentage' ? '50.00' : item.allocationMode === 'weighted' ? '1' : '0.00'}
                editable={!unknownOutcome}
              />
            </View>
          ))}
          {items.length > 1 ? <View style={styles.itemActions}>
            <Button title="Move up" disabled={index === 0} onPress={() => moveItem(index, -1)} />
            <Button title="Move down" disabled={index === items.length - 1} onPress={() => moveItem(index, 1)} />
          </View> : null}
          {items.length > 1
            ? <Button title={`Remove item ${index + 1}`} color="#9b1c1c"
              onPress={() => { setDirty(true); setItems(previous => previous.filter((_, itemIndex) => itemIndex !== index)); }} />
            : null}
        </View>
      ))}
      <Button title="Add another item" onPress={() => {
        setDirty(true);
        setItems(previous => [...previous, newLine(memberIds)]);
      }} />
      {totals && context.tab ? (
        <View accessibilityLiveRegion="polite" style={styles.summary}>
          <Text>Paid: {formatMinorAmount(totals.paid, context.tab.currency)}</Text>
          <Text>Item total: {formatMinorAmount(totals.allocated, context.tab.currency)}</Text>
          <Text style={totals.paid === totals.allocated ? styles.balanced : styles.errorText}>
            {totals.paid === totals.allocated ? 'Totals match' : 'Paid and item totals must match'}
          </Text>
        </View>
      ) : null}
      </View>
      <View style={styles.submit}>
        <Button title={pending ? 'Saving expense...' : unknownOutcome ? 'Resolve save status' : expenseId ? 'Save changes' : 'Save expense'} disabled={pending} onPress={submit} />
      </View>
      <Button title="Cancel" disabled={pending} color="#666" onPress={() => router.back()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48, gap: 8 },
  heading: { fontSize: 26, fontWeight: '700' },
  currency: { color: '#555', marginBottom: 12 },
  label: { fontSize: 15, fontWeight: '600', marginTop: 4 },
  section: { fontSize: 20, fontWeight: '700', marginTop: 18 },
  input: { borderColor: '#888', borderRadius: 8, borderWidth: 1, minHeight: 44, paddingHorizontal: 12 },
  amountRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  memberName: { flex: 1 },
  amountInput: { width: 130 },
  card: { borderColor: '#ccc', borderRadius: 10, borderWidth: 1, gap: 8, marginTop: 8, padding: 12 },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  itemActions: { flexDirection: 'row', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  chip: { borderColor: '#777', borderRadius: 18, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 12, paddingVertical: 8 },
  selectedChip: { backgroundColor: '#1867c0', borderColor: '#1867c0' },
  selectedChipText: { color: 'white', fontWeight: '600' },
  submit: { marginTop: 24 },
  summary: { backgroundColor: '#f2f5f8', borderRadius: 8, gap: 4, marginTop: 12, padding: 12 },
  balanced: { color: '#176b36', fontWeight: '600' },
  errorText: { color: '#9b1c1c', fontWeight: '600' },
  error: { backgroundColor: '#fde8e8', color: '#9b1c1c', padding: 12 },
  unknown: { backgroundColor: '#fff4ce', marginBottom: 8, padding: 12 },
  form: { gap: 8 },
  message: { padding: 24, textAlign: 'center' },
});
