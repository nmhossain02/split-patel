import { Contribution } from '../expenses/types';

export type ExpenseSummary = {
  id: string;
  tabId: string;
  description: string;
  currency: string;
  totalMinor: number;
  contributions: Contribution[];
  participantIds: string[];
  itemCount: number;
  expenseDate: string;
  status: 'active' | 'voided';
  createdBy: string;
  revision: number;
};

export type SettlementSummary = {
  id: string;
  tabId: string;
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
  currency: string;
  occurredAt: string;
  method: string;
  note: string | null;
  status: 'active' | 'voided';
  createdBy: string;
  revision: number;
};
