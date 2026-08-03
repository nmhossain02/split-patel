# Release and deployment runbook

## Environments

Development, preview, and production must use separate Firebase projects, OAuth
clients, App Check registrations, data, and EAS environment variables. Never point
an emulator build at production. Keep `EXPO_PUBLIC_USE_FIREBASE_EMULATORS` unset or
`false` in preview and production.

Configure the variables in `.env.example`. Store `GOOGLE_SERVICES_JSON` and
`GOOGLE_SERVICES_INFO_PLIST` as EAS file variables. Web Firebase configuration is
public identifier material, but it must still be environment-specific. Do not put
service-account keys or provider secrets in any `EXPO_PUBLIC_` variable.

## One-time production controls

1. Enable Google Authentication and restrict every web OAuth client to exact
   production origins and redirect URIs.
2. Register Play Integrity for Android, App Attest with DeviceCheck fallback for
   iOS, and reCAPTCHA Enterprise for web in Firebase App Check.
3. Deploy functions, rules, and indexes before clients. Turn on App Check metrics,
   observe valid production clients, then enforce it for callable functions.
4. Enable Firestore point-in-time recovery and scheduled exports described in
   [recovery](recovery.md).
5. Create budget alerts, function error/latency alerts, and log alerts for balance
   or membership projection mismatch messages.
6. Grant deployment and data access through least-privilege groups. Do not use
   personal service-account keys in CI.

Review the current [dependency exposure analysis](dependency-risk.md) and confirm
that no newer compatible fixes are available.

## Candidate gate

Use Node 22 and Java 21:

```bash
npm ci
npm --prefix functions ci
npm run test:docs
npm run typecheck
npm run lint
npm test -- --runInBand
npm run test:rules
npm run test:backend
npm run build:web
npm run test:e2e
npx expo-doctor
```

Generate the native projects and compile at least one local native candidate before
requesting signed builds:

```bash
npx expo prebuild --no-install
cd android && ./gradlew --no-daemon --max-workers=1 assembleDebug
```

Run the equivalent iOS compile on a macOS runner with Xcode. A local debug compile
proves native source and dependency compatibility, but it does not replace a signed
production build or the provider smoke checks below.

Then run the real-provider smoke matrix with non-production data:

| Platform | Required flow |
| --- | --- |
| Web | Google login, reload session restore, create/open tab, logout, browser-back denial, no error console messages |
| Android | Google login, cold restart restore, create/open tab, logout, protected deep-link denial |
| iOS | Google login, cold restart restore, create/open tab, logout, protected deep-link denial |

On phone, tablet, and supported browser widths, run the shared-expense journey
from `test/e2e/shared-expense.spec.ts` and confirm there are no clipped totals or
unreachable actions. A failed row blocks promotion.

## Current candidate evidence

As of 2026-08-02, the documentation, type, lint, 80 root tests, six Firestore
rule scenarios, four backend emulator tests, production web export, Expo Doctor,
production configuration guards, and automated browser journey gates pass locally
under Node 22. The browser journey covers two provisioned users, an
invitation, a shared expense, balance calculation, settlement, session reload,
logout, and protected-route denial. A local Android arm64 debug build also compiles
successfully.

Promotion remains blocked until a release operator verifies the real web OAuth and
App Check configuration, runs signed Android and iOS builds, completes both native
provider smoke rows on devices, and observes the hosted CI run. iOS compilation is
not available from the current Linux workstation, and no Android device or emulator
was connected for the current local verification. These are release gates, not
optional follow-up work.

## Deployment order

1. Confirm the latest scheduled export and restore rehearsal status.
2. Deploy Firestore indexes and wait until all indexes report Ready.
3. Deploy Firestore rules.
4. Deploy Cloud Functions and confirm callable and scheduled health.
5. Deploy the static web export to preview, run the web smoke flow, then promote.
6. Build signed native candidates with the production EAS environment, run the
   native smoke matrix, and submit the exact tested artifacts.
7. Monitor errors, latency, denied App Check requests, auth failures, and balance
   repair logs for at least 30 minutes after promotion.

Example commands, after authenticating the official CLIs to the intended project:

```bash
firebase use <production-project-id>
firebase deploy --only firestore:indexes
firebase deploy --only firestore:rules
firebase deploy --only functions
EXPO_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY=<site-key> npm run build:web
eas build --platform all --profile production
```

Deployment mutates external systems. Resolve and read back the selected project
before each command. This repository does not deploy production as part of CI.

## Rollback

Roll back clients to the last tested artifact or web release. Restore the previous
rules and function bundle from the tagged release. Do not roll source documents
back merely because a projection is incorrect. Run the projection verifier first.
For destructive or corrupt source-data incidents, follow the recovery runbook and
preserve audit logs before restoring.
