import { CurrencyCode } from '../money/money';

export type Contribution = {
  memberId: string;
  amountMinor: number;
};

export type Allocation = {
  memberId: string;
  amountMinor: number;
};

export type ExpenseItem = {
  id: string;
  description: string;
  amountMinor: number;
  allocations: Allocation[];
};

export type Expense = {
  id: string;
  tabId: string;
  description: string;
  currency: CurrencyCode;
  totalMinor: number;
  contributions: Contribution[];
  items: ExpenseItem[];
  expenseDate: string;
  status: 'active' | 'voided';
  createdBy: string;
  revision: number;
  idempotencyKey: string;
};

export type MemberEffect = {
  memberId: string;
  amountMinor: number;
};
