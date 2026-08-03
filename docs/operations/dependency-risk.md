# Dependency exposure analysis

Last reviewed: 2026-08-02.

`npm audit --omit=dev` reports no critical advisory. The remaining root high
advisories are in `brace-expansion` and `postcss` through Expo CLI, Metro,
configuration plugins, code generation, and lint/build tooling. Those modules do
not execute in the exported browser JavaScript or installed native application.
The supported Expo 54 patch line has no compatible remediation. `npm audit` offers
only an unplanned SDK 57 and React Native major upgrade.

The Functions tree reports moderate `uuid` advisories through the latest available
Firebase Admin 14.2 and Firebase Functions 7.3 packages. The vulnerable UUID buffer
APIs are not invoked by SplitPatel command code. npm's proposed forced remediation
is an unsafe downgrade to Firebase Admin 10, so it is rejected.

Controls:

- Production clients receive built artifacts, not Expo CLI or Metro servers.
- Build inputs are repository-controlled. Untrusted CSS, glob patterns, archives,
  source maps, or native project files are not accepted by a production service.
- Callable inputs are validated before domain execution and do not reach UUID
  generation APIs in transitive Google libraries.
- Dependabot or equivalent alerts and the weekly audit review remain required.
- Upgrade to the next supported Expo SDK and patched Firebase dependency line after
  compatibility and the full release matrix pass.

Reassess immediately if build services accept untrusted repository content, any
CLI becomes network-exposed, Firebase publishes compatible patched transitive
versions, or a new advisory shows a reachable runtime path.
