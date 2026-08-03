# Local release-candidate evidence

## Candidate identity

- Verification date: 2026-08-02, America/Los_Angeles
- Workspace: `/home/nabeel/projects/split-patel`
- Published source: commit `6aa89a0` on the public `nmhossain02/split-patel` `main` branch
- Runtime: Node 22.23.2, npm 10.9.8, Linux
- Data boundary: dedicated local Firebase Auth, Firestore, and Functions emulators

The initial public GitHub Actions run passed both the quality and
emulator/browser jobs. Subsequent documentation and workflow-hardening commits
must retain the same green matrix before web promotion.

## Clean-install automated matrix

Both the root and Functions dependency trees were installed with `npm ci` before
the final matrix.

| Command | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass with no warnings |
| `npm test -- --runInBand` | Pass, 19 suites and 80 tests |
| `npm run test:docs` | Pass, 17 documentation files and all 86 acceptance criteria traced |
| `npm run test:rules` | Pass, 6 allow and deny scenarios |
| `npm run test:backend` | Pass, 4 schema and Firestore transaction tests |
| `npx expo-doctor` | Pass, 18 of 18 checks |
| `npm run build:web` with explicit CI identifiers | Pass, 21 static routes |
| `npm run test:e2e` | Pass, 1 critical multi-user browser journey |
| Production native config with missing required variables | Correctly rejected |

Expected Firestore `PERMISSION_DENIED` warnings in the rules run are assertions of
the direct-write and unauthorized-read denial cases.

## Real browser flow exercised

The Playwright Chromium journey used independently authenticated emulator users
and exercised:

1. First login, trusted account provisioning, reload, and restored session.
2. Tab creation and confirmed pre-activity currency changes.
3. Second-user provisioning, invitation, logout, intended-user acceptance, and
   shared tab access.
4. Dirty expense cancellation with discard confirmation dismissed.
5. Keyboard expense entry at a 390 by 844 phone viewport with no horizontal
   overflow.
6. A USD 60.00 equal expense paid by Blair, producing the expected USD 30.00 debt.
7. Keyboard settlement entry at a 768 by 1024 tablet viewport, returning both
   users to zero with no horizontal overflow.
8. Logout followed by direct protected navigation, which returned to login without
   protected content.

## Native evidence boundary

An Android arm64 debug APK compiled earlier in this implementation sequence:

- Path: `android/app/build/outputs/apk/debug/app-debug.apk`
- Size: 62,748,236 bytes
- SHA-256: `a451bf1ec8482a04757032bfdd25f3f4261982e43539dc3896579f65aaaa9b25`

That artifact proves the native dependency graph compiled, but it predates the
final JavaScript, responsive-test, and dynamic service-file configuration changes.
It is not a signed or promotable production candidate.

## Security and dependency evidence

- Production callable Functions enforce App Check outside the emulator.
- Firestore rules deny direct authoritative writes and isolate private account,
  membership, financial, invitation, and disabled-account data.
- Production web export fails closed when required Firebase or reCAPTCHA values are
  absent.
- Production native config fails closed when the Google web client ID or native
  Firebase service-file variables are absent.
- Local Firebase service files and environment files are ignored by Git.
- `npm audit --omit=dev` reports 2 high and 12 moderate build-tool advisories with
  no critical advisory. The Functions tree reports 7 moderate transitive UUID
  advisories. Reachability and upgrade constraints are documented in
  [dependency exposure](../operations/dependency-risk.md).

## Promotion blockers

The following gates require external state unavailable from this workstation and
remain unverified:

1. Authenticate Firebase to the intended production project, read back the target,
   deploy indexes, rules, and Functions, and verify index readiness and scheduled
   verifier health. The Firebase CLI has no authorized account.
2. Configure production Google OAuth and App Check registrations, then complete
   web login, reload restoration, logout, and console-error smoke checks using a
   non-production identity.
3. Enable and verify production backup, recovery, budget, latency, function-error,
   App Check, and projection-mismatch controls described in the release runbook.

Signed Android and iOS builds, real-provider smoke tests, and native accessibility
checks are deferred platform gates. They do not block the current web-only target.

These are blocking release gates. Local emulator, browser, and compile evidence do
not substitute for them.
