# Acceptance-criterion traceability

This matrix maps every feature criterion to its strongest current proof. The
documentation check fails if a criterion is missing. “Local pass” means the named
automated boundary passes in this repository. It does not replace a platform row
marked pending.

## Proof IDs

| Proof ID | Evidence |
| --- | --- |
| AUTH-DOM | `src/domain/__tests__/auth-errors.test.ts` |
| AUTH-HOOK | `src/hooks/__tests__/useAuth.test.tsx` |
| AUTH-COMP | `src/screens/__tests__/LoginScreen.test.tsx` and `TabListScreen.test.tsx` |
| TAB-DOM | `src/domain/__tests__/tab.test.ts` |
| TAB-APP | `src/application/__tests__/tab-service.test.ts` |
| TAB-COMP | `src/screens/__tests__/TabListScreen.test.tsx`, `TabDetailScreen.test.tsx`, `CreateTabScreen.test.tsx`, and `useTabContext.test.tsx` |
| EXP-DOM | `src/domain/__tests__/expense-sharing.scenarios.test.ts` and `domain-invariants.test.ts` |
| EXP-APP | `src/application/__tests__/expense-service.test.ts` |
| EXP-FORM | `src/presentation/__tests__/expense-form.test.ts`, `CreateExpenseScreen.test.tsx`, and `CreateSettlementScreen.test.tsx` |
| CMD-ERR | `src/application/__tests__/command-failure.test.ts` and `CreateExpenseScreen.test.tsx` |
| STORE | `functions/src/__tests__/firestore-store.integration.test.ts` |
| RULES | `test/firestore/firestore.rules.test.js` |
| E2E-WEB | `test/e2e/shared-expense.spec.ts` |
| BUILD | Node 22, TypeScript, ESLint, Expo Doctor, production configuration guards, web export, native prebuild, and Android arm64 compile gates |
| PROVIDER | Real Google OAuth and App Check release smoke |
| NATIVE | Android and iOS device release matrix |
| RESPONSIVE | Phone, tablet, keyboard-only web, and supported-width visual release smoke |

## Authentication

| Criterion | Primary proof | Boundary or remaining gate |
| --- | --- | --- |
| AUTH-001 | AUTH-HOOK | E2E-WEB local pass |
| AUTH-002 | AUTH-HOOK | E2E-WEB reload pass; PROVIDER pending |
| AUTH-003 | E2E-WEB | RULES local pass |
| AUTH-004 | E2E-WEB | Destination is deliberately discarded |
| AUTH-005 | AUTH-COMP | NATIVE pending |
| AUTH-006 | AUTH-COMP | PROVIDER pending |
| AUTH-007 | E2E-WEB emulator identity | PROVIDER pending |
| AUTH-008 | AUTH-DOM and AUTH-COMP | PROVIDER pending |
| AUTH-009 | AUTH-DOM and AUTH-COMP | PROVIDER pending |
| AUTH-010 | Safe adapter messages and structured-log source audit | PROVIDER console smoke pending |
| AUTH-011 | STORE and E2E-WEB | Local pass |
| AUTH-012 | AUTH-HOOK and repeated E2E-WEB provisioning | Local pass |
| AUTH-013 | AUTH-HOOK | Local pass |
| AUTH-014 | RULES | Local pass |
| AUTH-015 | RULES | Local pass |
| AUTH-016 | RULES and strict callable schemas | Local pass |
| AUTH-017 | E2E-WEB reload | PROVIDER and NATIVE pending |
| AUTH-018 | AUTH-COMP | NATIVE accessibility pending |
| AUTH-019 | E2E-WEB | Local pass |
| AUTH-020 | E2E-WEB | Local pass |
| AUTH-021 | RULES and active-account callable guard | Local pass |
| AUTH-022 | BUILD | PROVIDER and NATIVE pending |
| AUTH-023 | AUTH-COMP and E2E-WEB | PROVIDER console smoke pending |

## Tab management

