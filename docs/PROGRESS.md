# Progress and verification

Checkpoint: **17 October 2026**. Phases 0–2 remain implemented with all regression coverage. Phase 3 is implemented and verified. **Phase 3 acceptance gate: PASSED. Phases 4–9 have not started. This is not an operational store release.**

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

**Stop here; no Phase 4 code is implemented.** Next authorized phase must inspect this verified baseline and design additive Batch/production/receipt/InventoryMovement/InventoryReservation structures. Implement whole-unit ledger reconciliation, idempotent completion/receipts, stable lock ordering, FEFO/expiry, waste/adjustment/reservation constraints and named transactional permissions. Prove retry, rollback, reconciliation and concurrent final-unit behavior on real PostgreSQL and verify Portuguese screens. Orders/sales/payment/cash remain their later phases. Phases 4–9, backup/restore and pilot acceptance are required before an operational store release.
