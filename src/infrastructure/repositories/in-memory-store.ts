import { ApplicationStore, AuditEvent, MutationRecord, StoreTransaction } from '@/application/ports/store';
import { Balance } from '@/domain/balances/balance';
import { Expense, MemberEffect } from '@/domain/expenses/types';
import { Settlement } from '@/domain/settlements/types';
import { DomainInvariantError } from '@/domain/shared/errors';
import { Membership, TabAggregate } from '@/domain/tabs/types';
import { Invitation } from '@/domain/invitations/types';

type StoreState = {
  tabs: Map<string, TabAggregate>;
  memberships: Map<string, Membership>;
  expenses: Map<string, Expense>;
  settlements: Map<string, Settlement>;
  mutations: Map<string, MutationRecord>;
  balances: Map<string, Balance>;
  audits: AuditEvent[];
  invitations: Map<string, Invitation>;
};

type InMemorySeed = {
  tabs?: TabAggregate[];
  memberships?: Membership[];
  expenses?: Expense[];
  settlements?: Settlement[];
  balances?: (Balance & { tabId: string })[];
  invitations?: Invitation[];
};

const membershipKey = (tabId: string, userId: string) => `${tabId}/${userId}`;
const aggregateKey = (tabId: string, aggregateId: string) => `${tabId}/${aggregateId}`;
const mutationKey = (tabId: string, key: string) => `${tabId}/${key}`;
const balanceKey = (tabId: string, userId: string) => `${tabId}/${userId}`;
const clone = <T>(value: T): T => structuredClone(value);

const cloneMap = <T>(source: Map<string, T>): Map<string, T> => new Map(
  [...source.entries()].map(([key, value]) => [key, clone(value)]),
);

const cloneState = (source: StoreState): StoreState => ({
  tabs: cloneMap(source.tabs),
  memberships: cloneMap(source.memberships),
  expenses: cloneMap(source.expenses),
  settlements: cloneMap(source.settlements),
  mutations: cloneMap(source.mutations),
  balances: cloneMap(source.balances),
  audits: clone(source.audits),
  invitations: cloneMap(source.invitations),
});

class InMemoryTransaction implements StoreTransaction {
  constructor(private readonly state: StoreState) {}

  async getTab(tabId: string): Promise<TabAggregate | null> {
    const value = this.state.tabs.get(tabId);
    return value ? clone(value) : null;
  }

  async putTab(tab: TabAggregate): Promise<void> {
    this.state.tabs.set(tab.id, clone(tab));
  }

  async getMembership(tabId: string, userId: string): Promise<Membership | null> {
    const value = this.state.memberships.get(membershipKey(tabId, userId));
    return value ? clone(value) : null;
  }

  async putMembership(membership: Membership): Promise<void> {
    this.state.memberships.set(
      membershipKey(membership.tabId, membership.userId),
      clone(membership),
    );
  }

  async getInvitation(invitationId: string): Promise<Invitation | null> {
    const value = this.state.invitations.get(invitationId);
    return value ? clone(value) : null;
  }

  async putInvitation(invitation: Invitation): Promise<void> {
    this.state.invitations.set(invitation.id, clone(invitation));
  }

  async getExpense(tabId: string, expenseId: string): Promise<Expense | null> {
    const value = this.state.expenses.get(aggregateKey(tabId, expenseId));
    return value ? clone(value) : null;
  }

  async putExpense(expense: Expense): Promise<void> {
    this.state.expenses.set(aggregateKey(expense.tabId, expense.id), clone(expense));
  }

  async getSettlement(tabId: string, settlementId: string): Promise<Settlement | null> {
    const value = this.state.settlements.get(aggregateKey(tabId, settlementId));
    return value ? clone(value) : null;
  }

  async putSettlement(settlement: Settlement): Promise<void> {
    this.state.settlements.set(aggregateKey(settlement.tabId, settlement.id), clone(settlement));
  }

  async hasFinancialActivity(tabId: string): Promise<boolean> {
    const prefix = `${tabId}/`;
    return [...this.state.expenses.keys(), ...this.state.settlements.keys()]
      .some(key => key.startsWith(prefix));
  }

  async getMutation(tabId: string, key: string): Promise<MutationRecord | null> {
    const value = this.state.mutations.get(mutationKey(tabId, key));
    return value ? clone(value) : null;
  }

  async putMutation(tabId: string, mutation: MutationRecord): Promise<void> {
    this.state.mutations.set(mutationKey(tabId, mutation.key), clone(mutation));
  }

