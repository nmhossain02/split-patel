import { CurrencyCode } from '../money/money';

export type Settlement = {
  id: string;
  tabId: string;
  currency: CurrencyCode;
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
  occurredAt: string;
  method?: 'cash' | 'bank' | 'venmo' | 'paypal' | 'cash_app' | 'other';
  note?: string | null;
  status: 'active' | 'voided';
  createdBy: string;
  revision: number;
  idempotencyKey: string;
};
