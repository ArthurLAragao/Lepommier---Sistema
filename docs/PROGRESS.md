# Phase 7 checkpoint - acceptance gate passed

Checkpoint: **18 October 2026**. **Phases 0–7 are implemented with regression coverage. Phase 7 acceptance gate passed. Phases 8–9 remain pending. This is not an operational store release.** Verified full backup/restore, hardened installation/update and human operator/store pilot remain outstanding.

## Inspected baseline and preserved boundaries

Implementation/test commit: **a10ab869c0704b82005e6d5cf8bddc0393ea2f05**. Documentation is a separate checkpoint commit; its final hash and actual GitHub synchronization are reported after remote-main verification.

Started from clean main at **02e68aeb368092bec07d319c14ae193ea104a700**, fetched the authorized origin/main without divergence, and reconciled the brief/current policies/code. Reused React/Vite/Fastify/shared Zod/Prisma 7/PostgreSQL and existing native dialogs, security, permissions, money/date/CSV and inventory/order/cash services. Seven previous SQL migrations and package-lock.json match that baseline. No rebuild, dependency/global-service installation, database reset/drop, real-data seed, public interface or deployment. Synced project sources remain read-only.

## Implemented and consequential decisions

Thirteen permission-controlled tabular views: daily summary; fulfilled sales; stable-product sales; payment/refund method summaries; timestamped financial sources; order intake/current state; completed production; purchased ready-product receipts; waste; inventory movement/reconciliation; cash-session history; one customer's history; exact current alert sources. Owner dashboard, actual source links, Fortaleza presets/custom periods, relevant filters, stable pagination/full-filter totals, bounded safe explicit CSV, safe export audit and pt-BR operator guide are complete.

Fulfillment, payment/refund and intake dates remain distinct. Discounts count once; later refunds do not rewrite deliveries. Price/name changes and inactive products preserve snapshot amounts. Physical opening/closing is historical; reservations/availability and alerts are current. Cash uses Phase 6 formulas/snapshots, not an alternative drawer definition. No profit, invented threshold, growth percentage, chart dependency, provider verification or item-level refund allocation.

Reads validate session/actor in short REPEATABLE READ / READ ONLY snapshots without the global security write lock. Statement/transaction/acquisition bounds are 1.5/7/2 seconds. Export uses a new consistent snapshot, then a short final authorization/audit write before delivery. OWNER dashboard/export; explicit MANAGER financial/stock/cash/single-customer/cost reads without exports; PRODUCTION restricted stock/production/waste; CASHIER unchanged operational views. No customer PII/private-directory/cost leakage. Same exact Host/Origin/CSRF, session/setup/last-owner, CSP, privacy and append-only safeguards remain.

See PHASE_7_DECISIONS.md, REPORT_METRICS.md, REPORT_RECONCILIATION.md and REPORTING_OPERATOR_GUIDE.pt-BR.md.

## Additive migration

**202610170008_reporting_indexes** adds nine deliberate date/ID indexes for actual global range queries across orders, payments, refunds, production, purchased receipts, inventory movements and expiry. No new tables or historical row rewrite. Clean eight-migration application, original-baseline upgrades and genuine populated seven-to-eight upgrade passed. The latter preserves fingerprints of 17 history tables; source ownership/triggers remain intact. Prisma status is current and diff is empty; diff alone does not prove SQL trigger preservation.

## Commands actually executed and final results

Runtime: explicit bundled **Node 24.19.0**, existing npm CLI, portable **PostgreSQL 17.10**, installed Edge production browser on Windows. No Docker/TLS/LAN claim.

