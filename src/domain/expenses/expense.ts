import { DomainValidationError, ValidationIssue } from '../shared/errors';
import { sumMinorAmounts, validateCurrency, validateMinorAmount } from '../money/money';
import { Expense, MemberEffect } from './types';
import { isValidCalendarDate } from '../shared/date';

const DESCRIPTION_MAX = 120;
const ITEM_DESCRIPTION_MAX = 120;
const MAX_ITEMS = 100;
const MAX_PARTICIPANTS = 100;

const validateText = (value: string, path: string, maximum: number): ValidationIssue[] => {
  const length = [...value.trim()].length;
  if (length === 0) {
    return [{ path, code: 'empty', message: 'A value is required.' }];
  }
  if (length > maximum) {
    return [{ path, code: 'too_long', message: `Value cannot exceed ${maximum} characters.` }];
  }
  return [];
};

const validateUniqueMembers = (
  values: readonly { memberId: string }[],
  path: string,
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    if (!value.memberId.trim()) {
      issues.push({ path: `${path}.${index}.memberId`, code: 'empty', message: 'Member ID is required.' });
    } else if (seen.has(value.memberId)) {
      issues.push({ path: `${path}.${index}.memberId`, code: 'duplicate', message: 'Member may appear only once.' });
    }
    seen.add(value.memberId);
  }
  return issues;
};

export const validateExpense = (
  expense: Expense,
  allowedMemberIds?: ReadonlySet<string>,
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [
    ...validateText(expense.id, 'id', 128),
    ...validateText(expense.tabId, 'tabId', 128),
    ...validateText(expense.description, 'description', DESCRIPTION_MAX),
    ...validateText(expense.createdBy, 'createdBy', 128),
    ...validateText(expense.idempotencyKey, 'idempotencyKey', 128),
    ...validateCurrency(expense.currency),
    ...validateMinorAmount(expense.totalMinor, { path: 'totalMinor' }),
  ];

  if (!isValidCalendarDate(expense.expenseDate)) {
    issues.push({ path: 'expenseDate', code: 'invalid_date', message: 'Expense date must use YYYY-MM-DD.' });
  }
  if (!Number.isSafeInteger(expense.revision) || expense.revision < 1) {
    issues.push({ path: 'revision', code: 'invalid_revision', message: 'Revision must be a positive integer.' });
  }
  if (expense.contributions.length === 0 || expense.contributions.length > MAX_PARTICIPANTS) {
    issues.push({ path: 'contributions', code: 'invalid_count', message: 'Expense requires 1 to 100 contributors.' });
  }
  if (expense.items.length === 0 || expense.items.length > MAX_ITEMS) {
    issues.push({ path: 'items', code: 'invalid_count', message: 'Expense requires 1 to 100 items.' });
  }

  issues.push(...validateUniqueMembers(expense.contributions, 'contributions'));
  for (const [index, contribution] of expense.contributions.entries()) {
    issues.push(...validateMinorAmount(contribution.amountMinor, {
      path: `contributions.${index}.amountMinor`,
    }));
  }

  const itemIds = new Set<string>();
  for (const [itemIndex, item] of expense.items.entries()) {
    issues.push(...validateText(item.id, `items.${itemIndex}.id`, 128));
    issues.push(...validateText(item.description, `items.${itemIndex}.description`, ITEM_DESCRIPTION_MAX));
    issues.push(...validateMinorAmount(item.amountMinor, { path: `items.${itemIndex}.amountMinor` }));
    if (itemIds.has(item.id)) {
      issues.push({ path: `items.${itemIndex}.id`, code: 'duplicate', message: 'Item ID must be unique.' });
    }
    itemIds.add(item.id);
    if (item.allocations.length === 0 || item.allocations.length > MAX_PARTICIPANTS) {
      issues.push({
        path: `items.${itemIndex}.allocations`,
        code: 'invalid_count',
        message: 'Item requires 1 to 100 allocations.',
      });
    }
    issues.push(...validateUniqueMembers(item.allocations, `items.${itemIndex}.allocations`));
    for (const [allocationIndex, allocation] of item.allocations.entries()) {
      issues.push(...validateMinorAmount(allocation.amountMinor, {
        path: `items.${itemIndex}.allocations.${allocationIndex}.amountMinor`,
      }));
    }

    const allocated = sumMinorAmounts(item.allocations.map(allocation => allocation.amountMinor));
    if (allocated !== item.amountMinor) {
      issues.push({
        path: `items.${itemIndex}.allocations`,
        code: 'allocation_total',
        message: 'Item allocations must equal the item amount.',
      });
    }
  }

  const itemTotal = sumMinorAmounts(expense.items.map(item => item.amountMinor));
  if (itemTotal !== expense.totalMinor) {
    issues.push({ path: 'items', code: 'item_total', message: 'Item total must equal expense total.' });
  }
  const contributionTotal = sumMinorAmounts(expense.contributions.map(item => item.amountMinor));
  if (contributionTotal !== expense.totalMinor) {
    issues.push({
      path: 'contributions',
      code: 'contribution_total',
      message: 'Contribution total must equal expense total.',
    });
  }

  if (allowedMemberIds) {
    const referenced = new Set([
      ...expense.contributions.map(item => item.memberId),
      ...expense.items.flatMap(item => item.allocations.map(allocation => allocation.memberId)),
    ]);
    for (const memberId of referenced) {
      if (!allowedMemberIds.has(memberId)) {
        issues.push({ path: 'members', code: 'unknown_member', message: `Member ${memberId} is not allowed.` });
      }
    }
  }

  return issues;
};

