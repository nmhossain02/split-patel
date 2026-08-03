const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  where,
} = require('firebase/firestore');

const projectId = 'split-patel-rules-test';
let environment;

const dbFor = uid => environment.authenticatedContext(uid).firestore();

beforeAll(async () => {
  environment = await initializeTestEnvironment({ projectId });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'profiles/alex'), { displayName: 'Alex', schemaVersion: 1 }),
      setDoc(doc(db, 'users/alex'), { email: 'alex@example.test', accountStatus: 'active', schemaVersion: 1 }),
      setDoc(doc(db, 'users/blair'), { email: 'blair@example.test', accountStatus: 'active', schemaVersion: 1 }),
      setDoc(doc(db, 'users/casey'), { email: 'casey@example.test', accountStatus: 'active', schemaVersion: 1 }),
      setDoc(doc(db, 'tabs/trip'), {
        name: 'Trip',
        memberIds: ['alex', 'blair'],
        status: 'active',
        lastActivityAt: new Date('2026-01-01T00:00:00.000Z'),
        schemaVersion: 1,
      }),
      setDoc(doc(db, 'tabs/trip/members/alex'), { userId: 'alex', state: 'active', role: 'owner' }),
      setDoc(doc(db, 'tabs/trip/members/blair'), { userId: 'blair', state: 'left', role: 'member' }),
      setDoc(doc(db, 'tabs/trip/expenses/meal'), { description: 'Meal' }),
      setDoc(doc(db, 'tabs/trip/expenses/meal/items/main'), { description: 'Main' }),
      setDoc(doc(db, 'tabs/trip/settlements/payment'), { amountMinor: 100 }),
      setDoc(doc(db, 'tabs/trip/balances/alex'), { netMinor: 100 }),
      setDoc(doc(db, 'tabs/trip/auditEvents/event'), { action: 'create_expense' }),
      setDoc(doc(db, 'tabs/trip/mutationKeys/key'), { commandType: 'create_expense' }),
      setDoc(doc(db, 'invitations/invite'), {
        recipientUid: 'casey',
        inviterUid: 'alex',
        state: 'pending',
        expiresAt: new Date('2026-08-09T00:00:00.000Z'),
      }),
    ]);
  });
});

afterAll(async () => {
  await environment.cleanup();
});

test('separates public profiles from private account data', async () => {
  await assertSucceeds(getDoc(doc(dbFor('blair'), 'profiles/alex')));
  await assertSucceeds(getDoc(doc(dbFor('alex'), 'users/alex')));
  await assertFails(getDoc(doc(dbFor('blair'), 'users/alex')));
  await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), 'profiles/alex')));
});

test('requires an authorization-compatible query when listing tabs', async () => {
  const db = dbFor('alex');
  await assertSucceeds(getDocs(query(
    collection(db, 'tabs'),
    where('memberIds', 'array-contains', 'alex'),
    where('status', '==', 'active'),
    orderBy('lastActivityAt', 'desc'),
    orderBy(documentId(), 'desc'),
  )));
  await assertFails(getDocs(collection(db, 'tabs')));
  await assertFails(getDoc(doc(dbFor('casey'), 'tabs/trip')));
});

test('allows only active members to read tab children', async () => {
  const activeDb = dbFor('alex');
  await assertSucceeds(getDocs(collection(activeDb, 'tabs/trip/members')));
  await assertSucceeds(getDoc(doc(activeDb, 'tabs/trip/expenses/meal')));
  await assertSucceeds(getDoc(doc(activeDb, 'tabs/trip/expenses/meal/items/main')));
  await assertSucceeds(getDoc(doc(activeDb, 'tabs/trip/settlements/payment')));
  await assertSucceeds(getDoc(doc(activeDb, 'tabs/trip/balances/alex')));

  const formerDb = dbFor('blair');
  await assertFails(getDoc(doc(formerDb, 'tabs/trip/expenses/meal')));
  await assertFails(getDocs(collection(formerDb, 'tabs/trip/members')));
});

test('denies all direct client writes to authoritative documents', async () => {
  const db = dbFor('alex');
  const targets = [
    'profiles/alex',
    'users/alex',
    'tabs/new-tab',
    'tabs/trip',
    'tabs/trip/members/casey',
    'tabs/trip/expenses/new-expense',
    'tabs/trip/expenses/meal/items/extra',
    'tabs/trip/settlements/new-payment',
    'tabs/trip/balances/alex',
    'tabs/trip/auditEvents/new-event',
    'tabs/trip/mutationKeys/new-key',
    'invitations/new-invite',
  ];
  await Promise.all(targets.map(path => assertFails(setDoc(doc(db, path), { unsafe: true }))));
});

test('limits invitation reads to sender and recipient and hides internal records', async () => {
  await assertSucceeds(getDoc(doc(dbFor('alex'), 'invitations/invite')));
  await assertSucceeds(getDoc(doc(dbFor('casey'), 'invitations/invite')));
  await assertFails(getDoc(doc(dbFor('blair'), 'invitations/invite')));
  await assertFails(getDoc(doc(dbFor('alex'), 'tabs/trip/auditEvents/event')));
  await assertFails(getDoc(doc(dbFor('alex'), 'tabs/trip/mutationKeys/key')));
  await assertSucceeds(getDocs(query(
    collection(dbFor('casey'), 'invitations'),
    where('recipientUid', '==', 'casey'),
    where('state', '==', 'pending'),
    orderBy('expiresAt', 'asc'),
  )));
});

test('denies protected reads to a disabled authenticated account', async () => {
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'users/blair'), {
      email: 'blair@example.test', accountStatus: 'disabled', schemaVersion: 1,
    });
  });
  await assertFails(getDoc(doc(dbFor('blair'), 'profiles/alex')));
  await assertFails(getDoc(doc(dbFor('blair'), 'tabs/trip')));
});
