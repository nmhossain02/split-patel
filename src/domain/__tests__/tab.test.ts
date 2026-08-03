import { DomainValidationError } from '../shared/errors';
import {
  assertCanPerformTabAction,
  createTabAggregate,
  renameTab,
  setTabArchived,
  validateMembershipConsistency,
} from '../tabs/tab';

describe('tab domain', () => {
  const created = () => createTabAggregate({
    id: 'tab-1',
    name: '  Summer Trip  ',
    currency: 'USD',
    actorId: 'alex',
  });

  it('creates a normalized tab and its owner atomically', () => {
    expect(created()).toEqual({
      tab: {
        id: 'tab-1',
        name: 'Summer Trip',
        currency: 'USD',
        status: 'active',
        createdBy: 'alex',
        ownerIds: ['alex'],
        memberIds: ['alex'],
        revision: 1,
      },
      ownerMembership: {
        tabId: 'tab-1',
        userId: 'alex',
        role: 'owner',
        state: 'active',
        revision: 1,
      },
    });
  });

  it('rejects empty, oversized, and unsupported-currency input', () => {
    expect(() => createTabAggregate({ id: 'tab-1', name: ' ', currency: 'XYZ', actorId: 'alex' }))
      .toThrow(DomainValidationError);
    expect(() => createTabAggregate({ id: 'tab-1', name: 'a'.repeat(81), currency: 'USD', actorId: 'alex' }))
      .toThrow(DomainValidationError);
    expect(() => createTabAggregate({ id: 'tab-1', name: '😀'.repeat(80), currency: 'USD', actorId: 'alex' }))
      .not.toThrow();
    expect(() => createTabAggregate({ id: 'tab-1', name: '😀'.repeat(81), currency: 'USD', actorId: 'alex' }))
      .toThrow(DomainValidationError);
  });

  it('allows an admin to rename but only an owner to archive', () => {
    const { tab } = created();
    const admin = { tabId: tab.id, userId: 'blair', role: 'admin' as const, state: 'active' as const, revision: 1 };
    expect(renameTab(tab, admin, 'New name', 1)).toEqual(expect.objectContaining({
      name: 'New name',
      revision: 2,
    }));
    expect(() => setTabArchived(tab, admin, true, 1)).toThrow(DomainValidationError);
  });

  it('rejects stale changes and mutations on archived tabs', () => {
    const { tab, ownerMembership } = created();
    expect(() => renameTab(tab, ownerMembership, 'New name', 0)).toThrow(DomainValidationError);
    const archived = setTabArchived(tab, ownerMembership, true, 1);
    expect(() => assertCanPerformTabAction(archived, ownerMembership, 'create_expense'))
      .toThrow(DomainValidationError);
    expect(setTabArchived(archived, ownerMembership, false, 2).status).toBe('active');
  });

  it('detects denormalized membership inconsistencies and loss of last owner', () => {
    const { tab, ownerMembership } = created();
    expect(validateMembershipConsistency(tab, [ownerMembership])).toEqual([]);
    expect(validateMembershipConsistency(tab, [{ ...ownerMembership, state: 'left' }]))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'last_owner' }),
        expect.objectContaining({ path: 'memberIds', code: 'inconsistent' }),
      ]));
  });
});
