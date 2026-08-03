# Feature 003: Expense sharing and balances

**Status:** Implemented, native release verification pending

## Goal

Members can record who paid, assign itemized costs fairly, understand resulting
balances, edit mistakes without duplicate effects, and record external settlements.
The same behavior must be executable as pure code without UI or Firebase.

## In scope

- One or multiple contributors to an expense
- One or more line items
- Exact, equal, percentage, and weighted allocation helpers
- Item-level allocations among active tab members
- Deterministic minor-unit rounding
- Expense history, detail, edit, and void
- Per-member net balances and deterministic payment suggestions
- Recording and voiding external settlements
- Idempotency, optimistic concurrency, audit history, and projection repair

Moving money, provider payment confirmation, refunds, negative line items,
multi-currency tabs, receipt OCR, and recurring expenses are out of scope.

## Core behavior

### Create an expense

A member enters a description, date, one or more contributors, and line items.
Each line item is allocated among one or more active members. Allocation helpers
may populate exact amounts, equal shares, percentages, or weights, but the saved
result is always explicit integer minor-unit allocations.

Before submission, the UI shows total paid, total allocated, and any mismatch.
Saving is impossible until the domain invariants in
[the domain model](../architecture/domain-model.md) pass. One pending command may
be submitted at a time. Timeout and retry reuse the idempotency key.

### View balances

A positive member balance means that member should receive money. A negative
balance means that member owes money. The tab overview displays both net balances
and optional simplified payment suggestions. Suggestions are derived and must not
be described as additional debts.

### Edit or void

Authorized users may edit an active expense using its expected revision. A stale
edit fails with a conflict and shows the latest data before resubmission. Successful
edits apply only the old-to-new ledger delta. Voiding retains the expense and audit
history and reverses its active effect. Retrying either command cannot apply the
effect twice.

### Record a settlement

A member records an external payment from one tab member to another. SplitPatel
does not claim that a provider transferred money. The user confirms sender,
recipient, amount, method, and date before recording. The settlement adjusts both
balances equally and oppositely. A mistaken settlement is voided rather than hard
deleted.

## Acceptance criteria

### Money and validation

- **EXP-001:** Every amount is represented and persisted as an integer minor-unit
  value with the tab currency. No financial calculation uses floating point.
- **EXP-002:** Description, date, contributor, item, allocation, supported currency,
  and configured limit validation returns field-addressable typed errors.
- **EXP-003:** Expense total equals line-item total, contribution total, and total
  allocations before a command can commit.
- **EXP-004:** Contributors and allocated users are active or explicitly permitted
  historical tab members according to the command policy.
- **EXP-005:** Equal, percentage, and weighted helpers distribute every minor unit
  with deterministic largest-remainder rounding and stable ID tie-breaking.
- **EXP-006:** A domain result is identical across web, Android, iOS, locale, item
  render order, and repeated execution.

### Create and history

- **EXP-007:** An active tab member may create an expense; a non-member, removed
  member, disabled user, or archived tab cannot.
- **EXP-008:** Create writes the expense, items, ledger projection deltas, audit
  event, revision, and idempotency result as one logical operation.
- **EXP-009:** Retrying a command with the same key and request returns the original
  result without a duplicate expense or balance effect.
- **EXP-010:** Reusing a key with different content returns a conflict.
- **EXP-011:** Expense history is ordered by expense date descending, uses a stable
  tie-breaker, paginates in groups of 25, and distinguishes loading, empty, cached,
  and failed states.
- **EXP-012:** Expense detail shows contributors, items, allocations, total, status,
  creator, and revision with profile fallbacks.

### Edit and void

- **EXP-013:** The creator, owner, or admin may edit an expense according to the
  authorization policy. An ordinary member cannot edit another creator's expense.
- **EXP-014:** Edit requires the expected revision and applies exactly the net
  difference between the previous and replacement ledger effects.
- **EXP-015:** A stale edit reports a conflict and leaves source data and projections
  unchanged.
- **EXP-016:** Voiding an active expense reverses its full active ledger effect once,
  retains history, and increments revision.
- **EXP-017:** Editing a voided expense or voiding it twice has a stable typed result
  and never changes balances twice.

### Balances and suggestions

- **EXP-018:** For every tab, the sum of member net balances is exactly zero.
- **EXP-019:** A member's net equals contributions minus allocations plus settlements
  sent minus settlements received.
- **EXP-020:** Balance projections match a full recalculation from active source
  records after create, edit, void, settlement, retry, and conflict scenarios.
- **EXP-021:** Payment suggestions settle all non-zero balances without changing
  totals, never suggest self-payment, and use deterministic ordering.
- **EXP-022:** UI labels clearly distinguish “owes,” “is owed,” and “suggested
  payment,” including negative values and zero state without relying only on color.

### Settlements

- **EXP-023:** Sender and recipient are distinct tab members and amount is positive
  in the tab currency.
