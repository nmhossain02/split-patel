import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Button, Image, Pressable, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter, Link } from 'expo-router';
import { getMoreTabs, getOwnTabBalances, subscribeToInvitations, subscribeToTabs } from '@/services/firestore';
import { signOut } from '@/services/auth';
import { TabSummary } from '@/domain/tabs/types';
import { useAuth } from '@/hooks/useAuth';
import { Invitation } from '@/domain/invitations/types';
import { acceptInvitationCommand } from '@/services/commands';
import { createIdempotencyKey } from '@/application/idempotency';
import { formatMinorAmount } from '@/domain/money/money';

const TabListScreen = () => {
  const [tabs, setTabs] = useState<TabSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [status, setStatus] = useState<'active' | 'archived'>('active');
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [acceptingInvitation, setAcceptingInvitation] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [ownBalances, setOwnBalances] = useState<Map<string, number>>(new Map());
  const [usingCache, setUsingCache] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.uid;

  useEffect(() => subscribeToTabs(
    (nextTabs, metadata) => {
      setHasMore(nextTabs.length === 25);
      setTabs(previous => {
        const firstPageIds = new Set(nextTabs.map(item => item.id));
        return [...nextTabs, ...previous.filter(item => !firstPageIds.has(item.id) && item.status === status)];
      });
      setErrorMessage(null);
      setUsingCache(metadata.fromCache);
      setLoading(false);
    },
    () => {
      setErrorMessage('Unable to load tabs. Check your connection and try again.');
      setLoading(false);
    },
    status,
  ), [reloadKey, status]);

  useEffect(() => subscribeToInvitations(setInvitations, () => {
    setErrorMessage('Invitations could not be loaded.');
  }), []);

  useEffect(() => {
    if (!userId || tabs.length === 0) {
      setOwnBalances(new Map());
      return;
    }
    let active = true;
    getOwnTabBalances(tabs)
      .then(next => { if (active) setOwnBalances(next); })
      .catch(() => { if (active) setErrorMessage('Tab balances could not be loaded.'); });
    return () => { active = false; };
  }, [tabs, userId]);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        {user?.photoURL ? (
          <Image accessibilityLabel={`${user.displayName ?? 'SplitPatel user'} profile photo`}
            source={{ uri: user.photoURL }} style={styles.avatar} />
        ) : null}
        <View style={styles.identity}>
          <Text style={styles.identityName}>{user?.displayName ?? 'SplitPatel user'}</Text>
          <Text selectable style={styles.identityDetail}>{user?.email ?? 'No email'} · ID {user?.uid}</Text>
        </View>
        <Button
          title={signingOut ? 'Signing out...' : 'Sign out'}
          disabled={signingOut}
          onPress={handleSignOut}
        />
      </View>
      {errorMessage ? <Text accessibilityRole="alert" style={styles.message}>{errorMessage}</Text> : null}
      {errorMessage ? <Button title="Try loading tabs again" onPress={() => {
        setLoading(true);
        setErrorMessage(null);
        setReloadKey(value => value + 1);
      }} /> : null}
      {usingCache ? (
        <Text accessibilityLiveRegion="polite" style={styles.cacheNotice}>Showing saved tabs while offline.</Text>
      ) : null}
      {invitations.length > 0 ? (
        <View style={styles.invitations}>
          <Text style={styles.invitationTitle}>Invitations</Text>
          {invitations.map(invitation => (
            <View key={invitation.id} style={styles.invitationRow}>
              <View style={styles.identity}>
                <Text style={styles.itemName}>{invitation.tabName}</Text>
                <Text style={styles.itemMeta}>Invited as {invitation.role} · expires {invitation.expiresAt.slice(0, 10)}</Text>
              </View>
              <Button title={acceptingInvitation === invitation.id ? 'Joining...' : 'Accept'}
                disabled={!!acceptingInvitation} onPress={async () => {
                  setAcceptingInvitation(invitation.id);
                  setErrorMessage(null);
                  try {
                    const tab = await acceptInvitationCommand({
                      invitationId: invitation.id,
                      idempotencyKey: createIdempotencyKey(`accept-${invitation.id}`),
                    });
                    router.push({ pathname: '/tabs/[id]', params: { id: tab.id } });
                  } catch {
                    setErrorMessage('The invitation could not be accepted. It may have expired.');
                  } finally {
                    setAcceptingInvitation(null);
                  }
                }} />
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.filters}>
        {(['active', 'archived'] as const).map(option => (
          <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: status === option }} aria-checked={status === option}
            style={[styles.filter, status === option && styles.selectedFilter]} onPress={() => {
              setLoading(true);
              setTabs([]);
              setStatus(option);
            }}>
            <Text style={status === option ? styles.selectedFilterText : undefined}>
              {option === 'active' ? 'Active tabs' : 'Archived tabs'}
            </Text>
          </Pressable>
        ))}
      </View>
      <FlatList<TabSummary>
        data={tabs}
        keyExtractor={item => item.id}
        ListEmptyComponent={loading
          ? <Text style={styles.message}>Loading tabs...</Text>
          : <Text style={styles.message}>{status === 'active'
            ? 'No active tabs yet. Create one to get started.'
            : 'No archived tabs.'}</Text>}
        renderItem={({ item }) => (
          <Link href={{ pathname: '/tabs/[id]', params: { id: item.id } }} asChild>
            <TouchableOpacity accessibilityRole="button" style={styles.item}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemMeta}>{item.currency} · {item.memberCount} member{item.memberCount === 1 ? '' : 's'}</Text>
              {ownBalances.has(item.id) ? (() => {
                const amount = ownBalances.get(item.id) ?? 0;
                return <Text style={styles.itemBalance}>
                  {amount > 0 ? 'You are owed ' : amount < 0 ? 'You owe ' : 'You are settled at '}
                  {formatMinorAmount(Math.abs(amount), item.currency)}
                </Text>;
              })() : <Text style={styles.itemMeta}>Balance loading...</Text>}
            </TouchableOpacity>
          </Link>
        )}
        ListFooterComponent={hasMore && tabs.length > 0 ? (
          <Button title={loadingMore ? 'Loading...' : 'Load more tabs'} disabled={loadingMore} onPress={async () => {
            setLoadingMore(true);
            setErrorMessage(null);
            try {
              const next = await getMoreTabs(status, tabs[tabs.length - 1]);
              setTabs(previous => [...previous, ...next.filter(item => !previous.some(old => old.id === item.id))]);
              setHasMore(next.length === 25);
            } catch {
              setErrorMessage('More tabs could not be loaded.');
            } finally {
              setLoadingMore(false);
            }
          }} />
        ) : null}
      />
      <Button title="Create New Tab" onPress={() => router.push('/tabs/create')} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  toolbar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    padding: 8,
  },
  avatar: { borderRadius: 20, height: 40, width: 40 },
  identity: { flex: 1 },
  identityName: { fontWeight: '600' },
  identityDetail: { color: '#666', fontSize: 12 },
  message: {
    padding: 20,
    textAlign: 'center',
  },
  cacheNotice: { backgroundColor: '#fff4ce', padding: 10, textAlign: 'center' },
  item: {
    padding: 20,
    borderBottomColor: '#ccc',
    borderBottomWidth: 1,
  },
  itemName: {
    fontSize: 17,
    fontWeight: '600',
  },
  itemMeta: {
    color: '#666',
    marginTop: 4,
  },
  itemBalance: { fontWeight: '600', marginTop: 4 },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  filter: { borderColor: '#777', borderRadius: 18, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 14, paddingVertical: 8 },
  selectedFilter: { backgroundColor: '#1867c0', borderColor: '#1867c0' },
  selectedFilterText: { color: 'white', fontWeight: '600' },
  invitations: { backgroundColor: '#f2f6fb', margin: 12, padding: 12 },
  invitationTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  invitationRow: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingVertical: 6 },
});

export default TabListScreen;
