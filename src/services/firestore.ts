import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import { Balance } from '@/domain/balances/balance';
import { ExpenseSummary, SettlementSummary } from '@/domain/history/types';
import { Expense } from '@/domain/expenses/types';
import { Settlement } from '@/domain/settlements/types';
import { Invitation } from '@/domain/invitations/types';
import { Membership, PublicProfile, SnapshotMetadata, SubscriptionErrorHandler, TabSummary, Unsubscribe } from '@/domain/tabs/types';

const timestampToIso = (value: unknown): string | null => {
  if (value && typeof (value as FirebaseFirestoreTypes.Timestamp).toDate === 'function') {
    return (value as FirebaseFirestoreTypes.Timestamp).toDate().toISOString();
  }
  return null;
};

const mapTab = (document: FirebaseFirestoreTypes.DocumentSnapshot): TabSummary => {
  const data = document.data()!;
  return {
    id: document.id,
    name: data.name,
    currency: data.currency,
    status: data.status,
    createdBy: data.createdBy,
    ownerIds: data.ownerIds,
    memberIds: data.memberIds,
    memberCount: data.memberCount,
    revision: data.revision,
    lastActivityAt: timestampToIso(data.lastActivityAt),
  };
};

const mapExpenseSummary = (tabId: string, document: FirebaseFirestoreTypes.DocumentSnapshot): ExpenseSummary => {
  const data = document.data()!;
  return {
    id: document.id, tabId, description: data.description, currency: data.currency,
    totalMinor: data.totalMinor, contributions: data.contributions, participantIds: data.participantIds,
    itemCount: data.itemCount, expenseDate: timestampToIso(data.expenseDate)?.slice(0, 10) ?? '',
    status: data.status, createdBy: data.createdBy, revision: data.revision,
  };
};

const mapSettlementSummary = (tabId: string, document: FirebaseFirestoreTypes.DocumentSnapshot): SettlementSummary => {
  const data = document.data()!;
  return {
    id: document.id, tabId, fromMemberId: data.fromMemberId, toMemberId: data.toMemberId,
    amountMinor: data.amountMinor, currency: data.currency, occurredAt: timestampToIso(data.occurredAt) ?? '',
    method: data.method ?? 'other', note: data.note ?? null, status: data.status,
    createdBy: data.createdBy, revision: data.revision,
  };
};

export const getTabs = (status: 'active' | 'archived' = 'active') => {
  const currentUser = auth().currentUser;
  if (!currentUser) throw new Error('User not authenticated');
  return firestore().collection('tabs')
    .where('memberIds', 'array-contains', currentUser.uid)
    .where('status', '==', status)
    .orderBy('lastActivityAt', 'desc')
    .orderBy(firestore.FieldPath.documentId(), 'desc')
    .limit(25);
};

export const subscribeToTabs = (
  onData: (tabs: TabSummary[], metadata: SnapshotMetadata) => void,
  onError?: SubscriptionErrorHandler,
  status: 'active' | 'archived' = 'active',
): Unsubscribe => getTabs(status).onSnapshot(
  { includeMetadataChanges: true },
  snapshot => onData(snapshot.docs.map(mapTab), { fromCache: snapshot.metadata.fromCache }),
  error => onError?.(error),
);

export const getMoreTabs = async (
  status: 'active' | 'archived',
  after: TabSummary,
): Promise<TabSummary[]> => {
  const currentUser = auth().currentUser;
  if (!currentUser || !after.lastActivityAt) return [];
  const snapshot = await firestore().collection('tabs')
    .where('memberIds', 'array-contains', currentUser.uid)
    .where('status', '==', status)
    .orderBy('lastActivityAt', 'desc')
    .orderBy(firestore.FieldPath.documentId(), 'desc')
    .startAfter(firestore.Timestamp.fromDate(new Date(after.lastActivityAt)), after.id)
    .limit(25).get();
  return snapshot.docs.map(mapTab);
};

export const getOwnTabBalances = async (tabs: readonly TabSummary[]): Promise<Map<string, number>> => {
  const currentUser = auth().currentUser;
  if (!currentUser) throw new Error('User not authenticated');
  const balances = new Map<string, number>();
  for (let offset = 0; offset < tabs.length; offset += 25) {
    const page = tabs.slice(offset, offset + 25);
    const documents = await Promise.all(page.map(tab =>
      firestore().doc(`tabs/${tab.id}/balances/${currentUser.uid}`).get()));
    page.forEach((tab, index) => balances.set(
      tab.id,
      documents[index].exists() ? documents[index].data()?.netMinor ?? 0 : 0,
    ));
  }
  return balances;
};

export const subscribeToTab = (
  tabId: string,
  onData: (tab: TabSummary | null) => void,
  onError?: SubscriptionErrorHandler,
): Unsubscribe => firestore().doc(`tabs/${tabId}`).onSnapshot(
  snapshot => onData(snapshot.exists() ? mapTab(snapshot) : null),
  error => onError?.(error),
);

export const subscribeToMemberships = (
  tabId: string,
  onData: (memberships: Membership[]) => void,
  onError?: SubscriptionErrorHandler,
): Unsubscribe => firestore().collection(`tabs/${tabId}/members`)
  .where('state', '==', 'active').onSnapshot(
    snapshot => onData(snapshot.docs.map(document => ({
      tabId,
      userId: document.id,
      role: document.data().role,
      state: document.data().state,
      revision: document.data().revision,
    }))),
    error => onError?.(error),
  );

export const subscribeToBalances = (
  tabId: string,
  onData: (balances: Balance[]) => void,
  onError?: SubscriptionErrorHandler,
): Unsubscribe => firestore().collection(`tabs/${tabId}/balances`).onSnapshot(
  snapshot => onData(snapshot.docs.map(document => ({
    memberId: document.id,
    netMinor: document.data().netMinor,
  }))),
  error => onError?.(error),
);

