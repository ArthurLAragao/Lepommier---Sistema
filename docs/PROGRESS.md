# Progress and verification — Phase 5

Checkpoint: **17 October 2026**. **Phases 0–5 are implemented with regression coverage. Phase 5 acceptance gate passed. Phases 6–9 remain pending. This is not an operational store release.** Full cash closing/reconciliation is not implemented.

## Baseline reconciliation and implementation

Inspected actual main at 0b6ce1f / 0879f7a: brief/requirements/rules/metrics/permissions/architecture/assumptions/plan/progress/testing/matrix/limitations, identity/privacy/CSV decisions, Phase 4/inventory invariants/reservation contract/operator guide, all four migrations/schema, current lock/actor/session rechecks, FEFO/release/consumption and operation lookup, ledger/projection triggers, money/date/BigInt DTOs, native dialogs, production PostgreSQL/browser harness and private manual launcher. The checkpoint matched the four-migration Phase 4 code: 113 unit/API, 104 PostgreSQL and 43 browser tests. No stack rebuild, dependency change/global installation, old migration rewrite or database reset.

Implemented counter POS and history/non-fiscal detail; employee-entered WhatsApp drafts and future Fortaleza pickup; confirmed immutable product/price/discount snapshots; all-item owned FEFO reservations; full manual cash/Pix/debit/credit payment; ready/paid/eligible handover; unpaid cancellation and owner-only full original-method refund/cancellation; fulfilled refund without stock return; connected customer order/payment/refund history; privacy erasure of linked collection text; safe audit/events; version conflicts; actor/key/payload idempotency and genuine uncertain-response lookup/retry; named permissions and explicit PII/cost projections; responsive pt-BR screens and operator guides.

## Decisions and migration

- Additive **202610170005_orders** only: Order, OrderItem, Payment, Refund, OrderEvent, limited CashSession and extensions to InventoryReservation/InventoryMovement/InventoryOperation. Four earlier migrations preserved against 0b6ce1f after CRLF/LF normalization. Valid legacy INTERNAL reservations/allocations/ledger remain; new ORDER reservations have genuine restrictive composite item/product/quantity FKs, source equality and per-batch consumption/operation checks. Custom SQL checks/triggers are tested directly as Prisma diff cannot express them all.
- Explicit OWNER/MANAGER opening of one shared active store cash session is the minimum Phase 5 prerequisite. No auto-open, permanent seed, bypass, close endpoint, counted cash, withdrawals/additions/expenses/differences or complete cash report. Each payment/refund retains its actor/current session. Full Phase 6 remains pending. OWNER alone approves refund/paid cancellation; MANAGER can grant coded discounts; CASHIER cannot discount/refund/open or consume arbitrary inventory. PRODUCTION has no new customer/order/payment access.
- Exact BigInt monetary arithmetic; integer cents; order subtotal/total at most 99,999,999 centavos; 1–20 distinct products, 1–100,000 whole units/line; cumulative proportional discount allocation. Monetary/history aggregates transport as decimal strings. One full positive payment, one original-method full refund. Zero-total drafts may be reviewed but confirmation/checkout rejects zero totals; no fictitious receipt/no-charge path.
- Manual order flow DRAFT → CONFIRMED → PREPARING → READY → FULFILLED, cancellation only before handover; payment derived separately UNPAID/PAID/REFUNDED. Atomic immediate counter checkout may skip preparation/ready. Confirmed amendments and expired allocation resolution use explicit cancellation/recreation; paid cancellation refunds/releases in the same transaction. Fulfilled refunds preserve handover/consumption. No partial fulfillment/payment/refund, deposits, split tender, store credit, installments, backorders, delivery, bank verification or automatic WhatsApp.
- Pickup is a strictly future Fortaleza minute within 365 days; selection/confirmation validate active non-anonymized customers, product versions/prices, and lots suitable through the pickup business date. Handover revalidates current lot/product eligibility. Orders reference customer IDs without copying customer identity; anonymization scrubs collection name/note/operator notes and prevents reintroduction. Fulfilled totals before refunds, last fulfillment, received payments and refunds are separate actual-history queries, without debt/profit claims.
- Existing security lock → actor-bound operation → sorted products → order → active cash when financial → sorted reservations → sorted batches → ledger/projections/events/audit/result. Current actor/session checks, setup closure, password/last-owner, exact Host/Origin/CSRF/CSP, privacy and append-only safeguards remain. All effects/result commit together. Browser uncertainty retains the same key/payload in component memory; reload loses that command and requires history review, not a durable queue or a second external charge/refund.

Details: PHASE_5_DECISIONS.md, ORDER_PAYMENT_POLICY.md, CASH_FOUNDATION.md, RESERVATION_CONTRACT.md, CUSTOMER_PRIVACY.md and SALES_OPERATOR_GUIDE.pt-BR.md.

## Commands actually executed and results

Runtime: **Node 24.19.0** through the bundled executable and explicit npm CLI, PostgreSQL **17.10** portable runtime, installed Edge using production assets at 1366×768 and 390×844, reduced motion and Asia/Tokyo browser timezone. No Docker, TLS/proxy/LAN/public deployment or human pilot verification.

