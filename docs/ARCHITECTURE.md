# Architecture

## Decision: one local application

TypeScript monorepo: `apps/web` (React/Vite/Tailwind), `apps/api` (Fastify/Zod/Prisma), `packages/shared` (validated transport contracts and pure locale/domain helpers), `docs` and `scripts`. PostgreSQL is the persistent operational database. No microservices, cloud storage or remote authentication.

Production serves local frontend files and `/api` from the same Fastify origin. Development uses a Vite proxy. Default hosts are `127.0.0.1`; PostgreSQL's development port is loopback-only. Only development/test database Compose is currently supplied; a production container/network installation is pending Phase 8. No broad CORS. LAN access is future opt-in, requiring a trusted firewall rule, HTTPS, host authentication review and physical network controls. A responsive page is not remote mobile deployment.

## Boundaries and dependencies

1. Foundation: config, errors, correlation IDs, health/readiness, validated shared contracts, UI primitives.
2. Identity: users, sessions, authorization and audit. All data endpoints require server authorization.
3. Catalog/customers: validation, safe deactivation, privacy-aware projections and import jobs.
4. Inventory/production: append-only movements, batches, reservations, receipts and allocation.
5. Sales: order state transitions, price snapshots, full payments/refunds, idempotency.
6. Cash: one active session, append-only movements, immutable closing snapshot.
7. Reporting: read-only defined queries over the above records.
8. Operations: backups, health, installation and update lifecycle.

Routes validate input and delegate to transactional services. Shared schemas describe transport data, never replace database constraints. API responses use `{ error: { code, message, requestId, fields? } }`. Errors shown to employees are Portuguese and never contain stack traces or database credentials. Request logs exclude bodies, cookies, authorization and query data containing personal information.

## Implemented database foundation and identity

The preserved foundation migration creates StoreSettings. Additive migration `202610170002_identity` creates User, Session, AuditEvent, InstallationState, LoginThrottle and Role, with explicit uniqueness/check constraints, restrictive historical references, timestamps and lookup/expiry indexes. It contains no operational records or default credentials. The installation singleton is distinct from StoreSettings; it permanently closes first-owner setup. Audit records are append-only.

Security-sensitive transactions lock the singleton row, reauthorize the actor, enforce account versions, preserve one active owner and serialize the five-active-account limit. Setup owner creation/closure and audit commit together. Real PostgreSQL tests exercise both clean application and an upgrade preserving an existing foundation record. See [AUTH_SECURITY.md](AUTH_SECURITY.md) for the implemented schema/security boundaries.

## Implemented Phase 3 registry

Additive `202610170003_registry` creates Customer (immutable sequence registration, optional identity, current marketing state, active/anonymized flags/version), separate MarketingPreferenceEvent provenance, Category, Product and metadata-only ImportJob. No stock/financial tables are introduced. Restrict/NoAction FKs preserve references; SQL checks/functions/triggers protect CPF/date/phone shape/money/identity/anonymization beyond Prisma's representable schema. Clean and identity-upgrade tests preserve existing data/closure/password/session/audit.

RegistryService uses explicit role-specific database selects and the existing transactional actor/session recheck under the security lock. All mutations share the exact Host/Origin/CSRF scope. Versions reject concurrent stale edits. This local serialization also orders bulk confirmation against account revocation; it is a deliberate bounded five-account design, not a throughput scaling claim. CSV uses strict csv-parse with explicit mapping, bounded memory-only previews, server-bound confirmation and atomic/idempotent import. No raw CSV persists. Downloads are authenticated and short-lived in browser memory. See PHASE_3_DECISIONS.md, CUSTOMER_CSV.md and CUSTOMER_PRIVACY.md for constraints, retention and privacy projections.

Current marketing state lives on Customer rather than a separate singleton preference table; history is separate. Anonymization scrubs optional evidence references while retaining non-identifying event provenance; it does not alter append-only AuditEvent. There are no PII audit snapshots. Category deactivation retains products and their flags. Prices/cost are integer centavos; Phase 5 order items snapshot prices. No stock fields, photo upload or fabricated availability are present.

## Implemented Phase 4 inventory and production

