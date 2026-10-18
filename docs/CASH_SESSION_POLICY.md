# Cash session, counted closing and correction contract

## State and sources

- OPEN: closedAt is null; one active store session, explicit OWNER/MANAGER opening. Payments/refunds and authorized cash movements can post.
- CLOSED: immutable closing snapshot/actor/time, no new financial source, no reopening or counted-value replacement. Legacy rows already closed before Phase 6 retain their original timestamp without fabricated count/snapshot.
- Separate review: PENDING_REVIEW until the first review of a counted closed session; latest append-only APPROVED or NEEDS_ATTENTION decision. Open sessions are not reviewable. Review does not execute a bank reconciliation or change figures.

The session spans its real opening/closing instants, including overnight. History date filters apply to opening dates using inclusive selected Fortaleza dates and the following exclusive day boundary; search uses the full immutable session UUID. There is no auto-close, day split or automatic float transfer. Unpaid/confirmed future pickups and their reservations may remain; later full payment uses whichever explicit active session exists then. Refund today of an older payment belongs to today's recording session, without changing the earlier session.

## Exact centavo definitions

```
expected physical cash = opening float
  + CASH Payment.amountCents
  - CASH Refund.amountCents
  + CASH_ADDITION amounts
  - CASH_WITHDRAWAL amounts
  - CASH_EXPENSE amounts
  + signed CASH_REVERSAL amounts

difference = counted physical cash - expected physical cash
method net receipts = gross full payments for that method - full refunds for that method
```

Cash tender is not the receipt; change is not deducted twice. PIX/DEBIT_CARD/CREDIT_CARD have gross/refund/net summaries but no physical drawer contribution. Negative electronic net is valid when refunding an older sale. Opening float is not revenue; operational cash difference is not profit/loss. Expenses do not create stock, a supplier invoice/payable or accounting ledger. No fictitious zero-payment receipt.

Single opening/movement/payment/refund values use the existing maximum 99,999,999 centavos. Cash movements must be positive. Session gross/refund totals, movement aggregates, expected/counted amounts cap at 999,999,999,999 centavos; signed corrections/differences/net totals stay bounded. SQL numeric/BigInt arithmetic and decimal-string DTOs avoid unsafe JavaScript Number conversions. Cash outflow/negative reversal/cash refund cannot make expected physical cash negative; fund a real addition first if necessary, never use an override. Existing negative legacy sources are retained and flagged, requiring controlled investigation rather than guessed balances.

## Closing and lock order

The employee reads sources, counts outside a transaction, enters count and reviews the calculated difference. Nonzero difference requires a 5-500-character explanation and explicit irreversible-close confirmation. No arbitrary backdating input exists. The server rechecks the current actor/session, acquires the established security/operation/session locks, verifies the displayed activity version, derives and reconciles source records, inserts the immutable closing snapshot, sets closedAt and commits audit/idempotent result together. A concurrent payment/refund/movement increments the activity version even if it is electronic or has no physical cash effect; a stale confirmation must reload/review.

Sales preserve security -> operation -> products -> order -> cash -> reservations -> batches. Cash-only operations never subsequently lock product/order rows; immutable financial/order references are read only. All financial insertions validate/lock the active cash row. An operation commits first and is included, or closure wins and the posting fails with no late record. Immediate checkout failure rolls back order/payment/reservations/consumption/audit/result. Two different close keys create one snapshot; the same key/payload returns the same original result. Reusing a key with changed data fails. Current action permissions and actor ownership also apply to result lookup. Retain existing bounded recognized retry policy.

## Review and narrow corrections

OWNER alone may append a review with mandatory note and expected review version. Both decisions preserve original figures and all previous annotations. Stale review rejects; a broken reconciliation cannot be approved away. There is no silent reopening or modification of count/explanation. A mistaken annotation can be addressed by another clearly explained review.

OWNER may reverse one non-reversal CashMovement once, for the same full amount and opposite direction, in the explicitly selected current open session. Required: reason and confirmation that corresponding inverse physical handling occurred. The server derives amount/direction from the original, never client-supplied balance. Restrictive unique linkage prevents duplicate reversal. Original movement/session/closing and any earlier review remain unchanged. No reversal of a reversal, payment/refund target, partial correction, backdating or generic balance setter. Record actual subsequent additions/outflows normally; annotation-only observations belong in review. More complex recording-error repair requires a separately controlled maintenance policy.

## Reconciliation and retention

Sources are derived, with only activity/review counters maintained transactionally. Compare counters to immutable source counts, financial amounts/methods/instants to referenced order/payment, and all closed snapshot fields/totals to current immutable sources. Findings such as source mismatch, counter drift, closing drift, negative legacy expectation or missing historical count are data-integrity/availability concerns. Display them separately from counted minus expected. Do not disable guards, insert invented money or auto-repair to make a report green.

Cash records, reversals, reviews, financial rows and audit are append-only with restrictive history links. Reasons/notes are bounded plain text; internal reference uses a narrow non-personal identifier format. No recipient identity, card number/CVV, customer snapshot, raw request body or secret is needed. Diagnostic logs are separate from financial source records and safe audit. Backups, prior delivered screens and long-term retention require separate policy; this workflow is not full accounting, legal certification or verified restore.
