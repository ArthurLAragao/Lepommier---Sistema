# Progress and verification

Checkpoint: **17 October 2026**. Phases 0–1 remain implemented and covered by regression tests. Phase 2 is implemented and verified. **Phases 3–9 have not begun. This is not an operational store release.**

**Phase 2 acceptance gate: PASSED.** All required source, migration, real PostgreSQL, production build and browser checks passed. Phase 3 has not started.

## Inspection and reconciliation

Inspected all twelve requested product/technical/testing documents, the original PROJECT_BRIEF.txt, scripts/lockfile, Fastify app, shared schemas, UI primitives/navigation, Prisma schema/migration history, environment, CSP and existing PostgreSQL/browser tests. Started from clean foundation commit `ce9724c`; reused the strict TypeScript React/Vite/Fastify/Zod/PostgreSQL/Prisma 7 stack, native dialogs, production entrypoint, security headers and portable test harness. No application rebuild or working-feature replacement.

The previous checkpoint correctly identified the foundation and pending identity. One documentation discrepancy was corrected: a production DB container with no published port was a future design, while only development/test Compose exists. “Settings” permission is now precise: every role can change its own password/view non-sensitive diagnostics; only OWNER administers accounts/future store settings. Future operational entities remain a design, not empty implemented tables.

## Implemented in Phase 2

| Area                   | Concrete result                                                                                                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Core schema            | Additive identity migration, User/Role, Session, AuditEvent, InstallationState and bounded LoginThrottle; explicit FKs, uniqueness/checks/indexes, versions and UTC timestamps; original StoreSettings preserved                                       |
| First owner            | Private local random installation-key file, direct-peer loopback policy with no trusted forwarded headers, Origin/CSRF guard, database lock and atomic owner/closure/audit; permanent closure trigger; no defaults/public registration/reset           |
| Passwords              | Established native Argon2id, chosen 12–128 Unicode-character passwords preserved without truncation, current-password verification, own change, owner reauthenticated reset and confirmed offline local owner recovery                                 |
| Sessions               | Random opaque 256-bit tokens, only SHA-256 digests persisted; HttpOnly/Strict/Path=/ cookie, explicit HTTP/HTTPS policy, 12-hour absolute expiry, one current session/account, logout and sensitive-change revocation, bounded old-session cleanup     |
| Authorization/accounts | Reusable named permissions and transactional actor rechecks; owner list/create/edit/role/disable/reactivate/reset, stale-edit rejection, five-active-account limit, concurrent last-active-owner protection, no account deletion route                 |
| Request protection     | Exact local Origin/Host, required non-simple CSRF header/JSON for all identity mutations, absent/foreign Origin rejection, no CORS relaxation, persistent source/identifier attempts, bounded native hashing                                           |
| Audit/logging          | Safe security events, meaningful retained actor references, append-only audit trigger, filtered metadata, admitted failed-login events/coalesced denials, correlation IDs; no body/credential logging                                                  |
| Frontend               | pt-BR setup/login gates, current-user display, logout, expiry/retry handling, own-password form, employee list/pagination/dialogs/roles/confirmations/reset; delayed auth responses cannot restore a logged-out shell; cream/green design/CSP retained |
| Fixtures/maintenance   | Exclusive-create secret generator; explicit guarded development-only chosen-credential fixture, no operational seed; local owner recovery CLI with stopped-app/local-DB/confirmation checks                                                            |
| Documentation          | Updated architecture/permissions/assumptions/testing/matrix/limitations/README; AUTH_SECURITY.md, PHASE_2_DECISIONS.md and Portuguese access/operator guide                                                                                            |

Operational modules remain honestly unavailable. Only synthetic isolated test accounts were created. No real employee/customer/financial data, fake sales figures, cloud resources, external publication, remote push or system-wide service installation.

## Security decisions

