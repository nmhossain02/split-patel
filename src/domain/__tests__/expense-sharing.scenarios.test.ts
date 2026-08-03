import { allocateEqual } from '../money/allocation';
import { calculateExpenseDelta, calculateExpenseEffects } from '../expenses/expense';
import { calculateBalances, suggestPayments } from '../balances/balance';
import { makeExpense, makeSettlement } from '../testing/fixtures';

describe('documented expense-sharing scenarios', () => {
  it('Scenario A: calculates an equal split with one payer', () => {
    const expense = makeExpense();

    expect(calculateExpenseEffects(expense)).toEqual([
      { memberId: 'alex', amountMinor: 4000 },
      { memberId: 'blair', amountMinor: -2000 },
      { memberId: 'casey', amountMinor: -2000 },
    ]);
    const balances = calculateBalances('tab-1', 'USD', [expense], []);
    expect(suggestPayments(balances)).toEqual([
      { fromMemberId: 'blair', toMemberId: 'alex', amountMinor: 2000 },
      { fromMemberId: 'casey', toMemberId: 'alex', amountMinor: 2000 },
    ]);
  });

  it('Scenario B: allocates itemized meals and a shared tip', () => {
    const expense = makeExpense({
      totalMinor: 3300,
      contributions: [{ memberId: 'alex', amountMinor: 3300 }],
      items: [
        {
          id: 'alex-meal',
          description: 'Alex meal',
          amountMinor: 1200,
          allocations: [{ memberId: 'alex', amountMinor: 1200 }],
        },
        {
          id: 'blair-meal',
          description: 'Blair meal',
          amountMinor: 1500,
          allocations: [{ memberId: 'blair', amountMinor: 1500 }],
        },
        {
          id: 'tip',
          description: 'Tip',
          amountMinor: 600,
          allocations: [
            { memberId: 'alex', amountMinor: 300 },
            { memberId: 'blair', amountMinor: 300 },
          ],
        },
      ],
    });

    expect(calculateBalances('tab-1', 'USD', [expense], [])).toEqual([
      { memberId: 'alex', netMinor: 1800 },
      { memberId: 'blair', netMinor: -1800 },
    ]);
  });

  it('Scenario C: supports multiple contributors', () => {
    const expense = makeExpense({
      totalMinor: 10_000,
      contributions: [
        { memberId: 'alex', amountMinor: 7000 },
        { memberId: 'blair', amountMinor: 3000 },
      ],
      items: [{
        id: 'booking',
        description: 'Booking',
        amountMinor: 10_000,
        allocations: [
          { memberId: 'alex', amountMinor: 2000 },
          { memberId: 'blair', amountMinor: 4000 },
          { memberId: 'casey', amountMinor: 4000 },
        ],
      }],
    });

    const balances = calculateBalances('tab-1', 'USD', [expense], []);
    expect(balances).toEqual([
      { memberId: 'alex', netMinor: 5000 },
      { memberId: 'blair', netMinor: -1000 },
      { memberId: 'casey', netMinor: -4000 },
    ]);
    expect(suggestPayments(balances)).toEqual([
      { fromMemberId: 'blair', toMemberId: 'alex', amountMinor: 1000 },
      { fromMemberId: 'casey', toMemberId: 'alex', amountMinor: 4000 },
    ]);
  });

  it('Scenario D: assigns deterministic remainder units by stable member ID', () => {
    expect(allocateEqual(1000, ['c', 'b', 'a'])).toEqual([
      { memberId: 'a', amountMinor: 334 },
      { memberId: 'b', amountMinor: 333 },
      { memberId: 'c', amountMinor: 333 },
    ]);
  });

  it('Scenario E: reduces debt after a settlement', () => {
    const expense = makeExpense();
    const settlement = makeSettlement();

    const balances = calculateBalances('tab-1', 'USD', [expense], [settlement]);
    expect(balances).toEqual([
      { memberId: 'alex', netMinor: 2000 },
      { memberId: 'casey', netMinor: -2000 },
    ]);
    expect(suggestPayments(balances)).toEqual([
      { fromMemberId: 'casey', toMemberId: 'alex', amountMinor: 2000 },
    ]);
  });

  it('Scenario F: calculates only the edit delta', () => {
    const previous = makeExpense();
    const next = makeExpense({
      revision: 2,
      idempotencyKey: 'edit-expense-1',
      items: [{
        id: 'item-1',
        description: 'Shared item',
        amountMinor: 6000,
        allocations: [
          { memberId: 'alex', amountMinor: 3000 },
          { memberId: 'blair', amountMinor: 2000 },
          { memberId: 'casey', amountMinor: 1000 },
        ],
      }],
    });

    expect(calculateExpenseDelta(previous, next)).toEqual([
      { memberId: 'alex', amountMinor: -1000 },
      { memberId: 'casey', amountMinor: 1000 },
    ]);
    expect(calculateBalances('tab-1', 'USD', [next], [])).toEqual([
      { memberId: 'alex', netMinor: 3000 },
      { memberId: 'blair', netMinor: -2000 },
      { memberId: 'casey', netMinor: -1000 },
    ]);
  });

  it('Scenario G: voiding reverses the source effect and matches recalculation', () => {
    const active = makeExpense();
    const voided = makeExpense({
      status: 'voided',
      revision: 2,
      idempotencyKey: 'void-expense-1',
    });

    expect(calculateExpenseDelta(active, voided)).toEqual([
      { memberId: 'alex', amountMinor: -4000 },
      { memberId: 'blair', amountMinor: 2000 },
      { memberId: 'casey', amountMinor: 2000 },
    ]);
    expect(calculateBalances('tab-1', 'USD', [voided], [])).toEqual([]);
  });
});
