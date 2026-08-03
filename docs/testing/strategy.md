# Layered testing strategy

## Objective

SplitPatel should prove most product behavior without starting a UI, browser,
device, network, or Firebase process. Tests become more expensive only when the
behavior crosses a boundary that a lower layer cannot prove.

This is not a license to omit end-to-end verification. A feature cannot be called
complete until its required real user flow passes. It does mean expensive E2E
automation stays small and follows reliable domain, application, integration, and
UI coverage.

## Test layers

### 1. Domain unit tests

Scope:

- Money value objects and validation
- Exact, equal, percentage, and weighted allocations
- Deterministic rounding
- Expense invariants and ledger effects
- Balance calculation and zero-sum checks
- Payment suggestions
- Edit and void delta calculation
- Role and lifecycle rules that do not require persistence

Dependencies: none outside the domain. No React, Firebase, clock, random IDs, or
network. These tests should run in milliseconds and contain the largest number of
behavioral examples.

Use table-driven examples plus property-based invariants. Important properties:

- Allocations and contributions conserve the exact source amount.
- Net balances sum to zero.
- Results are deterministic under repeated execution.
- Reordering input with stable IDs does not change rounded ownership.
- Applying an edit delta produces the same balances as full recalculation.
- Voiding and retrying are reversible and idempotent.

### 2. Application workflow tests

Scope complete use cases through interfaces:

- Authenticated actor and role checks
- Create, edit, retry, conflict, void, and settlement workflows
- Tab membership transitions
- Idempotency result reuse
- Audit event creation
- Balance projection updates and rebuild
- Stable typed error mapping

Use in-memory repositories, unit of work, deterministic clock, and deterministic
ID generator. These tests emulate multiple users by executing commands with
different actor contexts. They are the preferred system-level behavioral tests and
do not render UI or run Firebase.

