import { TabRole } from '@/domain/tabs/types';

export type CreateTabCommand = {
  actorId: string;
  name: string;
  currency: string;
  idempotencyKey: string;
};

export type RenameTabCommand = {
  actorId: string;
  tabId: string;
  name: string;
  expectedRevision: number;
  idempotencyKey: string;
};

export type ChangeTabCurrencyCommand = {
  actorId: string;
  tabId: string;
  currency: string;
  expectedRevision: number;
  idempotencyKey: string;
};

export type SetTabArchivedCommand = {
  actorId: string;
  tabId: string;
  archived: boolean;
  expectedRevision: number;
  idempotencyKey: string;
};

export type AddTabMemberCommand = {
  actorId: string;
  tabId: string;
  userId: string;
  role: Exclude<TabRole, 'owner'>;
  expectedRevision: number;
  idempotencyKey: string;
};

export type EndTabMembershipCommand = {
  actorId: string;
  tabId: string;
  userId: string;
  expectedRevision: number;
  idempotencyKey: string;
};

export type SetMemberRoleCommand = {
  actorId: string;
  tabId: string;
  userId: string;
  role: TabRole;
  expectedRevision: number;
  idempotencyKey: string;
};

export type InviteMemberCommand = {
  actorId: string;
  tabId: string;
  recipientUserId: string;
  role: Exclude<TabRole, 'owner'>;
  expectedRevision: number;
  idempotencyKey: string;
};

export type AcceptInvitationCommand = {
  actorId: string;
  invitationId: string;
  idempotencyKey: string;
};
