import { ExpenseService } from '../expenses/expense-service';
import { ExpenseDraft } from '../expenses/commands';
import { CanonicalJsonFingerprinter, FixedClock, SequenceIdGenerator } from '../ports/runtime';
import { InMemoryApplicationStore } from '@/infrastructure/repositories/in-memory-store';
import { createTabAggregate } from '@/domain/tabs/tab';
import { Membership } from '@/domain/tabs/types';
import { makeExpense } from '@/domain/testing/fixtures';

const expenseDraft = (overrides: Partial<ExpenseDraft> = {}): ExpenseDraft => {
  const expense = makeExpense();
  return {
    description: expense.description,
    currency: expense.currency,
    totalMinor: expense.totalMinor,
    contributions: expense.contributions,
    items: expense.items,
    expenseDate: expense.expenseDate,
    ...overrides,
  };
};

const setup = () => {
  const { tab, ownerMembership } = createTabAggregate({
    id: 'tab-1',
    name: 'Trip',
    currency: 'USD',
    actorId: 'alex',
  });
  const memberships: Membership[] = [
    ownerMembership,
    { tabId: tab.id, userId: 'blair', role: 'member', state: 'active', revision: 1 },
    { tabId: tab.id, userId: 'casey', role: 'member', state: 'active', revision: 1 },
  ];
  tab.memberIds = ['alex', 'blair', 'casey'];
  const store = new InMemoryApplicationStore({ tabs: [tab], memberships });
  const service = new ExpenseService({
    store,
    clock: new FixedClock('2026-08-02T12:00:00.000Z'),
    ids: new SequenceIdGenerator(),
    fingerprinter: new CanonicalJsonFingerprinter(),
  });
  return { service, store, tab };
};

