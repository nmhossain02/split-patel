import {
  collection,
  doc,
  DocumentData,
  DocumentSnapshot,
  documentId,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  Timestamp,
  where,
} from 'firebase/firestore';
import { Balance } from '@/domain/balances/balance';
import { ExpenseSummary, SettlementSummary } from '@/domain/history/types';
import { Expense } from '@/domain/expenses/types';
import { Settlement } from '@/domain/settlements/types';
import { Invitation } from '@/domain/invitations/types';
import { Membership, PublicProfile, SnapshotMetadata, SubscriptionErrorHandler, TabSummary, Unsubscribe } from '@/domain/tabs/types';
import { auth, db } from './firebase.web';

const timestampToIso = (value: unknown): string | null => value instanceof Timestamp
  ? value.toDate().toISOString()
  : null;

const mapTab = (document: DocumentSnapshot<DocumentData>): TabSummary => {
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

const mapExpenseSummary = (tabId: string, document: DocumentSnapshot<DocumentData>): ExpenseSummary => {
  const data = document.data()!;
  return {
    id: document.id, tabId, description: data.description, currency: data.currency,
    totalMinor: data.totalMinor, contributions: data.contributions, participantIds: data.participantIds,
    itemCount: data.itemCount, expenseDate: timestampToIso(data.expenseDate)?.slice(0, 10) ?? '',
    status: data.status, createdBy: data.createdBy, revision: data.revision,
  };
};

const mapSettlementSummary = (tabId: string, document: DocumentSnapshot<DocumentData>): SettlementSummary => {
  const data = document.data()!;
  return {
    id: document.id, tabId, fromMemberId: data.fromMemberId, toMemberId: data.toMemberId,
    amountMinor: data.amountMinor, currency: data.currency, occurredAt: timestampToIso(data.occurredAt) ?? '',
    method: data.method ?? 'other', note: data.note ?? null, status: data.status,
    createdBy: data.createdBy, revision: data.revision,
  };
};

export const getTabs = (status: 'active' | 'archived' = 'active') => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('User not authenticated');
  return query(
    collection(db, 'tabs'),
    where('memberIds', 'array-contains', currentUser.uid),
    where('status', '==', status),
    orderBy('lastActivityAt', 'desc'),
    orderBy(documentId(), 'desc'),
    limit(25),
  );
};

export const subscribeToTabs = (
  onData: (tabs: TabSummary[], metadata: SnapshotMetadata) => void,
  onError?: SubscriptionErrorHandler,
  status: 'active' | 'archived' = 'active',
): Unsubscribe => onSnapshot(getTabs(status), { includeMetadataChanges: true },
  snapshot => onData(snapshot.docs.map(mapTab), { fromCache: snapshot.metadata.fromCache }),
  error => onError?.(error),
);

export const getMoreTabs = async (
  status: 'active' | 'archived',
  after: TabSummary,
): Promise<TabSummary[]> => {
  const currentUser = auth.currentUser;
  if (!currentUser || !after.lastActivityAt) return [];
  const snapshot = await getDocs(query(
    collection(db, 'tabs'),
    where('memberIds', 'array-contains', currentUser.uid),
    where('status', '==', status),
    orderBy('lastActivityAt', 'desc'),
    orderBy(documentId(), 'desc'),
    startAfter(Timestamp.fromDate(new Date(after.lastActivityAt)), after.id),
    limit(25),
  ));
  return snapshot.docs.map(mapTab);
};

export const getOwnTabBalances = async (tabs: readonly TabSummary[]): Promise<Map<string, number>> => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('User not authenticated');
  const balances = new Map<string, number>();
  for (let offset = 0; offset < tabs.length; offset += 25) {
    const page = tabs.slice(offset, offset + 25);
    const documents = await Promise.all(page.map(tab =>
      getDoc(doc(db, 'tabs', tab.id, 'balances', currentUser.uid))));
    page.forEach((tab, index) => balances.set(
      tab.id,
      documents[index].exists() ? documents[index].data().netMinor : 0,
    ));
  }
  return balances;
};

export const subscribeToTab = (
  tabId: string,
  onData: (tab: TabSummary | null) => void,
  onError?: SubscriptionErrorHandler,
): Unsubscribe => onSnapshot(doc(db, 'tabs', tabId),
  snapshot => onData(snapshot.exists() ? mapTab(snapshot) : null),
  error => onError?.(error),
);

export const subscribeToMemberships = (
  tabId: string,
  onData: (memberships: Membership[]) => void,
  onError?: SubscriptionErrorHandler,
): Unsubscribe => onSnapshot(query(
  collection(db, 'tabs', tabId, 'members'), where('state', '==', 'active'),
), snapshot => onData(snapshot.docs.map(document => ({
  tabId,
  userId: document.id,
  role: document.data().role,
  state: document.data().state,
  revision: document.data().revision,
}))), error => onError?.(error));

export const subscribeToBalances = (
  tabId: string,
  onData: (balances: Balance[]) => void,
  onError?: SubscriptionErrorHandler,
): Unsubscribe => onSnapshot(collection(db, 'tabs', tabId, 'balances'),
  snapshot => onData(snapshot.docs.map(document => ({
    memberId: document.id,
    netMinor: document.data().netMinor,
  }))), error => onError?.(error));

