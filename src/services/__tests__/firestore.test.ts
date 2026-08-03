import { getOwnTabBalances, getTabs } from '../firestore';
import firestore from '@react-native-firebase/firestore';

jest.mock('@react-native-firebase/firestore', () => {
  const query: Record<string, jest.Mock> = {};
  query.where = jest.fn(() => query);
  query.orderBy = jest.fn(() => query);
  query.limit = jest.fn(() => query);
  query.onSnapshot = jest.fn();
  const mockGet = jest.fn();
  const mockDoc = jest.fn(() => ({ get: mockGet }));
  const mockCollection = jest.fn(() => query);
  const mockFirestore = () => ({ collection: mockCollection, doc: mockDoc });
  mockFirestore.FieldPath = { documentId: jest.fn(() => '__name__') };
  mockFirestore.mockGet = mockGet;
  mockFirestore.mockDoc = mockDoc;
  return {
    __esModule: true,
    default: mockFirestore,
  };
});
jest.mock('@react-native-firebase/auth', () => () => ({
  currentUser: { uid: 'test-user-id' },
}));

describe('Firestore read service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('constrains and bounds the current user tab query', () => {
    getTabs();
    const collection = firestore().collection as jest.Mock;
    const query = collection.mock.results.at(-1)?.value;
    expect(collection).toHaveBeenCalledWith('tabs');
    expect(query.where).toHaveBeenCalledWith('memberIds', 'array-contains', 'test-user-id');
    expect(query.where).toHaveBeenCalledWith('status', '==', 'active');
    expect(query.orderBy).toHaveBeenCalledWith('lastActivityAt', 'desc');
    expect(query.orderBy).toHaveBeenCalledTimes(2);
    expect(query.limit).toHaveBeenCalledWith(25);
  });

  it('loads the signed-in member balance for every paginated tab row', async () => {
    const firebaseMock = firestore as unknown as {
      mockGet: jest.Mock;
      mockDoc: jest.Mock;
    };
    const tabs = Array.from({ length: 26 }, (_, index) => ({
      id: `tab-${index}`, name: `Tab ${index}`, currency: 'USD', status: 'active' as const,
      createdBy: 'test-user-id', ownerIds: ['test-user-id'], memberIds: ['test-user-id'],
      memberCount: 1, revision: 1, lastActivityAt: '2026-08-02T00:00:00.000Z',
    }));
    firebaseMock.mockGet.mockImplementation(async () => ({
      exists: () => true, data: () => ({ netMinor: 123 }),
    }));

    const balances = await getOwnTabBalances(tabs);

    expect(firebaseMock.mockDoc).toHaveBeenCalledTimes(26);
    expect(firebaseMock.mockDoc).toHaveBeenCalledWith('tabs/tab-25/balances/test-user-id');
    expect(balances.size).toBe(26);
    expect(balances.get('tab-25')).toBe(123);
  });
});