Additive `202610170004_inventory` introduces batches, immutable stock ledger, production, purchased finished receipts, internal reservations/allocations and actor-scoped InventoryOperation. BIGINT batch projections update with ledger/allocation writes; deferred SQL constraint triggers validate final aggregate agreement. Composite foreign keys preserve product identity. Aggregate transport is decimal strings/BigInt, not floating point. No existing migration is rewritten and no order/financial/ingredient table is added.

InventoryService reuses the security singleton lock and current actor/session check, then operation identity, sorted product IDs, source row and sorted batches. All stock changes, safe audit and pointer-only idempotency result commit together. Bounded recognized serialization/deadlock retry uses the same request. Native dialogs preserve pending keys/payloads during uncertain responses and provide authenticated lookup. Original batch metadata/expiry and terminal production remain immutable; corrections append compensating movements.

Production/Estoque screens use existing cream/green components, forms, tables, pagination and modal focus behavior. CASHIER sees active sellable availability only; PRODUCTION has production/relevant batches and production-batch waste, without purchase costs/customer information. Phase 5 sales services now compose genuine owned reservations; no arbitrary consumption route exists. Read-only reconciliation reports drift without repair. See PHASE_4_DECISIONS.md, INVENTORY_INVARIANTS.md and RESERVATION_CONTRACT.md for numeric/expiry/transaction/retention details.

## Implemented Phase 5 sales and limited cash foundation

Additive 005 introduces Order/OrderItem/Payment/Refund/OrderEvent/CashSession and restrictive ORDER reservation ownership, preserving valid legacy INTERNAL rows. Monetary snapshots and aggregate DTOs use integer cents/decimal strings with BigInt arithmetic. Confirmed snapshots, financial rows/events and consumed stock are immutable. Deferred SQL checks bind sums, full payment/refund method/amount, ownership, allocations, ledger consumption and operation targets; custom constraints are tested separately from Prisma diff.

SalesService composes the existing InventoryService command/transaction helpers, never independent stock transactions or another inventory subsystem. Reauthorization/security lock → actor-bound operation → sorted products → order → current cash session when financial → sorted reservations → sorted batches → ledger/projections/events/audit/result. Checkout is one atomic sale/payment/consumption. Confirmation, payment, progress, pickup, cancellation/refund and opening have the same actor/key/canonical-payload model. SQL/result DTOs never serialize customer objects or submitted notes into audit. Authenticated lookup resolves uncertain responses; browser reload loses component-memory pending commands.

Named order permissions and explicit database projections exclude product cost/customer private data; PRODUCTION has no access. Customer anonymization scrubs collection text on linked orders and prevents reintroduction, retaining restrictive references and product/money snapshots. Customer profile queries distinguish fulfilled totals before refunds, receipts and refunds. Exact Host/Origin/CSRF/CSP and auth/session/setup safeguards remain unchanged.

Vendas/Pedidos use the existing cream/green native-dialog primitives, version conflicts, manual financial confirmations, Portuguese errors, independent fulfillment/payment badges, responsive cart and history. Cash opening remains explicit and shared. Phase 6 now supplies movements, counted closing, review, linked corrections and cash-specific history/reconciliation; full business reporting remains Phase 7. See PHASE_5_DECISIONS.md, ORDER_PAYMENT_POLICY.md and CASH_FOUNDATION.md.

## Future operational database design (historical design reference; implemented Order/Payment/CashSession fields above supersede this outline)

| Entity                        | Relationships and safeguards                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Order / OrderItem             | Source and state, separate payment state, immutable snapshots after confirmation, customer optional for counter |
| Payment / Refund              | One successful full payment per order, unique full refund reference, actor and current cash session             |
| CashSession / CashMovement    | Partial unique index for single active session, append-only money movement, preserved closing snapshot          |
| Sales/cash operation identity | Extend existing atomic audit/idempotency conventions to genuine business ownership                              |
| StoreSettings expansion       | Future operational defaults; current bounded ImportJob is already implemented in Phase 3                        |

Use foreign keys with RESTRICT for financial/catalog references. Avoid destructive cascades of historical records. Use version numbers for mutable customer/catalog edits and reject stale versions.

## Concurrency and integrity strategy

