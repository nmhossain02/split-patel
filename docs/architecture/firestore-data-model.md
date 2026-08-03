# Firestore data and access model

## Status and scope

This is the implemented production storage design. Clients have read access only
where authorized. Callable functions own authoritative mutations and execute
source, projection, idempotency, and audit writes transactionally.

The design supports fewer than 100 initial users without sacrificing financial
correctness, privacy, or a safe path to larger history volumes.

## Storage principles

1. Domain behavior does not depend on Firestore document shape.
2. Expense and settlement records are financial source data.
3. Balances are derived, rebuildable projections.
4. Money uses integer minor units plus an ISO 4217 currency.
5. Financial, membership, and projection writes are server-authoritative.
6. Every retriable mutation is idempotent and revision checked.
7. Collections used in history screens are paginated from the first release.
8. Public profile data and private account data are separate documents because
   Firestore cannot grant field-level read access within one document.

## Collection layout

```text
profiles/{uid}
users/{uid}
tabs/{tabId}
  members/{uid}
  expenses/{expenseId}
    items/{itemId}
  settlements/{settlementId}
  balances/{uid}
  mutationKeys/{idempotencyKey}
  auditEvents/{eventId}
invitations/{invitationId}
```

Document names are storage terms. Domain types remain defined in
[the domain model](domain-model.md).

## Documents

### `profiles/{uid}`

Readable by authenticated users:

```ts
type ProfileDocument = {
  displayName: string;
  photoURL: string | null;
  status: 'active' | 'disabled';
  updatedAt: Timestamp;
  schemaVersion: 1;
};
```

Email, provider identifiers, roles, and preferences are forbidden here.

### `users/{uid}`

Readable only by the owner and trusted backend:

```ts
type UserDocument = {
  email: string | null;
  emailNormalized: string | null;
  accountStatus: 'active' | 'disabled' | 'deletion_requested';
  preferences: {
    locale: string;
    defaultCurrency: string | null;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
  schemaVersion: 1;
};
```

Authentication provisioning creates or updates both user and profile documents
idempotently by UID.

### `tabs/{tabId}`

```ts
type TabDocument = {
  name: string;
  currency: string;
  status: 'active' | 'archived';
  createdBy: string;
  ownerIds: string[];
  memberIds: string[];
  memberCount: number;
  revision: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastActivityAt: Timestamp;
  schemaVersion: 1;
};
```

`memberIds` is a deliberately denormalized authorization and query index. The
authoritative role and membership lifecycle live in member documents. Membership
commands update both representations in one trusted transaction. A repair job
must detect and reconcile divergence.

The maximum 100 active members keeps the array bounded. Clients must not directly
modify `memberIds`, `ownerIds`, or `memberCount`.

### `tabs/{tabId}/members/{uid}`

```ts
type MembershipDocument = {
  userId: string;
  role: 'owner' | 'admin' | 'member';
  state: 'active' | 'left' | 'removed';
  invitedBy: string | null;
  joinedAt: Timestamp;
  updatedAt: Timestamp;
  endedAt: Timestamp | null;
  revision: number;
  schemaVersion: 1;
};
```

The document remains after departure so historical records can resolve the
participant without restoring access.

### `tabs/{tabId}/expenses/{expenseId}`

The parent document is a history-list summary and contribution source:

```ts
type ExpenseDocument = {
  description: string;
  currency: string;
  totalMinor: number;
  contributions: Array<{ memberId: string; amountMinor: number }>;
  participantIds: string[];
  itemCount: number;
  expenseDate: Timestamp;
  status: 'active' | 'voided';
  createdBy: string;
  revision: number;
  idempotencyKey: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  voidedAt: Timestamp | null;
  schemaVersion: 1;
};
```

`participantIds` supports member-specific history queries if needed and is
derived from contributions and allocations. It is not an authorization field.

### `tabs/{tabId}/expenses/{expenseId}/items/{itemId}`

```ts
type ExpenseItemDocument = {
  description: string;
  amountMinor: number;
  position: number;
  allocations: Array<{ memberId: string; amountMinor: number }>;
  schemaVersion: 1;
};
```

Items are separate so expense history does not repeatedly download receipt
details. The target limits keep a complete expense write below Firestore batch
and transaction limits. The backend validates parent, contributions, items, and
balance deltas as one logical command.

### `tabs/{tabId}/settlements/{settlementId}`

```ts
type SettlementDocument = {
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
  currency: string;
  method: 'cash' | 'bank' | 'venmo' | 'paypal' | 'cash_app' | 'other';
  note: string | null;
  occurredAt: Timestamp;
  status: 'active' | 'voided';
  createdBy: string;
  revision: number;
  idempotencyKey: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  schemaVersion: 1;
};
```

Provider labels are descriptive until an integration specification defines
verification. They must not be presented as proof that a provider processed a
payment.

### `tabs/{tabId}/balances/{uid}`

```ts
type BalanceProjectionDocument = {
  memberId: string;
  currency: string;
  netMinor: number;
  sourceRevision: number;
  updatedAt: Timestamp;
  schemaVersion: 1;
};
```

These documents are read-optimized projections. The sum for a tab must equal
zero. A backend verification job periodically recalculates them from active
expenses and settlements and emits an alert on mismatch.

### Mutation keys and audit events

`mutationKeys/{idempotencyKey}` stores command type, actor, aggregate ID, request
hash, result reference, and completion timestamp. Reuse with a different request
hash is a conflict.