| Criterion | Primary proof | Boundary or remaining gate |
| --- | --- | --- |
| TAB-001 | TAB-APP and active-account callable guard | Local pass |
| TAB-002 | TAB-DOM and callable schema | Local pass |
| TAB-003 | TAB-DOM, TAB-APP, and STORE | Currency-change E2E-WEB pass |
| TAB-004 | TAB-APP and STORE | Local pass |
| TAB-005 | TAB-APP | Local pass |
| TAB-006 | E2E-WEB and stable draft key | Local pass |
| TAB-007 | Firestore read-service test, RULES, and TAB-COMP | Hosted index deployment pending |
| TAB-008 | TAB-COMP | Local pass |
| TAB-009 | TAB-COMP and responsive E2E-WEB | Local pass |
| TAB-010 | E2E-WEB | NATIVE pending |
| TAB-011 | TAB-COMP and E2E-WEB | Local pass |
| TAB-012 | TAB-COMP | Local pass |
| TAB-013 | TAB-COMP and RULES | Local pass |
| TAB-014 | TAB-DOM, TAB-APP, and STORE | Local pass |
| TAB-015 | TAB-APP | Local pass |
| TAB-016 | TAB-APP and E2E-WEB | Local pass |
| TAB-017 | TAB-APP and E2E-WEB | Local pass |
| TAB-018 | TAB-APP, STORE, and projection verifier | Local pass |
| TAB-019 | TAB-APP | Local pass |
| TAB-020 | TAB-COMP historical-profile merge | Local pass |
| TAB-021 | TAB-APP | Local pass |
| TAB-022 | TAB-DOM and TAB-APP | Local pass |
| TAB-023 | TAB-DOM and EXP-APP | Local pass |
| TAB-024 | RULES | Local pass |
| TAB-025 | RULES | Local pass |
| TAB-026 | RULES and committed indexes | Hosted index deployment pending |
| TAB-027 | AUTH-COMP, EXP-FORM, and E2E-WEB | Local pass |
| TAB-028 | Component accessibility queries and 44-point controls | NATIVE accessibility pending |
| TAB-029 | E2E-WEB desktop, phone, and tablet widths | NATIVE pending |

## Expense sharing

| Criterion | Primary proof | Boundary or remaining gate |
| --- | --- | --- |
| EXP-001 | EXP-DOM and EXP-FORM | Local pass |
| EXP-002 | EXP-DOM and strict callable schemas | Local pass |
| EXP-003 | EXP-DOM, EXP-FORM, and STORE rollback | Local pass |
| EXP-004 | EXP-APP | Local pass |
| EXP-005 | EXP-DOM and EXP-FORM | Local pass |
| EXP-006 | EXP-DOM generated-order tests | NATIVE smoke pending |
| EXP-007 | EXP-APP and active-account callable guard | Local pass |
| EXP-008 | EXP-APP and STORE | Local pass |
| EXP-009 | EXP-APP and STORE | Local pass |
| EXP-010 | EXP-APP | Local pass |
| EXP-011 | Firestore read service and TAB-COMP | Hosted index deployment pending |
| EXP-012 | Detail screen and TAB-COMP historical profiles | Local pass |
| EXP-013 | EXP-APP | Local pass |
| EXP-014 | EXP-DOM and EXP-APP | Local pass |
| EXP-015 | EXP-APP | Local pass |
| EXP-016 | EXP-DOM and EXP-APP | Local pass |
| EXP-017 | EXP-APP | Local pass |
| EXP-018 | EXP-DOM and STORE | Local pass |
| EXP-019 | EXP-DOM | Local pass |
| EXP-020 | EXP-APP and projection verifier STORE tests | Local pass |
| EXP-021 | EXP-DOM and TAB-COMP | Local pass |
| EXP-022 | TAB-COMP and responsive E2E-WEB | Local pass |
| EXP-023 | EXP-DOM and EXP-APP | Local pass |
| EXP-024 | EXP-DOM and EXP-APP | Local pass |
| EXP-025 | EXP-APP and STORE | Local pass |
| EXP-026 | Settlement UI and E2E-WEB | Local pass |
| EXP-027 | RULES | Local pass |
| EXP-028 | CMD-ERR and stable-key expense and settlement component retries | Local pass |
| EXP-029 | CMD-ERR and EXP-FORM | Local pass |
| EXP-030 | STORE projection mismatch detection and repair | Local pass |
| EXP-031 | RULES, EXP-APP, and E2E-WEB | Local pass |
| EXP-032 | EXP-FORM and responsive E2E-WEB | Local pass |
| EXP-033 | EXP-FORM stable reorder test | Local pass |
| EXP-034 | E2E-WEB keyboard flow at phone and tablet widths | NATIVE pending |