- Argon2id v19: memory 19,456 KiB, two passes, one lane, 32-byte output with library-generated salts. At most two password jobs; excess work retries after two seconds. Native Windows x64/Node 24 was actually executed.
- Login names are immutable trimmed/lowercase ASCII (3–32 characters), checked/unique in PostgreSQL. Display names are separate. Passwords preserve Unicode and spaces.
- A singleton row lock serializes setup/security changes; checks and audit commit in the same transaction. Reauthorization under the lock prevents a concurrently revoked owner from completing a stale privileged write. Last-owner self/cross-account races and concurrent account-limit admission use real PostgreSQL tests.
- Exact Origin + application/json + `X-Pommier-CSRF: 1` + no CORS is the custom-header/preflight model. Missing/null Origin is refused, including CLI mutations without explicit headers. SameSite is additional protection. No secret CSRF token is claimed.
- Direct loopback means exactly 127.0.0.1, ::1 or ::ffff:127.0.0.1. Setup does not accept forwarded IP assertions. No network proxy/public setup is supported.
- Sessions have 12-hour absolute expiry, no inactivity/sliding extension. New login replaces prior access; password/role/disable/recovery changes revoke it. Secure follows HTTPS origin; local loopback HTTP explicitly omits Secure even in production-asset mode. Browser auth data stays out of Web Storage and URLs.
- Persistent budgets: eight attempts/identifier, sixty/direct source per fixed ten-minute window; no permanent account lockout, bounded 2,048-key store and safe audit rate. Seven-day session-history cleanup processes at most 1,000 records/startup/hour. Long-term security-audit archival is a later operator decision.

Details, rationale and primary references: [AUTH_SECURITY.md](AUTH_SECURITY.md), [PHASE_2_DECISIONS.md](PHASE_2_DECISIONS.md).

## Migrations

- Preserved `202610170001_foundation` unchanged; normalized-LF SHA-256 `6797c0bdfa2bed040bbc74c272c4db0c37b10edeec47d73a2841399ec436c0c4` matches the original commit.
- Added `202610170002_identity`; no destructive operational change, no reset/drop/seed. Account/audit FK updates explicitly use NoAction, matching SQL; deletes use Restrict.
- Clean isolated application and upgrade from the original foundation migration with a pre-existing StoreSettings marker are verified. Reapplying deploy reports no pending migrations; schema comparison reports no difference. SQL checks/triggers are additionally tested because Prisma introspection does not represent all of them.

## Commands actually executed

All application verification used **bundled Node 24.19.0**, not host Node 25.3.0. npm CLI was invoked through that executable because the Windows npm.cmd launcher selects the host runtime. Exact host paths and safe environment prerequisites are in TESTING.md.

| Command/check                                                                                      | Result                                                                                                                            |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| npm install with pinned cookie/Argon2 packages                                                     | Passed; lockfile updated, install audit reported zero known advisories                                                            |
| npm run db:generate                                                                                | Passed, Prisma 7.10.1                                                                                                             |
| npm run db:validate                                                                                | Passed                                                                                                                            |
| npm run db:migrate:test                                                                            | Passed on dedicated existing/fresh test DBs; no pending migrations on retry                                                       |
| prisma migrate status                                                                              | Database schema up to date; two migrations                                                                                        |
| prisma migrate diff --from-config-datasource --to-schema apps/api/prisma/schema.prisma --exit-code | Passed, no difference detected                                                                                                    |
| npm run typecheck                                                                                  | Passed across workspaces, tools and tests                                                                                         |
| npm run lint                                                                                       | Passed, zero warnings                                                                                                             |
| npm run format / npm run format:check                                                              | Passed, including final checkpoint documents                                                                                      |
| npm test                                                                                           | **65 passed**, six files; preserved foundation coverage                                                                           |
| npm run test:integration                                                                           | **32 passed**, two files, actual PostgreSQL 17.10                                                                                 |
| npm run build                                                                                      | Passed, shared/API/Vite production assets                                                                                         |
| npm run test:e2e using installed Edge and fresh production server                                  | **17 passed**, retaining all seven foundation browser scenarios                                                                   |
| Recovery CLI with explicit confirmation and private stdin                                          | Passed on isolated PostgreSQL; prior session revoked, old password fails, new complete password works, maintenance audit recorded |
| Foundation migration comparison / private scratch-secret source scan / git diff --check            | Passed; original migration unchanged, no private scratch secret in deliverable source, no whitespace errors                       |