| Actual command/check                                                                               | Result                                                        |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| npm run db:generate                                                                                | Passed, Prisma 7.10.1                                         |
| npm run db:validate                                                                                | Passed                                                        |
| npm run db:migrate:test                                                                            | Passed, clean and retained baseline/populated upgrades        |
| prisma migrate status                                                                              | Eight migrations; up to date                                  |
| prisma migrate diff --from-config-datasource --to-schema apps/api/prisma/schema.prisma --exit-code | No difference                                                 |
| npm run typecheck                                                                                  | Passed, shared/API/web/tools/tests                            |
| npm run lint                                                                                       | Passed, zero warnings                                         |
| npm run format:check                                                                               | Passed                                                        |
| npm test                                                                                           | **132 passed**, 13 files                                      |
| npm run test:integration via existing portable harness                                             | **217 passed**, seven files, including all 35 reporting cases |
| npm run build (also actual pretest:e2e hook)                                                       | Passed, production local assets                               |
| npm run test:e2e                                                                                   | **95 passed**, all earlier 78 plus 17 reporting cases         |
| Previous migration/lockfile, UTF-8 and Git whitespace/private-value checks                         | Passed; seven previous migrations unchanged                   |
| Preserved manual database row fingerprints                                                         | Match, four/five migrations unchanged; not a backup           |
| Disposable preview migrate deploy/status/diff and restart/readiness/local assets/CSP               | Passed; no business records/accounts seeded                   |

The existing task-local work/verify-postgres.mjs owns only test PostgreSQL 55437 and stops it in finally, retaining isolated databases. A full run used POMMIER_REPORT_ONLY=0 and RUN_POMMIER_E2E=1 for all 217 integration cases. Targeted reporting runs diagnosed failures; browser-only retries used POMMIER_BROWSER_ONLY=1/POMMIER_REPORT_E2E_ONLY=0 with another clean isolated DB and all 95 browser tests. No test was disabled. Unit/API and production-browser fixtures contain synthetic data only. Server time is controlled for the independently calculated multi-date reporting scenario; Asia/Tokyo browser timezone does not change Fortaleza dates.

## Failures investigated and corrected

SQL JSON aggregate parameter typing needed explicit text casts; daily aliases needed quoted day identifiers. Type checks identified a tuple type, request-payload overload and unused imports; these were fixed. The deliberate corruption fixture initially hit the existing fresh-version guard and was corrected without weakening it. Browser fixtures/assertions were corrected to supply the required catalog reason, match actual shared alert/receipt/filter semantics, compare rendered whitespace consistently and create their own pagination records. A method summary drill-down was corrected to preserve its exact day/method.

Early reused-cluster browser runs saw intermittent 500s in existing cash/registry setup, followed by worker fixture conflicts/login throttling. Sixty direct real-service open/close cycles did not reproduce the initial cash error; PostgreSQL logs had no matching constraint error. A fresh disposable test cluster was created while preserving the older databases, and its full 95-browser run passed. A subsequent full regression exposed the concrete Query read timeout in transaction control. New integration case 35 independently delayed only audit COMMIT by 2.2 seconds and reproduced a premature HTTP 500 with the original two-second client timer. The driver deadline is now bounded at 25 seconds to outlive the existing 20-second transaction budget. Connection timeout/pool (2 seconds/five), report SQL/transaction/acquisition bounds (1.5/7/2 seconds), authentication and test budgets remain unchanged. This is a reproduced deadline defect and fix, without claiming every earlier uninstrumented error had the same cause. Final full integration and browser runs passed, including the new commit regression and original owner race. No test was disabled or automatically retried.

Safe diagnostics add only allowlisted library error codes and timeout categories; the strengthened unit case proves no raw connection/error/private-code payload is logged. Optional E2E_DIAGNOSTIC_LOGS captures the test server's sanitized stdout only; private diagnostics stay outside Git. Portuguese waste reason projections also retain the existing stock vocabulary.

Desktop/narrow screenshots were visually inspected; keyboard, contained scrolling and relevant Axe checks passed. This is not human operator/assistive-technology acceptance. Non-fatal upstream Zod comment, approximately 541-kB bundle, pg client-query deprecation and color-environment warnings remain disclosed, without dependency upgrades or security weakening. Synthetic export-cap fixtures are not high-volume acceptance.

## Manual environments and next boundary

Phase 4 **http://127.0.0.1:3333/** and Phase 5 **http://[::1]:3335/** were restored with their frozen compatible runtimes and unchanged four/five-migration databases. The existing empty/uninitialized disposable preview was reused for Phase 7 at **http://localhost:3336/**, rather than adding another host/cookie collision. It has eight migrations, zero business records/accounts and a preserved private installation key; choose the first owner through secure setup. Legacy physical names data/phase6-preview and le_pommier_phase6_preview remain intentional. Shared PostgreSQL remains 127.0.0.1:55438, physical data/manual-testing/postgres. Only app 3333 was temporarily paused for browser tests; the shared cluster was not stopped. All three pages/readiness/CSP/local assets were verified; no terminal must remain open. Exact commands/key retrieval/persistence are in MANUAL_TESTING.pt-BR.md. No verified pg_dump/restore path exists and fingerprints are not a backup.

