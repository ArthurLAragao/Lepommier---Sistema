# Progress and verification

Checkpoint: **17 October 2026**. Phases 0–3 remain implemented with regression coverage. **Phase 4 is implemented and verified; its acceptance gate passed. Phases 5–9 have not started. This is not an operational store release.**

## Phase 4 implementation and reconciliation

Inspected the actual `af7a819` baseline, required brief/requirements/rules/metric/permission/architecture/testing/decision/privacy/CSV documents, all three migrations and schema, actor/session rechecks and lock order, audit filters/triggers, catalog origin/status rules, whole-unit/money/date helpers, native dialogs, production startup and portable PostgreSQL/browser harness. Code matched the Phase 3 checkpoint: production/stock unavailable, 97 unit/API, 63 PostgreSQL and 30 browser tests. Preserved foundation/identity/registry, setup closure, password/session/last-owner behavior, privacy projections, exact Origin/Host/CSRF, CSP and regression tests. No stack change or dependency/global installation.

Implemented finished-unit batches and opening counts; immutable ledger with transactionally maintained/reconciled BIGINT projections; planned/in-progress/completed/cancelled production receiving actual units only; purchased receipts with optional restricted cost snapshot; date-only expiry and unknown-expiry acknowledgement; reasoned waste and compensating IN/OUT adjustments; internal FEFO reservations/release/consumption and multi-product rollback; read-only reconciliation; actor-bound idempotency and status lookup; safe audit; pt-BR production/stock screens, details, filters/pages, stale review and uncertain-response handling. No real inventory/supplier/production records were supplied or seeded.

## Phase 4 decisions and migration

- Additive **202610170004_inventory** only: Batch, ProductionRecord, PurchasedProductReceipt, InventoryMovement, InventoryReservation, ReservationAllocation, InventoryOperation. Earlier three migrations are preserved against `af7a819` after CRLF/LF normalization. Restrictive/composite FKs, deliberate indexes, row bounds and deferred aggregate consistency triggers align with Prisma; direct SQL tests cover safeguards Prisma diff cannot express.
- Ledger is authoritative; no stock setter or auto-repair. Positive command quantity 1–100,000, batch cap 1 trillion, numeric/BigInt sums and decimal-string aggregate DTOs. Corrections preserve original entries and append a referenced compensating movement.
- Expiry valid through its entered Fortaleza date, blocked afterward, without automatic waste. Unknown expiry requires a reason and sorts after dated FEFO stock; owner must validate this initial policy and actual food safety. Server-recorded instants only; no arbitrary backdating or shelf-life inference.
- Security lock → operation → sorted products → source row → sorted batches → allocation/ledger/projections/audit/result. Current actor/session reauthorization coordinates revocation/catalog changes; recognized serialization/deadlock conflicts have three total attempts. No external work/user wait under locks.
- OWNER/MANAGER administer inventory and see explicitly granted receipt costs. PRODUCTION manages production and production-source waste, without purchased receipt/opening/adjustment/customer/cost access. CASHIER sees active sellable availability only. All backend projections/permissions are enforced independently of UI controls.
- Internal reservations have explicit namespace/source ownership and eligibility-through date; no HTTP creation/consumption route or claim of order FK integrity. Entire-reservation release/consume is atomic/idempotent; expired allocation stays traceable and fails consumption. Genuine order ownership is Phase 5.
- Operations bind actor/key/kind/canonical digest and pointer-only result atomically, retained for database lifetime. Browser uncertainty preserves key/payload and offers lookup/same-request retry; browser reload loses the local pending command and requires history review. No auth token storage or raw body/supplier-note audit snapshots.

Details: PHASE_4_DECISIONS.md, INVENTORY_INVARIANTS.md, RESERVATION_CONTRACT.md and INVENTORY_OPERATOR_GUIDE.pt-BR.md. Required architecture/rules/metrics/permissions/assumptions/testing/matrix/limitations/plan and access/registry guides were reconciled with current behavior.