The inventory ledger is authoritative. Transactions acquire product/batch locks in stable ID order before computing eligible ledger balances and reservations. A transaction must validate nonnegative available stock before writing any reservation/consumption. Eligible batch selection excludes expired/blocked stock and prefers earliest expiry. Receipt source keys and production completion state protect against duplicate receipts.

Order confirmation, reservation, payment, handover, refund and cash close acquire the affected rows in consistent order. All POS writes, including audit and idempotency record, commit together. The server calculates item totals from persisted prices, uses integer arithmetic and validates discounts. Unique constraints back up application checks.

An idempotency key is generated before submission. The key is retained in the UI during uncertain results and bound to actor, action and a request fingerprint. Reuse with a different payload is rejected. An authenticated lookup resolves an uncertain result; a new key must never be generated automatically for a retry.

## Implemented identity security

First-owner setup requires a private local 256-bit installation key, direct loopback peer and exact Origin/non-simple CSRF header. Forwarded headers are not trusted. Setup closure and owner creation are atomic and database-locked. Argon2id password hashing uses bounded native work. Opaque sessions store only digests, use HttpOnly/SameSite=Strict/Path=/ cookies, expire after 12 absolute hours and are revoked by logout, password changes, role changes or disabling. Secure follows the configured HTTPS origin; loopback HTTP is explicit. No auth tokens in browser storage. Existing CSP/security headers remain restrictive.

Backend authorization uses shared named permissions and transactional rechecks. Only OWNER administers accounts/reviews security events; every role manages its own password. Persistent source/identifier throttles and safe audit events are implemented. Public health/installation endpoints expose only non-sensitive status; protected account/session endpoints omit hashes/digests. Logs omit credentials and bodies. Development fixtures are explicit, guarded and separate. Recovery is a confirmed offline local CLI, not a reset endpoint. Details and operator procedure are in AUTH_SECURITY.md and ACCESS_OPERATOR_GUIDE.pt-BR.md.

Owner-only customer export/import and registry permissions are implemented in Phase 3. Other business permissions arrive with their modules. Photo uploads are omitted. Any future uploads must use size/type validation and generated names in a non-executable local directory. Backup/restore remains Phase 8 and must be an administrator procedure, never a general employee endpoint.

## Runtime and dependencies

Node.js 24 LTS is the intended runtime. Pin exact direct dependency versions and retain `package-lock.json`. Check installed package engines, Fastify plugin compatibility, Prisma schema generation, frontend build and runtime tests. Do not infer compatibility from a version number alone. See DEPENDENCIES.md for verified sources and actual installed versions.

Store timestamps as PostgreSQL timestamptz/UTC instants. Derive report ranges from a validated Fortaleza business date. Ordinary operation requires no external network calls. Liveness and database readiness are separate: a live HTTP server does not mean the database is usable.

## Implemented Phase 6 cash extension

Additive 006_cash preserves all prior sessions/payments/refunds and adds CashMovement, CashClosing, CashReview, source activity/review versions and an explicit legacy-closed marker. SQL-derived totals are the authority; a closing stores the reviewed immutable JSON/string-centavo snapshot. Migration 007_cash_session_entry prevents future inserts impersonating preexisting legacy closures. Original migrations 001–005 remain unchanged. Custom SQL guard/counter/deferred-commit protections complement Prisma schema and are tested directly; Prisma diff does not describe triggers.

CashService reuses InventoryService actor/key/kind/canonical-payload operations. Cash-only lock order is security singleton → operation → session, with no later order/product lock. Sales retains security → operation → sorted products → order → current session → sorted reservations/batches. Payment/refund/movement posting locks the session, rejects closed/insufficient/over-limit sources and increments activity in the transaction. Closing holds no lock while an employee counts; confirmation locks/recomputes and rejects stale activity. Snapshot/state/audit/result commit together, with one snapshot per session. Existing bounded three-attempt recognized deadlock/serialization retry remains unchanged.

Cash projections omit customer data, costs and tender/change. cash.current is minimal; detailed source/history/reconciliation is owner/manager only; review and exact linked current-session reversal are owner only. Native dialogs and the existing memory-only uncertain command mechanism retain keys/payload until retry/status resolution; browser reload is not a durable pending queue. No wildcard CORS, new authentication system, public service or CSP relaxation. See PHASE_6_DECISIONS.md and CASH_SESSION_POLICY.md.