**Stop here. Phase 8 continuation:** inspect local backup tooling; agree a protected destination/retention and access policy; produce a complete backup and actually restore into a separate disposable database before migrating important data; test permissions, constraints, restarts, persistence and disconnected core operation; then harden/reproduce installation/update/security/dependency procedures. Do not begin a real-data upgrade or claim restore protection from row JSON. Phase 9 still requires a realistic store day and human pilot acceptance. No accounting, fiscal/provider settlement, cloud publication or marketing sending is added.

## Historical Phase 6 evidence

## Phase 6 checkpoint — acceptance gate passed

Checkpoint: **17 October 2026**. **Phases 0–6 are implemented with regression coverage. Phase 6 acceptance gate passed. Phases 7–9 have not started. This is not an operational store release.** Full business reporting, verified backup/restore, installation acceptance and human store pilot remain pending.

Implementation commit: **a4049b6** (cash lifecycle, migrations, UI and regression tests). Documentation is a separate checkpoint commit; the final commit hash and actual push result are reported after remote-main verification.

## Inspection and preserved baseline

Inspected clean main at **239d8a9a396672cbbaa71bd700e21d0f40c7278c**, existing authorized origin/main, all five migrations/schema and current documentation/security/privacy/inventory/reservation/order/payment/cash-foundation/manual guides. Reused strict TypeScript React/Vite/Fastify/shared Zod/Prisma 7/PostgreSQL, existing UI/native dialogs, portable real-PostgreSQL harness and production browser setup. The checkpoint matched actual Phase 5 code and limited opening-only cash foundation. No stack change, dependency/global installation, original migration rewrite or database reset/drop. Earlier security/session/setup/last-owner, privacy, immutable order/payment/refund, inventory ledger/ownership and exact Origin/Host/CSRF/CSP safeguards remain.

## Implemented and decided

- Complete explicit shared OPEN/CLOSED cash lifecycle; opening actor/time/float and existing financial relationships preserved. Sessions may span midnight; unpaid future orders do not prevent closing and may be paid in a later explicit session.
- Append-only reasoned additions, withdrawals and categorized small cash expenses, safe optional reference and actor/server time. Physical outflows/refunds cannot exceed expected cash; no invented balance or backdating.
- Derived exact physical cash, separate per-method gross/refund/net receipts, cash counted and signed operational difference. Tender/change never inflate receipts; Pix/cards never increase drawer cash. Existing per-record caps and 999,999,999,999-cent session cap use SQL numeric/BigInt/decimal-string DTOs.
- Stale activity protection and atomic immutable counted snapshot/closing/audit/idempotent result. Payment/refund/checkout/movement versus closing commits into the open session before closure or fails/rolls back; checkout stock effects remain atomic. No locks while the employee counts.
- OWNER/MANAGER manage cash and history; CASHIER reads only necessary active-session identity/time/actor and uses existing payment permissions; PRODUCTION has no financial access. Only OWNER reviews or performs a single exact linked opposite movement in the explicitly reviewed current session, with reason and physical confirmation. Original figures/history remain unchanged. No reopen, replacement count, generic adjustment, payment correction or reversal chains.
- Current/history/detail/source pagination and Fortaleza opening-date/exact-session-ID filters, Portuguese movement/closing/review/correction dialogs, visible signed figures, stale reload and genuine committed-response retry/lookup. Read-only reconciliation separates integrity failures from a cash count difference; corruption/negative legacy expectation cannot be approved or silently repaired. No customer PII/cost/tender leak through cash projections.

Policies: PHASE_6_DECISIONS.md, CASH_SESSION_POLICY.md, CASH_OPERATOR_GUIDE.pt-BR.md and updated permissions/rules/metrics/architecture/assumptions/testing/manual guides. Full accounting, bank/Pix/card settlement verification, fiscal issuance, payables, cash export, denomination counting and Phase 7 dashboard/reporting are outside this checkpoint.

