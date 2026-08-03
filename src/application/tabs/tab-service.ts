import { ApplicationError } from '../errors';
import { Clock, IdGenerator, RequestFingerprinter } from '../ports/runtime';
import { ApplicationStore, AuditEvent, MutationRecord, StoreTransaction } from '../ports/store';
import { assertCanPerformTabAction, changeTabCurrency, createTabAggregate, renameTab, setTabArchived } from '@/domain/tabs/tab';
import { Membership, TabAggregate } from '@/domain/tabs/types';
import { Invitation } from '@/domain/invitations/types';
import {
  AddTabMemberCommand,
  CreateTabCommand,
  EndTabMembershipCommand,
  RenameTabCommand,
  SetTabArchivedCommand,
  SetMemberRoleCommand,
  InviteMemberCommand,
  AcceptInvitationCommand,
  ChangeTabCurrencyCommand,
} from './commands';

type TabServiceDependencies = {
  store: ApplicationStore;
  clock: Clock;
  ids: IdGenerator;
  fingerprinter: RequestFingerprinter;
};

export class TabService {
  constructor(private readonly dependencies: TabServiceDependencies) {}

  async createTab(command: CreateTabCommand): Promise<TabAggregate> {
    if (!command.actorId) throw new ApplicationError('unauthenticated', 'Authentication is required.');
    const scope = `account:${command.actorId}`;
    return this.dependencies.store.transaction(async transaction => {
      const fingerprint = this.dependencies.fingerprinter.fingerprint(command);
      const replay = await this.replayTab(transaction, scope, command.idempotencyKey, command, fingerprint);
      if (replay) return replay;

      const { tab, ownerMembership } = createTabAggregate({
        id: this.dependencies.ids.next('tab'),
        name: command.name,
        currency: command.currency,
        actorId: command.actorId,
      });
      await transaction.putTab(tab);
      await transaction.putMembership(ownerMembership);
      await this.record(transaction, scope, command, fingerprint, tab, null);
      return tab;
    });
  }

  async renameTab(command: RenameTabCommand): Promise<TabAggregate> {
    return this.mutateExistingTab(command, 'rename_tab', async (transaction, tab, actor) => {
      const next = renameTab(tab, actor, command.name, command.expectedRevision);
      await transaction.putTab(next);
      return next;
    });
  }

  async changeCurrency(command: ChangeTabCurrencyCommand): Promise<TabAggregate> {
    return this.mutateExistingTab(command, 'change_tab_currency', async (transaction, tab, actor) => {
      const hasFinancialActivity = await transaction.hasFinancialActivity(tab.id);
      const next = changeTabCurrency(
        tab,
        actor,
        command.currency,
        command.expectedRevision,
        hasFinancialActivity,
      );
      await transaction.putTab(next);
      return next;
    });
  }

  async setArchived(command: SetTabArchivedCommand): Promise<TabAggregate> {
    return this.mutateExistingTab(command, command.archived ? 'archive_tab' : 'restore_tab', async (transaction, tab, actor) => {
      const next = setTabArchived(tab, actor, command.archived, command.expectedRevision);
      await transaction.putTab(next);
      return next;
    });
  }

  async addMember(command: AddTabMemberCommand): Promise<TabAggregate> {
    return this.mutateExistingTab(command, 'add_tab_member', async (transaction, tab, actor) => {
      assertCanPerformTabAction(tab, actor, command.role === 'admin' ? 'promote_admin' : 'invite_member');
      this.assertRevision(tab, command.expectedRevision);
      if (!command.userId.trim()) throw new ApplicationError('validation_failed', 'User ID is required.');
      if (tab.memberIds.includes(command.userId)) {
        throw new ApplicationError('conflict', 'User is already an active member.');
      }
      if (tab.memberIds.length >= 100) {
        throw new ApplicationError('validation_failed', 'Tab has reached its 100-member limit.');
      }

      const existing = await transaction.getMembership(tab.id, command.userId);
      const membership: Membership = {
        tabId: tab.id,
        userId: command.userId,
        role: command.role,
        state: 'active',
        revision: (existing?.revision ?? 0) + 1,
      };
      const next: TabAggregate = {
        ...tab,
        memberIds: [...tab.memberIds, command.userId].sort(),
        revision: tab.revision + 1,
      };
      await transaction.putMembership(membership);
      await transaction.putTab(next);
      return next;
    });
  }

