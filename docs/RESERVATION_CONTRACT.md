# Current Phase 5 order/reservation ownership

ORDER reservations now have restrictive composite (orderItemId, productId, quantity) references to genuine OrderItem rows, sourceReference equal to that item ID, and at most one reservation per item. Existing INTERNAL references keep null orderItemId; no migration guesses an order or deletes legacy records. New consumption links the actual reservation/product and checks per-batch consumed allocation against ledger and operation target.

SalesService reuses reserveTx/reservationChangeTx inside the same reauthorized transaction: security → operation → sorted products → order → current cash when financial → sorted reservations → sorted batches → allocation/ledger/projections/audit/result. Confirmation reserves all items through the pickup Fortaleza date; checkout additionally pays/consumes/fulfills atomically. Payment cannot bypass expiry or ownership. Cancellation releases the whole order; paid cancellation also records its original-method full refund atomically. Expired allocation resolves through cancellation/recreation, never silent reassignment. See PHASE_5_DECISIONS.md and ORDER_PAYMENT_POLICY.md. No arbitrary employee reservation/consume HTTP route is exposed.

## Historical Phase 4 internal service contract (still supported for legacy INTERNAL records)

# Internal reservation contract for Phase 5

Phase 4 provides an internal InventoryService, with no reservation/consume HTTP mutation routes and no order tables. Synthetic integration tests call it inside isolated PostgreSQL. A UUID sourceReference is an **internal business reference**, not a fabricated order ID or an order foreign key. No ordinary employee screen creates reservations.

## Commands

- `reserve(principal, key, input, requestId)`: input contains productId, positive whole quantity <=100,000, sourceNamespace exactly INTERNAL, UUID sourceReference and date-only eligibilityThrough (today or later). Returns operationId, reservation targetId and ACTIVE state.
- `reserveMany(principal, key, sourceReference, lines, requestId)`: 1–20 distinct products, quantities and eligibility dates; deterministic product order, one transaction, all succeed or none do. Caller must consolidate duplicate product lines. Returns reservationIds and pointer targetId.
- `reservationChange(principal, key, 'RELEASE' | 'CONSUME', input, requestId)`: input requires reservationId, INTERNAL namespace and matching sourceReference. No arbitrary reservation ID alone grants ownership. The current permission is inventory.reservations (OWNER/MANAGER), rechecked under the security lock. Namespace/reference are restricted internal caller assertions, not verified external order ownership.

Unique (sourceNamespace, sourceReference, productId) prevents parallel independent reservations for the same source/product. A released source is not reused for a fresh reservation; a later explicit business revision needs a new valid source identity. Keys are UUIDs, actor scoped, kind/canonical payload bound and retained for database lifetime. Lookup uses the same actor and current kind permission. Same command returns its previous result; mismatched payload conflicts.

## Allocation and state

Active products only. Lock products and all candidate batches by sorted IDs, then select eligible unreserved quantities in FEFO order: earliest entered expiry, then oldest server recordedAt, then ID; explicitly unknown expiry sorts last. Batches expiring before eligibilityThrough are excluded. Insufficient units roll back the whole reservation, operation record and audit. No over-allocation or backorder.

Release and consumption apply to the **whole** reservation, not partial quantities. Release marks allocations released and decrements reserved, leaving physical unchanged. Consumption revalidates batch identity, ledger/projection agreement and expiry against today and eligibilityThrough, marks allocations consumed, decrements reserved and physical, and appends per-batch CONSUMPTION ledger entries atomically. Monotonic allocation fields and deferred status/sum checks back the service rules. Same terminal action is harmless; attempting the opposite terminal action conflicts. No double release or consumption.

When allocated units expire, allocation remains ACTIVE/traceable and contributes to expiredReserved. Consumption fails with no partial change. Explicit release is allowed, followed by separately validated new allocation under a new business revision/source reference. There is no silent reallocation, expiry cleanup, fake fulfilment or customer order in Phase 4.

## Transaction composition and Phase 5 work

Standalone methods acquire AuthService.withPermission and its InstallationState security lock. For an eventual order transaction, internal `commandTx` / `reserveTx` helpers require the caller to hold that lock, reauthorize the actor/session, validate the genuine business source, lock all products by sorted ID and batches by sorted ID, and commit the business record, stock change, audit and operation result together. Do not nest independent transactions or call a stock HTTP endpoint from an order transaction. Preserve order: security → operation identity → sorted products → source record → sorted batches → allocations/ledger/projections/audit/result. No user input or external work under locks.

Before exposure in Phase 5: create real Order/OrderItem ownership, add an explicit namespace/schema migration and restrictive foreign keys, validate order state/owner/access, freeze product/price snapshots, define collection eligibility and genuine revised source identity, and tie release/consumption to authorized cancellation/handover. CASHIER currently lacks inventory.reservations; a future business permission must authorize a validated sale transaction without granting arbitrary stock consumption. Compose payment/cash prerequisites according to the implementation plan. Re-test atomic rollback, permission revocation, cross-product races, uncertain submission and expired pickup exceptions. No referential integrity to orders is claimed today.