- **EXP-024:** Recording an active settlement adds `amount` to the sender's net and
  subtracts `amount` from the recipient's net.
- **EXP-025:** Settlement create and void are idempotent, revision checked, audited,
  and projection consistent.
- **EXP-026:** A provider method label is not displayed as provider-confirmed payment.

### Reliability and security

- **EXP-027:** Clients cannot directly write expenses, items, settlements, balances,
  mutation keys, or audit events.
- **EXP-028:** A timeout produces a pending or unknown state that resolves through
  the command key; the UI does not invite creation of a second logical expense.
- **EXP-029:** Failed or denied commands preserve user input and show a retry or
  correction path with a stable safe error message.
- **EXP-030:** A projection verifier can rebuild balances from source data, reports
  differences, and repairs only projections without rewriting financial sources.
- **EXP-031:** Security rules and backend authorization pass allowed and denied
  multi-user emulator scenarios.

### Frontend quality

- **EXP-032:** Expense forms expose accessible labels, errors, contributor totals,
  allocation totals, and pending state.
- **EXP-033:** Adding, removing, and reordering item controls does not change saved
  allocation values or rounding identity.
- **EXP-034:** The form remains usable at supported phone, tablet, and browser widths
  with keyboard-only web operation and no clipped totals.

## Executable behavioral scenarios

These scenarios are required as pure domain tests and application workflow tests.
Amounts below are minor units.

### Scenario A: equal split with one payer

```text
Expense total: 6000
Contributions: Alex 6000
Allocations: Alex 2000, Blair 2000, Casey 2000
Expected net: Alex +4000, Blair -2000, Casey -2000
Expected suggestions: Blair -> Alex 2000, Casey -> Alex 2000
```

### Scenario B: itemized meal and shared tip

```text
Alex meal: 1200 allocated to Alex
Blair meal: 1500 allocated to Blair
Tip: 600 allocated equally to Alex and Blair
Contributions: Alex 3300
Expected allocations: Alex 1500, Blair 1800
Expected net: Alex +1800, Blair -1800
```

### Scenario C: multiple contributors

```text
Expense total: 10000
Contributions: Alex 7000, Blair 3000
Allocations: Alex 2000, Blair 4000, Casey 4000
Expected net: Alex +5000, Blair -1000, Casey -4000
Expected suggestions: Blair -> Alex 1000, Casey -> Alex 4000
```

### Scenario D: deterministic remainder

```text
Expense total: 1000 split equally among member IDs a, b, c
Expected allocations: a 334, b 333, c 333
Expected total: 1000 on every platform and invocation
```

### Scenario E: settlement reduces debt

```text
Starting net: Alex +4000, Blair -2000, Casey -2000
Settlement: Blair sends Alex 2000
Expected net: Alex +2000, Blair 0, Casey -2000
Expected suggestion: Casey -> Alex 2000
```

### Scenario F: edit and retry

Create Scenario A, then change Casey's allocation from 2000 to 1000 and Alex's
from 2000 to 3000 at the expected revision. The resulting net is Alex +3000,
Blair -2000, Casey -1000. Repeating the edit with the same idempotency key leaves
that result unchanged. Submitting an older revision with a new key returns a
conflict and changes nothing.

### Scenario G: void and projection rebuild

Create Scenarios A and C, record Scenario E's settlement where applicable, then
void Scenario A. Incremental projections must equal a clean recalculation from the
remaining active expense and settlement sources. Retrying the void changes nothing.

## Data and access implications

- History needs paginated expense summary documents; item details must not be
  downloaded for every list row.
- Expense writes span the parent, items, balance projection, idempotency, and audit
  records and therefore require a trusted transaction boundary.
- Balance documents optimize reads but remain fully rebuildable.
- Stable revisions and keys are required because mobile retries and uncertain
  network completion are normal behavior.
- Multi-user tests need independently authenticated actors and must prove both
  allowed and denied commands.

See [Firestore data and access model](../architecture/firestore-data-model.md) for
document shapes, indexes, and mutation processing.

## Verification plan

| Layer | Required coverage |
| --- | --- |
| Domain unit | Every scenario above, invariant failure, limits, rounding, suggestions, property tests |
| Application system | Multi-user create/edit/void/settle workflows using in-memory repositories and deterministic clock/IDs |
| Repository contract | The same repository behavior against in-memory and Firestore emulator adapters |
| Emulator integration | Transactions, idempotency, conflict, indexes, security matrix, projection rebuild |
| Component | Form rendering, validation display, item manipulation, pending/error state, accessible totals |
| Route integration | Expense history/detail/editor navigation and unsaved-change handling |
| E2E smoke | One small multi-user journey after lower layers are reliable |

Property-based tests should generate valid expenses and assert exact total
conservation, zero-sum balances, deterministic output, and edit/void reversibility.