## Phase 4 commands actually executed

Runtime: bundled **Node 24.19.0**, explicit npm CLI; host npm.cmd/Node 25 was not silently used. PostgreSQL **17.10**, loopback isolated port 55437, fresh `_test` databases; installed Edge production assets at 1366×768 and 390×844, Asia/Tokyo browser timezone and reduced motion. No Docker execution or TLS/LAN/public deployment verification.

| Command/check                                                                                      | Actual result                                                                                                       |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Prisma format; npm run db:generate; npm run db:validate                                            | Passed; Prisma 7.10.1 client generated, schema valid                                                                |
| npm run db:migrate:test; prisma migrate status                                                     | Passed, all four migrations applied cleanly / existing test target up to date                                       |
| prisma migrate diff --from-config-datasource --to-schema apps/api/prisma/schema.prisma --exit-code | Passed, no difference                                                                                               |
| Foundation-, identity-, registry-baseline upgrades                                                 | Passed, preserved synthetic legacy records, closure, hashes/sessions/audit/customer preferences/inactive catalog    |
| work/verify-phase4-preservation.mjs (task-local)                                                   | Three original migrations preserved; source/document candidates and known private values checked without disclosure |
| npm run typecheck; final tsc -p tsconfig.tests.json --noEmit                                       | Passed, including tools/shared/API/web and strengthened tests                                                       |
| npm run lint                                                                                       | Passed with zero warnings                                                                                           |
| npm run format; npm run format:check                                                               | Passed after final source/document updates                                                                          |
| npm test                                                                                           | **113 passed / 10 files** (97 retained + 16 new inventory/helper/retry checks)                                      |
| npm run test:integration through work/verify-postgres.mjs                                          | **104 passed / 4 files** (63 retained + 41 inventory) in the final database rerun                                   |
| RUN_POMMIER_E2E=1 work/verify-postgres.mjs, invoking npm run build and npm run test:e2e            | Production build passed; **43 browser tests passed** (30 retained + 13 inventory)                                   |

Harnesses use unique synthetic databases, do not drop/reset existing databases, and gracefully stop owned PostgreSQL/browser processes. The manual database at port 55438 is separate and never serves as an automated-test fixture. Known upstream Zod comment-optimization and NO_COLOR/FORCE_COLOR build/test warnings are non-fatal; there are no disabled failing tests.

## Failures found and corrected

Initial Prisma validation required explicit composite one-to-one uniqueness for batch/product links; corrected before generating/applying the additive migration. Strict TypeScript caught an overly narrow inferred inventory DTO list; corrected with the shared type. Older overview/catalog text falsely described inventory as unavailable or asserted no operations; replaced with accurate module/panel states. Saved receipt notes are now visible in batch details, with a browser assertion, and production details expose stored plan/timestamps/notes.

First full browser run: 42 passed, one retained CSV Escape test timed out. It matched a name in the original sample while preview generation could still be busy. It now waits for the review table and enabled cancellation; the real cancel-response/no-created-customer assertions remain and the full rerun passed 43/43. A strengthened direct-FK fixture first hit an existing allocation unique key (P2002) instead of its intended composite FK; it now uses a distinct valid batch, asserts P2003, and the database rerun passed 104/104. Completion races now also exercise distinct command keys. A sandbox Git-child EPERM prevented the first local preservation scan; the authorized subprocess rerun passed. No test was disabled or product safeguard removed.

## Current boundary and continuation

The manual app was gracefully paused during browser verification, then resumed after applying only migration 004 to the dedicated `le_pommier_manual` database on loopback port 55438. Before/after fingerprints of all 11 existing tables were equal, including identity/setup and registry history. No fixture/default account was created. The existing private key/configuration and persistent `data/manual-testing/postgres` were retained. Verified `http://127.0.0.1:3333/` and `/api/health/ready` returned HTTP 200, CSP was present, and installation was already initialized with setup closed. App/database are detached local processes; no terminal window needs to stay open. The existing private manual launcher supports start/stop/stop-app/status; no test-harness process is used for manual operation.

