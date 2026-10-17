# Testing foundation, identity, registry and inventory

Use Node 24 LTS and `npm ci`. Generated Prisma/shared outputs are prepared by hooks and are not committed. Do not run tests against store data, reset existing databases or disable failing checks. Test credentials are synthetic random values; no default production password exists.

## Source gate

```powershell
npm run db:generate
npm run db:validate
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

Pure tests cover the preserved money/date/CSV helpers plus login normalization, password Unicode/bounds, shared request validation, permission mapping, expiry calculation, loopback checks, safe audit filtering, native password budget/recovery and development/maintenance target guards. Injected Fastify tests cover safe Portuguese errors/correlation IDs, local binding, headers/CSP, health/readiness, resource cleanup and production entrypoint. Real PostgreSQL route tests cover Origin/CSRF. Pure tests alone do not prove PostgreSQL behavior.

On this Windows host the npm.cmd launcher selects host Node 25.3.0 regardless of PATH. The actual verification uses:

```powershell
$env:PATH = 'C:\Users\Ryzen\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:PATH
& 'C:\Users\Ryzen\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run typecheck
```

The same explicit runtime/CLI runs the other npm commands. On another installation use its verified Node 24 executable; do not silently substitute a runtime.

## Real PostgreSQL integration

1. Start an isolated local PostgreSQL instance. Development/test Compose configuration is supplied: `docker compose --profile test up -d db-test` when Docker is available. This host did **not** execute Docker.
2. Configure TEST_DATABASE_URL to a separate local PostgreSQL DB ending in `_test`, distinct from DATABASE_URL. Target comparisons decode DB names and normalize default ports, so different credentials/loopback aliases do not bypass the same-target check. Test/development/recovery targets allow only an optional `schema=public` query; host/port override and other query options are refused. The test role needs CREATE DATABASE for fresh per-suite isolation. Do not give the production app unnecessary database-administration permissions.
3. Run `npm run db:migrate:test`, then `npm run test:integration`.
4. Stop the test instance afterward; retain/delete only explicitly reviewed disposable databases through a separate maintenance procedure. This suite never drops/resets the supplied database.

The tests create uniquely named `_test` databases and apply real migrations. The foundation upgrade starts with **only** the original foundation migration and a marker, then applies all remaining migrations. Phase 3 adds an **identity-baseline upgrade** with existing owner/hash/session/audit, foundation marker and closed installation. Phase 4 adds a **registry-baseline upgrade** with existing synthetic customer/preference history, inactive category/product and all identity markers, then applies inventory additively. Other suites apply all four migrations cleanly. Identity tests retain setup races/closure, loopback/forward spoofing, login/digests/cookies, logout/replacement/expiry, revocation, roles, password/recovery, CSRF/Origin, last-owner/five-account concurrency, throttling and audit safeguards. Expiry uses an injected clock, not sleeps. Fixtures remain isolated from store/development data.

Phase 3 unit tests cover optional customer validation, phones, CPF, date-only birthdays, integer money, permissions, privacy query projections, strict CSV parsing/limits/mapping, normalized duplicates and formula-safe escaping. Real PostgreSQL registry tests cover CRUD, role projections and unauthorized paths, duplicate/CPF review, concurrent edit-status conflicts, marketing history/anonymization without audit PII, product-code races, category references, SQL constraints, every new mutation's CSRF/Origin, atomic import/retry/drift, expiry/restart, export and permission revocation ordered against writes/import. Browser response-loss simulation occurs only **after a real confirmation commits**; retry uses persisted results.

The existing task-local portable harness runs PostgreSQL **17.10** bound to `127.0.0.1:55437`, uses a random private password file and stops the owned server in finally. From this task workspace:

```powershell
& 'C:\Users\Ryzen\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' work/verify-postgres.mjs
```

The portable wrapper/runtime lives in `work/`, outside application dependencies. It is host-specific testing infrastructure, not a production installer; no global service was installed. Fresh disposable databases are retained without resetting existing data. One expanded-run Windows disk checkpoint took about 25 seconds, beyond the old 20-second shutdown wait; PostgreSQL completed cleanly. The wrapper now allows up to 60 seconds without force-killing/deleting data. Check owned ports 55437/3333 are closed afterward.

## Browser gate

Use a newly created, migrated loopback DB ending in `_test` with uninitialized InstallationState. Set E2E_DATABASE_URL to it, distinct from DATABASE_URL; do not reuse an initialized DB for the first-run scenario. Generate an isolated random setup key into a private E2E_SETUP_SECRET_FILE, and set E2E_OWNER_PASSWORD to a random synthetic password with 12–128 characters. E2E_OWNER_LOGIN is optional (synthetic default identifier only). Never use actual owner credentials. No persisted browser storage state/trace includes auth bodies; trace is deliberately off.

Run `npm run test:e2e`. It builds production assets and starts/stops a fresh production server on `127.0.0.1:3333`, passing the isolated DB/key/origin explicitly. Stop any manual preview first. Do not enable E2E_REUSE_SERVER for the first-run gate; intentional reuse is only for reviewed manual diagnostics and cannot certify fresh setup.

Install Playwright Chromium if needed (`npx playwright install chromium`), or select installed Edge:

```powershell
$env:PLAYWRIGHT_EXECUTABLE_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run test:e2e
```

On this host the existing harness creates a fresh E2E DB, random secret file/password and passes them directly to the browser run without printing values:

```powershell
$env:RUN_POMMIER_E2E = '1'
& 'C:\Users\Ryzen\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' work/verify-postgres.mjs
```

Browser coverage retains seven foundation and ten identity checks. Registry adds empty state/optional fields/validation, safe date/text/CPF profile, duplicates, stale-edit review, status changes, preference/confirmed anonymization, restricted roles/costs, category/product forms/prices, search/filter/pagination, CSV template/mapping/review/retry/cancellation, export and layout/Axe. Expiry modifies only isolated session timestamps and uses normal focus revalidation, with no app bypass. Viewports: 1366×768 and 390×844; keyboard/dialog containment, Escape/focus, reduced motion, overflow/assets/recovery remain checked. Browser timezone is Asia/Tokyo to verify date-only behavior. `00-auth` intentionally runs first on a fresh DB; registry fixtures follow setup.

Passing Axe does not establish complete accessibility. Blocking external asset requests demonstrates local installed assets, not complete disconnected store operations. Full operational persistence, backup/restore and a human pilot remain Phases 8–9.

## Phase 4 evidence and safety

`packages/shared/src/inventory.test.ts` covers whole units, movement sign, exact BigInt availability, expiry/unknown-expiry, FEFO ties, canonical payloads, production transitions, shortfall and permission mapping. `apps/api/src/inventory/service.test.ts` tests recognized bounded retry classification, including wrapped and cyclic errors. Existing privacy/auth/CSV tests remain enabled.

`apps/api/test/inventory.integration.test.ts` runs 41 scenarios on real PostgreSQL: opening/completion/receipt retries, audit-failure rollback, origins, optional historical cost, ledger/projection equality, FEFO spanning batches/unknown expiry, Fortaleza midnight, final-unit and waste/adjustment races, release/consumption and their race, expired/future eligibility, role projections/scope, every new mutation's CSRF/Host/Origin, transactional revocation, changed-payload/actor lookup, multi-product rollback, SQL bounds/identity/history protection, test-only drift detection, product-status/origin versus completion, registry upgrade, numeric limits and production shortfall/cancellation. Positive PRODUCTION lifecycle and scoped waste are tested. No employee reservation/consume route is introduced for testing.

The drift scenario deliberately disables one projection trigger **only inside its isolated test database**, introduces a controlled inconsistency and re-enables the trigger. It proves diagnosis/write refusal without auto-repair. This is not an operator maintenance procedure. Another isolated test-only trigger forces the final audit write to fail, proving all prior inventory writes/result roll back. No store/manual database is altered by these scenarios.

`e2e/02-inventory.spec.ts` adds 13 production-asset browser scenarios after secure setup/registry tests: production lifecycle/details/cancellation, actual versus planned units, opening validation/expired labels, receipt cost, waste/adjustment/history/reconciliation, explicit unknown expiry, stale versions, real committed response-loss resolved by same-key retry and lookup, CASHIER/PRODUCTION projections, filters/pagination, keyboard/modal control, 1366×768 and 390×844 with Axe/overflow. The retained CSV cancellation test now waits for the review table and enabled cancel action rather than matching text also present in the earlier sample; no cancellation assertion is removed.

Migration preservation compares 001/002/003 to `af7a819` after CRLF/LF normalization; the harness runs deploy/status/diff, clean databases and foundation/identity/registry upgrades. Prisma diff does not model custom triggers; SQL integration assertions verify them. Run all source commands and the full harness above; actual totals/results/fixes are recorded in PROGRESS.md. No Docker claim or human pilot acceptance follows from these tests.

The persistent manual environment is separate from this harness: port 55438, database `le_pommier_manual`, ignored private `data/manual-testing/postgres` and `.env`. The automated harness owns/stops only port 55437 and its temporary production browser server. Stop only the manual app before browser tests; do not run the stopping test harness as a persistent manual environment. No new inventory/production fixture command is added and no operational record is seeded into the manual DB.

## Development fixtures and logs (continued)

Development fixtures are optional and separate from automated tests. Follow AUTH_SECURITY.md; the command refuses production, absent opt-in, remote/non-dev/operational targets and does not reset an initialized DB. The guards are unit tested, including connection query overrides and encoded same-target aliases. The actual production fixture CLI refusal was checked without connecting to a DB. Secret CLI generation, no-value output and no-overwrite behavior were also executed on a private scratch target. Test setup uses fresh DBs through normal setup APIs/services, not a hidden seed.

No request body, password, installation key, raw cookie or digest should appear in diagnostic logs, API projections or test output. Request/audit failures should report correlation IDs and safe codes. Keep private scratch DB/key files out of deliverables and Git. Review a failed browser artifact before sharing; do not enable credential-capturing traces.

Actual counts, failures fixed and remaining limitations are in PROGRESS.md, TEST_MATRIX.md and KNOWN_LIMITATIONS.md.

## Phase 5 verification

Use the same Node 24.19.0, explicit npm CLI, isolated PostgreSQL 17.10 harness and production Edge setup above. The workspace-local harness is C:/Users/Ryzen/Documents/Codex/2026-10-17/si/work/verify-postgres.mjs, run from the workspace parent of outputs, not from the repository. It owns port 55437 and fresh _test databases. Pause the manual app at 3333 before both integration and browser gates: local owner recovery deliberately refuses a live application port. Preserve its PostgreSQL at 55438. Restore the compatible frozen manual runtime afterwards; never migrate le_pommier_manual as part of this harness.

Shared sales unit tests cover whole units, bounded exact centavo/discount allocation, large aggregate formatting, Fortaleza pickup conversion/dates, strict request/state/payment validation and named permissions. sales.integration.test.ts adds 40 PostgreSQL scenarios (numbered 1–41 with combined migration cases 34–35). They cover all requested Phase 5 concurrency/integrity groups: final-unit/multi-product/forced-audit rollback, snapshots/discount approval, genuine ORDER ownership/legacy INTERNAL migration, suitable/expired pickup, full payment/tender, duplicate/concurrent checkout/payment/refund/handover/opening, cancellation races, original-method full refunds/current versus earlier sessions, unchanged fulfilled stock, zero-total rejection, stale versions, privacy/anonymization, authorization revocation, exact mutation Origin/Host/CSRF, payload mismatch/uncertain lookup, direct SQL constraints and final ledger reconciliation. Controlled service clocks avoid expiry sleeps. Trigger-forced failure and maintenance closing exist only inside isolated test fixtures, never as employee endpoints.

e2e/03-sales.spec.ts adds 18 production-browser scenarios: explicit limited cash opening, POS, manual-money confirmation, WhatsApp drafts/edit/confirmation, payment before/at pickup, unpaid/paid cancellation, fulfilled refund/history, price/stale review, genuinely committed lost-response lookup/same-key retry, role navigation/backend checks, search/filter/pagination, keyboard/native dialogs, desktop/narrow overflow and Axe. Fixtures are clearly synthetic and created through normal isolated APIs. Existing Phase 0–4 tests remain enabled; unavailable-module assertions target the still-unavailable complete Caixa module. Registry profile checks actual empty connected history.

Run generation/validation, npm run typecheck, lint, format check, unit tests, clean/upgrade/status/diff through the real harness, production build and all browser tests. Compare all four previous migration files against 0b6ce1f after CRLF/LF normalization. Prisma diff cannot prove custom constraints; direct SQL integration checks do. Actual results and failures fixed belong in PROGRESS.md. No Docker/TLS/LAN, human pilot, real-store import or full backup/restore claim follows from these commands.
