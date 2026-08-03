import React, { useEffect, useState } from 'react';
import { Button, ScrollView, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { createIdempotencyKey } from '@/application/idempotency';
import { formatMinorAmount } from '@/domain/money/money';
import { Settlement } from '@/domain/settlements/types';
import { useAuth } from '@/hooks/useAuth';
import { useTabContext } from '@/hooks/useTabContext';
import { voidSettlementCommand } from '@/services/commands';
import { getSettlementDetail } from '@/services/firestore';

export default function SettlementDetailScreen() {
  const { id, settlementId: settlementIdParam } = useLocalSearchParams<{
    id?: string | string[]; settlementId?: string | string[];
  }>();
  const tabId = Array.isArray(id) ? id[0] : id;
  const settlementId = Array.isArray(settlementIdParam) ? settlementIdParam[0] : settlementIdParam;
  const { user } = useAuth();
  const context = useTabContext(tabId);
  const loadProfiles = context.loadProfiles;
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => createIdempotencyKey('void-settlement'));

  useEffect(() => {
    if (!tabId || !settlementId) { setLoading(false); return; }
    getSettlementDetail(tabId, settlementId).then(next => {
      setSettlement(next);
      if (next) void loadProfiles([next.createdBy, next.fromMemberId, next.toMemberId]);
      setLoading(false);
    }).catch(() => { setErrorMessage('The settlement could not be loaded.'); setLoading(false); });
  }, [loadProfiles, settlementId, tabId]);

  if (loading || context.loading) return <Text style={styles.message}>Loading settlement...</Text>;
  if (!settlement || !context.tab || !tabId || !settlementId) {
    return <Text accessibilityRole="alert" style={styles.message}>{errorMessage ?? 'Settlement not found.'}</Text>;
  }
  const name = (uid: string) => context.profileById.get(uid)?.displayName ?? 'Unavailable user';
  const role = context.memberships.find(item => item.userId === user?.uid)?.role;
  const canVoid = settlement.status === 'active'
    && (settlement.createdBy === user?.uid || role === 'owner' || role === 'admin');

  const voidSettlement = async () => {
    if (pending) return;
    setPending(true); setErrorMessage(null);
    try {
      setSettlement(await voidSettlementCommand({
        tabId, settlementId, expectedRevision: settlement.revision, idempotencyKey,
      }));
    } catch {
      setErrorMessage('The settlement could not be voided. Reload it before trying again.');
    } finally { setPending(false); }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>External payment</Text>
      <Text style={styles.amount}>{formatMinorAmount(settlement.amountMinor, settlement.currency)}</Text>
      <Text style={styles.primary}>{name(settlement.fromMemberId)} paid {name(settlement.toMemberId)}</Text>
      <Text style={styles.meta}>{settlement.occurredAt.slice(0, 10)} · {settlement.method?.replace('_', ' ') ?? 'other'} · revision {settlement.revision} · {settlement.status}</Text>
      <Text style={styles.help}>This is a user-recorded payment. SplitPatel did not transfer or verify it.</Text>
      {settlement.note ? <Text style={styles.note}>{settlement.note}</Text> : null}
      {errorMessage ? <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text> : null}
      {canVoid ? <Button title={pending ? 'Voiding...' : 'Void settlement'} color="#9b1c1c"
        disabled={pending} onPress={voidSettlement} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10, padding: 20, paddingBottom: 48 },
  heading: { fontSize: 27, fontWeight: '700' },
  amount: { fontSize: 24, fontWeight: '700', marginTop: 10 },
  primary: { fontSize: 18, fontWeight: '600' },
  meta: { color: '#666' },
  help: { backgroundColor: '#f2f6fb', lineHeight: 20, marginVertical: 8, padding: 12 },
  note: { borderLeftColor: '#aaa', borderLeftWidth: 3, padding: 10 },
  error: { backgroundColor: '#fde8e8', color: '#9b1c1c', padding: 12 },
  message: { padding: 24, textAlign: 'center' },
});