`auditEvents/{eventId}` stores actor, action, target, old and new revision,
correlation ID, and server timestamp. It must not store unnecessary profile or
secret data. Audit events are append-only to clients.

### `invitations/{invitationId}`

Invitations are top-level because a recipient must discover them before becoming
a tab member. They contain tab ID, inviter UID, recipient UID when known, role,
state, expiry, and timestamps. Email-based discovery requires a trusted backend
lookup against private normalized email data. Raw invitation tokens and email
addresses must not be broadly queryable.

## Access patterns and indexes

| User behavior | Storage operation | Index or design requirement |
| --- | --- | --- |
| Load own account | Get `users/{uid}` and `profiles/{uid}` | Document IDs |
| List my tabs | Query `tabs` where `memberIds` array-contains UID, order by `lastActivityAt desc`, paginate, then get the signed-in member's balance document for each row in the 25-tab page | Composite index: `memberIds ARRAY`, `lastActivityAt DESC`; bounded parallel document gets |
| Open a tab | Get tab, active member documents, then required profiles | Membership and profile document IDs; profile reads batched |
| List expenses | Query `tabs/{id}/expenses` by `expenseDate desc`, document ID as cursor, limit 25 | Single-field date index; stable cursor |
| Open expense | Get expense and query items by `position asc` | Item position index |
| Show balances | Query `tabs/{id}/balances`, then resolve profiles | Small bounded collection |
| List settlements | Query settlements by `occurredAt desc`, paginate | Single-field timestamp index |
| Find pending invitations | Query top-level invitations by `recipientUid` and `state`, order by expiry | Composite index |
| Rebuild balances | Page through all active expenses/items and settlements for one tab | Backend-only operation |
| Find a member's expense involvement | Optional collection query by `participantIds` plus date | Add only when the UI requires it |

Every required composite index must be committed in `firestore.indexes.json` and
tested through the emulator. Do not add speculative indexes for unsupported UI.

## Mutation paths

### Client-readable operations

Authenticated clients may directly read documents permitted by security rules and
subscribe to bounded list/detail projections. Every subscription needs explicit
loading, permission, retry, and unsubscribe behavior.

### Server-authoritative commands

The client sends a typed command to a trusted callable function or API for:

- Tab creation and membership changes
- Expense create, edit, and void
- Settlement create, edit, and void
- Tab archive, restore, and ownership transfer

The command handler:

1. Authenticates the actor.
2. Checks tab and membership authorization.
3. Claims or verifies the idempotency key.
4. Reads the expected aggregate revision.
5. Runs pure domain validation and calculates old and new ledger effects.
6. Writes source documents, membership denormalization, projection deltas, audit
   event, and mutation result atomically where Firestore limits permit.
7. Returns a typed result with new revision and server timestamps.

If a command cannot fit safely in one transaction, it uses an idempotent staged
workflow with an observable status document. The UI must not claim success before
that workflow reaches a committed state.

## Security rules requirements

Rules must be emulator tested for allowed and denied cases.

- `users/{uid}`: only matching UID may read; client writes are restricted to an
  explicitly permitted preference subset or disabled entirely.
- `profiles/{uid}`: authenticated users may read; owner updates are field allowlisted
  or performed by the backend.
- `tabs/{tabId}` and children: only active members may read, except the narrowly
  defined invitation preview.
- Financial, membership, balance, audit, and mutation-key client writes are denied.
- Queries must include constraints that let Firestore prove the rule for every
  possible result.
- Unknown fields, wrong schema versions, oversized arrays, and invalid field types
  are rejected on any client-writable document.
- Disabled users and archived tabs cannot perform new financial mutations.

The current rule that allows every authenticated user to read complete `users`
documents must be removed when public and private documents are separated.

## Consistency and repair

- `memberIds`, member documents, and `memberCount` are checked for consistency.
- Expense and settlement revisions are monotonic.
- Balance projections are recalculable and checked for zero sum.
- Failed projection or audit work is retried idempotently and surfaced through
  monitoring rather than silently logged.
- Repair tools operate on one tab at a time, support dry-run output, and preserve
  source financial records.

## Offline and retry behavior

Firestore cache may support read-only offline viewing. Financial mutations use
command idempotency and display a pending state while connectivity is uncertain.
The client must not create an optimistic duplicate expense after a timeout. On
reconnect it queries the command result by idempotency key.

## Data lifecycle and operations

- Use separate Firebase projects for development, test, and production.
- Emulator tests must never connect to production.
- Backups, restore drills, retention, and deletion workflows are required before
  production launch.
- Schema changes increment `schemaVersion` and include a resumable, idempotent
  migration with progress reporting and rollback or forward-repair guidance.
- Structured logs include correlation ID, actor UID, tab ID, command type, result,
  latency, and safe error code, without financial notes or private email content.
- Alerts cover failed financial commands, projection mismatches, rule denials that
  indicate client regressions, and migration failures.

## Rejected alternatives

### Obsolete PostgreSQL/Prisma schema

It does not match the Expo/Firebase application and is archived. Reintroducing a
relational backend requires a new architecture decision and migration plan.

### Floating-point amounts

They cannot provide exact financial invariants and are forbidden.

### Direct client writes for financial documents

Firestore rules are not a sufficient domain-validation engine for multi-document
totals, revisions, idempotency, audit events, and balance projection deltas.

### One growing tab document containing all history

It creates contention, document-size risk, repeated downloads, and poor pagination.

### Persisting only pairwise debts

Pairwise suggestions change when balances change and lose the source explanation.
Expenses and settlements remain authoritative; suggestions are derived.
