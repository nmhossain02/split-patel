import { ExpenseDraft } from '@/application/expenses/commands';
import { assertValidExpense } from '@/domain/expenses/expense';
import { allocateEqual, allocatePercentages, allocateWeighted } from '@/domain/money/allocation';
import { parseMajorAmount, sumMinorAmounts } from '@/domain/money/money';
import { DomainValidationError } from '@/domain/shared/errors';

export type ExpenseLineInput = {
  id: string;
  description: string;
  amount: string;
  participantIds: string[];
  allocationMode?: 'equal' | 'exact' | 'percentage' | 'weighted';
  shares?: Record<string, string>;
};

export type ExpenseContributionInput = {
  memberId: string;
  amount: string;
};

export type ExpenseFormInput = {
  description: string;
  currency: string;
  expenseDate: string;
  contributions: ExpenseContributionInput[];
  items: ExpenseLineInput[];
  activeMemberIds: string[];
};

const parseBasisPoints = (value: string): number => {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new DomainValidationError('Invalid percentage.', [{
    path: 'percentage', code: 'invalid_format', message: 'Enter a percentage with at most two decimal places.',
  }]);
  const basisPoints = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  if (basisPoints <= 0 || basisPoints > 10_000) throw new DomainValidationError('Invalid percentage.', [{
    path: 'percentage', code: 'invalid_weight', message: 'Percentage must be greater than 0 and no more than 100.',
  }]);
  return basisPoints;
};

const allocationFor = (item: ExpenseLineInput, amountMinor: number, currency: string) => {
  const mode = item.allocationMode ?? 'equal';
  if (mode === 'equal') return allocateEqual(amountMinor, item.participantIds);
  if (mode === 'exact') return item.participantIds.map(memberId => ({
    memberId,
    amountMinor: parseMajorAmount(item.shares?.[memberId] ?? '', currency),
  }));
  const weighted = item.participantIds.map(memberId => {
    const raw = item.shares?.[memberId] ?? '';
    const weight = mode === 'percentage' ? parseBasisPoints(raw) : Number(raw.trim());
    if (mode === 'weighted' && (!Number.isSafeInteger(weight) || weight <= 0)) {
      throw new DomainValidationError('Invalid weight.', [{
        path: 'weight', code: 'invalid_weight', message: 'Weights must be positive whole numbers.',
      }]);
    }
    return { memberId, weight };
  });
  return mode === 'percentage'
    ? allocatePercentages(amountMinor, weighted)
    : allocateWeighted(amountMinor, weighted);
};

export const buildExpenseDraft = (input: ExpenseFormInput): ExpenseDraft => {
  const items = input.items.map(item => {
    const amountMinor = parseMajorAmount(item.amount, input.currency);
    return {
      id: item.id,
      description: item.description,
      amountMinor,
      allocations: allocationFor(item, amountMinor, input.currency),
    };
  });
  const contributions = input.contributions
    .filter(contribution => contribution.amount.trim() && contribution.amount.trim() !== '0')
    .map(contribution => ({
      memberId: contribution.memberId,
      amountMinor: parseMajorAmount(contribution.amount, input.currency),
    }));
  const totalMinor = sumMinorAmounts(items.map(item => item.amountMinor));
  const draft: ExpenseDraft = {
    description: input.description,
    currency: input.currency,
    totalMinor,
    contributions,
    items,
    expenseDate: input.expenseDate,
  };
  assertValidExpense({
    id: 'form-validation',
    tabId: 'form-tab',
    ...draft,
    status: 'active',
    createdBy: 'form-actor',
    revision: 1,
    idempotencyKey: 'form-validation-key',
  }, new Set(input.activeMemberIds));
  return draft;
};
