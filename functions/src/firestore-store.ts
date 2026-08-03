import { createHash } from 'node:crypto';
import {
  DocumentData,
  DocumentReference,
  FieldValue,
  Firestore,
  Timestamp,
  Transaction,
} from 'firebase-admin/firestore';
import { ApplicationStore, AuditEvent, MutationRecord, StoreTransaction } from '../../src/application/ports/store';
import { Balance } from '../../src/domain/balances/balance';
import { Expense, ExpenseItem, MemberEffect } from '../../src/domain/expenses/types';
import { Settlement } from '../../src/domain/settlements/types';
import { Membership, TabAggregate } from '../../src/domain/tabs/types';
import { Invitation } from '../../src/domain/invitations/types';

type PendingWrite =
  | { kind: 'set'; reference: DocumentReference; data: DocumentData; merge?: boolean }
  | { kind: 'delete'; reference: DocumentReference };

const timestampFrom = (value: unknown): string => {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === 'string') return value;
  return new Date(0).toISOString();
};

const dateTimestamp = (value: string): Timestamp => Timestamp.fromDate(new Date(`${value}T00:00:00.000Z`));

const mutationDocumentId = (key: string): string => createHash('sha256').update(key).digest('hex');

class FirestoreStoreTransaction implements StoreTransaction {
  private readonly writes = new Map<string, PendingWrite>();
  private readonly loadedExpenseItems = new Map<string, Set<string>>();
  private readonly tabCurrencies = new Map<string, string>();

  constructor(
    private readonly firestore: Firestore,
    private readonly transaction: Transaction,
  ) {}

  async getTab(tabId: string): Promise<TabAggregate | null> {
    const snapshot = await this.transaction.get(this.firestore.doc(`tabs/${tabId}`));
    if (!snapshot.exists) return null;
    const data = snapshot.data()!;
    const tab = {
      id: snapshot.id,
      name: data.name,
      currency: data.currency,
      status: data.status,
      createdBy: data.createdBy,
      ownerIds: data.ownerIds,
      memberIds: data.memberIds,
      revision: data.revision,
    } satisfies TabAggregate;
    this.tabCurrencies.set(tab.id, tab.currency);
    return tab;
  }

  async putTab(tab: TabAggregate): Promise<void> {
    this.tabCurrencies.set(tab.id, tab.currency);
    const reference = this.firestore.doc(`tabs/${tab.id}`);
    this.set(reference, {
      name: tab.name,
      currency: tab.currency,
      status: tab.status,
      createdBy: tab.createdBy,
      ownerIds: tab.ownerIds,
      memberIds: tab.memberIds,
      memberCount: tab.memberIds.length,
      revision: tab.revision,
      updatedAt: FieldValue.serverTimestamp(),
      lastActivityAt: FieldValue.serverTimestamp(),
      createdAt: tab.revision === 1 ? FieldValue.serverTimestamp() : undefined,
      schemaVersion: 1,
    }, true);
  }

  async getMembership(tabId: string, userId: string): Promise<Membership | null> {
    const snapshot = await this.transaction.get(this.firestore.doc(`tabs/${tabId}/members/${userId}`));
    if (!snapshot.exists) return null;
    const data = snapshot.data()!;
    return {
      tabId,
      userId: data.userId,
      role: data.role,
      state: data.state,
      revision: data.revision,
    };
  }

  async putMembership(membership: Membership): Promise<void> {
    const reference = this.firestore.doc(`tabs/${membership.tabId}/members/${membership.userId}`);
    this.set(reference, {
      userId: membership.userId,
      role: membership.role,
      state: membership.state,
      revision: membership.revision,
      joinedAt: membership.revision === 1 ? FieldValue.serverTimestamp() : undefined,
      updatedAt: FieldValue.serverTimestamp(),
      endedAt: membership.state === 'active' ? null : FieldValue.serverTimestamp(),
      schemaVersion: 1,
    }, true);
  }

  async getInvitation(invitationId: string): Promise<Invitation | null> {
    const snapshot = await this.transaction.get(this.firestore.doc(`invitations/${invitationId}`));
    if (!snapshot.exists) return null;
    const data = snapshot.data()!;
    return {
      id: snapshot.id,
      tabId: data.tabId,
      tabName: data.tabName,
      inviterId: data.inviterUid,
      recipientUserId: data.recipientUid,
      role: data.role,
      state: data.state,
      expiresAt: timestampFrom(data.expiresAt),
      revision: data.revision,
    };
  }