export const assertValidExpense = (
  expense: Expense,
  allowedMemberIds?: ReadonlySet<string>,
): void => {
  const issues = validateExpense(expense, allowedMemberIds);
  if (issues.length > 0) {
    throw new DomainValidationError('Expense is invalid.', issues);
  }
};

export const calculateExpenseEffects = (expense: Expense): MemberEffect[] => {
  assertValidExpense(expense);
  if (expense.status === 'voided') return [];

  const effects = new Map<string, number>();
  for (const contribution of expense.contributions) {
    effects.set(contribution.memberId, (effects.get(contribution.memberId) ?? 0) + contribution.amountMinor);
  }
  for (const item of expense.items) {
    for (const allocation of item.allocations) {
      effects.set(allocation.memberId, (effects.get(allocation.memberId) ?? 0) - allocation.amountMinor);
    }
  }

  return [...effects.entries()]
    .map(([memberId, amountMinor]) => ({ memberId, amountMinor }))
    .filter(effect => effect.amountMinor !== 0)
    .sort((left, right) => left.memberId.localeCompare(right.memberId));
};

export const calculateExpenseDelta = (previous: Expense, next: Expense): MemberEffect[] => {
  if (previous.id !== next.id || previous.tabId !== next.tabId || previous.currency !== next.currency) {
    throw new DomainValidationError('Expense identity cannot change.', [{
      path: 'expense',
      code: 'identity_changed',
      message: 'Expense ID, tab, and currency must remain unchanged.',
    }]);
  }
  if (next.revision !== previous.revision + 1) {
    throw new DomainValidationError('Expense revision is invalid.', [{
      path: 'revision',
      code: 'revision_sequence',
      message: 'Expense revision must increment by one.',
    }]);
  }

  const delta = new Map<string, number>();
  for (const effect of calculateExpenseEffects(previous)) {
    delta.set(effect.memberId, -effect.amountMinor);
  }
  for (const effect of calculateExpenseEffects(next)) {
    delta.set(effect.memberId, (delta.get(effect.memberId) ?? 0) + effect.amountMinor);
  }
  return [...delta.entries()]
    .map(([memberId, amountMinor]) => ({ memberId, amountMinor }))
    .filter(effect => effect.amountMinor !== 0)
    .sort((left, right) => left.memberId.localeCompare(right.memberId));
};
