import { validateCurrency, validateMinorAmount } from '../money/money';
import { DomainValidationError, ValidationIssue } from '../shared/errors';
import { MemberEffect } from '../expenses/types';
import { Settlement } from './types';
import { isValidCalendarDate } from '../shared/date';

export const validateSettlement = (
  settlement: Settlement,
  allowedMemberIds?: ReadonlySet<string>,
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [
    ...validateCurrency(settlement.currency),
    ...validateMinorAmount(settlement.amountMinor),
  ];
  const required: [string, string][] = [
    ['id', settlement.id],
    ['tabId', settlement.tabId],
    ['fromMemberId', settlement.fromMemberId],
    ['toMemberId', settlement.toMemberId],
    ['createdBy', settlement.createdBy],
    ['idempotencyKey', settlement.idempotencyKey],
  ];
  for (const [path, value] of required) {
    if (!value.trim()) issues.push({ path, code: 'empty', message: 'A value is required.' });
  }
  if (settlement.fromMemberId === settlement.toMemberId) {
    issues.push({ path: 'toMemberId', code: 'self_payment', message: 'Settlement members must be different.' });
  }
  const datePrefix = /^(\d{4}-\d{2}-\d{2})(?:T.*)?$/.exec(settlement.occurredAt)?.[1] ?? '';
  if (!isValidCalendarDate(datePrefix) || Number.isNaN(new Date(settlement.occurredAt).getTime())) {
    issues.push({ path: 'occurredAt', code: 'invalid_date', message: 'A valid date is required.' });
  }
  const methods = ['cash', 'bank', 'venmo', 'paypal', 'cash_app', 'other'];
  if (settlement.method && !methods.includes(settlement.method)) {
    issues.push({ path: 'method', code: 'invalid_method', message: 'Payment method is invalid.' });
  }
  if (settlement.note && [...settlement.note].length > 240) {
    issues.push({ path: 'note', code: 'too_long', message: 'Note cannot exceed 240 characters.' });
  }
  if (!Number.isSafeInteger(settlement.revision) || settlement.revision < 1) {
    issues.push({ path: 'revision', code: 'invalid_revision', message: 'Revision must be positive.' });
  }
  if (allowedMemberIds) {
    for (const memberId of [settlement.fromMemberId, settlement.toMemberId]) {
      if (!allowedMemberIds.has(memberId)) {
        issues.push({ path: 'members', code: 'unknown_member', message: `Member ${memberId} is not allowed.` });
      }
    }
  }
  return issues;
};

export const calculateSettlementEffects = (settlement: Settlement): MemberEffect[] => {
  const issues = validateSettlement(settlement);
  if (issues.length > 0) throw new DomainValidationError('Settlement is invalid.', issues);
  if (settlement.status === 'voided') return [];
  return [
    { memberId: settlement.fromMemberId, amountMinor: settlement.amountMinor },
    { memberId: settlement.toMemberId, amountMinor: -settlement.amountMinor },
  ].sort((left, right) => left.memberId.localeCompare(right.memberId));
};

export const calculateSettlementDelta = (
  previous: Settlement,
  next: Settlement,
): MemberEffect[] => {
  if (previous.id !== next.id || previous.tabId !== next.tabId || previous.currency !== next.currency) {
    throw new DomainValidationError('Settlement identity cannot change.', [{
      path: 'settlement',
      code: 'identity_changed',
      message: 'Settlement ID, tab, and currency must remain unchanged.',
    }]);
  }
  if (next.revision !== previous.revision + 1) {
    throw new DomainValidationError('Settlement revision is invalid.', [{
      path: 'revision',
      code: 'revision_sequence',
      message: 'Settlement revision must increment by one.',
    }]);
  }

  const effects = new Map<string, number>();
  for (const effect of calculateSettlementEffects(previous)) {
    effects.set(effect.memberId, -effect.amountMinor);
  }
  for (const effect of calculateSettlementEffects(next)) {
    effects.set(effect.memberId, (effects.get(effect.memberId) ?? 0) + effect.amountMinor);
  }
  return [...effects.entries()]
    .map(([memberId, amountMinor]) => ({ memberId, amountMinor }))
    .filter(effect => effect.amountMinor !== 0)
    .sort((left, right) => left.memberId.localeCompare(right.memberId));
};