The portable runtime lacks pg_dump/pg_restore. The first private export attempt failed before any manual migration; its two empty scratch files were removed. No new dependency was installed. A private ACL-restricted pre-migration JSON row snapshot was created/read back, and the additive migration was checked by all baseline table fingerprints. This is **not** a full backup/restore solution or restore test; that remains Phase 8. Secrets, `.env`, installation keys, database files, row snapshots/backups and private scratch/test artifacts remain outside Git. The user authorized a normal reviewed checkpoint to existing `origin/main`; no force-push, history rewrite, unrelated merge or external deployment is authorized.

Limitations: unknown-expiry default needs owner validation; finished whole units only; internal reservations without orders; immutable batch metadata requires compensating correction; no partial fulfilment/count wizard/durable browser command queue; no large-volume performance acceptance. Human operator/assistive-technology review, full backup/restore, operational restart/disconnected pilot, TLS/proxy/LAN/Docker and remaining store modules remain unverified/pending. No actual stock count or supplier file was imported.

**Stop at Phase 4.** Phase 5 must inspect this four-migration baseline, create real Order/OrderItem ownership and restrictive reservation references, snapshot product/prices, compose confirmation/cancellation/handover with FEFO allocation/release/consumption, and enforce full-payment/cash prerequisites deliberately. Test rollback, permission revocation, cross-product/final-unit/expired-pickup races and uncertain submissions. No Phase 5 implementation was started. Payments/refunds/cash closing/reports/backup/installation/pilot work remains required before a complete operational store release.

## Historical Phase 3 checkpoint evidence

The following sections retain the prior Phase 3 implementation and verification record; their then-future inventory statements are superseded by the current Phase 4 checkpoint above.

## Inspection and reconciliation

Started from inspected local Phase 2 commit 721d303. Read PROJECT_BRIEF, requirements, architecture, business/metric rules, permissions, implementation plan, assumptions, progress/testing/matrix/limitations and AUTH_SECURITY/PHASE_2_DECISIONS. Inspected migrations/schema, named permissions and transactional actor rechecks, sessions/CSRF/Origin/Host, shared contracts/errors, UI primitives/native dialogs, unavailable modules, scripts/lockfile/runtime and portable PostgreSQL/production browser harness.

The checkpoint matched code: identity was complete, customer/catalog modules were unavailable, and no operational schema existed. Reused strict TypeScript React/Vite/Fastify/Zod/Prisma 7/PostgreSQL, cream/green UI, local production entrypoint and test harness. Preserved installation closure, Argon2id/session/revocation, last-owner invariants, exact Origin/Host/CSRF and audit safeguards. No rebuild, placeholder replacement, global installation, database reset/deletion, remote push or external publication.

Documentation reconciled the former broad manager/private-fields and future-schema wording: MANAGER has no CPF/private notes or bulk/marketing administration; PRODUCTION reads active catalog without customer/cost access. Current marketing state lives on Customer with separate history. Earlier operational schema remains future design, not empty speculative tables.

## Implemented features