export const subscribeToExpenses = (
  tabId: string,
  onData: (expenses: ExpenseSummary[], metadata: SnapshotMetadata) => void,
  onError?: SubscriptionErrorHandler,
): Unsubscribe => onSnapshot(query(
  collection(db, 'tabs', tabId, 'expenses'), orderBy('expenseDate', 'desc'), orderBy(documentId(), 'desc'), limit(25),
), { includeMetadataChanges: true }, snapshot => onData(
  snapshot.docs.map(document => mapExpenseSummary(tabId, document)),
  { fromCache: snapshot.metadata.fromCache },
), error => onError?.(error));

export const subscribeToSettlements = (
  tabId: string,
  onData: (settlements: SettlementSummary[], metadata: SnapshotMetadata) => void,
  onError?: SubscriptionErrorHandler,
): Unsubscribe => onSnapshot(query(
  collection(db, 'tabs', tabId, 'settlements'), orderBy('occurredAt', 'desc'), orderBy(documentId(), 'desc'), limit(25),
), { includeMetadataChanges: true }, snapshot => onData(
  snapshot.docs.map(document => mapSettlementSummary(tabId, document)),
  { fromCache: snapshot.metadata.fromCache },
), error => onError?.(error));

export const getMoreExpenses = async (tabId: string, after: ExpenseSummary): Promise<ExpenseSummary[]> => {
  const snapshot = await getDocs(query(
    collection(db, 'tabs', tabId, 'expenses'), orderBy('expenseDate', 'desc'), orderBy(documentId(), 'desc'),
    startAfter(Timestamp.fromDate(new Date(`${after.expenseDate}T00:00:00.000Z`)), after.id), limit(25),
  ));
  return snapshot.docs.map(document => mapExpenseSummary(tabId, document));
};

export const getMoreSettlements = async (tabId: string, after: SettlementSummary): Promise<SettlementSummary[]> => {
  const snapshot = await getDocs(query(
    collection(db, 'tabs', tabId, 'settlements'), orderBy('occurredAt', 'desc'), orderBy(documentId(), 'desc'),
    startAfter(Timestamp.fromDate(new Date(after.occurredAt)), after.id), limit(25),
  ));
  return snapshot.docs.map(document => mapSettlementSummary(tabId, document));
};

export const getProfiles = async (uids: string[]): Promise<PublicProfile[]> => {
  const uniqueIds = [...new Set(uids)].slice(0, 100);
  const documents = await Promise.all(uniqueIds.map(uid => getDoc(doc(db, 'profiles', uid))));
  return documents.filter(document => document.exists()).map(document => ({
    id: document.id,
    displayName: document.data()?.displayName ?? 'SplitPatel user',
    photoURL: document.data()?.photoURL ?? null,
    status: document.data()?.status ?? 'active',
  }));
};

export const getExpenseDetail = async (tabId: string, expenseId: string): Promise<Expense | null> => {
  const reference = doc(db, 'tabs', tabId, 'expenses', expenseId);
  const [parent, itemDocuments] = await Promise.all([
    getDoc(reference),
    getDocs(query(collection(reference, 'items'), orderBy('position', 'asc'))),
  ]);
  if (!parent.exists()) return null;
  const data = parent.data();
  return {
    id: parent.id, tabId, description: data.description, currency: data.currency,
    totalMinor: data.totalMinor, contributions: data.contributions,
    items: itemDocuments.docs.map(document => ({
      id: document.id, description: document.data().description,
      amountMinor: document.data().amountMinor, allocations: document.data().allocations,
    })),
    expenseDate: timestampToIso(data.expenseDate)?.slice(0, 10) ?? '',
    status: data.status, createdBy: data.createdBy, revision: data.revision,
    idempotencyKey: data.idempotencyKey,
  };
};

export const getSettlementDetail = async (tabId: string, settlementId: string): Promise<Settlement | null> => {
  const snapshot = await getDoc(doc(db, 'tabs', tabId, 'settlements', settlementId));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return {
    id: snapshot.id, tabId, currency: data.currency,
    fromMemberId: data.fromMemberId, toMemberId: data.toMemberId,
    amountMinor: data.amountMinor, occurredAt: timestampToIso(data.occurredAt) ?? '',
    method: data.method ?? 'other', note: data.note ?? null, status: data.status,
    createdBy: data.createdBy, revision: data.revision, idempotencyKey: data.idempotencyKey,
  };
};

export const subscribeToInvitations = (
  onData: (invitations: Invitation[]) => void,
  onError?: SubscriptionErrorHandler,
): Unsubscribe => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('User not authenticated');
  return onSnapshot(query(
    collection(db, 'invitations'),
    where('recipientUid', '==', currentUser.uid),
    where('state', '==', 'pending'),
    where('expiresAt', '>', Timestamp.now()),
    orderBy('expiresAt', 'asc'),
  ), snapshot => onData(snapshot.docs.map(document => {
    const data = document.data();
    return {
      id: document.id, tabId: data.tabId, tabName: data.tabName, inviterId: data.inviterUid,
      recipientUserId: data.recipientUid, role: data.role, state: data.state,
      expiresAt: timestampToIso(data.expiresAt) ?? '', revision: data.revision,
    };
  })), error => onError?.(error));
};
