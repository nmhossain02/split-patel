import { Balance } from '@/domain/balances/balance';
import { Expense, MemberEffect } from '@/domain/expenses/types';
import { Settlement } from '@/domain/settlements/types';
import { Membership, TabAggregate } from '@/domain/tabs/types';
import { Invitation } from '@/domain/invitations/types';

export type MutationRecord = {
  key: string;
  actorId: string;
  commandType: string;
  requestFingerprint: string;
  aggregateId: string;
  resultRevision: number;
  completedAt: string;
};

export type AuditEvent = {
  id: string;
  tabId: string;
  actorId: string;
  action: string;
  aggregateId: string;
  previousRevision: number | null;
  nextRevision: number;
  occurredAt: string;
  correlationId: string;
};

export interface StoreTransaction {
  getTab(tabId: string): Promise<TabAggregate | null>;
  putTab(tab: TabAggregate): Promise<void>;
  getMembership(tabId: string, userId: string): Promise<Membership | null>;
  putMembership(membership: Membership): Promise<void>;
  getInvitation(invitationId: string): Promise<Invitation | null>;
  putInvitation(invitation: Invitation): Promise<void>;
  getExpense(tabId: string, expenseId: string): Promise<Expense | null>;
  putExpense(expense: Expense): Promise<void>;
  getSettlement(tabId: string, settlementId: string): Promise<Settlement | null>;
  putSettlement(settlement: Settlement): Promise<void>;
  hasFinancialActivity(tabId: string): Promise<boolean>;
  getMutation(tabId: string, key: string): Promise<MutationRecord | null>;
  putMutation(tabId: string, mutation: MutationRecord): Promise<void>;
  applyBalanceEffects(tabId: string, effects: readonly MemberEffect[]): Promise<void>;
  appendAuditEvent(event: AuditEvent): Promise<void>;
  listBalances(tabId: string): Promise<Balance[]>;
}

export interface ApplicationStore {
  transaction<T>(work: (transaction: StoreTransaction) => Promise<T>): Promise<T>;
}