| Area              | Implemented behavior                                                                                                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer registry | Name-only minimum, optional validated identity/contact/date/address/notes, immutable unique display registration, role-aware list/profile/create/edit, search/status/sort and pages of 20                                                             |
| Integrity/privacy | Versioned stale-edit rejection, real concurrent-write protection, duplicate contact/name review with reason, non-overridable unique CPF, reversible deactivation and confirmed owner-only anonymization without PII audit snapshots                   |
| Marketing         | UNKNOWN default, explicit state/source/reason/actor/time/evidence history, no inferred import consent or promotional sending                                                                                                                          |
| Catalog           | Versioned categories/products, unique normalized category name/SKU, origin, integer prices/optional restricted estimated cost, status, filters/search/sort/page, honest neutral photo placeholder and no stock data                                   |
| CSV               | Empty template, UTF-8 comma/semicolon strict parser, quoted/multiline fields, explicit mapper/original-normalized preview, row errors/file+DB duplicates, create-or-skip choices, atomic bound confirmation, retry idempotency and DB drift rejection |
| Export            | Explicit owner-only minimal filtered CSV, UTF-8 BOM/formula-safe escaping, anonymized exclusion, bounded size, safe count/scope audit and no public URL                                                                                               |
| Security/audit    | Named permissions, DB field projections, transactional actor/session rechecks using existing lock; all new mutation CSRF/Origin checks; safe field-name/coded metadata and price/cost events                                                          |
| UI/docs           | Portuguese forms/profiles/dialogs/feedback, permission awareness, expiry/uncertain-result/stale paths, desktop/narrow layout, operator/CSV/privacy/catalog policies                                                                                   |

No real customer file, employee detail or operational dataset was supplied/imported. All automated records and screenshots are synthetic and isolated. Optional development fixture safeguards remain unchanged; no customer/product seed is automatic.

## Decisions and migrations

Added only **202610170003_registry**: Customer, MarketingPreferenceEvent, Category, Product, ImportJob and supporting enums/indexes/FKs/checks/triggers. Foundation 001 and identity 002 are unchanged from 721d303 after line-ending normalization; both were compared directly. No inventory/financial tables. Prisma schema and SQL agree; custom checks/functions/triggers are documented and directly tested, because Prisma diff does not represent all of them.

Registrations are concurrent-safe sequence numbers with permitted gaps. Birthday supports complete date only, PostgreSQL DATE/API YYYY-MM-DD, 1900 through today in Fortaleza. Brazilian phone normalization never guesses digits and is nonunique; email is trimmed/lowercased/nonunique; optional CPF check digits are not identity verification. Zero selling price requires explicit confirmation; whole-unit amounts are integer centavos. Category deactivation retains child product links/active flags. Future order items must snapshot prices; sales-history preservation is not yet end-to-end testable.

Imports are atomic, at most 100 rows/256 KiB/20 columns, with memory-only 15-minute previews (up to another 60 seconds for pruning), five total/two per actor. Raw CSV/filenames/PII are not persisted in jobs/logs/audits. Same confirmation choices return the same stored result; changed DB duplicate assumptions require a new review. Closed metadata-only jobs retain 30 days with bounded cleanup. Anonymization cancels all pending previews and clears evidence references, but cannot recall earlier downloads/browser-delivered data/backups. DB diagnostic archives need their own restricted retention policy.

Existing security lock orders revocation against registry writes/imports: a revoked actor cannot complete if revocation obtained the lock first; an operation already holding it commits before a later revocation. This is a bounded local five-account design, not a scaling/cancellation guarantee. Full rationale: PHASE_3_DECISIONS.md, CUSTOMER_CSV.md, CUSTOMER_PRIVACY.md and PERMISSIONS.md.

## Commands actually executed

Verification uses **bundled Node 24.19.0** on Windows x64 through the explicit npm CLI, not host Node 25.3.0. Exact paths/safe prerequisites are in TESTING.md. PostgreSQL is the existing portable **17.10** on loopback; Edge uses production assets/server and a fresh isolated migrated DB. **Docker was not executed or verified.**

