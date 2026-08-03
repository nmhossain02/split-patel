import { Expense } from '../expenses/types';
import { calculateExpenseEffects } from '../expenses/expense';
import { Settlement } from '../settlements/types';
import { calculateSettlementEffects } from '../settlements/settlement';
import { DomainInvariantError, DomainValidationError } from '../shared/errors';
import { sumMinorAmounts, validateMinorAmount } from '../money/money';

export type Balance = {
  memberId: string;
  netMinor: number;
};

export type PaymentSuggestion = {
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
};

export const calculateBalances = (
  tabId: string,
  currency: string,
  expenses: readonly Expense[],
  settlements: readonly Settlement[],
): Balance[] => {
  const balances = new Map<string, number>();

  for (const expense of expenses) {
    if (expense.tabId !== tabId || expense.currency !== currency) {
      throw new DomainValidationError('Expense does not belong to the balance scope.', [{
        path: 'expenses',
        code: 'scope_mismatch',
        message: 'Every expense must match the requested tab and currency.',
      }]);
    }
    for (const effect of calculateExpenseEffects(expense)) {
      balances.set(effect.memberId, sumMinorAmounts([
        balances.get(effect.memberId) ?? 0,
        effect.amountMinor,
      ]));
    }
  }

  for (const settlement of settlements) {
    if (settlement.tabId !== tabId || settlement.currency !== currency) {
      throw new DomainValidationError('Settlement does not belong to the balance scope.', [{
        path: 'settlements',
        code: 'scope_mismatch',
        message: 'Every settlement must match the requested tab and currency.',
      }]);
    }
    for (const effect of calculateSettlementEffects(settlement)) {
      balances.set(effect.memberId, sumMinorAmounts([
        balances.get(effect.memberId) ?? 0,
        effect.amountMinor,
      ]));
    }
  }

  const result = [...balances.entries()]
    .map(([memberId, netMinor]) => ({ memberId, netMinor }))
    .filter(balance => balance.netMinor !== 0)
    .sort((left, right) => left.memberId.localeCompare(right.memberId));

  const total = result.reduce((sum, balance) => sum + BigInt(balance.netMinor), 0n);
  if (total !== 0n) {
    throw new DomainInvariantError(`Balance total must equal zero, received ${total}.`);
  }
  return result;
};

export const suggestPayments = (balances: readonly Balance[]): PaymentSuggestion[] => {
  const memberIds = new Set<string>();
  for (const [index, balance] of balances.entries()) {
    if (!balance.memberId.trim() || memberIds.has(balance.memberId)
      || validateMinorAmount(Math.abs(balance.netMinor), { allowZero: true }).length > 0) {
      throw new DomainValidationError('Balance input is invalid.', [{
        path: `balances.${index}`,
        code: 'invalid_balance',
        message: 'Balances require a unique member and a safe integer amount.',
      }]);
    }
    memberIds.add(balance.memberId);
  }
  const total = balances.reduce((sum, balance) => sum + BigInt(balance.netMinor), 0n);
  if (total !== 0n) {
    throw new DomainInvariantError(`Cannot suggest payments for non-zero total ${total}.`);
  }

  const debtors = balances
    .filter(balance => balance.netMinor < 0)
    .map(balance => ({ ...balance, remaining: -balance.netMinor }))
    .sort((left, right) => left.memberId.localeCompare(right.memberId));
  const creditors = balances
    .filter(balance => balance.netMinor > 0)
    .map(balance => ({ ...balance, remaining: balance.netMinor }))
    .sort((left, right) => left.memberId.localeCompare(right.memberId));

  const suggestions: PaymentSuggestion[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amountMinor = Math.min(debtor.remaining, creditor.remaining);
    suggestions.push({
      fromMemberId: debtor.memberId,
      toMemberId: creditor.memberId,
      amountMinor,
    });
    debtor.remaining -= amountMinor;
    creditor.remaining -= amountMinor;
    if (debtor.remaining === 0) debtorIndex += 1;
    if (creditor.remaining === 0) creditorIndex += 1;
  }

  if (debtors.some(item => item.remaining !== 0) || creditors.some(item => item.remaining !== 0)) {
    throw new DomainInvariantError('Payment suggestions did not settle every balance.');
  }
  return suggestions;
};
