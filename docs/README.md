# SplitPatel documentation

This directory is the source of truth for intended behavior and architecture.
Checked-in code is not evidence that a feature is complete unless its acceptance
criteria and verification matrix pass.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| Planned | Behavior is specified but implementation has not started. |
| Prototype | Some behavior exists, but required checks or user flows do not pass. |
| Implemented | Code exists and automated lower-layer verification passes. Required real user flows may still be outstanding. |
| Complete | All acceptance criteria and the platform verification matrix pass. |

## Feature status

| Feature | Status | Current evidence | Important gaps |
| --- | --- | --- | --- |
| [User authentication](features/001-user-authentication.md) | Implemented | Emulator provisioning, privacy rules, browser account lifecycle, logout, and protected deep-link flow pass. | Real Google OAuth completion and session restore smoke on web, Android, and iOS remain release checks. |
| [Tab management](features/002-tab-management.md) | Implemented | Domain/application tests, Firestore transactions/rules, and automated responsive two-user invite flow pass. | Android and iOS interaction release smoke remain. |
| [Expense sharing](features/003-expense-sharing.md) | Implemented | Pure scenarios, application transactions, projection rebuild, strict rules, component failure/retry states, and responsive keyboard expense-to-settlement browser flow pass. | Native release smoke remains. |

## Architecture

- [Domain model](architecture/domain-model.md)
- [Firestore data and access model](architecture/firestore-data-model.md)
- [Modular architecture](architecture/modular-architecture.md)

These documents define the implemented production model and its remaining release
verification boundary.

## Operations

- [Release and deployment](operations/release.md)
- [Recovery and incident response](operations/recovery.md)
- [Dependency exposure analysis](operations/dependency-risk.md)

## Verification

- [Layered testing strategy](testing/strategy.md)
- [Acceptance-criterion traceability](testing/traceability.md)
- [Local release-candidate evidence](testing/release-evidence.md)

The preferred system-level behavioral tests run complete multi-user expense
scenarios through application use cases and in-memory repositories. They do not
need React Native, Firebase, or a browser. Emulator and UI tests then verify their
own integration boundaries, while E2E coverage stays small and high value.

## Archived material

The following files describe an abandoned Vite, Chakra UI, PostgreSQL, and Prisma
design. They are retained only to preserve history:

- [Legacy Vite README](archive/legacy-vite-readme.md)
- [Legacy Prisma schema](archive/legacy-schema.prisma)

Archived documents must not be used for implementation or setup decisions.
