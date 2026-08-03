import { buildExpenseDraft } from '../expense-form';
import { formatMinorAmount, parseMajorAmount } from '@/domain/money/money';

test('parses and formats money without floating-point calculations', () => {
  expect(parseMajorAmount('10.05', 'USD')).toBe(1005);
  expect(formatMinorAmount(-1005, 'USD')).toBe('-USD 10.05');
  expect(parseMajorAmount('500', 'JPY')).toBe(500);
  expect(() => parseMajorAmount('1.1', 'JPY')).toThrow('Invalid money amount');
});

test('builds a multiple-contributor itemized draft with deterministic equal splits', () => {
  const draft = buildExpenseDraft({
    description: 'Dinner',
    currency: 'USD',
    expenseDate: '2026-08-02',
    activeMemberIds: ['alex', 'blair', 'casey'],
    contributions: [
      { memberId: 'alex', amount: '7.00' },
      { memberId: 'blair', amount: '3.00' },
      { memberId: 'casey', amount: '' },
    ],
    items: [{
      id: 'meal',
      description: 'Meal',
      amount: '10.00',
      participantIds: ['alex', 'blair', 'casey'],
    }],
  });
  expect(draft.totalMinor).toBe(1000);
  expect(draft.contributions).toEqual([
    { memberId: 'alex', amountMinor: 700 },
    { memberId: 'blair', amountMinor: 300 },
  ]);
  expect(draft.items[0].allocations).toEqual([
    { memberId: 'alex', amountMinor: 334 },
    { memberId: 'blair', amountMinor: 333 },
    { memberId: 'casey', amountMinor: 333 },
  ]);
});

test.each([
  ['exact', { alex: '2.00', blair: '3.00', casey: '5.00' }, [200, 300, 500]],
  ['percentage', { alex: '20', blair: '30', casey: '50' }, [200, 300, 500]],
  ['weighted', { alex: '1', blair: '2', casey: '3' }, [167, 333, 500]],
] as const)('builds explicit allocations from the %s helper', (allocationMode, shares, expected) => {
  const draft = buildExpenseDraft({
    description: 'Custom split', currency: 'USD', expenseDate: '2026-08-02',
    activeMemberIds: ['alex', 'blair', 'casey'],
    contributions: [{ memberId: 'alex', amount: '10.00' }],
    items: [{
      id: 'custom', description: 'Custom', amount: '10.00',
      participantIds: ['alex', 'blair', 'casey'], allocationMode, shares,
    }],
  });
  expect(draft.items[0].allocations.map(item => item.amountMinor)).toEqual(expected);
});

test('preserves stable item allocation identity when items are reordered', () => {
  const base = {
    description: 'Two items', currency: 'USD', expenseDate: '2026-08-02',
    activeMemberIds: ['alex', 'blair'],
    contributions: [{ memberId: 'alex', amount: '10.00' }],
  };
  const items = [
    { id: 'first', description: 'First', amount: '3.00', participantIds: ['blair', 'alex'] },
    { id: 'second', description: 'Second', amount: '7.00', participantIds: ['alex', 'blair'] },
  ];
  const first = buildExpenseDraft({ ...base, items });
  const reordered = buildExpenseDraft({ ...base, items: [...items].reverse() });
  const byId = (draft: typeof first) => new Map(draft.items.map(item => [item.id, item.allocations]));
  expect(byId(reordered)).toEqual(byId(first));
});
