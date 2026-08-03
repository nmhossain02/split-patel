import { TabRole } from '../tabs/types';

export type Invitation = {
  id: string;
  tabId: string;
  tabName: string;
  inviterId: string;
  recipientUserId: string;
  role: Exclude<TabRole, 'owner'>;
  state: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
  expiresAt: string;
  revision: number;
};
