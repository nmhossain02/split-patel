# Operations, recovery, and incident response

## Data protection

Financial source records are expenses and settlements. Balance documents are
rebuildable projections. Audit events and mutation keys are part of the evidence
needed to diagnose retries and must be retained with source data.

For production:

- Enable Firestore point-in-time recovery.
- Schedule daily managed exports to a versioned, retention-locked Cloud Storage
  bucket in the same jurisdiction as the database.
- Keep at least 35 daily exports and 12 monthly exports, subject to the approved
  privacy and retention policy.
- Use a dedicated backup service account that can export and write only to the
  backup bucket. Separate restore permission from routine deployment permission.
- Rehearse a restore into an isolated project quarterly. Record duration, document
  counts, failed records, and balance-recalculation results.

An export is not a proven backup until a restore and financial reconciliation pass.

## Monitoring

Alert on callable error rate, p95 latency, function instance saturation, Firestore
quota use, authentication failure spikes, denied App Check requests, and project
budget thresholds. The scheduled verifier logs a high-severity event when it repairs
a balance mismatch. Page an operator if any source-derived projection differs.

Never log ID tokens, OAuth responses, email search values, expense notes, or full
command bodies. Callable logs use actor IDs, aggregate IDs, correlation keys,
command type, result, and latency.

## Incident priorities

1. Stop further harm by disabling the affected client release or callable surface.
2. Preserve logs, audit events, mutation keys, and the latest export.
3. Determine whether the issue affects only projections or financial source data.
4. For projection-only issues, run detection without repair, review the diff, then
   repair projections and verify the tab sums to zero.
5. For source corruption or unauthorized access, revoke credentials, preserve the
   incident snapshot, and restore into an isolated project before any production
   import.
6. Notify affected users and authorities according to the approved incident and
   privacy policy. Record decisions and timestamps.

## Recovery validation

After a restore, compare collection and document counts, sample audit chains, and
recalculate every tab balance from active expenses and settlements. Every tab must
sum exactly to zero, projection checks must report zero mismatches, and the critical
two-user browser scenario must pass against the restored environment before traffic
returns.

## Routine maintenance

- Review Firebase and Expo supported versions monthly.
- Review npm advisories weekly. Build-tool-only advisories that cannot be fixed on
  the supported Expo SDK require a documented exposure analysis and upgrade issue.
- Review IAM, OAuth origins, App Check metrics, and recovery contacts quarterly.
- Exercise disabled-account access, restore, function rollback, and incident
  communication at least twice per year.