The existing `work/verify-postgres.mjs` harness ran migrate/status/diff/integration and, with RUN_POMMIER_E2E=1, created a new isolated browser DB plus random private key/password and ran the production browser gate. It stops its owned PostgreSQL process in finally. No existing DB was reset or dropped. Temporary DBs/files are retained privately outside Git for investigation.

Additional actual CLI checks: `npm run setup:secret` created a random private scratch key without printing it, refused a second exclusive-create attempt and left the original bytes unchanged. `npm run dev:fixture -- --confirm-dev-fixture --json-stdin` under NODE_ENV=production explicitly refused before database access. Positive development seeding was not run against any real development/store database. Target guards now reject host/port query overrides and conservatively compare decoded DB names/default ports across credential/loopback aliases.

## Verification findings and corrections

The supplied Phase 0–1 record had 47 unit/API, two PostgreSQL and seven browser tests. All original suites remain. New tests cover normalization/passwords/permissions, API errors, setup races, loopback/forward spoofing, permanent closure, cookies/digests, session expiry/revocation, role restrictions, all mutation CSRF/origin guards, source/identifier throttle, owner/account-limit concurrency, audit and recovery.

Browser verification caught a current-user text-node accessibility/test ambiguity and module table selectors overlapping the new employee table. The name now has its own semantic element and module assertions are scoped correctly. A password maxlength could truncate Unicode input; it was removed and an explicit 129-emoji rejection test added. Native hashing now recovers after a saturated dummy-hash attempt. Initial-session network failure gets an actionable retry gate. A new error-state test incorrectly expected a heading where the shared component renders an alert; the assertion was corrected to the actual alert, without dropping the scenario. Delayed account-refresh results are invalidated after logout/expiry/password change and tested explicitly.

No failing test was disabled. Browser checks cover setup/login/account/password/expiry/logout workflows, 1366×768 and 390×844 layouts, keyboard/dialog behavior, reduced motion, Axe and local asset requests. Screenshots of setup, accounts and narrow login were visually inspected; they contain only synthetic test data and no visible secrets. Automated Axe is not a complete human accessibility audit.

## Environment and remaining limits

Real PostgreSQL 17.10 ran from the existing portable harness on 127.0.0.1:55437. Docker and psql remain unavailable on PATH; **Docker was not executed or verified**. Compiler/child-process checks needed permitted execution after sandbox spawn EPERM restrictions. No Node runtime was silently switched. The portable wrapper is testing infrastructure, not a production installation dependency.

Two existing non-fatal upstream Zod optimization-comment warnings remain. No full TLS/proxy/LAN deployment, different native-binary platform, human terminal/operator usability review, audit archival or operational backup/restore/pilot is claimed. Interactive recovery prompting and optional development-fixture execution are implemented; the recovery stdin path and fixture target guards have automated evidence. See KNOWN_LIMITATIONS.md.

## Precise continuation: Phase 3 (not started)

1. Reinspect this checkpoint/code and confirm the Phase 2 gate. Keep the foundation/identity migrations and authorization/security guards.
2. Implement customer/profile/marketing-preference and category/product schemas additively, using the existing requirements/business rules. No speculative inventory/payment/cash tables or fake operating records.
3. Implement validated CRUD, safe deactivation/history retention, role-specific privacy projections, stale-edit protection, search/filter/pagination and owner-only customer export/import/anonymization policy. Define/extend named backend permissions before enabling controls.
4. Implement CSV column mapping, preview, validation and duplicate review using an actual supplied file/schema when available. Do not invent customer attributes, consent, catalog or prices. Add meaningful real PostgreSQL authorization/privacy/integrity and browser tests.
5. Run the complete regression gate, update this checkpoint/matrix/limitations and only then proceed toward Phase 4.

This turn stops at Phase 2. Phases 3–9 are still required before an operational store release; no external publishing/push authorization is implied.
