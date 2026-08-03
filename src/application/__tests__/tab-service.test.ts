import { TabService } from '../tabs/tab-service';
import { CanonicalJsonFingerprinter, FixedClock, SequenceIdGenerator } from '../ports/runtime';
import { InMemoryApplicationStore } from '@/infrastructure/repositories/in-memory-store';
import { createTabAggregate } from '@/domain/tabs/tab';
import { makeExpense } from '@/domain/testing/fixtures';

const dependencies = (store: InMemoryApplicationStore) => ({
  store,
  clock: new FixedClock('2026-08-02T12:00:00.000Z'),
  ids: new SequenceIdGenerator(),
  fingerprinter: new CanonicalJsonFingerprinter(),
});

describe('TabService workflows', () => {
  it('creates one owner tab for concurrent idempotent retries', async () => {
    const store = new InMemoryApplicationStore();
    const service = new TabService(dependencies(store));
    const command = {
      actorId: 'alex',
      name: '  Summer trip  ',
      currency: 'USD',
      idempotencyKey: 'create-tab-1',
    };

    const [first, retry] = await Promise.all([service.createTab(command), service.createTab(command)]);

    expect(retry).toEqual(first);
    expect(first).toEqual(expect.objectContaining({ name: 'Summer trip', ownerIds: ['alex'] }));
    expect(await store.readMembership(first.id, 'alex')).toEqual(expect.objectContaining({
      role: 'owner',
      state: 'active',
    }));
    expect(await store.readAuditEvents()).toHaveLength(1);
  });

  it('adds members with role enforcement and permits an admin rename', async () => {
    const { tab, ownerMembership } = createTabAggregate({
      id: 'tab-1', name: 'Trip', currency: 'USD', actorId: 'alex',
    });
    const store = new InMemoryApplicationStore({ tabs: [tab], memberships: [ownerMembership] });
    const service = new TabService(dependencies(store));

    const withAdmin = await service.addMember({
      actorId: 'alex',
      tabId: tab.id,
      userId: 'blair',
      role: 'admin',
      expectedRevision: 1,
      idempotencyKey: 'add-admin',
    });
    const withMember = await service.addMember({
      actorId: 'blair',
      tabId: tab.id,
      userId: 'casey',
      role: 'member',
      expectedRevision: 2,
      idempotencyKey: 'add-member',
    });
    const renamed = await service.renameTab({
      actorId: 'blair',
      tabId: tab.id,
      name: 'Renamed trip',
      expectedRevision: 3,
      idempotencyKey: 'rename-tab',
    });

    expect(withAdmin.memberIds).toEqual(['alex', 'blair']);
    expect(withMember.memberIds).toEqual(['alex', 'blair', 'casey']);
    expect(renamed).toEqual(expect.objectContaining({ name: 'Renamed trip', revision: 4 }));
    expect(await store.readMembership(tab.id, 'blair')).toEqual(expect.objectContaining({ role: 'admin' }));

    await expect(service.addMember({
      actorId: 'blair',
      tabId: tab.id,
      userId: 'devon',
      role: 'admin',
      expectedRevision: 4,
      idempotencyKey: 'admin-promotes-admin',
    })).rejects.toBeDefined();
  });

  it('blocks last-owner departure and membership with an outstanding balance', async () => {
    const { tab, ownerMembership } = createTabAggregate({
      id: 'tab-1', name: 'Trip', currency: 'USD', actorId: 'alex',
    });
    tab.memberIds.push('blair');
    const blair = { tabId: tab.id, userId: 'blair', role: 'member' as const, state: 'active' as const, revision: 1 };
    const store = new InMemoryApplicationStore({
      tabs: [tab],
      memberships: [ownerMembership, blair],
      balances: [
        { tabId: tab.id, memberId: 'alex', netMinor: 1000 },
        { tabId: tab.id, memberId: 'blair', netMinor: -1000 },
      ],
    });
    const service = new TabService(dependencies(store));

    await expect(service.endMembership({
      actorId: 'blair', tabId: tab.id, userId: 'blair', expectedRevision: 1, idempotencyKey: 'leave-1',
    })).rejects.toMatchObject({ code: 'conflict' });
    await expect(service.endMembership({
      actorId: 'alex', tabId: tab.id, userId: 'alex', expectedRevision: 1, idempotencyKey: 'leave-owner',
    })).rejects.toMatchObject({ code: 'conflict' });
  });

  it('allows a zero-balance member to leave and an owner to archive and restore', async () => {
    const { tab, ownerMembership } = createTabAggregate({
      id: 'tab-1', name: 'Trip', currency: 'USD', actorId: 'alex',
    });
    tab.memberIds.push('blair');
    const blair = { tabId: tab.id, userId: 'blair', role: 'member' as const, state: 'active' as const, revision: 1 };
    const store = new InMemoryApplicationStore({ tabs: [tab], memberships: [ownerMembership, blair] });
    const service = new TabService(dependencies(store));

    const left = await service.endMembership({
      actorId: 'blair', tabId: tab.id, userId: 'blair', expectedRevision: 1, idempotencyKey: 'leave-1',
    });
    expect(left.memberIds).toEqual(['alex']);
    expect(await store.readMembership(tab.id, 'blair')).toEqual(expect.objectContaining({ state: 'left' }));

    const archived = await service.setArchived({
      actorId: 'alex', tabId: tab.id, archived: true, expectedRevision: 2, idempotencyKey: 'archive-1',
    });
    const restored = await service.setArchived({
      actorId: 'alex', tabId: tab.id, archived: false, expectedRevision: 3, idempotencyKey: 'restore-1',
    });
    expect(archived.status).toBe('archived');
    expect(restored.status).toBe('active');
  });

  it('lets only an owner change currency before any financial activity', async () => {
    const { tab, ownerMembership } = createTabAggregate({
      id: 'tab-1', name: 'Trip', currency: 'USD', actorId: 'alex',
    });
    tab.memberIds.push('blair');
    const blair = { tabId: tab.id, userId: 'blair', role: 'admin' as const, state: 'active' as const, revision: 1 };
    const store = new InMemoryApplicationStore({ tabs: [tab], memberships: [ownerMembership, blair] });
    const service = new TabService(dependencies(store));

    await expect(service.changeCurrency({
      actorId: 'blair', tabId: tab.id, currency: 'CAD', expectedRevision: 1,
      idempotencyKey: 'admin-currency-change',
    })).rejects.toBeDefined();

    const changed = await service.changeCurrency({
      actorId: 'alex', tabId: tab.id, currency: 'CAD', expectedRevision: 1,
      idempotencyKey: 'owner-currency-change',
    });
    expect(changed).toEqual(expect.objectContaining({ currency: 'CAD', revision: 2 }));
    expect(await store.readAuditEvents()).toEqual([
      expect.objectContaining({ action: 'change_tab_currency', previousRevision: 1, nextRevision: 2 }),
    ]);

    const activeExpense = makeExpense({ tabId: tab.id, currency: 'CAD' });
    const financialStore = new InMemoryApplicationStore({
      tabs: [changed], memberships: [ownerMembership], expenses: [activeExpense],
    });
    const financialService = new TabService(dependencies(financialStore));
    await expect(financialService.changeCurrency({
      actorId: 'alex', tabId: tab.id, currency: 'EUR', expectedRevision: 2,
      idempotencyKey: 'blocked-currency-change',
    })).rejects.toBeDefined();
    expect((await financialStore.readTab(tab.id))?.currency).toBe('CAD');
  });

  it('transfers ownership without allowing the final owner to be demoted', async () => {
    const { tab, ownerMembership } = createTabAggregate({
      id: 'tab-1', name: 'Trip', currency: 'USD', actorId: 'alex',
    });
    tab.memberIds.push('blair');
    const blair = { tabId: tab.id, userId: 'blair', role: 'member' as const, state: 'active' as const, revision: 1 };
    const store = new InMemoryApplicationStore({ tabs: [tab], memberships: [ownerMembership, blair] });
    const service = new TabService(dependencies(store));

    await expect(service.setMemberRole({
      actorId: 'alex', tabId: tab.id, userId: 'alex', role: 'admin', expectedRevision: 1,
      idempotencyKey: 'demote-last-owner',
    })).rejects.toMatchObject({ code: 'conflict' });

    const twoOwners = await service.setMemberRole({
      actorId: 'alex', tabId: tab.id, userId: 'blair', role: 'owner', expectedRevision: 1,
      idempotencyKey: 'promote-owner',
    });
    const transferred = await service.setMemberRole({
      actorId: 'alex', tabId: tab.id, userId: 'alex', role: 'member', expectedRevision: 2,
      idempotencyKey: 'complete-transfer',
    });
    expect(twoOwners.ownerIds).toEqual(['alex', 'blair']);
    expect(transferred.ownerIds).toEqual(['blair']);
    expect(await store.readMembership(tab.id, 'blair')).toEqual(expect.objectContaining({ role: 'owner' }));
  });

  it('creates an intended-recipient invitation and accepts it idempotently', async () => {
    const { tab, ownerMembership } = createTabAggregate({
      id: 'tab-1', name: 'Trip', currency: 'USD', actorId: 'alex',
    });
    const store = new InMemoryApplicationStore({ tabs: [tab], memberships: [ownerMembership] });
    const service = new TabService(dependencies(store));
    const invitation = await service.inviteMember({
      actorId: 'alex', tabId: tab.id, recipientUserId: 'blair', role: 'member',
      expectedRevision: 1, idempotencyKey: 'invite-blair-0001',
    });
    expect(invitation).toEqual(expect.objectContaining({
      tabName: 'Trip', recipientUserId: 'blair', state: 'pending',
    }));

    await expect(service.acceptInvitation({
      actorId: 'casey', invitationId: invitation.id, idempotencyKey: 'accept-wrong-user',
    })).rejects.toMatchObject({ code: 'forbidden' });
    const command = { actorId: 'blair', invitationId: invitation.id, idempotencyKey: 'accept-blair-0001' };
    const [accepted, retry] = await Promise.all([
      service.acceptInvitation(command), service.acceptInvitation(command),
    ]);
    expect(retry).toEqual(accepted);
    expect(accepted.memberIds).toEqual(['alex', 'blair']);
    expect(await store.readInvitation(invitation.id)).toEqual(expect.objectContaining({ state: 'accepted' }));
    expect(await store.readMembership(tab.id, 'blair')).toEqual(expect.objectContaining({ state: 'active' }));

    const secondKey = await service.acceptInvitation({
      actorId: 'blair', invitationId: invitation.id, idempotencyKey: 'accept-blair-0002',
    });
    expect(secondKey).toEqual(accepted);
  });

  it('persists invitation expiry before reporting the conflict', async () => {
    const { tab, ownerMembership } = createTabAggregate({
      id: 'tab-1', name: 'Trip', currency: 'USD', actorId: 'alex',
    });
    const invitation = {
      id: 'invitation-1', tabId: tab.id, tabName: tab.name, inviterId: 'alex',
      recipientUserId: 'blair', role: 'member' as const, state: 'pending' as const,
      expiresAt: '2026-08-01T12:00:00.000Z', revision: 1,
    };
    const store = new InMemoryApplicationStore({
      tabs: [tab], memberships: [ownerMembership], invitations: [invitation],
    });
    const service = new TabService(dependencies(store));

    await expect(service.acceptInvitation({
      actorId: 'blair', invitationId: invitation.id, idempotencyKey: 'accept-expired-0001',
    })).rejects.toMatchObject({ code: 'conflict' });
    expect(await store.readInvitation(invitation.id)).toEqual(expect.objectContaining({
      state: 'expired', revision: 2,
    }));
  });
});
