import { applicationDefault, deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { ExpenseService } from '../../../src/application/expenses/expense-service';
import { TabService } from '../../../src/application/tabs/tab-service';
import { FirestoreApplicationStore } from '../firestore-store';
import { RandomIdGenerator, Sha256Fingerprinter, SystemClock } from '../runtime';
import { verifyTabBalanceProjection, verifyTabMembershipProjection } from '../projection-verifier';

const projectId = 'split-patel-backend-test';
const app = initializeApp({ credential: applicationDefault(), projectId }, `test-${Date.now()}`);
const firestore = getFirestore(app);
const dependencies = {
  store: new FirestoreApplicationStore(firestore),
  clock: new SystemClock(),
  ids: new RandomIdGenerator(),
  fingerprinter: new Sha256Fingerprinter(),
};
const tabs = new TabService(dependencies);
const expenses = new ExpenseService(dependencies);

afterAll(async () => {
  await deleteApp(app);
});

test('commits an idempotent shared expense and balanced projections atomically', async () => {
  const ownerId = `owner-${Date.now()}`;
  const memberId = `member-${Date.now()}`;
  const tab = await tabs.createTab({
    actorId: ownerId,
    name: 'Production trip',
    currency: 'USD',
    idempotencyKey: `create-tab-key-${Date.now()}`,
  });
  const withMember = await tabs.addMember({
    actorId: ownerId,
    tabId: tab.id,
    userId: memberId,
    role: 'member',
    expectedRevision: tab.revision,
    idempotencyKey: `add-member-key-${Date.now()}`,
  });
  expect(withMember.memberIds).toEqual([memberId, ownerId].sort());

  const idempotencyKey = `expense-command-key-${Date.now()}`;
  const command = {
    actorId: ownerId,
    tabId: tab.id,
    idempotencyKey,
    draft: {
      description: 'Shared dinner',
      currency: 'USD',
      totalMinor: 10_00,
      contributions: [{ memberId: ownerId, amountMinor: 10_00 }],
      items: [{
        id: 'dinner',
        description: 'Dinner',
        amountMinor: 10_00,
        allocations: [
          { memberId: ownerId, amountMinor: 5_00 },
          { memberId, amountMinor: 5_00 },
        ],
      }],
      expenseDate: '2026-08-02',
    },
  };

  const [first, retry] = await Promise.all([
    expenses.createExpense(command),
    expenses.createExpense(command),
  ]);
  expect(retry.id).toBe(first.id);

  const expense = await firestore.doc(`tabs/${tab.id}/expenses/${first.id}`).get();
  const item = await firestore.doc(`tabs/${tab.id}/expenses/${first.id}/items/dinner`).get();
  const ownerBalance = await firestore.doc(`tabs/${tab.id}/balances/${ownerId}`).get();
  const memberBalance = await firestore.doc(`tabs/${tab.id}/balances/${memberId}`).get();
  const mutations = await firestore.collection(`tabs/${tab.id}/mutationKeys`).get();
  const expenseAudits = await firestore.collection(`tabs/${tab.id}/auditEvents`)
    .where('action', '==', 'create_expense').get();

  expect(expense.data()).toMatchObject({ totalMinor: 10_00, itemCount: 1, revision: 1 });
  expect(item.data()).toMatchObject({ amountMinor: 10_00, position: 0 });
  expect(ownerBalance.data()).toMatchObject({ currency: 'USD', netMinor: 5_00, sourceRevision: 1 });
  expect(memberBalance.data()).toMatchObject({ currency: 'USD', netMinor: -5_00, sourceRevision: 1 });
  expect(mutations.size).toBe(2);
  expect(expenseAudits.size).toBe(1);

  await firestore.doc(`tabs/${tab.id}/balances/${memberId}`).update({ netMinor: -999 });
  await expect(verifyTabBalanceProjection(firestore, tab.id, 'USD', false)).resolves.toEqual({
    mismatchCount: 1, repaired: false,
  });
  await expect(verifyTabBalanceProjection(firestore, tab.id, 'USD', true)).resolves.toEqual({
    mismatchCount: 1, repaired: true,
  });
  expect((await firestore.doc(`tabs/${tab.id}/balances/${memberId}`).get()).data()?.netMinor).toBe(-5_00);

  const invitedId = `invited-${Date.now()}`;
  const invitation = await tabs.inviteMember({
    actorId: ownerId,
    tabId: tab.id,
    recipientUserId: invitedId,
    role: 'member',
    expectedRevision: withMember.revision,
    idempotencyKey: `invite-member-key-${Date.now()}`,
  });
  const accepted = await tabs.acceptInvitation({
    actorId: invitedId,
    invitationId: invitation.id,
    idempotencyKey: `accept-invitation-key-${Date.now()}`,
  });
  expect(accepted.memberIds).toContain(invitedId);
  expect((await firestore.doc(`invitations/${invitation.id}`).get()).data()).toMatchObject({
    state: 'accepted', recipientUid: invitedId, tabName: 'Production trip',
  });
  expect((await firestore.doc(`tabs/${tab.id}/members/${invitedId}`).get()).data()).toMatchObject({
    state: 'active', role: 'member',
  });

  await firestore.doc(`tabs/${tab.id}`).update({ memberIds: [ownerId], memberCount: 1 });
  await expect(verifyTabMembershipProjection(firestore, tab.id, false)).resolves.toEqual({
    mismatchCount: 2, repaired: false,
  });
  await expect(verifyTabMembershipProjection(firestore, tab.id, true)).resolves.toEqual({
    mismatchCount: 2, repaired: true,
  });
  expect((await firestore.doc(`tabs/${tab.id}`).get()).data()).toMatchObject({
    memberIds: [invitedId, memberId, ownerId].sort(), memberCount: 3, ownerIds: [ownerId],
  });
});

test('rolls back every financial write when validation fails', async () => {
  const ownerId = `rollback-owner-${Date.now()}`;
  const tab = await tabs.createTab({
    actorId: ownerId,
    name: 'Rollback',
    currency: 'USD',
    idempotencyKey: `rollback-tab-key-${Date.now()}`,
  });

  await expect(expenses.createExpense({
    actorId: ownerId,
    tabId: tab.id,
    idempotencyKey: `invalid-expense-key-${Date.now()}`,
    draft: {
      description: 'Invalid',
      currency: 'USD',
      totalMinor: 10_00,
      contributions: [{ memberId: ownerId, amountMinor: 10_00 }],
      items: [{
        id: 'invalid',
        description: 'Invalid split',
        amountMinor: 10_00,
        allocations: [{ memberId: ownerId, amountMinor: 9_00 }],
      }],
      expenseDate: '2026-08-02',
    },
  })).rejects.toThrow('Expense is invalid');

  expect((await firestore.collection(`tabs/${tab.id}/expenses`).get()).empty).toBe(true);
  expect((await firestore.collection(`tabs/${tab.id}/balances`).get()).empty).toBe(true);
  expect((await firestore.collection(`tabs/${tab.id}/mutationKeys`).get()).empty).toBe(true);
});

test('changes tab currency before financial activity and permanently locks it afterward', async () => {
  const ownerId = `currency-owner-${Date.now()}`;
  const tab = await tabs.createTab({
    actorId: ownerId,
    name: 'Currency boundary',
    currency: 'USD',
    idempotencyKey: `currency-tab-key-${Date.now()}`,
  });

  const changed = await tabs.changeCurrency({
    actorId: ownerId,
    tabId: tab.id,
    currency: 'CAD',
    expectedRevision: tab.revision,
    idempotencyKey: `change-currency-key-${Date.now()}`,
  });
  expect(changed).toMatchObject({ currency: 'CAD', revision: 2 });
  expect((await firestore.doc(`tabs/${tab.id}`).get()).data()).toMatchObject({
    currency: 'CAD', revision: 2,
  });

  await expenses.createExpense({
    actorId: ownerId,
    tabId: tab.id,
    idempotencyKey: `currency-expense-key-${Date.now()}`,
    draft: {
      description: 'Locks currency',
      currency: 'CAD',
      totalMinor: 100,
      contributions: [{ memberId: ownerId, amountMinor: 100 }],
      items: [{
        id: 'currency-item', description: 'Item', amountMinor: 100,
        allocations: [{ memberId: ownerId, amountMinor: 100 }],
      }],
      expenseDate: '2026-08-02',
    },
  });

  await expect(tabs.changeCurrency({
    actorId: ownerId,
    tabId: tab.id,
    currency: 'EUR',
    expectedRevision: changed.revision,
    idempotencyKey: `blocked-currency-key-${Date.now()}`,
  })).rejects.toThrow('Cannot change tab currency');
  expect((await firestore.doc(`tabs/${tab.id}`).get()).data()?.currency).toBe('CAD');
});