## Additive migrations

1. **202610170006_cash**: CashMovement/CashClosing/CashReview; activity/review counters; deliberate indexes/restrictive references; SQL totals and guards; immutable snapshot/append-only history; source counter and operation-target consistency. Existing open activity backfills from actual payment/refund records. Preexisting closed sessions are marked legacy without fabricated count/actor/snapshot.
2. **202610170007_cash_session_entry**: future sessions must start open at initial versions and cannot impersonate legacy closures. Added separately after 006 had applied in isolated verification.

All five earlier SQL migrations and package-lock.json compared to 239d8a9 after line-ending normalization: unchanged. Seven migrations cleanly apply. A genuine populated five-migration upgrade preserves identity/setup/session/audit/registry/inventory markers, internal and order-owned reservations, fulfilled/unfulfilled orders, cash/Pix/debit/credit payments, an older-payment refund and open/closed sessions. SQL protections are tested directly; Prisma diff alone does not represent triggers.

## Commands actually executed and final results

Runtime **bundled Node 24.19.0**, explicit npm CLI on Windows; existing portable **PostgreSQL 17.10**, installed Edge production browser. Host Node 25 was not substituted. No Docker/TLS/LAN verification claim.

| Actual command/check                                                                               | Final result                                                                |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| npm run db:generate; Prisma schema formatting during migration preparation                         | Passed, Prisma 7.10.1                                                       |
| npm run db:validate                                                                                | Passed                                                                      |
| npm run db:migrate:test; clean and foundation/identity/registry/inventory/orders-baseline upgrades | Passed, additive preservation without reset/drop                            |
| prisma migrate status                                                                              | Seven migrations, up to date                                                |
| prisma migrate diff --from-config-datasource --to-schema apps/api/prisma/schema.prisma --exit-code | Passed, no difference                                                       |
| npm run typecheck                                                                                  | Passed for shared/API/web/tools/tests                                       |
| npm run lint                                                                                       | Passed, zero warnings                                                       |
| npm run format; npm run format:check                                                               | Passed, including checkpoint/operator documents                             |
| npm test                                                                                           | **124 passed / 12 files**, 118 retained + 6 cash                            |
| npm run test:integration through work/verify-postgres.mjs                                          | **182 passed / 6 files**, 144 retained + 38 cash                            |
| RUN_POMMIER_E2E=1 work/verify-postgres.mjs invoking npm run build and npm run test:e2e             | Production build passed; **78 browser tests passed**, 61 retained + 17 cash |
| work/verify-phase6-preservation.mjs; private-value/path and Git whitespace review                  | Five original migrations/lockfile preserved; no private candidate matches   |
| Private preview start → graceful stop → restart and URL/readiness/local assets/CSP                 | Passed; no default account or operational fixture                           |
| Preserved Phase 4/5 database fingerprints before/after work                                        | All 19/25 public tables match; migration counts still 4/5                   |

The final real database run includes the strengthened negative-legacy-drawer guard and source-corruption assertion. Browser assets/server use real PostgreSQL and synthetic isolated fixtures, with normal authentication/CSRF. Keyboard/native dialogs, Axe, 1366×768 and 390×844 passed; desktop/narrow cash screenshots were visually inspected. No failing test was disabled. Test-owned PostgreSQL on 55437 and browser server shut down normally; shared manual PostgreSQL on 55438 remained running.

## Failures found and corrected

