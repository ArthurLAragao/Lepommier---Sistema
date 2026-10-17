# Inventory invariants and reconciliation

One location, finished individual units. InventoryMovement is the source of physical accounting. OPENING, PRODUCTION_RECEIPT, PURCHASED_RECEIPT and ADJUSTMENT_IN add their positive quantity; CONSUMPTION, WASTE and ADJUSTMENT_OUT subtract it. No automatic expiry movement or return type is implemented.

For each batch:

```
physical = sum(signed ledger quantities)
reserved = sum(allocated - released - consumed)
0 <= reserved <= physical <= 1,000,000,000,000
available = eligible ? physical - reserved : 0
blocked = eligible ? 0 : physical
expiredReserved = eligible ? 0 : reserved
```

Eligibility means expiry unknown under explicit acknowledgement, or expiry >= max(Fortaleza today, requested eligibility-through date). Product must be active for new allocations/receipts. Physical/blocked/reserved overlap intentionally: do not sum these displayed columns. Expired units stay present and expired reserved units remain an exception until explicitly released. Consumption rechecks expiry today and intended date and cannot use invalid allocations.

Command quantities are integers 1–100,000. Aggregate API fields use decimal strings parsed with BigInt; UI formatting never converts totals to Number. PostgreSQL SUM uses bigint inputs and numeric totals. Composite foreign keys match batch/product and allocation/reservation/product. Versions prevent stale batch mutations and production transitions. Restrictive foreign keys preserve history after ordinary deactivation.

Same transaction: actor/session authorization, operation identity, domain source, ledger, projections, allocations/state, safe audit and final idempotency result. Deferred constraint triggers compare the final cross-table totals at commit; row CHECKs separately cover limits/state. Ordinary ledger update/delete, receipt changes, batch identity/expiry changes, allocation reversal and completed operation changes are rejected. The normal application exposes no deletion or trigger-disabling path. A privileged database administrator can bypass these safeguards and is outside the browser authorization boundary.

Read-only endpoint: `GET /api/inventory/products/:productId/reconciliation`, OWNER/MANAGER. Findings: PHYSICAL_DRIFT, RESERVED_DRIFT, ALLOCATION_STATE, NEGATIVE_LEDGER. It records only safe access/count metadata. No balance is repaired. If drift appears, stop affected operations, preserve evidence/backups and have privileged maintenance investigate the original cause; do not disable triggers or set cached quantities to hide it. Normal corrections are new compensating ledger entries only when invariants already hold. Test-only corruption setup is isolated and not an operator repair procedure.

The current list iterates batches for a maximum 20 products per page and services serialize under the shared security lock. There is no accepted large-volume latency/SLA claim; monitor growth before a real pilot. Reconciliation reports current ledger/allocation consistency, not arbitrary historical sellable stock. Full reports, backups/restores and store acceptance remain later gates.

## Phase 5 composition

Order confirmations/checkout reuse the same ledger and projections. New ORDER reservations have restrictive genuine OrderItem/product/whole-quantity ownership; movement reservation/product links and deferred order checks prove consumption belongs to that order. Legacy INTERNAL allocations remain valid and are not converted. All-item confirmation, full checkout and paid cancellation/refund/release roll back together. Fulfilled refund leaves historical stock consumption intact and never restocks automatically. See RESERVATION_CONTRACT.md and PHASE_5_DECISIONS.md for extended lock order and SQL safeguards.