export const subscribeToExpenses = (
  tabId: string,
  onData: (expenses: ExpenseSummary[], metadata: SnapshotMetadata) => void,
  onError?: SubscriptionErrorHandler,
): Unsubscribe => firestore().collection(`tabs/${tabId}/expenses`)
  .orderBy('expenseDate', 'desc').orderBy(firestore.FieldPath.documentId(), 'desc').limit(25).onSnapshot(
    { includeMetadataChanges: true },
    snapshot => onData(snapshot.docs.map(document => mapExpenseSummary(tabId, document)), {
      fromCache: snapshot.metadata.fromCache,
    }),
    error => onError?.(error),
  );

export const subscribeToSettlements = (
  tabId: string,
  onData: (settlements: SettlementSummary[], metadata: SnapshotMetadata) => void,
  onError?: SubscriptionErrorHandler,
): Unsubscribe => firestore().collection(`tabs/${tabId}/settlements`)
  .orderBy('occurredAt', 'desc').orderBy(firestore.FieldPath.documentId(), 'desc').limit(25).onSnapshot(
    { includeMetadataChanges: true },
    snapshot => onData(snapshot.docs.map(document => mapSettlementSummary(tabId, document)), {
      fromCache: snapshot.metadata.fromCache,
    }),
    error => onError?.(error),
  );

export const getMoreExpenses = async (
  tabId: string,
  after: ExpenseSummary,
): Promise<ExpenseSummary[]> => {
  const snapshot = await firestore().collection(`tabs/${tabId}/expenses`)
    .orderBy('expenseDate', 'desc').orderBy(firestore.FieldPath.documentId(), 'desc')
    .startAfter(firestore.Timestamp.fromDate(new Date(`${after.expenseDate}T00:00:00.000Z`)), after.id)
    .limit(25).get();
  return snapshot.docs.map(document => mapExpenseSummary(tabId, document));
};

export const getMoreSettlements = async (
  tabId: string,
  after: SettlementSummary,
): Promise<SettlementSummary[]> => {
  const snapshot = await firestore().collection(`tabs/${tabId}/settlements`)
    .orderBy('occurredAt', 'desc').orderBy(firestore.FieldPath.documentId(), 'desc')
    .startAfter(firestore.Timestamp.fromDate(new Date(after.occurredAt)), after.id)
    .limit(25).get();
  return snapshot.docs.map(document => mapSettlementSummary(tabId, document));
};

export const getExpenseDetail = async (tabId: string, expenseId: string): Promise<Expense | null> => {
  const reference = firestore().doc(`tabs/${tabId}/expenses/${expenseId}`);
  const [parent, itemsSnapshot] = await Promise.all([
    reference.get(),
    reference.collection('items').orderBy('position', 'asc').get(),
  ]);
  if (!parent.exists()) return null;
  const data = parent.data()!;
  return {
    id: parent.id,
    tabId,
    description: data.description,
    currency: data.currency,
    totalMinor: data.totalMinor,
    contributions: data.contributions,
    items: itemsSnapshot.docs.map(document => ({
      id: document.id,
      description: document.data().description,
      amountMinor: document.data().amountMinor,
      allocations: document.data().allocations,
    })),
    expenseDate: timestampToIso(data.expenseDate)?.slice(0, 10) ?? '',
    status: data.status,
    createdBy: data.createdBy,
    revision: data.revision,
    idempotencyKey: data.idempotencyKey,
  };
};

export const getSettlementDetail = async (tabId: string, settlementId: string): Promise<Settlement | null> => {
  const snapshot = await firestore().doc(`tabs/${tabId}/settlements/${settlementId}`).get();
  if (!snapshot.exists()) return null;
  const data = snapshot.data()!;
  return {
    id: snapshot.id, tabId, currency: data.currency,
    fromMemberId: data.fromMemberId, toMemberId: data.toMemberId,
    amountMinor: data.amountMinor, occurredAt: timestampToIso(data.occurredAt) ?? '',
    method: data.method ?? 'other', note: data.note ?? null, status: data.status,
    createdBy: data.createdBy, revision: data.revision, idempotencyKey: data.idempotencyKey,
  };
};

export const getProfiles = async (uids: string[]): Promise<PublicProfile[]> => {
  const uniqueIds = [...new Set(uids)].slice(0, 100);
  const documents = await Promise.all(uniqueIds.map(uid => firestore().doc(`profiles/${uid}`).get()));
  return documents.filter(document => document.exists()).map(document => ({
    id: document.id,
    displayName: document.data()?.displayName ?? 'SplitPatel user',
    photoURL: document.data()?.photoURL ?? null,
    status: document.data()?.status ?? 'active',
  }));
};

export const subscribeToInvitations = (
  onData: (invitations: Invitation[]) => void,
  onError?: SubscriptionErrorHandler,
): Unsubscribe => {
  const currentUser = auth().currentUser;
  if (!currentUser) throw new Error('User not authenticated');
  return firestore().collection('invitations')
    .where('recipientUid', '==', currentUser.uid)
    .where('state', '==', 'pending')
    .where('expiresAt', '>', firestore.Timestamp.now())
    .orderBy('expiresAt', 'asc')
    .onSnapshot(snapshot => onData(snapshot.docs.map(document => {
      const data = document.data();
      return {
        id: document.id, tabId: data.tabId, tabName: data.tabName, inviterId: data.inviterUid,
        recipientUserId: data.recipientUid, role: data.role, state: data.state,
        expiresAt: timestampToIso(data.expiresAt) ?? '', revision: data.revision,
      };
    })), error => onError?.(error));
};
