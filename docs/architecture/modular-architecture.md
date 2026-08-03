# Modular architecture

## Objective

SplitPatel must make financial behavior testable without React Native, Expo,
Firebase, a browser, or a network. Frameworks are replaceable adapters around the
domain and application workflows.

## Target module boundaries

```text
src/
  domain/
    money/
    expenses/
    balances/
    settlements/
    tabs/
  application/
    ports/
    use-cases/
  infrastructure/
    firebase/
    repositories/
  presentation/
    hooks/
    screens/
    routes/
```

The current repository is not organized this way yet. This is the target for new
financial work and incremental refactoring of authentication and tab management.

## Domain layer

The domain layer contains value objects, aggregates, validation, split algorithms,
ledger effects, balance calculation, and payment suggestions.

Allowed dependencies:

- TypeScript language and small framework-independent utility libraries
- Other domain modules with an acyclic dependency direction

Forbidden dependencies:

- React or React Native
- Expo and Expo Router
- Firebase SDKs
- Device storage, network APIs, or environment variables
- Implicit wall-clock time, random IDs, locale, or platform behavior

Domain functions accept plain typed values and return values or typed errors. A
caller supplies clocks and IDs when they are needed. Calculations must be
deterministic and free of side effects.

Representative APIs:

```ts
allocateEqual(amountMinor, memberIds): Allocation[]
allocateWeighted(amountMinor, weights): Allocation[]
validateExpense(expense): ValidationResult
calculateLedgerEffects(expense): MemberEffect[]
calculateBalances(expenses, settlements): Balance[]
suggestSettlements(balances): PaymentSuggestion[]
```

## Application layer

The application layer implements use cases such as:

- `CreateTab`
- `AddTabMember`
- `CreateExpense`
- `EditExpense`
- `VoidExpense`
- `RecordSettlement`
- `GetTabBalances`

Use cases coordinate authorization, domain validation, transactions, persistence,
idempotency, audit records, and projection updates. They depend on interfaces,
not Firebase implementations.

Required ports include repositories, unit of work, authenticated actor, clock,
ID generator, and audit sink. In-memory implementations support fast system-level
behavior tests.

## Infrastructure layer

Firebase adapters implement application ports. They own:

- Firestore document translation
- Queries, pagination, indexes, and transactions
- Callable function or backend transport
- Firebase Authentication identity translation
- Emulator configuration
- Retry classification and infrastructure error mapping

Firestore snapshots and SDK types do not cross into domain or UI contracts.
Adapters map them to application data transfer objects.

Financial writes are server-authoritative. Clients may read permitted projections
and submit commands, but they do not directly write expenses, settlements,
membership, audit records, or balance projections.

## Presentation layer

Screens and hooks own rendering, navigation, input collection, accessibility,
loading state, and frontend error presentation. They call application-facing
controllers or use cases and do not calculate financial results themselves.

UI tests should prove:

- Correct controls and content render for each view state
- Inputs and validation messages are connected accessibly
- Actions call the expected application boundary once
- Loading prevents accidental duplicate submission
- Navigation occurs only after successful results

They should not re-test split arithmetic or balance algorithms.

## Error model

Use typed errors at module boundaries, including:

- `Unauthenticated`
- `Forbidden`
- `NotFound`
- `ValidationFailed`
- `Conflict`
- `AlreadyProcessed`
- `Unavailable`
- `UnexpectedInfrastructureFailure`

Presentation maps these to stable user behavior. Raw Firebase errors and console
logging alone are not an application error strategy.

## Incremental migration

1. Introduce domain money and expense types with no Firebase dependency.
2. Implement split and balance scenarios as pure tests.
3. Define repository ports and in-memory adapters.
4. Implement expense use cases against those ports.
5. Add Firestore/backend adapters and emulator contract tests.
6. Connect UI controllers and component tests.
7. Refactor existing tab and authentication services behind the same boundaries.

New behavior must not add more platform-conditional business logic to screens.
