import React, { useEffect, useMemo, useState } from 'react';
import { Button, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { createIdempotencyKey } from '@/application/idempotency';
import { SUPPORTED_CURRENCIES } from '@/domain/money/money';
import { useAuth } from '@/hooks/useAuth';
import { useTabContext } from '@/hooks/useTabContext';
import {
  endTabMembershipCommand,
  changeTabCurrencyCommand,
  inviteMemberCommand,
  renameTabCommand,
  setTabArchivedCommand,
  setMemberRoleCommand,
} from '@/services/commands';
import { requestConfirmation } from '@/presentation/confirmation';

export default function TabSettingsScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const tabId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();
  const { user } = useAuth();
  const context = useTabContext(tabId);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const role = useMemo(() => context.memberships.find(item => item.userId === user?.uid)?.role, [context.memberships, user?.uid]);
  const memberName = (memberId: string) => context.profileById.get(memberId)?.displayName ?? 'Unavailable user';

  useEffect(() => {
    if (context.tab && !currency) setCurrency(context.tab.currency);
  }, [context.tab, currency]);

  const run = async (operation: string, command: () => Promise<unknown>, after?: () => void) => {
    if (pending) return;
    setPending(operation);
    setErrorMessage(null);
    try {
      await command();
      after?.();
    } catch {
      setErrorMessage('That change could not be completed. The tab may have changed, or your role may not permit it.');
    } finally {
      setPending(null);
    }
  };

  if (context.loading) return <Text style={styles.message}>Loading settings...</Text>;
  if (!context.tab || !tabId || !user) return <Text accessibilityRole="alert" style={styles.message}>{context.errorMessage}</Text>;
  const tab = context.tab;
  const canManage = role === 'owner' || role === 'admin';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Manage {tab.name}</Text>
      <Text style={styles.meta}>Your role: {role ?? 'member'}</Text>
      {errorMessage ? <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text> : null}

      {canManage && tab.status === 'active' ? (
        <View style={styles.section}>
          <Text style={styles.title}>Rename tab</Text>
          <TextInput accessibilityLabel="New tab name" style={styles.input} value={name}
            onChangeText={setName} placeholder={tab.name} maxLength={160} />
          <Button title={pending === 'rename' ? 'Renaming...' : 'Rename'} disabled={!!pending || !name.trim()}
            onPress={() => run('rename', () => renameTabCommand({
              tabId, name, expectedRevision: tab.revision, idempotencyKey: createIdempotencyKey('rename-tab'),
            }), () => setName(''))} />
        </View>
      ) : null}

      {role === 'owner' && tab.status === 'active' ? (
        <View style={styles.section}>
          <Text style={styles.title}>Tab currency</Text>
          <Text style={styles.help}>
            Currency can change only before any expense or settlement is recorded. Existing financial records are never converted.
          </Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="Tab currency" style={styles.choices}>
            {[...SUPPORTED_CURRENCIES].sort().map(option => (
              <Pressable key={option} accessibilityRole="radio"
                accessibilityState={{ checked: currency === option }} aria-checked={currency === option}
                onPress={() => setCurrency(option)}
                style={[styles.choice, currency === option && styles.selectedChoice]}>
                <Text style={currency === option ? styles.selectedChoiceText : undefined}>{option}</Text>
              </Pressable>
            ))}
          </View>
          <Button title={pending === 'currency' ? 'Updating currency...' : 'Change currency'}
            disabled={!!pending || !currency || currency === tab.currency}
            onPress={() => requestConfirmation({
              title: 'Change tab currency?',
              message: `Use ${currency} for this tab? This is allowed only before financial activity and does not convert amounts.`,
              confirmLabel: 'Change currency',
              onConfirm: () => run('currency', () => changeTabCurrencyCommand({
                  tabId, currency, expectedRevision: tab.revision,
                  idempotencyKey: createIdempotencyKey('change-tab-currency'),
                })),
            })} />
        </View>
      ) : null}

      {canManage && tab.status === 'active' ? (
        <View style={styles.section}>
          <Text style={styles.title}>Invite member</Text>
          <Text style={styles.help}>The recipient must already have a SplitPatel account. Invitations expire after seven days.</Text>
          <TextInput accessibilityLabel="Member email" style={styles.input} value={inviteEmail}
            onChangeText={setInviteEmail} autoCapitalize="none" autoCorrect={false}
            keyboardType="email-address" placeholder="member@example.com" />
          <Button title={pending === 'invite' ? 'Sending...' : 'Send invitation'} disabled={!!pending || !inviteEmail.trim()}
            onPress={() => run('invite', () => inviteMemberCommand({
              tabId, email: inviteEmail.trim(), role: 'member', expectedRevision: tab.revision,
              idempotencyKey: createIdempotencyKey('invite-member'),
            }), () => setInviteEmail(''))} />
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.title}>Members</Text>
        {context.memberships.map(membership => (
          <View key={membership.userId} style={styles.member}>
            <View style={styles.flex}>
              <Text style={styles.memberName}>{memberName(membership.userId)}</Text>
              <Text style={styles.meta}>{membership.role} · {membership.userId === user.uid ? 'you' : membership.userId}</Text>
            </View>
            {canManage && membership.userId !== user.uid && membership.role !== 'owner' && tab.status === 'active'
              ? <Button title="Remove" color="#9b1c1c" disabled={!!pending} onPress={() => run('remove', () =>
                endTabMembershipCommand({ tabId, userId: membership.userId, expectedRevision: tab.revision,
                  idempotencyKey: createIdempotencyKey('remove-member') }))} />
              : null}
            {role === 'owner' && tab.status === 'active'
              && (membership.userId !== user.uid || (membership.role === 'owner' && tab.ownerIds.length > 1))
              ? <Button title={membership.role === 'owner' ? 'Make member' : membership.role === 'admin' ? 'Make owner' : 'Make admin'}
                disabled={!!pending} onPress={() => run('role', () => setMemberRoleCommand({
                  tabId, userId: membership.userId,
                  role: membership.role === 'owner' ? 'member' : membership.role === 'admin' ? 'owner' : 'admin',
                  expectedRevision: tab.revision, idempotencyKey: createIdempotencyKey('set-member-role'),
                }))} />
              : null}
          </View>
        ))}
      </View>

      {role === 'owner' ? (
        <View style={styles.section}>
          <Text style={styles.title}>{tab.status === 'archived' ? 'Restore tab' : 'Archive tab'}</Text>
          <Text style={styles.help}>{tab.status === 'archived'
            ? 'Restoring allows members to record new activity again.'
            : 'Archiving makes the tab read-only without deleting its history.'}</Text>
          <Button color={tab.status === 'archived' ? undefined : '#9b1c1c'}
            title={pending === 'archive' ? 'Updating...' : tab.status === 'archived' ? 'Restore tab' : 'Archive tab'}
            disabled={!!pending} onPress={() => run('archive', () => setTabArchivedCommand({
              tabId, archived: tab.status !== 'archived', expectedRevision: tab.revision,
              idempotencyKey: createIdempotencyKey(tab.status === 'archived' ? 'restore-tab' : 'archive-tab'),
            }))} />
        </View>
      ) : null}

      {tab.status === 'active' ? (
        <View style={styles.section}>
          <Text style={styles.title}>Leave tab</Text>
          <Text style={styles.help}>You can leave only with a zero balance. The final owner cannot leave.</Text>
          <Button title={pending === 'leave' ? 'Leaving...' : 'Leave tab'} color="#9b1c1c" disabled={!!pending}
            onPress={() => run('leave', () => endTabMembershipCommand({
              tabId, userId: user.uid, expectedRevision: tab.revision,
              idempotencyKey: createIdempotencyKey('leave-tab'),
            }), () => router.replace('/tabs'))} />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48 },
  heading: { fontSize: 25, fontWeight: '700' },
  title: { fontSize: 19, fontWeight: '700', marginBottom: 6 },
  meta: { color: '#666', marginTop: 3 },
  help: { color: '#555', lineHeight: 20, marginBottom: 10 },
  section: { borderTopColor: '#ddd', borderTopWidth: 1, marginTop: 24, paddingTop: 18 },
  input: { borderColor: '#888', borderRadius: 8, borderWidth: 1, minHeight: 44, marginBottom: 10, paddingHorizontal: 12 },
  member: { alignItems: 'center', borderBottomColor: '#eee', borderBottomWidth: 1, flexDirection: 'row', gap: 8, minHeight: 60, paddingVertical: 8 },
  flex: { flex: 1 },
  memberName: { fontSize: 16, fontWeight: '600' },
  error: { backgroundColor: '#fde8e8', color: '#9b1c1c', marginTop: 12, padding: 12 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  choice: { borderColor: '#777', borderRadius: 18, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 12, paddingVertical: 8 },
  selectedChoice: { backgroundColor: '#1867c0', borderColor: '#1867c0' },
  selectedChoiceText: { color: 'white', fontWeight: '600' },
  message: { padding: 24, textAlign: 'center' },
});