  async putInvitation(invitation: Invitation): Promise<void> {
    this.set(this.firestore.doc(`invitations/${invitation.id}`), {
      tabId: invitation.tabId,
      tabName: invitation.tabName,
      inviterUid: invitation.inviterId,
      recipientUid: invitation.recipientUserId,
      role: invitation.role,
      state: invitation.state,
      expiresAt: Timestamp.fromDate(new Date(invitation.expiresAt)),
      revision: invitation.revision,
      createdAt: invitation.revision === 1 ? FieldValue.serverTimestamp() : undefined,
      updatedAt: FieldValue.serverTimestamp(),
      schemaVersion: 1,
    }, true);
  }

  async getExpense(tabId: string, expenseId: string): Promise<Expense | null> {
    const reference = this.firestore.doc(`tabs/${tabId}/expenses/${expenseId}`);
    const parent = await this.transaction.get(reference);
    if (!parent.exists) return null;
    const itemsSnapshot = await this.transaction.get(reference.collection('items').orderBy('position', 'asc'));
    const items = itemsSnapshot.docs.map(document => {
      const data = document.data();
      return {
        id: document.id,
        description: data.description,
        amountMinor: data.amountMinor,
        allocations: data.allocations,
      } satisfies ExpenseItem;
    });
    this.loadedExpenseItems.set(reference.path, new Set(items.map(item => item.id)));
    const data = parent.data()!;
    return {
      id: parent.id,
      tabId,
      description: data.description,
      currency: data.currency,
      totalMinor: data.totalMinor,
      contributions: data.contributions,
      items,
      expenseDate: timestampFrom(data.expenseDate).slice(0, 10),
      status: data.status,
      createdBy: data.createdBy,
      revision: data.revision,
      idempotencyKey: data.idempotencyKey,
    };
  }

  async putExpense(expense: Expense): Promise<void> {
    const reference = this.firestore.doc(`tabs/${expense.tabId}/expenses/${expense.id}`);
    const participantIds = [...new Set([
      ...expense.contributions.map(item => item.memberId),
      ...expense.items.flatMap(item => item.allocations.map(allocation => allocation.memberId)),
    ])].sort();
    this.set(reference, {
      description: expense.description,
      currency: expense.currency,
      totalMinor: expense.totalMinor,
      contributions: expense.contributions,
      participantIds,
      itemCount: expense.items.length,
      expenseDate: dateTimestamp(expense.expenseDate),
      status: expense.status,
      createdBy: expense.createdBy,
      revision: expense.revision,
      idempotencyKey: expense.idempotencyKey,
      createdAt: expense.revision === 1 ? FieldValue.serverTimestamp() : undefined,
      updatedAt: FieldValue.serverTimestamp(),
      voidedAt: expense.status === 'voided' ? FieldValue.serverTimestamp() : null,
      schemaVersion: 1,
    }, true);
    const nextIds = new Set<string>();
    expense.items.forEach((item, position) => {
      nextIds.add(item.id);
      this.set(reference.collection('items').doc(item.id), {
        description: item.description,
        amountMinor: item.amountMinor,
        position,
        allocations: item.allocations,
        schemaVersion: 1,
      });
    });
    for (const previousId of this.loadedExpenseItems.get(reference.path) ?? []) {
      if (!nextIds.has(previousId)) this.delete(reference.collection('items').doc(previousId));
    }
  }

  async getSettlement(tabId: string, settlementId: string): Promise<Settlement | null> {
    const snapshot = await this.transaction.get(this.firestore.doc(`tabs/${tabId}/settlements/${settlementId}`));
    if (!snapshot.exists) return null;
    const data = snapshot.data()!;
    return {
      id: snapshot.id,
      tabId,
      currency: data.currency,
      fromMemberId: data.fromMemberId,
      toMemberId: data.toMemberId,
      amountMinor: data.amountMinor,
      occurredAt: timestampFrom(data.occurredAt),
      method: data.method,
      note: data.note,
      status: data.status,
      createdBy: data.createdBy,
      revision: data.revision,
      idempotencyKey: data.idempotencyKey,
    };
  }

  async putSettlement(settlement: Settlement): Promise<void> {
    this.set(this.firestore.doc(`tabs/${settlement.tabId}/settlements/${settlement.id}`), {
      fromMemberId: settlement.fromMemberId,
      toMemberId: settlement.toMemberId,
      amountMinor: settlement.amountMinor,
      currency: settlement.currency,
      method: settlement.method ?? 'other',
      note: settlement.note ?? null,
      occurredAt: Timestamp.fromDate(new Date(settlement.occurredAt)),
      status: settlement.status,
      createdBy: settlement.createdBy,
      revision: settlement.revision,
      idempotencyKey: settlement.idempotencyKey,
      createdAt: settlement.revision === 1 ? FieldValue.serverTimestamp() : undefined,
      updatedAt: FieldValue.serverTimestamp(),
      voidedAt: settlement.status === 'voided' ? FieldValue.serverTimestamp() : null,
      schemaVersion: 1,
    }, true);
  }

