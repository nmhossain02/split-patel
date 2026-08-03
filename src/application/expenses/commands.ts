import { Contribution, Expense, ExpenseItem } from '@/domain/expenses/types';
import { Settlement } from '@/domain/settlements/types';

export type ExpenseDraft = Pick<
  Expense,
  'description' | 'currency' | 'totalMinor' | 'contributions' | 'items' | 'expenseDate'
>;

export type CreateExpenseCommand = {
  actorId: string;
  tabId: string;
  idempotencyKey: string;
  draft: ExpenseDraft;
};

export type EditExpenseCommand = CreateExpenseCommand & {
  expenseId: string;
  expectedRevision: number;
};

export type VoidExpenseCommand = {
  actorId: string;
  tabId: string;
  expenseId: string;
  expectedRevision: number;
  idempotencyKey: string;
};

export type SettlementDraft = Pick<
  Settlement,
  'currency' | 'fromMemberId' | 'toMemberId' | 'amountMinor' | 'occurredAt' | 'method' | 'note'
>;

export type CreateSettlementCommand = {
  actorId: string;
  tabId: string;
  idempotencyKey: string;
  draft: SettlementDraft;
};

export type VoidSettlementCommand = {
  actorId: string;
  tabId: string;
  settlementId: string;
  expectedRevision: number;
  idempotencyKey: string;
};

export type EditableExpenseFields = {
  description: string;
  currency: string;
  totalMinor: number;
  contributions: Contribution[];
  items: ExpenseItem[];
  expenseDate: string;
};
