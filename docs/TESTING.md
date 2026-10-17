# Testing the foundation

Use Node 24 LTS. `npm ci` installs exact locked dependencies. Generated Prisma and shared outputs are prepared automatically by the test/type-check/build scripts; generated files are not committed.

## Source and API checks

```powershell
npm run typecheck
npm run lint
npm run format:check
npm test
npm run db:validate
npm run build
```

The foundation unit/API suite covers strict integer money/units, CSV formula escaping, Fortaleza date boundaries, safe API errors, correlation IDs, readiness versus liveness, local-only binding, graceful resource cleanup and serving the actual production entrypoint. API contract tests inject a probe and do not prove PostgreSQL behavior.

## Dedicated PostgreSQL tests

1. Configure `.env` from `.env.example` with unique credentials.
2. Set `TEST_DATABASE_URL` to a separate local database ending in `_test`. It must differ from `DATABASE_URL`.
3. Start `docker compose --profile test up -d db-test`.
4. Run `npm run db:migrate:test`.
5. Run `npm run test:integration`.
6. Stop the test service with `docker compose --profile test stop db-test`.

The test migration wrapper and integration suite reject an absent test URL, non-loopback host, a name without `_test`, or the exact operational URL. The current tests verify the real PostgreSQL server, Prisma access to the migrated foundation table and actual readiness through the API. They do not validate future stock, payment, cash, auth or backup behavior.

On this implementation host Docker was unavailable, so PostgreSQL 17.10 was run as a portable **real database process** inside the task's scratch directory, bound to `127.0.0.1:55437`, with random temporary credentials and a separate `le_pommier_test` database. It was stopped after verification. The portable package wrapper is a prerelease testing utility; it is not an application runtime dependency or a production database installation.

## Browser acceptance

Install the matching browser once with `npx playwright install chromium`, then run `npm run test:e2e`. The command builds production assets and starts/stops a fresh production server on loopback port 3333. Stop a manual preview first. The tests do not seed operational data.

To use installed Edge instead of downloading Chromium on Windows:

```powershell
$env:PLAYWRIGHT_EXECUTABLE_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run test:e2e
```

For an intentional retained preview only, set `E2E_REUSE_SERVER=1`; otherwise the runner refuses to silently reuse a possibly stale server. CI never reuses an existing server.

Browser checks cover 1366×768 desktop layout, 390×844 navigation/overflow, reduced motion, unavailable-module disclosure, settings search/filter/pagination, dialog focus/Escape/focus restoration, connection failure/retry and no external asset requests. The browser timezone is deliberately Asia/Tokyo; the interface receives the business date from the API. Axe runs WCAG 2 A/AA and WCAG 2.1 AA checks on overview, settings and the dialog. Passing automation does not establish complete accessibility or operator usability.

Blocking external browser requests verifies the **foundation's local assets**. It does not prove full store operations work offline, because those modules are not yet implemented. Do not describe it as the final offline-operation acceptance test.

## Environmental restrictions

The initial sandbox denied npm network access and compiler child processes (`ECONNREFUSED 127.0.0.1:9` / `spawn EPERM`). The permitted executions ran with the bundled Node 24.19.0 runtime and access needed for local child processes/package download. No system-wide tools, Windows services, browser profiles or store records were changed.

The exact execution record and unresolved release gates are in PROGRESS.md and TEST_MATRIX.md.
