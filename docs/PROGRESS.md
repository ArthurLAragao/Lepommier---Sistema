# Progress and verification

Checkpoint date: **17 October 2026**. Phase 0 and Phase 1 implemented and verified. **Phases 2–9 are pending. This is not an operational store release.**

## Implemented

| Area                            | Files/modules                                                                                                                                   | Result                                                                                                                                                                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Product and technical decisions | docs/PRODUCT_REQUIREMENTS.md, ARCHITECTURE.md, BUSINESS_RULES.md, METRIC_DEFINITIONS.md, PERMISSIONS.md, IMPLEMENTATION_PLAN.md, ASSUMPTIONS.md | Scope, business defaults, schema/entity plan, transaction/concurrency strategy, role matrix and phase gates documented                                                                                                               |
| Workspace/tooling               | Root package/lock/config files, apps/web, apps/api, packages/shared, scripts                                                                    | Strict TypeScript monorepo, pinned compatible versions, lint/format/build/test commands, reproducible preparation hooks                                                                                                              |
| Local API                       | apps/api/src                                                                                                                                    | Fastify, Zod config/structured Portuguese errors, unique correlation IDs, safe logging, security headers, liveness versus PostgreSQL readiness, graceful resource cleanup, same-origin static serving                                |
| Database foundation             | apps/api/prisma, prisma.config.ts, compose.yaml                                                                                                 | PostgreSQL config, matching Prisma 7 client/adapter/CLI, one foundation metadata migration, isolated test service and guarded test-migration command                                                                                 |
| Shared contracts/helpers        | packages/shared/src                                                                                                                             | Integer centavos/whole-unit validation, strict Brazilian money input, IANA Fortaleza dates and day boundaries, safe CSV cell escaping, validated public installation status                                                          |
| Interface                       | apps/web/src                                                                                                                                    | Provisional cream/green design, text wordmark, 10-item navigation, honest unavailable states, real connection status/retry, searchable/filterable/paginated module availability, reusable UI primitives and native accessible dialog |
| QA and disclosure               | apps/api/src/app.test.ts, apps/api/test, packages/shared/src/format.test.ts, e2e, docs/TESTING.md, TEST_MATRIX.md, KNOWN_LIMITATIONS.md         | Source/API, real PostgreSQL, browser and accessibility evidence separated; unresolved operational scenarios disclosed                                                                                                                |

The original user brief is preserved as docs/PROJECT_BRIEF.txt. There was no existing registry/HTML/application/brand asset to overwrite. No real customers, staff, products, financial entries or demo operating figures were created. No external deployment or remote push was performed.

## Executed verification

Commands below ran with bundled **Node 24.19.0**. The npm CLI was invoked through that runtime because the host's npm.cmd selects host Node 25.3.0 even when PATH is adjusted.

| Command / check                                                              | Actual result                                                                                      |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Registry version/engine/peer metadata inspection                             | Completed before pinning; stable Prisma 7 selected over the available major prerelease             |
| npm install, final lockfile                                                  | Completed; final install audit reported 0 known vulnerabilities                                    |
| npm run db:generate                                                          | Passed, Prisma 7.10.1                                                                              |
| npm run db:validate                                                          | Passed                                                                                             |
| npm run typecheck                                                            | Passed across workspaces, test/tool configs and integration test sources                           |
| npm run lint / equivalent local ESLint entrypoint                            | Passed with zero warnings                                                                          |
| npm run format:check                                                         | Passed                                                                                             |
| npm test                                                                     | **47 passed**, 2 test files; includes production-entrypoint regression                             |
| Initial migration deploy on a clean dedicated real PostgreSQL 17.10 database | Passed; created the foundation table                                                               |
| npm run db:migrate:test on the same isolated database                        | Passed; no pending migrations on retry                                                             |
| npm run test:integration                                                     | **2 passed**, 1 file, actual PostgreSQL/Prisma and API readiness                                   |
| npm run build                                                                | Passed: shared contracts, API and Vite production frontend                                         |
| npm run test:e2e with installed Edge, fresh production server                | **7 passed**; six workflow/layout checks and an accessibility test across overview/settings/dialog |
| GET / on the local production server                                         | HTTP 200, text/html; `/api` routes remain JSON and unknown APIs return 404                         |
| Browser timezone                                                             | Asia/Tokyo deliberately; the interface still uses server-provided Fortaleza business dates         |

Browser coverage: 1366×768 desktop; 390×844 navigation/overflow; reduced motion; settings search/filter/pagination; unavailable-module disclosure; modal keyboard containment, Escape and focus restoration; status connection failure/retry; external browser requests blocked while installed foundation assets load. Axe checked WCAG 2 A/AA and WCAG 2.1 AA on three views; muted text was darkened to resolve contrast failures. This is not a complete human accessibility or operational usability assessment.

## Failures found and resolved

- Initial package fetching/compiler child processes were blocked by the sandbox (`ECONNREFUSED 127.0.0.1:9`, `spawn EPERM`). Permitted executions completed the checks; these were not reported as passing before execution.
- The first static-serving dependency had audit advisories. It was replaced with a reviewed patched Fastify-5-compatible version; no blind force-upgrade was used.
- A duplicate Vite major caused incompatible plugin types. A shared exact version/override resolved it.
- The first browser run caught a root-entrypoint routing failure. An explicit route and regression test fixed it.
- An injected dialog stylesheet conflicted with CSP. The browser-native dialog now works without relaxing the stylesheet policy.
- Initial helper text was too small/light. Font sizes and contrast were corrected and browser/accessibility checks rerun.
- The portable PostgreSQL harness needed Windows-safe process output handling and the existing pg driver because client CLI binaries were not included. The corrected harness ran the real migration/integration checks and stopped its database.

No test was disabled to produce these results. Two non-fatal upstream Zod optimization-comment warnings remain in the frontend build; they are documented in KNOWN_LIMITATIONS.md.

## Environment and limits

The workspace originally contained empty outputs/work directories and no Git repository. Docker/psql were absent from PATH and no matching Program Files installation was found. Docker execution is **not verified**. A portable PostgreSQL 17.10 process was used under the task's scratch directory on loopback port 55437, with random temporary credentials and a dedicated `le_pommier_test` database. It was stopped after checks. No global database service, browser profile, cloud resource or system-wide tool was installed.

The application currently exposes only non-sensitive health/installation metadata. It has no login or operational mutations yet. A “database connected” status does not mean the store application is ready for use. The full 30-scenario release matrix remains pending except for explicitly identified foundation helper coverage. Backup/restore, operational restart persistence, ordinary offline store operations and production container installation are unverified/unimplemented.

## Precise continuation: Phase 2

1. Extend the documented entity design into constrained core Prisma schema/migrations; preserve the foundation migration.
2. Implement a loopback-only, installation-secret-protected, transactionally guarded first owner setup. No default credentials; disable setup permanently after owner creation.
3. Add established password hashing, expiring opaque server sessions in HttpOnly cookies, logout invalidation, mutation Origin/CSRF checks and login throttling. Do not put tokens in browser storage.
4. Implement individual accounts, the backend permission matrix, last-owner protection, safe security audit events and development-only fixtures with explicit seed safety guards.
5. Add real PostgreSQL setup races, login/session/logout/expiry, role restriction, CSRF and setup-closure integration tests. Add browser setup/login flows. Keep unavailable modules honestly labelled.
6. Run type checks, lint, unit/integration/browser checks and production build; update this checkpoint before Phase 3 customer/catalog work.

The implementation must continue through Phases 3–9 before attempting the operational release. No approval to publish externally or push remotely is implied.
