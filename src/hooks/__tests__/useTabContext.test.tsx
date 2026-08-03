import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Button, Text } from 'react-native';
import { useTabContext } from '../useTabContext';
import {
  getProfiles,
  subscribeToMemberships,
  subscribeToTab,
} from '@/services/firestore';
import { Membership, TabSummary } from '@/domain/tabs/types';

jest.mock('@/services/firestore', () => ({
  getProfiles: jest.fn(),
  subscribeToMemberships: jest.fn(),
  subscribeToTab: jest.fn(),
}));

let tabData: (tab: TabSummary | null) => void;
let tabError: (error: Error) => void;
let membershipData: (memberships: Membership[]) => void;

const Probe = () => {
  const context = useTabContext('tab-1');
  return (
    <>
      <Text testID="state">{context.loading ? 'loading' : context.errorMessage ?? context.tab?.name}</Text>
      <Text testID="profiles">{[...context.profileById.values()].map(profile => profile.displayName).sort().join(',')}</Text>
      <Button title="Load historical" onPress={() => context.loadProfiles(['departed'])} />
    </>
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(subscribeToTab).mockImplementation((_tabId, onData, onError) => {
    tabData = onData;
    tabError = error => onError?.(error);
    return jest.fn();
  });
  jest.mocked(subscribeToMemberships).mockImplementation((_tabId, onData) => {
    membershipData = onData;
    return jest.fn();
  });
  jest.mocked(getProfiles).mockImplementation(async ids => ids.map(id => ({
    id,
    displayName: id === 'departed' ? 'Departed Blair' : 'Alex',
    photoURL: null,
    status: 'active' as const,
  })));
});

it('merges active and historical profiles without changing membership', async () => {
  const view = render(<Probe />);
  act(() => {
    tabData({
      id: 'tab-1', name: 'Trip', currency: 'USD', status: 'active', createdBy: 'alex',
      ownerIds: ['alex'], memberIds: ['alex'], memberCount: 1, revision: 1, lastActivityAt: null,
    });
    membershipData([{ tabId: 'tab-1', userId: 'alex', role: 'owner', state: 'active', revision: 1 }]);
  });
  await waitFor(() => expect(view.getByTestId('profiles')).toHaveTextContent('Alex'));
  fireEvent.press(view.getByText('Load historical'));
  await waitFor(() => expect(view.getByTestId('profiles')).toHaveTextContent('Alex,Departed Blair'));
});

it('distinguishes a missing tab from removed access', () => {
  const view = render(<Probe />);
  act(() => tabData(null));
  expect(view.getByTestId('state')).toHaveTextContent('Tab not found.');
  act(() => tabError(Object.assign(new Error('denied'), { code: 'firestore/permission-denied' })));
  expect(view.getByTestId('state')).toHaveTextContent('Access to this tab was removed.');
});
