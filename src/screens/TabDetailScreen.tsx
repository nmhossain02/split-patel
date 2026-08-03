import React, { useEffect, useMemo, useState } from 'react';
import { Button, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Balance, suggestPayments } from '@/domain/balances/balance';
import { ExpenseSummary, SettlementSummary } from '@/domain/history/types';
import { formatMinorAmount } from '@/domain/money/money';
import { useTabContext } from '@/hooks/useTabContext';
import { getMoreExpenses, getMoreSettlements, subscribeToBalances, subscribeToExpenses, subscribeToSettlements } from '@/services/firestore';

export default function TabDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const tabId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();
  const context = useTabContext(tabId);
  const loadProfiles = context.loadProfiles;
  const [balances, setBalances] = useState<Balance[]>([]);
  const [expenses, setExpenses] = useState<ExpenseSummary[]>([]);
  const [settlements, setSettlements] = useState<SettlementSummary[]>([]);
  const [financialError, setFinancialError] = useState<string | null>(null);
  const [moreExpenses, setMoreExpenses] = useState(true);
  const [moreSettlements, setMoreSettlements] = useState(true);
  const [loadingMore, setLoadingMore] = useState<string | null>(null);
  const [expensesLoading, setExpensesLoading] = useState(true);
  const [settlementsLoading, setSettlementsLoading] = useState(true);
  const [cachedSections, setCachedSections] = useState({ expenses: false, settlements: false });

  useEffect(() => {
    if (!tabId) return;
    const fail = () => {
      setFinancialError('Some financial activity could not be loaded.');
      setExpensesLoading(false);
      setSettlementsLoading(false);
    };
    const unsubscribers = [
      subscribeToBalances(tabId, setBalances, fail),
      subscribeToExpenses(tabId, (next, metadata) => {
        setMoreExpenses(next.length === 25);
        setExpenses(previous => {
          const firstPageIds = new Set(next.map(item => item.id));
          return [...next, ...previous.filter(item => !firstPageIds.has(item.id))];
        });
        setCachedSections(previous => ({ ...previous, expenses: metadata.fromCache }));
        setExpensesLoading(false);
        void loadProfiles(next.flatMap(expense => [expense.createdBy, ...expense.participantIds]));
      }, fail),
      subscribeToSettlements(tabId, (next, metadata) => {
        setMoreSettlements(next.length === 25);
        setSettlements(previous => {
          const firstPageIds = new Set(next.map(item => item.id));
          return [...next, ...previous.filter(item => !firstPageIds.has(item.id))];
        });
        setCachedSections(previous => ({ ...previous, settlements: metadata.fromCache }));
        setSettlementsLoading(false);
        void loadProfiles(next.flatMap(settlement => [
          settlement.createdBy, settlement.fromMemberId, settlement.toMemberId,
        ]));
      }, fail),
    ];
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, [loadProfiles, tabId]);

  const balanceByMember = useMemo(() => new Map(balances.map(item => [item.memberId, item.netMinor])), [balances]);
  const suggestions = useMemo(() => {
    try { return suggestPayments(balances); } catch { return []; }
  }, [balances]);
  const memberName = (memberId: string) => context.profileById.get(memberId)?.displayName ?? 'Unavailable user';

  if (context.loading) return <Text style={styles.message}>Loading tab...</Text>;
  if (!context.tab) return <Text accessibilityRole="alert" style={styles.message}>{context.errorMessage}</Text>;
  const tab = context.tab;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {context.errorMessage || financialError
        ? <Text accessibilityRole="alert" style={styles.error}>{context.errorMessage ?? financialError}</Text>
        : null}
      <Text style={styles.title}>{tab.name}</Text>
      <Text style={styles.meta}>{tab.currency} · {tab.status === 'archived' ? 'Archived and read-only' : 'Active'}</Text>
      {cachedSections.expenses || cachedSections.settlements ? (
        <Text accessibilityLiveRegion="polite" style={styles.cacheNotice}>Showing saved financial activity while offline.</Text>
      ) : null}

      {tab.status === 'active' ? (
        <View style={styles.actions}>
          <Button title="Add expense" onPress={() => router.push({ pathname: '/tabs/[id]/expenses/create', params: { id: tab.id } })} />
          <Button title="Record settlement" onPress={() => router.push({ pathname: '/tabs/[id]/settlement', params: { id: tab.id } })} />
        </View>
      ) : null}
      <Button title="Manage tab" onPress={() => router.push({ pathname: '/tabs/[id]/settings', params: { id: tab.id } })} />

      <Text style={styles.section}>Balances</Text>
      {context.memberships.map(membership => {
        const amount = balanceByMember.get(membership.userId) ?? 0;
        return (
          <View key={membership.userId} style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.primary}>{memberName(membership.userId)}</Text>
              <Text style={styles.secondary}>{membership.role}</Text>
            </View>
            <Text style={[styles.amount, amount > 0 ? styles.positive : amount < 0 ? styles.negative : undefined]}>
              {amount > 0 ? 'is owed ' : amount < 0 ? 'owes ' : 'settled '}{formatMinorAmount(Math.abs(amount), tab.currency)}
            </Text>
          </View>
        );
      })}
      {suggestions.length > 0 ? (
        <View style={styles.suggestions}>
          <Text style={styles.cardTitle}>Suggested payments</Text>
          {suggestions.map(suggestion => (
            <Text key={`${suggestion.fromMemberId}-${suggestion.toMemberId}`} style={styles.secondary}>
              {memberName(suggestion.fromMemberId)} pays {memberName(suggestion.toMemberId)} {formatMinorAmount(suggestion.amountMinor, tab.currency)}
            </Text>
          ))}
        </View>
      ) : null}

      <Text style={styles.section}>Expenses</Text>
      {expensesLoading ? <Text style={styles.empty}>Loading expenses...</Text>
        : expenses.length === 0 ? <Text style={styles.empty}>No expenses yet.</Text> : expenses.map(expense => (
        <Pressable accessibilityRole="button" key={expense.id} style={styles.row} onPress={() => router.push({
          pathname: '/tabs/[id]/expenses/[expenseId]', params: { id: tab.id, expenseId: expense.id },
        })}>
          <View style={styles.flex}>
            <Text style={styles.primary}>{expense.description}</Text>
            <Text style={styles.secondary}>{expense.expenseDate} · {expense.itemCount} item{expense.itemCount === 1 ? '' : 's'}{expense.status === 'voided' ? ' · voided' : ''}</Text>
          </View>
          <Text style={styles.amount}>{formatMinorAmount(expense.totalMinor, tab.currency)}</Text>
        </Pressable>
      ))}
      {moreExpenses && expenses.length > 0 ? <Button title={loadingMore === 'expenses' ? 'Loading...' : 'Load more expenses'}
        disabled={!!loadingMore} onPress={async () => {
          setLoadingMore('expenses');
          try {
            const next = await getMoreExpenses(tab.id, expenses[expenses.length - 1]);
            setExpenses(previous => [...previous, ...next.filter(item => !previous.some(old => old.id === item.id))]);
            setMoreExpenses(next.length === 25);
          } catch { setFinancialError('More expenses could not be loaded.'); }
          finally { setLoadingMore(null); }
        }} /> : null}

      <Text style={styles.section}>Settlements</Text>
      {settlementsLoading ? <Text style={styles.empty}>Loading settlements...</Text>
        : settlements.length === 0 ? <Text style={styles.empty}>No settlements yet.</Text> : settlements.map(settlement => (
        <Pressable accessibilityRole="button" key={settlement.id} style={styles.row} onPress={() => router.push({
          pathname: '/tabs/[id]/settlements/[settlementId]', params: { id: tab.id, settlementId: settlement.id },
        })}>
          <View style={styles.flex}>
            <Text style={styles.primary}>{memberName(settlement.fromMemberId)} paid {memberName(settlement.toMemberId)}</Text>
            <Text style={styles.secondary}>{settlement.occurredAt.slice(0, 10)}{settlement.status === 'voided' ? ' · voided' : ' · recorded external payment'}</Text>
          </View>
          <Text style={styles.amount}>{formatMinorAmount(settlement.amountMinor, tab.currency)}</Text>
        </Pressable>
      ))}
      {moreSettlements && settlements.length > 0 ? <Button title={loadingMore === 'settlements' ? 'Loading...' : 'Load more settlements'}
        disabled={!!loadingMore} onPress={async () => {
          setLoadingMore('settlements');
          try {
            const next = await getMoreSettlements(tab.id, settlements[settlements.length - 1]);
            setSettlements(previous => [...previous, ...next.filter(item => !previous.some(old => old.id === item.id))]);
            setMoreSettlements(next.length === 25);
          } catch { setFinancialError('More settlements could not be loaded.'); }
          finally { setLoadingMore(null); }
        }} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48 },
  title: { fontSize: 28, fontWeight: '700' },
  meta: { color: '#555', marginBottom: 16, marginTop: 4 },
  actions: { gap: 8, marginBottom: 8 },
  section: { fontSize: 21, fontWeight: '700', marginBottom: 8, marginTop: 28 },
  row: { alignItems: 'center', borderBottomColor: '#ddd', borderBottomWidth: 1, flexDirection: 'row', gap: 12, minHeight: 60, paddingVertical: 10 },
  flex: { flex: 1 },
  primary: { fontSize: 16, fontWeight: '600' },
  secondary: { color: '#666', marginTop: 3 },
  amount: { fontVariant: ['tabular-nums'], fontWeight: '600', textAlign: 'right' },
  positive: { color: '#0b6b36' },
  negative: { color: '#9b1c1c' },
  suggestions: { backgroundColor: '#f2f6fb', borderRadius: 10, gap: 6, marginTop: 12, padding: 14 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  empty: { color: '#666', paddingVertical: 12 },
  error: { backgroundColor: '#fde8e8', color: '#9b1c1c', marginBottom: 12, padding: 12 },
  message: { padding: 24, textAlign: 'center' },
  cacheNotice: { backgroundColor: '#fff4ce', marginBottom: 8, padding: 10 },
});