  async endMembership(command: EndTabMembershipCommand): Promise<TabAggregate> {
    return this.mutateExistingTab(command, 'end_tab_membership', async (transaction, tab, actor) => {
      this.assertRevision(tab, command.expectedRevision);
      const target = await transaction.getMembership(tab.id, command.userId);
      if (!target || target.state !== 'active') {
        throw new ApplicationError('not_found', 'Active membership not found.');
      }
      const endingSelf = command.actorId === command.userId;
      if (!endingSelf) {
        assertCanPerformTabAction(tab, actor, 'remove_member');
        if (target.role === 'owner' && actor.role !== 'owner') {
          throw new ApplicationError('forbidden', 'Only owners may remove another owner.');
        }
      }
      const targetBalance = (await transaction.listBalances(tab.id))
        .find(balance => balance.memberId === command.userId)?.netMinor ?? 0;
      if (targetBalance !== 0) {
        throw new ApplicationError('conflict', 'Membership has an outstanding balance.');
      }
      if (target.role === 'owner' && tab.ownerIds.length === 1) {
        throw new ApplicationError('conflict', 'The last owner cannot leave or be removed.');
      }

      const nextMembership: Membership = {
        ...target,
        state: endingSelf ? 'left' : 'removed',
        revision: target.revision + 1,
      };
      const next: TabAggregate = {
        ...tab,
        memberIds: tab.memberIds.filter(id => id !== command.userId),
        ownerIds: tab.ownerIds.filter(id => id !== command.userId),
        revision: tab.revision + 1,
      };
      await transaction.putMembership(nextMembership);
      await transaction.putTab(next);
      return next;
    });
  }

  async setMemberRole(command: SetMemberRoleCommand): Promise<TabAggregate> {
    return this.mutateExistingTab(command, 'set_member_role', async (transaction, tab, actor) => {
      assertCanPerformTabAction(tab, actor, 'promote_admin');
      this.assertRevision(tab, command.expectedRevision);
      const target = await transaction.getMembership(tab.id, command.userId);
      if (!target || target.state !== 'active') {
        throw new ApplicationError('not_found', 'Active membership not found.');
      }
      if (target.role === command.role) return tab;
      if (target.role === 'owner' && command.role !== 'owner' && tab.ownerIds.length === 1) {
        throw new ApplicationError('conflict', 'The last owner cannot be demoted.');
      }
      const nextMembership: Membership = { ...target, role: command.role, revision: target.revision + 1 };
      const ownerIds = command.role === 'owner'
        ? [...new Set([...tab.ownerIds, command.userId])].sort()
        : tab.ownerIds.filter(id => id !== command.userId);
      const next: TabAggregate = { ...tab, ownerIds, revision: tab.revision + 1 };
      await transaction.putMembership(nextMembership);
      await transaction.putTab(next);
      return next;
    });
  }

