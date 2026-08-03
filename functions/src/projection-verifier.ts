import { FieldValue, Firestore, Timestamp } from 'firebase-admin/firestore';
import { calculateBalances } from '../../src/domain/balances/balance';
import { Expense } from '../../src/domain/expenses/types';
import { Settlement } from '../../src/domain/settlements/types';

const iso = (value: unknown): string => value instanceof Timestamp
  ? value.toDate().toISOString()
  : String(value ?? '');

export const verifyTabBalanceProjection = async (
  firestore: Firestore,
  tabId: string,
  currency: string,
  repair: boolean,
): Promise<{ mismatchCount: number; repaired: boolean }> => {
  const expenseDocuments = await firestore.collection(`tabs/${tabId}/expenses`).get();
  const expenses: Expense[] = await Promise.all(expenseDocuments.docs.map(async parent => {
    const data = parent.data();
    const itemDocuments = await parent.ref.collection('items').orderBy('position', 'asc').get();
    return {
      id: parent.id, tabId, description: data.description, currency: data.currency,
      totalMinor: data.totalMinor, contributions: data.contributions,
      items: itemDocuments.docs.map(item => ({
        id: item.id, description: item.data().description, amountMinor: item.data().amountMinor,
        allocations: item.data().allocations,
      })),
      expenseDate: iso(data.expenseDate).slice(0, 10), status: data.status,
      createdBy: data.createdBy, revision: data.revision, idempotencyKey: data.idempotencyKey,
    };
  }));
  const settlementDocuments = await firestore.collection(`tabs/${tabId}/settlements`).get();
  const settlements: Settlement[] = settlementDocuments.docs.map(document => {
    const data = document.data();
    return {
      id: document.id, tabId, currency: data.currency,
      fromMemberId: data.fromMemberId, toMemberId: data.toMemberId,
      amountMinor: data.amountMinor, occurredAt: iso(data.occurredAt),
      method: data.method, note: data.note, status: data.status,
      createdBy: data.createdBy, revision: data.revision, idempotencyKey: data.idempotencyKey,
    };
  });
  const expected = new Map(calculateBalances(tabId, currency, expenses, settlements)
    .map(balance => [balance.memberId, balance.netMinor]));
  const actualDocuments = await firestore.collection(`tabs/${tabId}/balances`).get();
  const actual = new Map(actualDocuments.docs.map(document => [document.id, document.data().netMinor as number]));
  const memberIds = new Set([...expected.keys(), ...actual.keys()]);
  const mismatches = [...memberIds].filter(memberId => (expected.get(memberId) ?? 0) !== (actual.get(memberId) ?? 0));
  if (mismatches.length === 0 || !repair) return { mismatchCount: mismatches.length, repaired: false };

  const batch = firestore.batch();
  actualDocuments.docs.forEach(document => batch.delete(document.ref));
  expected.forEach((netMinor, memberId) => batch.set(
    firestore.doc(`tabs/${tabId}/balances/${memberId}`),
    {
      memberId, currency, netMinor, sourceRevision: 1,
      updatedAt: Timestamp.now(), schemaVersion: 1,
    },
  ));
  await batch.commit();
  return { mismatchCount: mismatches.length, repaired: true };
};

export const verifyTabMembershipProjection = async (
  firestore: Firestore,
  tabId: string,
  repair: boolean,
): Promise<{ mismatchCount: number; repaired: boolean }> => {
  const [tab, memberships] = await Promise.all([
    firestore.doc(`tabs/${tabId}`).get(),
    firestore.collection(`tabs/${tabId}/members`).where('state', '==', 'active').get(),
  ]);
  if (!tab.exists) return { mismatchCount: 0, repaired: false };
  const expectedMemberIds = memberships.docs.map(document => document.id).sort();
  const expectedOwnerIds = memberships.docs
    .filter(document => document.data().role === 'owner').map(document => document.id).sort();
  const data = tab.data()!;
  const memberMismatch = JSON.stringify([...(data.memberIds ?? [])].sort()) !== JSON.stringify(expectedMemberIds);
  const ownerMismatch = JSON.stringify([...(data.ownerIds ?? [])].sort()) !== JSON.stringify(expectedOwnerIds);
  const countMismatch = data.memberCount !== expectedMemberIds.length;
  const mismatchCount = Number(memberMismatch) + Number(ownerMismatch) + Number(countMismatch);
  if (mismatchCount === 0 || !repair) return { mismatchCount, repaired: false };
  if (expectedOwnerIds.length === 0) return { mismatchCount, repaired: false };
  await tab.ref.update({
    memberIds: expectedMemberIds,
    ownerIds: expectedOwnerIds,
    memberCount: expectedMemberIds.length,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { mismatchCount, repaired: true };
};
