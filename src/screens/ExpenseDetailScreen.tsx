import React, { useEffect, useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { createIdempotencyKey } from '@/application/idempotency';
import { Expense } from '@/domain/expenses/types';
import { formatMinorAmount } from '@/domain/money/money';
import { useAuth } from '@/hooks/useAuth';
import { useTabContext } from '@/hooks/useTabContext';
import { voidExpenseCommand } from '@/services/commands';
import { getExpenseDetail } from '@/services/firestore';

export default function ExpenseDetailScreen() {
  const { id, expenseId: expenseIdParam } = useLocalSearchParams<{
    id?: string | string[];
    expenseId?: string | string[];
  }>();
  const tabId = Array.isArray(id) ? id[0] : id;
  const expenseId = Array.isArray(expenseIdParam) ? expenseIdParam[0] : expenseIdParam;
  const router = useRouter();
  const { user } = useAuth();
  const context = useTabContext(tabId);
  const loadProfiles = context.loadProfiles;
  const [expense, setExpense] = useState<Expense | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => createIdempotencyKey('void-expense'));

  useEffect(() => {
    if (!tabId || !expenseId) {
      setLoading(false);
      return;
    }
    getExpenseDetail(tabId, expenseId).then(next => {
      setExpense(next);
      if (next) {
        void loadProfiles([
          next.createdBy,
          ...next.contributions.map(item => item.memberId),
          ...next.items.flatMap(item => item.allocations.map(allocation => allocation.memberId)),
        ]);
      }
      setLoading(false);
    }).catch(() => {
      setErrorMessage('The expense could not be loaded.');
      setLoading(false);
    });
  }, [expenseId, loadProfiles, tabId]);

  if (loading || context.loading) return <Text style={styles.message}>Loading expense...</Text>;
  if (!expense || !context.tab || !tabId || !expenseId) {
    return <Text accessibilityRole="alert" style={styles.message}>{errorMessage ?? 'Expense not found.'}</Text>;
  }
  const name = (memberId: string) => context.profileById.get(memberId)?.displayName ?? 'Unavailable user';
  const actorRole = context.memberships.find(item => item.userId === user?.uid)?.role;
  const canChange = expense.status === 'active'
    && (expense.createdBy === user?.uid || actorRole === 'owner' || actorRole === 'admin');

  const voidExpense = async () => {
    if (pending) return;
    setPending(true);
    setErrorMessage(null);
    try {
      const next = await voidExpenseCommand({
        tabId,
        expenseId,
        expectedRevision: expense.revision,
        idempotencyKey,
      });
      setExpense(next);
    } catch {
      setErrorMessage('The expense could not be voided. Reload it before trying again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>{expense.description}</Text>
      <Text style={styles.meta}>{expense.expenseDate} · revision {expense.revision} · {expense.status}</Text>
      <Text style={styles.total}>{formatMinorAmount(expense.totalMinor, expense.currency)}</Text>
      {errorMessage ? <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text> : null}
      {canChange ? (
        <View style={styles.actions}>
          <Button title="Edit expense" disabled={pending} onPress={() => router.push({
            pathname: '/tabs/[id]/expenses/[expenseId]/edit', params: { id: tabId, expenseId },
          })} />
          <Button title={pending ? 'Voiding...' : 'Void expense'} color="#9b1c1c" disabled={pending} onPress={voidExpense} />
        </View>
      ) : null}

      <Text style={styles.section}>Paid by</Text>
      {expense.contributions.map(contribution => (
        <View key={contribution.memberId} style={styles.row}>
          <Text style={styles.flex}>{name(contribution.memberId)}</Text>
          <Text>{formatMinorAmount(contribution.amountMinor, expense.currency)}</Text>
        </View>
      ))}

      <Text style={styles.section}>Items and allocations</Text>
      {expense.items.map(item => (
        <View key={item.id} style={styles.card}>
          <View style={styles.row}>
            <Text style={[styles.flex, styles.primary]}>{item.description}</Text>
            <Text style={styles.primary}>{formatMinorAmount(item.amountMinor, expense.currency)}</Text>
          </View>
          {item.allocations.map(allocation => (
            <View key={allocation.memberId} style={styles.row}>
              <Text style={[styles.flex, styles.meta]}>{name(allocation.memberId)}</Text>
              <Text style={styles.meta}>{formatMinorAmount(allocation.amountMinor, expense.currency)}</Text>
            </View>
          ))}
        </View>
      ))}
      <Text style={styles.meta}>Created by {name(expense.createdBy)}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48 },
  heading: { fontSize: 27, fontWeight: '700' },
  total: { fontSize: 23, fontWeight: '700', marginVertical: 16 },
  meta: { color: '#666', marginTop: 3 },
  actions: { gap: 8, marginBottom: 8 },
  section: { fontSize: 20, fontWeight: '700', marginTop: 24 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 36 },
  flex: { flex: 1 },
  primary: { fontWeight: '600' },
  card: { borderColor: '#ddd', borderRadius: 10, borderWidth: 1, marginTop: 10, padding: 12 },
  error: { backgroundColor: '#fde8e8', color: '#9b1c1c', marginBottom: 12, padding: 12 },
  message: { padding: 24, textAlign: 'center' },
});