| Actual command/check                                                                               | Result                                                                                                                 |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| npm view csv-parse; pinned npm install                                                             | csv-parse 7.0.3 added, lockfile retained, install audit reported zero known advisories                                 |
| npm run db:generate / Prisma format                                                                | Passed, Prisma 7.10.1                                                                                                  |
| npm run db:validate                                                                                | Passed                                                                                                                 |
| Prisma migrate diff from saved Phase 2 schema                                                      | Generated additive registry SQL, subsequently reviewed/extended with explicit constraints                              |
| npm run db:migrate:test                                                                            | Passed existing isolated DB and clean fresh DBs, without resets; retries no pending migration                          |
| prisma migrate status                                                                              | Three migrations; database up to date                                                                                  |
| prisma migrate diff --from-config-datasource --to-schema apps/api/prisma/schema.prisma --exit-code | Passed, no difference                                                                                                  |
| Identity-baseline upgrade and foundation-only upgrade                                              | Passed, retaining marker, account hash, session digest, audit and installation closure                                 |
| npm run typecheck / npm run lint                                                                   | Passed, including final UI and all test sources; lint has zero warnings                                                |
| npm run format / npm run format:check                                                              | Passed, including completed checkpoint/operator documents                                                              |
| npm test                                                                                           | **97 passed**, eight files; original coverage retained                                                                 |
| npm run test:integration                                                                           | **63 passed**, three files, real PostgreSQL (31 added registry scenarios plus 32 retained)                             |
| npm run build                                                                                      | Passed shared/API/Vite production build                                                                                |
| npm run test:e2e                                                                                   | **30 passed**, including 13 registry and all 17 foundation/identity scenarios, installed Edge                          |
| Original migration / scratch-secret / git diff --check / port checks                               | Passed: both original migrations preserved; 105 candidates/11 private scratch values, zero matches; owned ports closed |

The task-local work/verify-postgres.mjs ran migrate/status/diff/integration and, with RUN_POMMIER_E2E=1, created a fresh browser DB/key/random password and ran production browser tests. No keys/passwords were printed. Databases and private scratch artifacts are retained for investigation outside Git, never reset/dropped. The owned server stopped cleanly in the final successful run.

## Failures found and fixed

- Strict TypeScript found exact-optional field construction and optional mapping values; explicit nullable updates and filtered mapping fixed them. Lint found control-character regex syntax, an unused binding and mixed React/helper exports; fixed without suppressions.
- Two integration fixture DELETE requests set JSON content type without a body, causing the parser's correct 400 before expected nonexistent-route 404. Fixtures now send an empty object; the no-delete endpoint assertions remain.
- Browser layout checks found the category selector's reused fixed-width search field overflowing at 1366 pixels. The selector/grid/filter controls now fit their column; table scrolling stays contained. The original overflow assertion remains and passes at desktop/narrow sizes.
- Native Escape default closing could bypass async CSV cancellation. The existing modal now defers closing to its controlled callback; the new browser cancellation test proves server cancellation completes and no customer is created.
- The test wrapper's old 20-second shutdown wait was shorter than a roughly 25-second Windows disk checkpoint. PostgreSQL subsequently shut down cleanly; the wrapper now allows 60 seconds, with no forced kill/data deletion. Final run stopped successfully.

The final formatting check also caught one browser-spec formatting discrepancy; the file was reformatted and directly rechecked, without changing assertions. No failing test was disabled. Final browser tests cover mapping/result/retry/export, role restrictions, customer/catalog actions, stale review, preferences/anonymization, keyboard/dialogs, 1366×768 and 390×844, reduced motion, Axe and existing local-assets/CSP/session flows. Customer profile/catalog desktop and narrow screenshots were visually inspected; synthetic data only. Axe is not a complete human accessibility audit.

## Limitations and Phase 4 continuation

No real-file compatibility/import, Excel/legacy-encoding support, partial birthdays, product photos, bulk updates/merges or legal-compliance guarantee. No TLS/proxy/LAN runtime verification, other native platforms, human terminal/operator/assistive-technology acceptance, audit archival, full backup/restore or store pilot. Two existing harmless upstream Zod comment-optimization build warnings remain. See KNOWN_LIMITATIONS.md.

At the historical Phase 3 checkpoint, inventory/production was the next unimplemented phase. That continuation is now implemented and verified in the Phase 4 evidence above. The current stopping point is Phase 4; orders/sales/payment/cash and later operational acceptance remain pending.
