# SplitPatel

SplitPatel is an expense-sharing application for groups, trips, households, and
events. It is being built with Expo and Firebase for web, Android, and iOS.

## Project status

The repository contains a production-oriented web release candidate. The complete
web flow has passed both a real browser walkthrough and an automated two-user
journey. Domain, application, Firestore emulator, security-rule, hosted CI, and
production web build checks pass. Web promotion still requires the
environment-specific OAuth, App Check, Firebase deployment, and provider smoke
checks listed in the [release runbook](docs/operations/release.md). Android and iOS
are separate deferred release targets.

Implemented behavior includes:

- Google authentication, private account provisioning, App Check, protected
  routing, session restoration, and logout
- Tab creation, roles, invitations, ownership transfer, rename, archive, removal,
  leave, stable history pagination, and authorization
- Itemized expenses with multiple contributors, deterministic integer splitting,
  edit, void, balances, payment suggestions, settlements, and settlement voiding
- Server-authoritative idempotent transactions, audit records, strict Firestore
  rules, and scheduled balance-projection verification and repair
- Layered unit, application, emulator, rule, component, and browser-flow tests

Feature status is tracked in [the documentation index](docs/README.md). A feature
is not complete until its acceptance criteria and required verification matrix
pass on every supported platform.

## Technology

- Expo 54 and React Native 0.81
- Expo Router 6
- TypeScript in strict mode
- Firebase Authentication and Cloud Firestore
- React Native Firebase on Android and iOS
- Firebase Web SDK in browsers
- Jest and React Native Testing Library

The target architecture separates pure expense-sharing rules from application
use cases, Firebase adapters, and React Native UI. See
[Modular architecture](docs/architecture/modular-architecture.md).

## Documentation

- [Documentation and feature status](docs/README.md)
- [Domain model](docs/architecture/domain-model.md)
- [Firestore data and access model](docs/architecture/firestore-data-model.md)
- [Modular architecture](docs/architecture/modular-architecture.md)
- [Layered testing strategy](docs/testing/strategy.md)
- [Acceptance-criterion traceability](docs/testing/traceability.md)
- [Local release-candidate evidence](docs/testing/release-evidence.md)
- [Authentication specification](docs/features/001-user-authentication.md)
- [Tab management specification](docs/features/002-tab-management.md)
- [Expense sharing specification](docs/features/003-expense-sharing.md)
- [Contributing](CONTRIBUTING.md)

## Local development

### Prerequisites

- A supported Node.js release and npm
- An Expo-compatible Android emulator, iOS simulator, or browser
- Access to the development Firebase project
- A development build for native Google Sign-In and React Native Firebase

Expo Go is not sufficient for native authentication because the app uses custom
native modules.

### Install and run

```bash
npm install
npm run web
```

For a native platform, install a development build and then run one of:

```bash
npm run android
npm run ios
```

The native build requires the correct development versions of
`google-services.json` and `GoogleService-Info.plist`. Production and development
Firebase projects must remain separate. Never use a production test account or
production data for local verification.

Copy `.env.example` to `.env.local` and use environment-specific
Firebase values. The browser flow uses only local emulator identities:

```bash
npm run test:e2e
```

## Quality checks

Run these before requesting review:

```bash
npm test -- --runInBand
npm run lint
npm run typecheck
npm run test:docs
npm run test:rules
npm run test:backend
npm run build:web
npm run test:e2e
```

The target test approach is intentionally layered. Pure domain scenarios and
application workflows run without Firebase or UI dependencies. Firestore emulator
tests verify adapters and security rules. UI tests verify rendering and frontend
behavior. A small set of expensive end-to-end smoke tests is added only after the
lower layers are reliable.

## Production target

The initial deployment is expected to serve fewer than 100 users. The design
still prioritizes correct financial calculations, authorization, idempotency,
auditability, recoverability, and maintainable data access patterns. Low expected
traffic is not treated as permission to weaken those properties.

See [release and deployment](docs/operations/release.md) and
[operations, recovery, and incidents](docs/operations/recovery.md) before promoting
a build or changing production data.
