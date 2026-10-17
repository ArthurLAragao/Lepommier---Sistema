# Testing foundation, identity and registry

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

The tests create uniquely named `_test` databases and apply real migrations. The foundation upgrade starts with **only** the original foundation migration and a marker, then applies all remaining migrations. Phase 3 adds an **identity-baseline upgrade** with existing owner/hash/session/audit, foundation marker and closed installation; registry preserves them all. Other tests apply all three migrations cleanly. Identity tests retain setup races/closure, loopback/forward spoofing, login/digests/cookies, logout/replacement/expiry, revocation, roles, password/recovery, CSRF/Origin, last-owner/five-account concurrency, throttling and audit safeguards. Expiry uses an injected clock, not sleeps. Fixtures remain isolated from store/development data.

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

## Development fixtures and logs

Development fixtures are optional and separate from automated tests. Follow AUTH_SECURITY.md; the command refuses production, absent opt-in, remote/non-dev/operational targets and does not reset an initialized DB. The guards are unit tested, including connection query overrides and encoded same-target aliases. The actual production fixture CLI refusal was checked without connecting to a DB. Secret CLI generation, no-value output and no-overwrite behavior were also executed on a private scratch target. Test setup uses fresh DBs through normal setup APIs/services, not a hidden seed.

No request body, password, installation key, raw cookie or digest should appear in diagnostic logs, API projections or test output. Request/audit failures should report correlation IDs and safe codes. Keep private scratch DB/key files out of deliverables and Git. Review a failed browser artifact before sharing; do not enable credential-capturing traces.

Actual counts, failures fixed and remaining limitations are in PROGRESS.md, TEST_MATRIX.md and KNOWN_LIMITATIONS.md.
