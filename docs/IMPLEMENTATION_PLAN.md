# Implementation plan

Proceed in dependency order. Each checkpoint runs type checks, lint, relevant tests and production build, resolves introduced failures and updates PROGRESS.md. Do not treat an unavailable dependency as a passing test.

| Phase | Scope                                                                                                         | Acceptance evidence                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 0     | Inspect assets/tooling; requirements, architecture, rules, metrics, permissions, assumptions                  | Inventory and explicit decisions recorded                                                             |
| 1     | Strict workspace, local shell, reusable UI, pt-BR helpers, API contracts/errors/correlation, health/readiness | Boot, real frontend/API connection, local assets, honest unavailable modules, unit/API/browser checks |
| 2     | Schema/migrations, secure owner setup, sessions, roles, audit, development-only fixtures                      | PostgreSQL setup/session/race/authorization integration tests                                         |
| 3     | Customers/profiles/preferences/privacy, catalog, versioned search/pagination, safe CSV                        | Unit, real PostgreSQL/migration/concurrency/privacy and production browser gate; see PROGRESS.md      |
| 4     | Ledger/batches, production, ready-made receipts, waste/adjustments, reservations                              | PostgreSQL reconciliation, expiry, retry and last-unit concurrency tests                              |
| 5     | POS, WhatsApp orders, full payment, pickup, idempotency and refunds                                           | Full store flows including uncertain submission and payment atomic rollback                           |
| 6     | Cash open, movements, close, differences and review                                                           | Cash/card/Pix distinction, immutable closing and discrepancy tests                                    |
| 7     | Defined dashboard/reports, filters, safe CSV, alerts                                                          | Underlying record reconciliation and Fortaleza boundaries                                             |
| 8     | Backups/restore, production Compose, installation, security/dependency review                                 | Clean restore, restart persistence, disconnected operation, reproducible install                      |
| 9     | Realistic store day, keyboard and 1366×768 QA, Portuguese operator guide, pilot checklist                     | Critical scenarios pass; limitations and human review explicit                                        |

## Test inventory and release gate

Track all 30 scenarios from the supplied brief in TEST_MATRIX.md as they become implemented. Use a dedicated PostgreSQL test database, with explicit safety guards preventing execution against store data. Pure helpers can be unit tested; database behavior must not be replaced by in-memory tests. Browser mocks may test failure UI but do not prove persistence.

Do not enable unfinished modules. Build functional modules in stages; show availability text and a clear roadmap for unavailable modules. No externally hosted deployment or remote push is authorized.

## Continuation discipline

Phases 0–2 were verified at `721d303`. Phase 3 extends that implementation with additive registry schema and preserved auth/audit/CSRF controls; see PHASE_3_DECISIONS.md. Advance only after its expanded gate in PROGRESS.md passes. Synthetic isolated fixtures only; an actual store import requires a separately reviewed file and mapping.

Phase 4 continuation: inspect current catalog, rules, permissions, metrics and verified migration baseline. Design additive Batch/production/receipt/ledger/reservation structures with integer whole-unit movements and stable row-lock ordering. Implement idempotent production completion and purchased-product receipts, FEFO eligible allocation, expiry/waste/adjustment restrictions and transactional actor rechecks. Prove reconciliation, retries, reserved/expired-stock refusal and simultaneous final-unit safety on real PostgreSQL, then verify Portuguese UI/browser flows. Sales/payment/cash remain later phases. No Phase 4 schema or route is introduced by this checkpoint.

The next phase starts only after the preceding checkpoint is verified or a precise environmental blocker is documented. Keep schema decisions, test output and exact continuation commands in PROGRESS.md. Before any operational release, owner validation of ASSUMPTIONS.md and a real restore/pilot gate is mandatory.
