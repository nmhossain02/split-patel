export type PublicProfile = {
  id: string;
  displayName: string;
  photoURL: string | null;
  status: 'active' | 'disabled';
};

export type SubscriptionErrorHandler = (error: Error) => void;
export type Unsubscribe = () => void;
export type SnapshotMetadata = { fromCache: boolean };

export type TabRole = 'owner' | 'admin' | 'member';
export type MembershipState = 'active' | 'left' | 'removed';

export type Membership = {
  tabId: string;
  userId: string;
  role: TabRole;
  state: MembershipState;
  revision: number;
};

export type TabAggregate = {
  id: string;
  name: string;
  currency: string;
  status: 'active' | 'archived';
  createdBy: string;
  ownerIds: string[];
  memberIds: string[];
  revision: number;
};

export type TabSummary = TabAggregate & {
  memberCount: number;
  lastActivityAt: string | null;
};