describe('ExpenseService multi-user workflows', () => {
  it('creates an expense atomically and replays the same idempotent command', async () => {
    const { service, store } = setup();
    const command = {
      actorId: 'alex',
      tabId: 'tab-1',
      idempotencyKey: 'create-1',
      draft: expenseDraft(),
    };

    const created = await service.createExpense(command);
    const replayed = await service.createExpense(command);

    expect(replayed).toEqual(created);
    expect(await store.readBalances('tab-1')).toEqual([
      { memberId: 'alex', netMinor: 4000 },
      { memberId: 'blair', netMinor: -2000 },
      { memberId: 'casey', netMinor: -2000 },
    ]);
    expect(await store.readAuditEvents()).toHaveLength(1);
    expect(await store.readMutation('tab-1', 'create-1')).toEqual(expect.objectContaining({
      aggregateId: created.id,
      commandType: 'create_expense',
      resultRevision: 1,
    }));
  });

  it('serializes concurrent retries into one financial effect', async () => {
    const { service, store } = setup();
    const command = {
      actorId: 'alex',
      tabId: 'tab-1',
      idempotencyKey: 'concurrent-create',
      draft: expenseDraft(),
    };

    const [first, second] = await Promise.all([
      service.createExpense(command),
      service.createExpense(command),
    ]);

    expect(second).toEqual(first);
    expect(await store.readAuditEvents()).toHaveLength(1);
    expect(await store.readBalances('tab-1')).toEqual([
      { memberId: 'alex', netMinor: 4000 },
      { memberId: 'blair', netMinor: -2000 },
      { memberId: 'casey', netMinor: -2000 },
    ]);
  });

  it('rejects reuse of an idempotency key for changed content', async () => {
    const { service } = setup();
    const command = {
      actorId: 'alex',
      tabId: 'tab-1',
      idempotencyKey: 'create-1',
      draft: expenseDraft(),
    };
    await service.createExpense(command);

    await expect(service.createExpense({
      ...command,
      draft: { ...command.draft, description: 'Changed request' },
    })).rejects.toMatchObject({ code: 'idempotency_conflict' });
  });

  it('applies an edit delta once and rejects stale or unauthorized edits', async () => {
    const { service, store } = setup();
    const created = await service.createExpense({
      actorId: 'alex',
      tabId: 'tab-1',
      idempotencyKey: 'create-1',
      draft: expenseDraft(),
    });

    await expect(service.editExpense({
      actorId: 'blair',
      tabId: 'tab-1',
      expenseId: created.id,
      expectedRevision: 1,
      idempotencyKey: 'forbidden-edit',
      draft: expenseDraft(),
    })).rejects.toMatchObject({ code: 'forbidden' });

    const editedDraft = expenseDraft({
      items: [{
        id: 'item-1',
        description: 'Shared item',
        amountMinor: 6000,
        allocations: [
          { memberId: 'alex', amountMinor: 3000 },
          { memberId: 'blair', amountMinor: 2000 },
          { memberId: 'casey', amountMinor: 1000 },
        ],
      }],
    });
    const edited = await service.editExpense({
      actorId: 'alex',
      tabId: 'tab-1',
      expenseId: created.id,
      expectedRevision: 1,
      idempotencyKey: 'edit-1',
      draft: editedDraft,
    });
    expect(edited.revision).toBe(2);
    expect(await store.readBalances('tab-1')).toEqual([
      { memberId: 'alex', netMinor: 3000 },
      { memberId: 'blair', netMinor: -2000 },
      { memberId: 'casey', netMinor: -1000 },
    ]);

    await expect(service.editExpense({
      actorId: 'alex',
      tabId: 'tab-1',
      expenseId: created.id,
      expectedRevision: 1,
      idempotencyKey: 'stale-edit',
      draft: expenseDraft(),
    })).rejects.toMatchObject({ code: 'conflict' });
    expect(await store.readBalances('tab-1')).toEqual([
      { memberId: 'alex', netMinor: 3000 },
      { memberId: 'blair', netMinor: -2000 },
      { memberId: 'casey', netMinor: -1000 },
    ]);
  });

  it('records and voids a settlement without losing zero-sum consistency', async () => {
    const { service, store } = setup();
    await service.createExpense({
      actorId: 'alex',
      tabId: 'tab-1',
      idempotencyKey: 'create-1',
      draft: expenseDraft(),
    });

    const settlement = await service.createSettlement({
      actorId: 'blair',
      tabId: 'tab-1',
      idempotencyKey: 'settle-1',
      draft: {
        currency: 'USD',
        fromMemberId: 'blair',
        toMemberId: 'alex',
        amountMinor: 2000,
        occurredAt: '2026-08-03',
      },
    });
    expect(await store.readBalances('tab-1')).toEqual([
      { memberId: 'alex', netMinor: 2000 },
      { memberId: 'casey', netMinor: -2000 },
    ]);

    const voided = await service.voidSettlement({
      actorId: 'blair',
      tabId: 'tab-1',
      settlementId: settlement.id,
      expectedRevision: 1,
      idempotencyKey: 'void-settlement-1',
    });
    expect(voided.status).toBe('voided');
    expect(await store.readBalances('tab-1')).toEqual([
      { memberId: 'alex', netMinor: 4000 },
      { memberId: 'blair', netMinor: -2000 },
      { memberId: 'casey', netMinor: -2000 },
    ]);
  });

  it('voids an expense exactly once and rolls back invalid commands', async () => {
    const { service, store } = setup();

    await expect(service.createExpense({
      actorId: 'alex',
      tabId: 'tab-1',
      idempotencyKey: 'invalid-create',
      draft: expenseDraft({ totalMinor: 5999 }),
    })).rejects.toBeDefined();
    expect(await store.readBalances('tab-1')).toEqual([]);
    expect(await store.readMutation('tab-1', 'invalid-create')).toBeNull();

    const created = await service.createExpense({
      actorId: 'alex',
      tabId: 'tab-1',
      idempotencyKey: 'create-1',
      draft: expenseDraft(),
    });
    const command = {
      actorId: 'alex',
      tabId: 'tab-1',
      expenseId: created.id,
      expectedRevision: 1,
      idempotencyKey: 'void-1',
    };
    const first = await service.voidExpense(command);
    const retry = await service.voidExpense(command);

    expect(retry).toEqual(first);
    expect(await store.readBalances('tab-1')).toEqual([]);
    expect(await store.readAuditEvents()).toHaveLength(2);
  });

  it('rejects non-members, removed members, and archived tabs', async () => {
    const { service, tab } = setup();
    await expect(service.createExpense({
      actorId: 'outsider',
      tabId: 'tab-1',
      idempotencyKey: 'outsider-create',
      draft: expenseDraft(),
    })).rejects.toMatchObject({ code: 'forbidden' });

    const archivedStore = new InMemoryApplicationStore({
      tabs: [{ ...tab, status: 'archived' }],
      memberships: [{ tabId: tab.id, userId: 'alex', role: 'owner', state: 'active', revision: 1 }],
    });
    const archivedService = new ExpenseService({
      store: archivedStore,
      clock: new FixedClock('2026-08-02T12:00:00.000Z'),
      ids: new SequenceIdGenerator(),
      fingerprinter: new CanonicalJsonFingerprinter(),
    });
    await expect(archivedService.createExpense({
      actorId: 'alex',
      tabId: 'tab-1',
      idempotencyKey: 'archived-create',
      draft: expenseDraft(),
    })).rejects.toMatchObject({ code: 'forbidden' });
  });
});
