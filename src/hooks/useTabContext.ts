import { useCallback, useEffect, useMemo, useState } from 'react';
import { Membership, PublicProfile, TabSummary } from '@/domain/tabs/types';
import { getProfiles, subscribeToMemberships, subscribeToTab } from '@/services/firestore';

export const useTabContext = (tabId: string | undefined) => {
  const [tab, setTab] = useState<TabSummary | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadProfiles = useCallback(async (userIds: string[]) => {
    try {
      const loaded = await getProfiles(userIds);
      setProfiles(previous => {
        const merged = new Map(previous.map(profile => [profile.id, profile]));
        loaded.forEach(profile => merged.set(profile.id, profile));
        return [...merged.values()];
      });
    } catch {
      setErrorMessage('Some member profiles could not be loaded.');
    }
  }, []);

  useEffect(() => {
    if (!tabId) {
      setErrorMessage('Tab not found.');
      setLoading(false);
      return;
    }
    const fail = (error: Error) => {
      const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
      setErrorMessage(code.includes('permission-denied')
        ? 'Access to this tab was removed.'
        : 'Unable to load this tab. Check your connection and try again.');
      setLoading(false);
    };
    const unsubscribeTab = subscribeToTab(tabId, next => {
      setTab(next);
      setLoading(false);
      if (!next) setErrorMessage('Tab not found.');
    }, fail);
    const unsubscribeMembers = subscribeToMemberships(tabId, next => {
      setMemberships(next);
      void loadProfiles(next.map(item => item.userId));
    }, fail);
    return () => {
      unsubscribeTab();
      unsubscribeMembers();
    };
  }, [loadProfiles, tabId]);

  const profileById = useMemo(() => new Map(profiles.map(profile => [profile.id, profile])), [profiles]);
  return { tab, memberships, profileById, loadProfiles, loading, errorMessage };
};
