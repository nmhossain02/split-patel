# Feature 002: Tab management

**Status:** Implemented, native release verification pending

## Goal

Authenticated users can create and organize expense-sharing groups, manage their
membership safely, and open a reliable tab overview before recording expenses.

## In scope

- Create, list, open, rename, archive, and restore tabs
- Fixed tab currency
- Owner, admin, and member roles
- Invitations, joining, leaving, and removal
- Member profile display
- Loading, empty, error, offline-read, and concurrency behavior

Expense entry and balances are defined in
[Feature 003](003-expense-sharing.md). Currency conversion and public tabs are out
of scope.

## User-visible behavior

### Create

A user supplies a tab name and currency. Names are trimmed and must contain 1 to
80 Unicode characters. Saving shows progress and prevents duplicate submission.
Success creates the user as owner, returns to the tab, and makes it visible in the
tab list. A timeout can be retried with the same idempotency key without creating
a duplicate.

Currency cannot change after the first expense. Before that point an owner may
change it only through a separately confirmed action that explains the impact.

### List

The main authenticated screen lists active tabs by most recent activity, newest
first. Archived tabs are available through a separate filter. Each row shows name,
currency, member count, and the user's balance when that projection exists.

The screen distinguishes loading, no tabs, cached offline data, permission loss,
and retryable failure. History is paginated even for the initial small deployment.

### Detail and membership

Tab detail shows the tab name, currency, member roles, and profile fallbacks when
a profile is missing. Owners and admins see only actions their role permits.
Membership changes preserve at least one owner and never erase historical expense
attribution or a non-zero balance.

Invitations expire and can be accepted only by the intended authenticated user.
Accepting twice is idempotent. A removed or departed member loses access to new
reads and commands while remaining referenced in history.

### Archive

Archiving hides the tab from the default list and prevents new expenses and
settlements. Existing members retain read access. Restoring requires an owner.
Archiving does not delete financial data.

## Acceptance criteria

### Create

- **TAB-001:** Only an authenticated active user may create a tab.
- **TAB-002:** Name validation trims surrounding whitespace and enforces 1 to 80
  characters before submission.
- **TAB-003:** Currency is a supported ISO 4217 code and is stored with the tab.
- **TAB-004:** Creation atomically produces the tab, owner membership, denormalized
  member indexes, audit event, and idempotency result.
- **TAB-005:** Double activation or retry with the same idempotency key creates one
  tab and returns the original result.
- **TAB-006:** Success opens the created tab. Failure retains entered values and
  offers a safe retry.

### List and detail

- **TAB-007:** The default list contains exactly the active tabs where the user is
  an active member, ordered by `lastActivityAt` descending with stable pagination.
- **TAB-008:** Archived tabs appear only when the archived filter is selected.
- **TAB-009:** Loading, empty, offline-cache, and retryable-error states are visually
  and accessibly distinct.
- **TAB-010:** Selecting a row opens that tab and supports a valid deep link.
- **TAB-011:** Tab detail shows name, currency, active members, and roles.
- **TAB-012:** A missing profile uses a neutral deleted/unavailable-user label and
  never leaves the entire detail screen loading forever.
- **TAB-013:** A missing tab shows not found. Lost membership shows access denied
  and removes the tab from subsequent list results.

### Roles and membership

- **TAB-014:** The creator is an owner and every active tab has at least one owner.
- **TAB-015:** Only owners may promote admins, transfer ownership, archive, restore,
  or remove another owner.
- **TAB-016:** Owners and admins may invite or remove ordinary members. Members may
  leave their own membership.
- **TAB-017:** Invitation acceptance is intended-user-only, expiry checked, and
  idempotent.
- **TAB-018:** Membership changes atomically update the membership document,
  `memberIds`, `ownerIds`, counts, revision, and audit history.
- **TAB-019:** A user with a non-zero balance cannot be removed or leave through a
  path that silently discards that balance.
- **TAB-020:** Departed members lose access but remain resolvable in financial history.
- **TAB-021:** Concurrent stale membership or rename commands fail with a conflict
  and do not overwrite the newer revision.

### Lifecycle and security

- **TAB-022:** An owner may rename a tab to another valid name; success updates
  revision, audit data, and list activity once.
- **TAB-023:** An archived tab is read-only for ordinary product commands.
- **TAB-024:** Non-members cannot read the tab, membership, expenses, settlements,
  balances, or audit data.
- **TAB-025:** Clients cannot directly modify role indexes, membership state, audit
  records, or schema metadata.
- **TAB-026:** The tab list query and all rule allow/deny cases pass against the
  Firestore emulator with committed indexes.

### Frontend quality

- **TAB-027:** Submit controls prevent duplicate actions while a command is pending.
- **TAB-028:** Every interactive element has an accessible name, role, focus order,
  and touch target appropriate to the platform.
- **TAB-029:** Phone, tablet, and supported web widths have no unreachable actions,
  clipped financial values, or navigation loops.

## Data relationships and access patterns

Tab-to-user is many-to-many through membership. The tab document contains bounded
member and owner ID arrays for authorized queries; membership documents contain
roles and lifecycle. Financial children remain under the tab.

Required reads and indexes are defined in
[Firestore data and access model](../architecture/firestore-data-model.md). The
primary list query uses `memberIds array-contains` plus `lastActivityAt desc` and a
cursor. Tab detail reads membership documents and batches profile gets by UID.

## Verification plan

| Layer | Required coverage |
| --- | --- |
| Domain | Name/currency validation, role transitions, last-owner and outstanding-balance rules |
| Application | Create, retry, rename, invite, accept, leave, remove, archive, and conflict workflows with in-memory repositories |
| Emulator integration | Transactions, list query/index, membership consistency, security allow/deny matrix |
| Component | List states, create validation, detail, role actions, errors, duplicate submission |
| Route integration | Login-to-list, create return, deep link, lost-access redirect |
| E2E smoke | One owner creates a tab, invites a second user, and both can open it |

## Current verification matrix

| Behavior | Web | Android | iOS |
| --- | --- | --- | --- |
| Create/list/detail | Automated and manual | Build configuration verified | Build configuration verified |
| Domain and application workflows | Platform-independent pass | Platform-independent pass | Platform-independent pass |
| Firestore emulator and rules | Pass | Pass | Pass |
| Authenticated two-user flow | Browser pass | Release smoke pending | Release smoke pending |

The complete lifecycle is implemented. Native provider, navigation, accessibility,
and responsive-layout smoke checks remain before the status can become Complete.
