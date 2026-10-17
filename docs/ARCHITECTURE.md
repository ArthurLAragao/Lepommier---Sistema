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

Current marketing state lives on Customer rather than a separate singleton preference table; history is separate. Anonymization scrubs optional evidence references while retaining non-identifying event provenance; it does not alter append-only AuditEvent. There are no PII audit snapshots. Category deactivation retains products and their flags. Prices/cost are integer centavos; future order items must snapshot prices. No stock fields, photo upload or fabricated availability are present.

## Implemented Phase 4 inventory and production

Additive `202610170004_inventory` introduces batches, immutable stock ledger, production, purchased finished receipts, internal reservations/allocations and actor-scoped InventoryOperation. BIGINT batch projections update with ledger/allocation writes; deferred SQL constraint triggers validate final aggregate agreement. Composite foreign keys preserve product identity. Aggregate transport is decimal strings/BigInt, not floating point. No existing migration is rewritten and no order/financial/ingredient table is added.

InventoryService reuses the security singleton lock and current actor/session check, then operation identity, sorted product IDs, source row and sorted batches. All stock changes, safe audit and pointer-only idempotency result commit together. Bounded recognized serialization/deadlock retry uses the same request. Native dialogs preserve pending keys/payloads during uncertain responses and provide authenticated lookup. Original batch metadata/expiry and terminal production remain immutable; corrections append compensating movements.

Production/Estoque screens use existing cream/green components, forms, tables, pagination and modal focus behavior. CASHIER sees active sellable availability only; PRODUCTION has production/relevant batches and production-batch waste, without purchase costs/customer information. No sales-linked reservation screen or arbitrary consumption route exists. Read-only reconciliation reports drift without repair. See PHASE_4_DECISIONS.md, INVENTORY_INVARIANTS.md and RESERVATION_CONTRACT.md for numeric/expiry/transaction/retention details.

## Future operational database design (remaining modules)

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