| Command/check                                                                                            | Actual result                                                                                                                          |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Prisma format; npm run db:generate; npm run db:validate                                                  | Passed; Prisma 7.10.1 generated and schema valid                                                                                       |
| work/create-phase5-migration.mjs (task-local saved four-migration schema diff plus reviewed constraints) | Created additive 005, no earlier migration edited                                                                                      |
| npm run db:migrate:test; prisma migrate status                                                           | Passed existing isolated target and fresh clean databases; five migrations up to date                                                  |
| prisma migrate diff --from-config-datasource --to-schema apps/api/prisma/schema.prisma --exit-code       | Passed, no difference                                                                                                                  |
| Foundation/identity/registry/inventory baseline upgrades                                                 | Passed; preserved markers, closure, password/session/audit/customer/catalog and legacy INTERNAL reservation/allocation/ledger records  |
| npm run typecheck; npm run lint; final test-source TypeScript check                                      | Passed; tools/shared/API/web/test sources; zero lint warnings                                                                          |
| npm run format; npm run format:check                                                                     | Passed, including final checkpoint documents                                                                                           |
| npm test                                                                                                 | **118 passed / 11 files** (113 retained + 5 sales/helper cases)                                                                        |
| npm run test:integration via work/verify-postgres.mjs                                                    | **144 passed / 5 files** (104 retained + 40 sales cases); final full rerun passed                                                      |
| RUN_POMMIER_E2E=1 work/verify-postgres.mjs → npm run build / npm run test:e2e                            | Production build passed; **61 browser tests passed** (43 retained + 18 sales/order cases), final full rerun after POS width correction |
| work/verify-phase5-preservation.mjs                                                                      | Four old migrations and lockfile preserved; working/staged whitespace checks                                                           |
| work/inspect-phase5-manual.mjs verify                                                                    | 18 original manual table fingerprints unchanged, four migrations, original DB not migrated                                             |
| Separate preview: Prisma migrate deploy/status, existing setup-secret script                             | Five migrations applied to new empty le_pommier_phase5_preview; private random key without value output; no account/business seed      |
| Private manual/preview start/status and graceful stop/restart                                            | Passed; both local pages/readiness HTTP 200, CSP present; original setup remains closed, preview securely awaits first owner           |

Harnesses use isolated synthetic databases at 55437 and stop only their owned test cluster/server. No actual customer file, product/price, stock count, order, payment or supplier record was supplied or automatically populated into either manual environment. Tests exercise direct SQL constraints, rollback injection, revocation and documented race outcomes without disabling safeguards.

## Failures found and resolved

Initial TypeScript diagnostics identified mutable Prisma sort typing and an omitted explicit INTERNAL namespace after helper extraction; both corrected. A React purity lint finding on pickup default time was fixed with lazy state initialization. A test sent an undefined header value rejected by Fastify injection; the helper now omits absent values. Local owner-recovery regression correctly refused an app already listening at 3333; paused that manual app instead of weakening recovery. An ambiguous browser status locator caused a worker restart, repeated fixture-name conflicts and eventual genuine login throttling; scoped the locator and made fixture identities unique, without changing throttling. Visual review found inherited max-width narrowing the POS despite a wide width declaration; corrected the maximum and added a >900px desktop browser assertion. All affected checks and the full PostgreSQL/browser gate were rerun successfully; no test was disabled.

Existing non-fatal upstream warnings remain: two Zod/Rollup optimization-comment warnings, pg concurrent-query deprecation and test console color environment warning. No dependency upgrade was introduced for these warnings.

## Persistent manual environment

Original **http://127.0.0.1:3333/** is running on its privately frozen compatible **Phase 4** runtime with le_pommier_manual and unchanged credentials/data. Its database was deliberately **not migrated**: the portable tooling has no pg_dump/pg_restore and a row JSON snapshot/fingerprint is not a verified full backup. That missing recovery capability blocks an in-place manual upgrade, not isolated Phase 5 acceptance. No archive was rewritten or global backup tool installed.

Separate **http://[::1]:3335/** is running the Phase 5 build with dedicated le_pommier_phase5_preview/user and secure first-owner setup; no default credentials. IPv6 versus IPv4 intentionally separates host cookies, which ports alone do not isolate. Both use persistent loopback PostgreSQL 55438 at private data/manual-testing/postgres, distinct from automated 55437. Pages/readiness returned 200 and CSP remained present after actual graceful stop/start. No terminal must remain open. Exact stop/start commands, private key location and data protection limits: **MANUAL_TESTING.pt-BR.md**. Private launchers/configuration/keys/database files are excluded from Git.

## Acceptance, limitations and Phase 6 continuation

The reviewed implementation is committed as `799f34a91e9edb46c4bb415593e5231a4d0f6347` on `main`. The authorized destination is `https://github.com/ArthurLAragao/Lepommier---Sistema.git`, `origin/main`; fetch confirmed no divergence from the inspected baseline before committing. Staged Git objects/history were checked against 21 known private values with no matches, and private runtime/data/backup/scratch paths were excluded. Documentation is saved separately. Remote synchronization is verified separately at handoff; a local commit alone is not evidence of a push or deployment.

**Phase 5 gate passed. Stop here.** Full cash closing, expected/counted physical cash, electronic-method separation in closing, additions/withdrawals/expenses, immutable differences/review/corrections and full cash reporting are the precise Phase 6 continuation. Reuse payment/refund/session records and lock/idempotency conventions; preserve original payment sessions and current-session refunds. Resolve final assignment/closing policies explicitly and prove financial/closing races before enabling complete Caixa.

Manual provider execution cannot be inferred from database success. Zero-total completion and automatic reallocation are unsupported; confirmed amendments use cancellation/recreation. Pending browser commands do not survive reload. Unknown expiry remains an owner-review policy, not food-safety assurance. Full reporting, tested backup/restore and production installation, real operational restart/disconnected acceptance and human pilot remain Phases 7–9. No fiscal integration, public release, real-store data import, cloud publication or operational-readiness claim. A reviewed ordinary GitHub checkpoint to authorized origin/main is separate from deployment and excludes all private data.

## Historical Phase 4 checkpoint

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
