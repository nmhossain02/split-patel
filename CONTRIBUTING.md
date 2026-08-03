# Contributing to SplitPatel

## Source of truth

Repository documentation is authoritative for product behavior:

- `docs/features/` defines user-visible behavior and acceptance criteria.
- `docs/architecture/` defines domain, storage, security, and module boundaries.
- `docs/testing/strategy.md` defines required verification layers.
- `README.md` describes the current project status and setup.

When code and documentation disagree, do not silently choose one. Update the
approved specification first or record the implementation as a known gap.

## Feature workflow

1. Write or update the feature specification.
2. Identify affected domain invariants, data relationships, access patterns,
   authorization rules, migrations, and failure states.
3. Give every acceptance criterion a stable identifier.
4. Map each criterion to the least expensive test layer that proves it.
5. Implement pure domain behavior before infrastructure or UI where applicable.
6. Run automated checks and the applicable real user flow.
7. Update the verification matrix with evidence and remaining gaps.

Implementation should not begin when a decision could materially change persisted
data, money calculations, privacy, or authorization and the specification leaves
that decision ambiguous.

## Definition of ready

A feature is ready to implement when:

- User goals, in-scope behavior, and explicit non-goals are documented.
- Normal, empty, loading, error, offline, retry, and concurrent behavior is clear.
- Domain terms and invariants are defined.
- Data reads and writes, indexes, authorization, and migration effects are known.
- Acceptance criteria are objective and testable.
- The verification plan identifies unit, application, integration, UI, and E2E
  coverage as appropriate.

## Definition of done

A feature may be marked complete only when:

- Every in-scope acceptance criterion passes.
- Pure domain behavior is covered without UI or Firebase dependencies.
- Application workflows are tested through repository interfaces.
- Firebase adapters and security rules pass emulator-backed tests.
- UI tests cover rendering and frontend behavior without duplicating domain tests.
- Required E2E or manual user flows pass on applicable platforms.
- `npm test -- --runInBand`, `npm run lint`, and `npx tsc --noEmit` pass.
- Documentation, operational guidance, and the verification matrix are current.
- Any intentionally unverified platform or scenario is stated explicitly.

“The UI looks clean” is not sufficient verification. Visual and navigation
criteria must name the viewport, platform, interaction, and expected result.

## Architecture expectations

Domain code must not import React, Expo, Firebase, wall-clock time, random ID
generators, or platform APIs. Supply clocks, ID generators, and repositories as
interfaces so tests remain deterministic.

Use cases coordinate domain operations and repository transactions. Firebase
code implements those repository contracts. Screens and hooks translate between
the UI and use cases. See [Modular architecture](docs/architecture/modular-architecture.md).

## Test selection

Use the lowest layer that can prove a behavior:

- Domain unit tests for splitting, validation, balances, rounding, and suggestions
- Application tests for multi-user workflows with in-memory repositories
- Emulator tests for Firestore queries, transactions, indexes, and security rules
- Component tests for rendering, input, accessibility, and frontend state
- Route integration tests for navigation and auth guards
- E2E tests for a small number of critical cross-system journeys

See [the full testing strategy](docs/testing/strategy.md).

## Pull requests

Keep a pull request focused on one coherent behavior or enabling change. Include:

- The specification and acceptance-criterion identifiers it implements
- Data model, index, rule, or migration changes
- Tests added at each applicable layer
- Commands run and their results
- Real user-flow evidence or an exact statement of what remains unverified
- Operational or rollback considerations

Use `no-mistakes` as the review and validation gate for every PR. Do not invoke it
outside PR preparation or creation.