  async inviteMember(command: InviteMemberCommand): Promise<Invitation> {
    return this.dependencies.store.transaction(async transaction => {
      const fingerprint = this.dependencies.fingerprinter.fingerprint(command);
      const replay = await this.replayInvitation(
        transaction, command.tabId, command.idempotencyKey, command.actorId, 'invite_member', fingerprint,
      );
      if (replay) return replay;
      const tab = await transaction.getTab(command.tabId);
      if (!tab) throw new ApplicationError('not_found', 'Tab not found.');
      const actor = await transaction.getMembership(tab.id, command.actorId);
      if (!actor || actor.state !== 'active') throw new ApplicationError('forbidden', 'Active tab membership is required.');
      assertCanPerformTabAction(tab, actor, command.role === 'admin' ? 'promote_admin' : 'invite_member');
      this.assertRevision(tab, command.expectedRevision);
      if (tab.memberIds.includes(command.recipientUserId)) {
        throw new ApplicationError('conflict', 'User is already an active member.');
      }
      const now = this.dependencies.clock.now();
      const invitation: Invitation = {
        id: this.dependencies.ids.next('invitation'),
        tabId: tab.id,
        tabName: tab.name,
        inviterId: command.actorId,
        recipientUserId: command.recipientUserId,
        role: command.role,
        state: 'pending',
        expiresAt: new Date(new Date(now).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        revision: 1,
      };
      await transaction.putInvitation(invitation);
      await this.recordInvitation(transaction, command.tabId, command, fingerprint, invitation, 'invite_member');
      return invitation;
    });
  }

  async acceptInvitation(command: AcceptInvitationCommand): Promise<TabAggregate> {
    const scope = `account:${command.actorId}`;
    const result = await this.dependencies.store.transaction(async transaction => {
      const fingerprint = this.dependencies.fingerprinter.fingerprint(command);
      const replay = await this.replayTab(
        transaction, scope, command.idempotencyKey, command, fingerprint, 'accept_invitation',
      );
      if (replay) return { tab: replay, expired: false };
      const invitation = await transaction.getInvitation(command.invitationId);
      if (!invitation) throw new ApplicationError('not_found', 'Invitation not found.');
      if (invitation.recipientUserId !== command.actorId) {
        throw new ApplicationError('forbidden', 'Invitation belongs to another user.');
      }
      if (invitation.state === 'accepted') {
        const acceptedTab = await transaction.getTab(invitation.tabId);
        const acceptedMembership = acceptedTab
          ? await transaction.getMembership(acceptedTab.id, command.actorId)
          : null;
        if (acceptedTab && acceptedMembership?.state === 'active'
          && acceptedTab.memberIds.includes(command.actorId)) {
          return { tab: acceptedTab, expired: false };
        }
        throw new ApplicationError('conflict', 'Accepted invitation membership is inconsistent.');
      }
      if (invitation.state !== 'pending') throw new ApplicationError('conflict', 'Invitation is no longer pending.');
      if (new Date(invitation.expiresAt).getTime() <= new Date(this.dependencies.clock.now()).getTime()) {
        await transaction.putInvitation({ ...invitation, state: 'expired', revision: invitation.revision + 1 });
        return { tab: null, expired: true };
      }
      const tab = await transaction.getTab(invitation.tabId);
      if (!tab) throw new ApplicationError('not_found', 'Tab not found.');
      if (tab.status !== 'active') throw new ApplicationError('conflict', 'Archived tabs cannot accept invitations.');
      if (tab.memberIds.length >= 100) throw new ApplicationError('validation_failed', 'Tab has reached its member limit.');
      const existing = await transaction.getMembership(tab.id, command.actorId);
      if (existing?.state === 'active' && tab.memberIds.includes(command.actorId)) {
        await transaction.putInvitation({ ...invitation, state: 'accepted', revision: invitation.revision + 1 });
        await this.record(transaction, scope, command, fingerprint, tab, tab.revision, 'accept_invitation');
        return { tab, expired: false };
      }
      const membership: Membership = {
        tabId: tab.id,
        userId: command.actorId,
        role: invitation.role,
        state: 'active',
        revision: (existing?.revision ?? 0) + 1,
      };
      const next: TabAggregate = {
        ...tab,
        memberIds: [...new Set([...tab.memberIds, command.actorId])].sort(),
        revision: tab.revision + 1,
      };
      await transaction.putMembership(membership);
      await transaction.putTab(next);
      await transaction.putInvitation({ ...invitation, state: 'accepted', revision: invitation.revision + 1 });
      await this.record(transaction, scope, command, fingerprint, next, tab.revision, 'accept_invitation');
      return { tab: next, expired: false };
    });
    if (result.expired || !result.tab) throw new ApplicationError('conflict', 'Invitation has expired.');
    return result.tab;
  }

  private async mutateExistingTab<T extends { actorId: string; tabId: string; idempotencyKey: string }>(
    command: T,
    commandType: string,
    mutate: (
      transaction: StoreTransaction,
      tab: TabAggregate,
      actor: Membership,
    ) => Promise<TabAggregate>,
  ): Promise<TabAggregate> {
    return this.dependencies.store.transaction(async transaction => {
      const fingerprint = this.dependencies.fingerprinter.fingerprint(command);
      const replay = await this.replayTab(transaction, command.tabId, command.idempotencyKey, command, fingerprint, commandType);
      if (replay) return replay;
      const tab = await transaction.getTab(command.tabId);
      if (!tab) throw new ApplicationError('not_found', 'Tab not found.');
      const actor = await transaction.getMembership(command.tabId, command.actorId);
      if (!actor || actor.state !== 'active') {
        throw new ApplicationError('forbidden', 'Active tab membership is required.');
      }
      const previousRevision = tab.revision;
      const next = await mutate(transaction, tab, actor);
      await this.record(transaction, command.tabId, command, fingerprint, next, previousRevision, commandType);
      return next;
    });
  }

  private assertRevision(tab: TabAggregate, expectedRevision: number): void {
    if (tab.revision !== expectedRevision) {
      throw new ApplicationError('conflict', 'Tab has changed since it was loaded.');
    }
  }

  private async replayTab(
    transaction: StoreTransaction,
    scope: string,
    key: string,
    command: { actorId: string },
    fingerprint: string,
    commandType = 'create_tab',
  ): Promise<TabAggregate | null> {
    const mutation = await transaction.getMutation(scope, key);
    if (!mutation) return null;
    if (
      mutation.actorId !== command.actorId
      || mutation.commandType !== commandType
      || mutation.requestFingerprint !== fingerprint
    ) {
      throw new ApplicationError('idempotency_conflict', 'Idempotency key was used for another request.');
    }
    const tab = await transaction.getTab(mutation.aggregateId);
    if (!tab) throw new ApplicationError('conflict', 'Completed mutation result is missing.');
    return tab;
  }

  private async replayInvitation(
    transaction: StoreTransaction,
    scope: string,
    key: string,
    actorId: string,
    commandType: string,
    fingerprint: string,
  ): Promise<Invitation | null> {
    const mutation = await transaction.getMutation(scope, key);
    if (!mutation) return null;
    if (mutation.actorId !== actorId || mutation.commandType !== commandType
      || mutation.requestFingerprint !== fingerprint) {
      throw new ApplicationError('idempotency_conflict', 'Idempotency key was used for another request.');
    }
    const invitation = await transaction.getInvitation(mutation.aggregateId);
    if (!invitation) throw new ApplicationError('conflict', 'Completed invitation result is missing.');
    return invitation;
  }

  private async recordInvitation(
    transaction: StoreTransaction,
    scope: string,
    command: { actorId: string; idempotencyKey: string },
    fingerprint: string,
    invitation: Invitation,
    commandType: string,
  ): Promise<void> {
    const occurredAt = this.dependencies.clock.now();
    await transaction.putMutation(scope, {
      key: command.idempotencyKey, actorId: command.actorId, commandType,
      requestFingerprint: fingerprint, aggregateId: invitation.id,
      resultRevision: invitation.revision, completedAt: occurredAt,
    });
    await transaction.appendAuditEvent({
      id: this.dependencies.ids.next('audit'), tabId: invitation.tabId, actorId: command.actorId,
      action: commandType, aggregateId: invitation.id, previousRevision: null,
      nextRevision: invitation.revision, occurredAt, correlationId: command.idempotencyKey,
    });
  }

  private async record(
    transaction: StoreTransaction,
    scope: string,
    command: { actorId: string; idempotencyKey: string },
    fingerprint: string,
    tab: TabAggregate,
    previousRevision: number | null,
    commandType = 'create_tab',
  ): Promise<void> {
    const occurredAt = this.dependencies.clock.now();
    const mutation: MutationRecord = {
      key: command.idempotencyKey,
      actorId: command.actorId,
      commandType,
      requestFingerprint: fingerprint,
      aggregateId: tab.id,
      resultRevision: tab.revision,
      completedAt: occurredAt,
    };
    const audit: AuditEvent = {
      id: this.dependencies.ids.next('audit'),
      tabId: tab.id,
      actorId: command.actorId,
      action: commandType,
      aggregateId: tab.id,
      previousRevision,
      nextRevision: tab.revision,
      occurredAt,
      correlationId: command.idempotencyKey,
    };
    await transaction.putMutation(scope, mutation);
    await transaction.appendAuditEvent(audit);
  }
}
