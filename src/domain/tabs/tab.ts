import { validateCurrency } from '../money/money';
import { DomainValidationError, ValidationIssue } from '../shared/errors';
import { Membership, TabAggregate, TabRole } from './types';

export type CreateTabInput = {
  id: string;
  name: string;
  currency: string;
  actorId: string;
};

export type CreatedTab = {
  tab: TabAggregate;
  ownerMembership: Membership;
};

export type TabAction =
  | 'rename'
  | 'change_currency'
  | 'archive'
  | 'restore'
  | 'invite_member'
  | 'remove_member'
  | 'promote_admin'
  | 'create_expense';

const actionRoles: Record<TabAction, readonly TabRole[]> = {
  rename: ['owner', 'admin'],
  change_currency: ['owner'],
  archive: ['owner'],
  restore: ['owner'],
  invite_member: ['owner', 'admin'],
  remove_member: ['owner', 'admin'],
  promote_admin: ['owner'],
  create_expense: ['owner', 'admin', 'member'],
};

export const normalizeTabName = (name: string): string => name.trim();

export const validateTabName = (name: string, path = 'name'): ValidationIssue[] => {
  const length = [...normalizeTabName(name)].length;
  if (length === 0) return [{ path, code: 'empty', message: 'Tab name is required.' }];
  if (length > 80) return [{ path, code: 'too_long', message: 'Tab name cannot exceed 80 characters.' }];
  return [];
};

export const createTabAggregate = (input: CreateTabInput): CreatedTab => {
  const issues = [
    ...validateTabName(input.name),
    ...validateCurrency(input.currency),
  ];
  if (!input.id.trim()) issues.push({ path: 'id', code: 'empty', message: 'Tab ID is required.' });
  if (!input.actorId.trim()) issues.push({ path: 'actorId', code: 'empty', message: 'Actor ID is required.' });
  if (issues.length > 0) throw new DomainValidationError('Cannot create tab.', issues);

  const tab: TabAggregate = {
    id: input.id,
    name: normalizeTabName(input.name),
    currency: input.currency,
    status: 'active',
    createdBy: input.actorId,
    ownerIds: [input.actorId],
    memberIds: [input.actorId],
    revision: 1,
  };
  return {
    tab,
    ownerMembership: {
      tabId: tab.id,
      userId: input.actorId,
      role: 'owner',
      state: 'active',
      revision: 1,
    },
  };
};

export const assertCanPerformTabAction = (
  tab: TabAggregate,
  membership: Membership | null,
  action: TabAction,
): void => {
  const permitted = membership
    && membership.tabId === tab.id
    && membership.state === 'active'
    && actionRoles[action].includes(membership.role);
  if (!permitted) {
    throw new DomainValidationError('Tab action is not permitted.', [{
      path: 'actor',
      code: 'forbidden',
      message: `Active ${actionRoles[action].join(' or ')} role required.`,
    }]);
  }
  if (tab.status === 'archived' && action !== 'restore') {
    throw new DomainValidationError('Archived tabs are read-only.', [{
      path: 'status',
      code: 'archived',
      message: 'Restore the tab before changing it.',
    }]);
  }
};

export const renameTab = (
  tab: TabAggregate,
  actor: Membership,
  name: string,
  expectedRevision: number,
): TabAggregate => {
  assertCanPerformTabAction(tab, actor, 'rename');
  const issues = validateTabName(name);
  if (expectedRevision !== tab.revision) {
    issues.push({ path: 'revision', code: 'conflict', message: 'Tab has changed since it was loaded.' });
  }
  if (issues.length > 0) throw new DomainValidationError('Cannot rename tab.', issues);
  return { ...tab, name: normalizeTabName(name), revision: tab.revision + 1 };
};

export const changeTabCurrency = (
  tab: TabAggregate,
  actor: Membership,
  currency: string,
  expectedRevision: number,
  hasFinancialActivity: boolean,
): TabAggregate => {
  assertCanPerformTabAction(tab, actor, 'change_currency');
  const issues = validateCurrency(currency);
  if (expectedRevision !== tab.revision) {
    issues.push({ path: 'revision', code: 'conflict', message: 'Tab has changed since it was loaded.' });
  }
  if (currency === tab.currency) {
    issues.push({ path: 'currency', code: 'unchanged', message: 'Choose a different currency.' });
  }
  if (hasFinancialActivity) {
    issues.push({
      path: 'currency',
      code: 'financial_activity',
      message: 'Currency cannot change after an expense or settlement has been recorded.',
    });
  }
  if (issues.length > 0) throw new DomainValidationError('Cannot change tab currency.', issues);
  return { ...tab, currency, revision: tab.revision + 1 };
};

export const setTabArchived = (
  tab: TabAggregate,
  actor: Membership,
  archived: boolean,
  expectedRevision: number,
): TabAggregate => {
  assertCanPerformTabAction(tab, actor, archived ? 'archive' : 'restore');
  if (expectedRevision !== tab.revision) {
    throw new DomainValidationError('Cannot update tab.', [{
      path: 'revision',
      code: 'conflict',
      message: 'Tab has changed since it was loaded.',
    }]);
  }
  return {
    ...tab,
    status: archived ? 'archived' : 'active',
    revision: tab.revision + 1,
  };
};

export const validateMembershipConsistency = (
  tab: TabAggregate,
  memberships: readonly Membership[],
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const active = memberships.filter(item => item.state === 'active');
  const activeIds = [...active.map(item => item.userId)].sort();
  const ownerIds = [...active.filter(item => item.role === 'owner').map(item => item.userId)].sort();
  if (ownerIds.length === 0) {
    issues.push({ path: 'ownerIds', code: 'last_owner', message: 'An active tab requires an owner.' });
  }
  if (new Set(memberships.map(item => item.userId)).size !== memberships.length) {
    issues.push({ path: 'memberships', code: 'duplicate', message: 'Membership IDs must be unique.' });
  }
  if (JSON.stringify(activeIds) !== JSON.stringify([...tab.memberIds].sort())) {
    issues.push({ path: 'memberIds', code: 'inconsistent', message: 'Active membership index is inconsistent.' });
  }
  if (JSON.stringify(ownerIds) !== JSON.stringify([...tab.ownerIds].sort())) {
    issues.push({ path: 'ownerIds', code: 'inconsistent', message: 'Owner index is inconsistent.' });
  }
  return issues;
};
