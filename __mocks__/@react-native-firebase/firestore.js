const query = {
  where: jest.fn(() => query),
  orderBy: jest.fn(() => query),
  limit: jest.fn(() => query),
  onSnapshot: jest.fn(),
};
const mockCollection = jest.fn(() => query);
const mockDoc = jest.fn(() => ({
  get: jest.fn(),
  onSnapshot: jest.fn(),
}));

const firestore = () => ({
  collection: mockCollection,
  doc: mockDoc,
});

export default firestore;
