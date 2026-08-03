# Domain model

## Purpose

This document defines SplitPatel independently of React Native and Firestore. It
is the contract for calculations, application workflows, persistence adapters,
and user-facing specifications.

The initial deployment is expected to have fewer than 100 total users. The model
nevertheless protects financial correctness, privacy, auditability, and future
data migration. Scale assumptions may simplify operations, but they do not change
money or authorization invariants.

## Terms

- **User**: an authenticated account with private account data.
- **Profile**: the limited user identity visible to other authenticated users.
- **Tab**: an expense-sharing group, such as a trip, household, or event.
- **Member**: a user participating in a tab with a role and lifecycle state.
- **Expense**: a recorded purchase or charge allocated among tab members.
- **Contribution**: money a member paid toward an expense.
- **Allocation**: the portion of an expense a member is responsible for.
- **Settlement**: an external payment recorded between two members to reduce an
  outstanding balance. SplitPatel records it but does not move money initially.
- **Net balance**: how much a member should receive or pay within one tab.
- **Payment suggestion**: a deterministic simplification of net balances. It is
  not a new debt and is not the financial source of truth.

## Aggregate boundaries

### User account

Private account data belongs to exactly one authenticated UID. It includes email,
preferences, account status, and consent metadata. A public profile contains only
the display name and optional photo URL needed in shared tabs.

Invariants:

- The authenticated UID is the account identifier.
- Only the owner and trusted backend may read private account data.
- Other authenticated users may read the public profile.
- Email is private and must not be placed in a broadly readable profile document.
- Disabling an account prevents new mutations but does not erase historical
  attribution from shared records.

### Tab

A tab owns membership, expenses, settlements, and balance projections.

Required attributes:

- Stable tab ID
- Name from 1 to 80 trimmed Unicode characters
- ISO 4217 currency code
- Status: `active` or `archived`
- Creator UID and audit timestamps
- Monotonically increasing revision

The tab currency is immutable after the first expense. Supporting conversion or
multiple currencies requires a separate approved specification.

### Membership

A membership connects one user to one tab.

Roles:

- `owner`: full tab and membership administration
- `admin`: manage expenses and ordinary members, but not ownership
- `member`: view the tab and create or edit their permitted financial records

States:

- `active`: participates in new expenses and can access the tab
- `left`: no current access, retained for historical attribution
- `removed`: removed by an authorized member, retained for history

Invariants:

- A user has at most one membership record per tab.
- An active tab always has at least one active owner.
- Historical expenses retain participant IDs after a member leaves.
- A removed or departed member cannot be assigned new allocations.
- Removing a member with a non-zero balance requires settling, transferring, or
  explicitly accepting the outstanding balance according to a future approved
  removal workflow. It must never silently discard debt.

### Expense

An expense is the authoritative description of what was paid and how cost was
allocated. It supports one or more contributors and itemized allocation.

Required attributes:

- Stable expense ID and parent tab ID
- Description from 1 to 120 trimmed Unicode characters
- Expense date and audit timestamps
- Currency matching the tab
- Positive total in integer minor units
- One or more contributions
- One or more line items
- Status: `active` or `voided`
- Creator UID, revision, and idempotency key

Each line item has a stable ID, description, positive amount in minor units, and
one or more allocations. Tax, tip, and service charges are ordinary line items so
their allocation is explicit. Discounts and refunds are out of initial scope and
require signed-amount rules before implementation.

Invariants for an active expense:

```text
sum(lineItem.amountMinor) == expense.totalMinor
sum(contribution.amountMinor) == expense.totalMinor
for each item: sum(item.allocation.amountMinor) == item.amountMinor
all contributors and allocated members belong to the tab
all amounts are integers in the tab currency's minor unit
```

Editing an expense increments its revision and applies only the delta between the
old and new ledger effects. Voiding keeps the record and audit history while
reversing its active ledger effect. Hard deletion is not part of normal product
behavior.

### Settlement

A settlement records that one member paid another outside SplitPatel.

Required attributes:

- Sender, recipient, tab, currency, and positive integer amount
- Occurrence and audit timestamps
- Method label such as `cash`, `bank`, `venmo`, or `other`
- Status: `active` or `voided`
- Creator UID, revision, and idempotency key