  async hasFinancialActivity(tabId: string): Promise<boolean> {
    const tab = this.firestore.collection('tabs').doc(tabId);
    const [expenses, settlements] = await Promise.all([
      this.transaction.get(tab.collection('expenses').limit(1)),
      this.transaction.get(tab.collection('settlements').limit(1)),
    ]);
    return !expenses.empty || !settlements.empty;
  }

  async getMutation(scope: string, key: string): Promise<MutationRecord | null> {
    const snapshot = await this.transaction.get(this.mutationReference(scope, key));
    if (!snapshot.exists) return null;
    const data = snapshot.data()!;
    return {
      key: data.key,
      actorId: data.actorId,
      commandType: data.commandType,
      requestFingerprint: data.requestFingerprint,
      aggregateId: data.aggregateId,
      resultRevision: data.resultRevision,
      completedAt: timestampFrom(data.completedAt),
    };
  }

  async putMutation(scope: string, mutation: MutationRecord): Promise<void> {
    this.set(this.mutationReference(scope, mutation.key), {
      ...mutation,
      completedAt: FieldValue.serverTimestamp(),
      schemaVersion: 1,
    });
  }

  async applyBalanceEffects(tabId: string, effects: readonly MemberEffect[]): Promise<void> {
    const combined = new Map<string, number>();
    for (const effect of effects) {
      combined.set(effect.memberId, (combined.get(effect.memberId) ?? 0) + effect.amountMinor);
    }
    if ([...combined.values()].reduce((sum, amount) => sum + amount, 0) !== 0) {
      throw new Error('Balance effects must sum to zero.');
    }
    const references = [...combined.keys()].sort().map(memberId =>
      this.firestore.doc(`tabs/${tabId}/balances/${memberId}`));
    const snapshots = references.length > 0 ? await this.transaction.getAll(...references) : [];
    snapshots.forEach((snapshot, index) => {
      const memberId = references[index].id;
      const previous = snapshot.data();
      const netMinor = (previous?.netMinor ?? 0) + (combined.get(memberId) ?? 0);
      if (!Number.isSafeInteger(netMinor)) throw new Error('Balance exceeded the safe integer range.');
      if (netMinor === 0) {
        this.delete(references[index]);
        return;
      }
      this.set(references[index], {
        memberId,
        currency: previous?.currency ?? this.tabCurrencies.get(tabId),
        netMinor,
        sourceRevision: (previous?.sourceRevision ?? 0) + 1,
        updatedAt: FieldValue.serverTimestamp(),
        schemaVersion: 1,
      }, true);
    });
    this.set(this.firestore.doc(`tabs/${tabId}`), {
      lastActivityAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, true);
  }

  async appendAuditEvent(event: AuditEvent): Promise<void> {
    this.set(this.firestore.doc(`tabs/${event.tabId}/auditEvents/${event.id}`), {
      ...event,
      occurredAt: FieldValue.serverTimestamp(),
      schemaVersion: 1,
    });
  }

  async listBalances(tabId: string): Promise<Balance[]> {
    const snapshot = await this.transaction.get(this.firestore.collection(`tabs/${tabId}/balances`));
    return snapshot.docs.map(document => ({
      memberId: document.id,
      netMinor: document.data().netMinor,
    }));
  }

  flush(): void {
    for (const write of this.writes.values()) {
      if (write.kind === 'delete') this.transaction.delete(write.reference);
      else if (write.merge) this.transaction.set(write.reference, write.data, { merge: true });
      else this.transaction.set(write.reference, write.data);
    }
  }

  private mutationReference(scope: string, key: string): DocumentReference {
    if (scope.startsWith('account:')) {
      return this.firestore.doc(`users/${scope.slice('account:'.length)}/mutationKeys/${mutationDocumentId(key)}`);
    }
    return this.firestore.doc(`tabs/${scope}/mutationKeys/${mutationDocumentId(key)}`);
  }

  private set(reference: DocumentReference, data: DocumentData, merge = false): void {
    const clean = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
    this.writes.set(reference.path, { kind: 'set', reference, data: clean, merge });
  }

  private delete(reference: DocumentReference): void {
    this.writes.set(reference.path, { kind: 'delete', reference });
  }
}

export class FirestoreApplicationStore implements ApplicationStore {
  constructor(private readonly firestore: Firestore) {}

  transaction<T>(work: (transaction: StoreTransaction) => Promise<T>): Promise<T> {
    return this.firestore.runTransaction(async transaction => {
      const adapter = new FirestoreStoreTransaction(this.firestore, transaction);
      const result = await work(adapter);
      adapter.flush();
      return result;
    });
  }
}
