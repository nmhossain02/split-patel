# Feature 001: User authentication

**Status:** Implemented, release verification pending

## Goal

A person can securely sign in with Google, resume an existing session, understand
authentication failures, view their identity, and sign out on web, Android, and
iOS. Authentication also provisions the public and private documents required by
the rest of SplitPatel.

## In scope

- Google authentication on web, Android, and iOS
- Session restoration and authenticated route protection
- Idempotent account and profile provisioning by Firebase UID
- A discoverable authenticated account surface
- Logout and disabled-account behavior
- Accessible loading, cancellation, failure, and retry states

Password login, anonymous accounts, account linking, account deletion, and
additional identity providers require separate specifications.

## User-visible behavior

### Startup

The app displays a neutral startup state while Firebase determines whether a
session exists. It does not flash the login screen or protected content. An active
user is routed to their tab list. A signed-out or disabled user is routed to login.

### Sign in

The login screen presents one primary “Sign in with Google” action. Starting login
disables duplicate submission and shows progress. Cancelling returns to an enabled
login screen without an error alert. A provider, network, configuration, or account
failure produces a useful message and retry action without exposing raw SDK errors.

### Provisioning

After Firebase authentication succeeds, a trusted provisioning operation creates
or updates `users/{uid}` and `profiles/{uid}`. Retrying provisioning is safe. The
user does not enter the app until provisioning succeeds or an explicitly supported
recoverable pending state is shown.

The private user document stores email and preferences. The public profile stores
only display name, optional photo URL, status, and schema metadata. See
[Firestore data and access model](../architecture/firestore-data-model.md).

### Authenticated account surface

Every authenticated route provides a reachable account or profile surface showing
the current display name and email, optional photo, and a logout action. The logout
action cannot exist only on a screen that successful login immediately replaces.

### Logout

Logout disables duplicate taps, signs out of Google where required, signs out of
Firebase, clears private cached application state, and returns to login. A partial
provider logout failure must not leave the app displaying protected data after the
Firebase session ends.

## Acceptance criteria

### Startup and routing

- **AUTH-001:** While auth state is unresolved, only the startup state is visible.
- **AUTH-002:** A restored active session reaches the tab list without showing the
  login screen.
- **AUTH-003:** A signed-out user sees login and cannot view a protected route.
- **AUTH-004:** Opening a protected deep link while signed out returns to login and
  preserves or safely discards the destination according to an explicit route
  policy. The chosen policy is tested.

### Login

- **AUTH-005:** Login has one accessible primary Google action on all platforms.
- **AUTH-006:** One activation starts at most one provider flow until it completes.
- **AUTH-007:** Successful provider authentication creates a Firebase session for
  the same provider account.
- **AUTH-008:** User cancellation restores the idle screen without an error alert.
- **AUTH-009:** Provider, offline, and configuration failures show stable user-safe
  messages and permit retry.
- **AUTH-010:** Raw tokens, credentials, and provider responses are never logged.

### Provisioning and privacy

- **AUTH-011:** Successful first login creates private user and public profile
  documents with the Firebase UID as document ID.
- **AUTH-012:** Repeated login updates allowed profile fields without duplicating
  the account or overwriting preferences.
- **AUTH-013:** Authentication does not complete app entry until provisioning has
  reached a known successful state.
- **AUTH-014:** Another authenticated user can read the public profile but cannot
  read the private user document or email through profile access.
- **AUTH-015:** A user cannot read or write another user's private account data.
- **AUTH-016:** Unknown fields and client attempts to modify account status or
  schema metadata are rejected.

### Session and logout

- **AUTH-017:** Closing and reopening each supported app restores a valid session.
- **AUTH-018:** The authenticated account surface displays display name, email,
  optional photo, and logout with accessible labels and focus order.
- **AUTH-019:** Successful logout clears protected UI and routes to login.
- **AUTH-020:** Browser back navigation or a protected deep link after logout does
  not reveal protected data.
- **AUTH-021:** A disabled account cannot enter protected routes or issue commands.

### Quality

- **AUTH-022:** Web, Android, and iOS meet the platform verification matrix below.
- **AUTH-023:** No unhandled promise rejection or error-level console message occurs
  during successful login, cancellation, session restoration, or logout.

## Data relationships and access patterns

- Firebase UID has a one-to-one relationship with private user and public profile.
- Login performs document gets or a single idempotent provisioning command, never
  an unbounded query by email.
- Tab member display reads profiles by UID. It does not read private user documents.
- Account disablement is enforced by trusted commands as well as UI routing.
- Test, development, and production identity projects are separate.

## Verification plan

| Layer | Required coverage |
| --- | --- |
| Unit | Auth error classification, provisioning merge rules, route-state reducer |
| Application | Restore, login, provision, retry, disable, and logout workflows with fake auth and repositories |
| Emulator integration | Private/public document rules and idempotent provisioning |
| Component | Login, progress, cancellation, errors, account surface, duplicate-tap prevention |
| Route integration | Startup redirect and protected deep links |
| Provider smoke | One successful login and logout on web, Android, and iOS using non-production accounts |

Google's real provider UI is not required in routine unit or emulator tests. Fake
identity responses and Firebase emulator identities exercise application behavior.
A small provider smoke test verifies configuration for each release candidate.

## Current verification matrix

| Platform | Login UI | Provider starts | Login completes | Session restores | Logout | Protected routes |
| --- | --- | --- | --- | --- | --- | --- |
| Web | Automated and manual | Manual provider start; emulator automated | Emulator automated; real provider pending | Code path verified; real provider reload pending | Automated and manual | Automated and manual |
| Android | Unverified | Unverified | Unverified | Unverified | Unverified | Unverified |
| iOS | Unverified | Unverified | Unverified | Unverified | Unverified | Unverified |

TypeScript, lint, component, privacy-rule, and browser account-flow checks pass.
The feature must not move to Complete until real-provider login, reload, and logout
pass on all three supported platforms without console errors.