The sender and recipient must be distinct and must be current or historical tab
members. Provider links or labels do not prove payment. A settlement is included
in balances only after the user explicitly confirms it under the settlement
feature's eventual acceptance criteria.

## Money and rounding

All persisted and calculated money uses integer minor units. Floating-point
values are forbidden for financial state. Every amount carries or inherits an
ISO 4217 currency.

Equal, percentage, and weighted splits use deterministic largest-remainder
rounding:

1. Calculate each member's exact rational share.
2. Assign the floor in minor units.
3. Distribute remaining minor units by descending fractional remainder.
4. Break equal remainders by stable member ID order.

The result must always sum exactly to the source amount and be independent of UI
render order, locale, device, and platform.

## Ledger and balances

For each active expense and member:

```text
expenseEffect(member) = contributions(member) - allocations(member)
```

For each active settlement from sender to recipient:

```text
settlementEffect(sender) = +amount
settlementEffect(recipient) = -amount
```

Therefore:

```text
netBalance(member) =
  sum(expenseEffect(member)) + sum(settlementEffect(member))
```

A positive balance means the member should receive money. A negative balance
means the member owes money. For every tab and currency:

```text
sum(netBalance(all members)) == 0
```

Expense and settlement records are the source of truth. Stored balance documents
are rebuildable projections and must never be used to repair missing source data.

Payment suggestions are created by matching debtors and creditors until their
balances reach zero. Sorting and tie-breaking must be deterministic. Suggestions
may change when records change without changing the underlying obligations.

## Relationships

| Entity | Relationship |
| --- | --- |
| User to Tab | Many-to-many through Membership |
| Tab to Membership | One-to-many; tab lifecycle boundary |
| Tab to Expense | One-to-many |
| Expense to Contribution | One-to-many value objects |
| Expense to LineItem | One-to-many |
| LineItem to Allocation | One-to-many value objects |
| Tab to Settlement | One-to-many |
| Tab to BalanceProjection | One per historically participating member |
| User to Invitation | One-to-many pending invitations, if invitations are enabled |

References to users and members use immutable IDs. Display names and photos are
resolved from profiles at read time, with a safe fallback for missing profiles.
Financial records must not duplicate mutable profile or email data.

## Authorization policy

| Operation | Owner | Admin | Member |
| --- | --- | --- | --- |
| Read active tab | Yes | Yes | Yes |
| Rename tab | Yes | Yes | No |
| Archive or restore tab | Yes | No | No |
| Invite ordinary member | Yes | Yes | No |
| Promote admin or transfer ownership | Yes | No | No |
| Remove ordinary member | Yes | Yes | No |
| Create expense | Yes | Yes | Yes |
| Edit own expense | Yes | Yes | Yes, while policy permits |
| Edit another user's expense | Yes | Yes | No |
| Void another user's expense | Yes | Yes | No |
| Record own settlement | Yes | Yes | Yes |

Financial mutations must also validate active membership, tab state, expected
revision, idempotency, and all money invariants. UI visibility is not security.

## Concurrency and auditability

- Every mutation has a client-generated idempotency key.
- Editable aggregates have an expected revision for optimistic concurrency.
- Retrying the same successful command returns the original result without a
  duplicate financial effect.
- Conflicting stale edits fail explicitly and return the latest revision.
- Server timestamps are authoritative for audit ordering.
- Financial create, edit, void, and settlement operations record actor, action,
  aggregate ID, old revision, new revision, and correlation ID.
- Projection updates occur atomically with source-record changes or are repaired
  by an observable, idempotent worker.

## Initial limits

Limits keep validation and Firestore operations bounded:

- Fewer than 100 total deployed users initially
- At most 100 active members per tab
- At most 100 line items per expense
- At most 100 allocations per line item
- At most 100 contributions per expense
- Paginated expense and settlement history, with a default page size of 25

These are product validation limits, not assumptions hidden only in code.

## Explicit non-goals for the first production milestone

- Currency conversion or mixed-currency tabs
- Moving money or confirming provider-side payment automatically
- Receipt OCR
- Recurring expenses
- Negative line items, refunds, or chargebacks
- Anonymous users
- Hard deletion of financial history