- Initial strict TypeScript caught unsupported UUID prefix filtering/optional shapes and fixture typing; exact ID search and explicit nullable/select/request contracts fixed them. Lint caught control-character regex use; readable codepoint validation fixed it without rule suppression.
- Invalid money reached an eager BigInt refinement after failed base validation; positive-string refinement now returns structured validation instead of a 500, covered by unit/API cases. Signed money display now correctly renders negative sub-real differences.
- First uncommitted 006 attempt had CASE syntax error. Transaction rollback/no applied schema change was verified, only its isolated failed migration marker was resolved, and corrected still-unapplied SQL succeeded. Applied SQL was then preserved; additional new-session protection uses 007.
- Expanded isolated database creation exhausted disk. Only the inspected task-local regenerable npm download cache was removed, preserving all databases/dependencies/manual data. Fresh runs then passed. One transient existing registry query timeout on the loaded Windows test run disappeared on complete reruns without changing application limits or removing assertions.
- New test fixtures initially omitted required account-restoration fields and a difference explanation on deliberately corrupted closing data; fixtures now satisfy the real contracts while retaining revocation/drift assertions. The former Phase 5 raw close fixture now uses the real counted-close API.
- Axe found a status role replacing definition-list semantics in the closing form. Moving the live status inside the definition value preserved announcements and passed all 78 browser cases. Final review added a financial-posting guard for preexisting negative expected cash and proved rejection without repair.
- Restricted Windows process spawning initially blocked esbuild/PostgreSQL. Running the same authorized checks outside the restricted-token sandbox passed; no application security setting was weakened.

## Manual environments and data safety

All three local applications and the shared PostgreSQL cluster are running at this checkpoint. HTTP page/readiness both 200 and CSP present:

| Application         | Exact URL              | Database and setup                                                                                                 |
| ------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Preserved Phase 4   | http://127.0.0.1:3333/ | le_pommier_manual, four migrations, existing initialized installation, private frozen compatible runtime           |
| Preserved Phase 5   | http://[::1]:3335/     | le_pommier_phase5_preview, five migrations, existing initialized installation, privately frozen compatible runtime |
| New Phase 6 preview | http://localhost:3336/ | le_pommier_phase6_preview, seven migrations, separate uninitialized installation                                   |

These are separate databases/users in **one** PostgreSQL 17.10 cluster at 127.0.0.1:55438, physically data/manual-testing/postgres. They are not separate PostgreSQL installations. The Phase 4 app was paused for automated port 3333 checks and restored; Phase 5 remains compatible with its unchanged database. Neither old database was migrated to Phase 6. Table fingerprints match; this is preservation evidence, **not verified full backup/restore**. Missing pg_dump/pg_restore remains a blocker for an in-place important-data upgrade, so no global backup tool was installed.

Phase 6 was created empty: verified zero accounts/products/orders/cash sessions, seven migrations and local assets responding. Its private key is data/phase6-preview/installation-secret; the authorized installer retrieves it privately and chooses the first owner credentials through the real loopback/Origin/CSRF setup screen. No key/credential is printed or served publicly. There is no default owner or automatic cash/product/stock/sale seed. Distinct IPv4/IPv6/localhost cookie hosts prevent cross-environment host-cookie overlap; ports alone do not isolate cookies.

Private launchers use detached hidden processes; no terminal window must stay open. Phase 6 graceful stop/restart was actually verified. Exact start/stop/status commands, private key location and shared-cluster stop order are in MANUAL_TESTING.pt-BR.md. The original launcher refuses to stop shared PostgreSQL while either preview depends on it. Private .env/key/database/log/runtime/snapshot/test artifacts remain outside Git. No actual customer data was copied into the new preview or tests, no public interface/deployment was enabled.

## Remaining boundary and precise Phase 7 continuation

**Stop after Phase 6.** Phase 7 must first inspect this seven-migration baseline and reconcile metric/permission definitions with immutable inventory/order/payment/refund/cash sources. Implement authorized tabular dashboard/report queries before charts/CSV, with Fortaleza boundaries, discounts, future paid pickups, anonymous sales, cancellations, later-session refunds and customer privacy. Compare every displayed/exported figure to underlying rows and maintain all 0–6 regressions. Do not turn cash difference into profit or count electronic receipts as physical cash. No Phase 7 implementation has started.

Full restore/retention/install/update/restart acceptance, real operator/assistive-technology/store-day pilot, larger-volume performance and Docker/TLS/proxy/LAN remain unverified/pending. Known nonfatal upstream optimizer, pg client query, bundle-size and color-environment warnings are disclosed. See KNOWN_LIMITATIONS.md and TEST_MATRIX.md. Normal reviewed origin/main checkpoint is authorized; no force-push, history rewrite, unrelated merge, public repository change or deployment is authorized. Commit hashes/push outcome are reported after the actual remote verification.

## Historical Phase 5 checkpoint

# Progress and verification - Phase 5

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