  async applyBalanceEffects(tabId: string, effects: readonly MemberEffect[]): Promise<void> {
    const effectTotal = effects.reduce((sum, effect) => sum + effect.amountMinor, 0);
    if (effectTotal !== 0) {
      throw new DomainInvariantError(`Balance effect must sum to zero, received ${effectTotal}.`);
    }

    for (const effect of effects) {
      const key = balanceKey(tabId, effect.memberId);
      const current = this.state.balances.get(key)?.netMinor ?? 0;
      const next = current + effect.amountMinor;
      if (!Number.isSafeInteger(next)) {
        throw new DomainInvariantError('Balance exceeds the safe integer range.');
      }
      if (next === 0) this.state.balances.delete(key);
      else this.state.balances.set(key, { memberId: effect.memberId, netMinor: next });
    }

    const total = (await this.listBalances(tabId)).reduce((sum, balance) => sum + balance.netMinor, 0);
    if (total !== 0) throw new DomainInvariantError(`Stored balances must sum to zero, received ${total}.`);
  }

  async appendAuditEvent(event: AuditEvent): Promise<void> {
    this.state.audits.push(clone(event));
  }

  async listBalances(tabId: string): Promise<Balance[]> {
    return [...this.state.balances.entries()]
      .filter(([key]) => key.startsWith(`${tabId}/`))
      .map(([, balance]) => clone(balance))
      .sort((left, right) => left.memberId.localeCompare(right.memberId));
  }
}

export class InMemoryApplicationStore implements ApplicationStore {
  private state: StoreState;
  private transactionTail: Promise<void> = Promise.resolve();

  constructor(seed: InMemorySeed = {}) {
    this.state = {
      tabs: new Map((seed.tabs ?? []).map(tab => [tab.id, clone(tab)])),
      memberships: new Map((seed.memberships ?? []).map(item => [membershipKey(item.tabId, item.userId), clone(item)])),
      expenses: new Map((seed.expenses ?? []).map(item => [aggregateKey(item.tabId, item.id), clone(item)])),
      settlements: new Map((seed.settlements ?? []).map(item => [aggregateKey(item.tabId, item.id), clone(item)])),
      mutations: new Map(),
      balances: new Map((seed.balances ?? []).map(item => [
        balanceKey(item.tabId, item.memberId),
        { memberId: item.memberId, netMinor: item.netMinor },
      ])),
      audits: [],
      invitations: new Map((seed.invitations ?? []).map(item => [item.id, clone(item)])),
    };
  }

  async transaction<T>(work: (transaction: StoreTransaction) => Promise<T>): Promise<T> {
    const execute = async (): Promise<T> => {
      const candidate = cloneState(this.state);
      const result = await work(new InMemoryTransaction(candidate));
      this.state = candidate;
      return clone(result);
    };

    const result = this.transactionTail.then(execute, execute);
    this.transactionTail = result.then(() => undefined, () => undefined);
    return result;
  }

  async readBalances(tabId: string): Promise<Balance[]> {
    await this.transactionTail;
    return new InMemoryTransaction(cloneState(this.state)).listBalances(tabId);
  }

  async readTab(tabId: string): Promise<TabAggregate | null> {
    await this.transactionTail;
    return new InMemoryTransaction(cloneState(this.state)).getTab(tabId);
  }

  async readMembership(tabId: string, userId: string): Promise<Membership | null> {
    await this.transactionTail;
    return new InMemoryTransaction(cloneState(this.state)).getMembership(tabId, userId);
  }

  async readExpense(tabId: string, expenseId: string): Promise<Expense | null> {
    await this.transactionTail;
    return new InMemoryTransaction(cloneState(this.state)).getExpense(tabId, expenseId);
  }

  async readSettlement(tabId: string, settlementId: string): Promise<Settlement | null> {
    await this.transactionTail;
    return new InMemoryTransaction(cloneState(this.state)).getSettlement(tabId, settlementId);
  }

  async readAuditEvents(): Promise<AuditEvent[]> {
    await this.transactionTail;
    return clone(this.state.audits);
  }

  async readInvitation(invitationId: string): Promise<Invitation | null> {
    await this.transactionTail;
    return new InMemoryTransaction(cloneState(this.state)).getInvitation(invitationId);
  }

  async readMutation(tabId: string, key: string): Promise<MutationRecord | null> {
    await this.transactionTail;
    return new InMemoryTransaction(cloneState(this.state)).getMutation(tabId, key);
  }
}
