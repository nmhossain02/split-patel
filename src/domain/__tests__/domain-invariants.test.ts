import { allocateEqual, allocatePercentages, allocateWeighted } from '../money/allocation';
import { DomainInvariantError, DomainValidationError } from '../shared/errors';
import { calculateBalances, suggestPayments } from '../balances/balance';
import { calculateExpenseEffects, validateExpense } from '../expenses/expense';
import { makeExpense, makeSettlement } from '../testing/fixtures';
import { validateSettlement } from '../settlements/settlement';

describe('allocation invariants', () => {
  it('conserves every generated amount across varying member counts', () => {
    for (let amountMinor = 1; amountMinor <= 500; amountMinor += 7) {
      for (let memberCount = 1; memberCount <= 12; memberCount += 1) {
        const memberIds = Array.from({ length: memberCount }, (_, index) => `member-${index}`);
        const first = allocateEqual(amountMinor, memberIds);
        const second = allocateEqual(amountMinor, [...memberIds].reverse());

        expect(first.reduce((sum, item) => sum + item.amountMinor, 0)).toBe(amountMinor);
        expect(second).toEqual(first);
        expect(first.every(item => Number.isSafeInteger(item.amountMinor))).toBe(true);
      }
    }
  });

  it('conserves weighted amounts and breaks equal remainders by member ID', () => {
    expect(allocateWeighted(17, [
      { memberId: 'z', weight: 2 },
      { memberId: 'a', weight: 2 },
      { memberId: 'm', weight: 1 },
    ])).toEqual([
      { memberId: 'a', amountMinor: 7 },
      { memberId: 'm', amountMinor: 3 },
      { memberId: 'z', amountMinor: 7 },
    ]);
  });

  it('requires percentages to total exactly 100 percent', () => {
    expect(() => allocatePercentages(1000, [
      { memberId: 'a', weight: 5000 },
      { memberId: 'b', weight: 4999 },
    ])).toThrow(DomainValidationError);
  });

  it('rejects duplicate members and non-integer amounts', () => {
    expect(() => allocateEqual(100.5, ['a'])).toThrow(DomainValidationError);
    expect(() => allocateEqual(100, ['a', 'a'])).toThrow(DomainValidationError);
  });
});

describe('expense and balance invariants', () => {
  it('returns field-addressable issues for mismatched totals', () => {
    const expense = makeExpense({ totalMinor: 5999 });
    const issues = validateExpense(expense);

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'items', code: 'item_total' }),
      expect.objectContaining({ path: 'contributions', code: 'contribution_total' }),
    ]));
  });

  it('rejects members outside the allowed tab membership', () => {
    const issues = validateExpense(makeExpense(), new Set(['alex', 'blair']));
    expect(issues).toContainEqual(expect.objectContaining({
      code: 'unknown_member',
      message: 'Member casey is not allowed.',
    }));
  });

  it('rejects impossible calendar dates for expenses and settlements', () => {
    expect(validateExpense(makeExpense({ expenseDate: '2026-02-30' }))).toContainEqual(
      expect.objectContaining({ path: 'expenseDate', code: 'invalid_date' }),
    );
    expect(validateSettlement(makeSettlement({ occurredAt: '2026-13-01T12:00:00.000Z' }))).toContainEqual(
      expect.objectContaining({ path: 'occurredAt', code: 'invalid_date' }),
    );
  });

  it('keeps each expense and aggregate balance zero sum', () => {
    const expenses = [
      makeExpense(),
      makeExpense({ id: 'expense-2', idempotencyKey: 'create-expense-2' }),
    ];
    const settlements = [makeSettlement()];

    for (const expense of expenses) {
      expect(calculateExpenseEffects(expense).reduce((sum, item) => sum + item.amountMinor, 0)).toBe(0);
    }
    expect(calculateBalances('tab-1', 'USD', expenses, settlements)
      .reduce((sum, item) => sum + item.netMinor, 0)).toBe(0);
  });

  it('rejects records outside the requested tab or currency', () => {
    expect(() => calculateBalances('another-tab', 'USD', [makeExpense()], []))
      .toThrow(DomainValidationError);
  });

  it('rejects payment suggestions for a non-zero balance set', () => {
    expect(() => suggestPayments([{ memberId: 'alex', netMinor: 100 }]))
      .toThrow(DomainInvariantError);
    expect(() => suggestPayments([
      { memberId: 'alex', netMinor: 100 },
      { memberId: 'alex', netMinor: -100 },
    ])).toThrow(DomainValidationError);
    expect(() => suggestPayments([
      { memberId: 'alex', netMinor: Number.MAX_SAFE_INTEGER + 1 },
      { memberId: 'blair', netMinor: -(Number.MAX_SAFE_INTEGER + 1) },
    ])).toThrow(DomainValidationError);
  });

  it('never suggests a self-payment and settles all generated balances', () => {
    for (let amountMinor = 1; amountMinor <= 1000; amountMinor += 31) {
      const suggestions = suggestPayments([
        { memberId: 'a', netMinor: amountMinor },
        { memberId: 'b', netMinor: -Math.floor(amountMinor / 2) },
        { memberId: 'c', netMinor: -(amountMinor - Math.floor(amountMinor / 2)) },
      ]);
      const resulting = new Map<string, number>([
        ['a', amountMinor],
        ['b', -Math.floor(amountMinor / 2)],
        ['c', -(amountMinor - Math.floor(amountMinor / 2))],
      ]);
      for (const suggestion of suggestions) {
        expect(suggestion.fromMemberId).not.toBe(suggestion.toMemberId);
        resulting.set(
          suggestion.fromMemberId,
          (resulting.get(suggestion.fromMemberId) ?? 0) + suggestion.amountMinor,
        );
        resulting.set(
          suggestion.toMemberId,
          (resulting.get(suggestion.toMemberId) ?? 0) - suggestion.amountMinor,
        );
      }
      expect([...resulting.values()].every(value => value === 0)).toBe(true);
    }
  });
});
