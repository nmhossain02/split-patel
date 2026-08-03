import { Expense } from '../expenses/types';
import { Settlement } from '../settlements/types';

// Deterministic valid defaults for domain and application tests.

export const makeExpense = (overrides: Partial<Expense> = {}): Expense => ({
  id: 'expense-1',
  tabId: 'tab-1',
  description: 'Shared expense',
  currency: 'USD',
  totalMinor: 6000,
  contributions: [{ memberId: 'alex', amountMinor: 6000 }],
  items: [{
    id: 'item-1',
    description: 'Shared item',
    amountMinor: 6000,
    allocations: [
      { memberId: 'alex', amountMinor: 2000 },
      { memberId: 'blair', amountMinor: 2000 },
      { memberId: 'casey', amountMinor: 2000 },
    ],
  }],
  expenseDate: '2026-08-02',
  status: 'active',
  createdBy: 'alex',
  revision: 1,
  idempotencyKey: 'create-expense-1',
  ...overrides,
});

export const makeSettlement = (overrides: Partial<Settlement> = {}): Settlement => ({
  id: 'settlement-1',
  tabId: 'tab-1',
  currency: 'USD',
  fromMemberId: 'blair',
  toMemberId: 'alex',
  amountMinor: 2000,
  occurredAt: '2026-08-03',
  status: 'active',
  createdBy: 'blair',
  revision: 1,
  idempotencyKey: 'create-settlement-1',
  ...overrides,
});