The scenarios in
[Expense sharing](../features/003-expense-sharing.md#executable-behavioral-scenarios)
must run at this layer as well as the domain layer.

### 3. Repository contract tests

Every repository interface has a shared contract suite. Run it against:

1. The in-memory adapter used by application tests.
2. The Firestore emulator adapter.

The contract covers create, get, list ordering, pagination, expected-revision
updates, idempotency lookup, atomic unit-of-work behavior, missing data, and typed
infrastructure failures. This prevents fast tests from relying on semantics the
real adapter does not provide.

### 4. Firebase emulator integration tests

Scope:

- Document serialization and schema versions
- Required composite indexes and query shapes
- Transactions and atomic projection updates
- Security rule allow and deny matrices
- Independently authenticated users
- Membership denormalization consistency
- Retry after uncertain command completion
- Balance projection rebuild and repair

Use dedicated Firebase project identifiers and startup guards so tests cannot
connect to production. Seed data is deterministic and isolated per test or suite.
Rules tests assert denials as first-class behavior, not merely successful reads.

Emulator tests may call trusted command handlers directly or through the local
callable endpoint depending on the boundary under test. They do not need a browser.

### 5. Component and hook tests

Scope frontend behavior only:

- Correct content for loading, empty, success, offline, error, and conflict states
- Accessible names, roles, messages, focus, and touch behavior
- Input editing and field-error placement
- Pending-state duplicate submission prevention
- Correct command DTO sent to a mocked controller
- Navigation callback only after success

Inject controller results and view models. Do not recreate domain algorithms in
component test fixtures. A component can display a balance supplied by its
controller without proving how that balance was calculated.

### 6. Route integration tests

Use Expo Router test support to verify:

- Authenticated and signed-out redirects
- Deep links
- Create-to-detail and list-to-detail navigation
- Back behavior and unsaved-change confirmation
- Access loss while a protected route is open

These tests may mock application controllers but should use real route definitions.

### 7. End-to-end and manual user flows

Automate only critical cross-system journeys after lower layers are stable:

1. Sign in with a non-production test identity.
2. User A creates a tab and adds User B.
3. User A records a shared expense.
4. User B observes the correct expense and balance.
5. User B records a settlement.
6. Both users observe zero or expected remaining balances.
7. A user logs out and cannot reopen protected content.

Provider UI may remain a release-candidate smoke check if reliable automation is
not available. Once authenticated, a test-only identity mechanism may exercise the
rest of the flow in CI, but it must be impossible in production builds.

Run the smallest useful browser E2E set on every protected branch. Run native E2E
smoke tests on release candidates or when native routing/auth code changes until
runtime and cost justify broader coverage.

## Acceptance-criterion mapping

Every criterion in `docs/features/` must map to one or more test IDs. Prefer one
decisive lower-layer test over repeating the same assertion at every layer.

The complete live mapping is maintained in
[acceptance-criterion traceability](traceability.md). Example:

| Criterion | Primary proof | Boundary proof |
| --- | --- | --- |
| EXP-005 deterministic rounding | Domain table/property tests | None required |
| EXP-009 idempotent create | Application workflow test | Emulator transaction test |
| EXP-022 balance labels | Component accessibility test | E2E smoke observation |
| TAB-007 authorized ordered list | Application query test | Emulator index/rule test |
| AUTH-020 protected content after logout | Route integration test | Provider smoke flow |

Specifications should not say only “add unit tests.” They must name behavior,
actors, preconditions, result, and the layer that proves it.

## Testability requirements

- Domain and application packages compile without platform SDKs.
- Time and ID generation are injected.
- Authenticated actor is explicit in every command.
- Repository interfaces use domain/application types, not Firestore snapshots.
- UI depends on controllers or use cases, not Firestore collections.
- External errors are translated once at adapter boundaries.
- Tests do not depend on execution order or shared production-like accounts.
- Financial fixtures use integer minor units and explicit currencies.
- Multi-user fixtures label actors consistently and never infer identity from name.

## Scenario fixture design

Provide builders for:

- Users and profiles
- Tabs with owner/admin/member combinations
- Expenses with items, contributions, and allocations
- Settlements
- Clocks, IDs, and idempotency keys

Builders must produce valid objects by default and expose deliberate overrides for
invalid cases. Avoid opaque giant JSON snapshots. Assertions should emphasize
financial effects, authorization, revisions, and persisted relationships.

## Continuous integration gates

The target PR pipeline runs, in order:

1. Formatting or documentation checks
2. TypeScript validation
3. Lint
4. Domain and application tests
5. Component and route tests
6. Firestore emulator, repository contract, and security-rule tests
7. Production web bundle
8. Small browser E2E smoke set when available

Fail fast on lower layers. Upload useful logs and screenshots for boundary tests,
but redact tokens, emails, and financial notes.

Use `no-mistakes` only while preparing or creating a PR, after the relevant local
checks pass.

## Completion evidence

A feature verification matrix records:

- Commit or build under test
- Platform and environment
- Acceptance criteria exercised
- Automated commands and results
- Real user flows performed
- Known unverified scenarios and why

If a real user flow is blocked, report exactly which step and boundary remain
unverified. Passing lower-layer tests does not justify a “Complete” status by itself.

## Current baseline

As of 2026-08-02:

- Nineteen root Jest suites cover 80 domain, application, presentation, service, and
  component behaviors.
- Six Firestore rule scenarios verify privacy, membership, direct-write denial,
  invitation scope, query authorization, and disabled-account access.
- Four backend tests cover atomic idempotency, rollback, invitations, currency
  locking, strict callable schemas, and projection mismatch detection and repair.
- One automated browser journey covers the critical two-user expense and
  settlement lifecycle. The same flow has also passed a manual browser walkthrough.
- TypeScript, lint, Expo Doctor, backend build, production configuration guards,
  and production web export pass under Node 22.

CI runs these layers on pull requests and the main branch. Native and real-provider
smoke checks remain release-candidate gates because they require configured devices
and external provider accounts.
