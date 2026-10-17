# Phase 2 security implementation

Scope is local identity/account administration. Operational authorization must be added as each later module is implemented; the future permission matrix does not imply implemented sales/customer endpoints. See [operator instructions](ACCESS_OPERATOR_GUIDE.pt-BR.md) and [decision reconciliation](PHASE_2_DECISIONS.md).

## Storage and concurrency

`202610170002_identity` adds only User, Session, AuditEvent, InstallationState, LoginThrottle and Role. The original StoreSettings migration remains unchanged. UUIDs identify accounts/sessions/events. Login identifiers are immutable, trimmed/lowercase ASCII, 3–32 characters matching `[a-z0-9][a-z0-9._-]{2,31}`. PostgreSQL checks normalization and uniqueness. User active state, role, timestamps and optimistic version are persisted. Accounts are disabled instead of deleted; restrictive session/audit actor FKs retain meaningful references. Audit targets are UUID references, currently account IDs, without a speculative polymorphic operational FK.

The migration seeds one installation row, never a user/password. Setup, login issuance, authorization-sensitive writes and account changes lock this row with `SELECT ... FOR UPDATE` inside a PostgreSQL transaction. Setup rechecks closure under the lock, creates the owner and closes setup atomically. The closure trigger rejects reversal/deletion. Account mutations recheck the actor's session and permission after obtaining the same lock. Last-owner counts and the five-active-account limit are checked under this lock, preventing concurrent demotion/disable/create races. The invariant applies to application/maintenance code, not arbitrary SQL by a database superuser. Row lock serialization is appropriate to the initial five-account local deployment; review it before scaling.

Audit UPDATE/DELETE is rejected by a trigger. Ordinary account actions never cascade deletion. Expiry, user-session lookup, audit time/actor/type and throttle-window indexes are explicit. Future migrations must retain these custom SQL constraints/triggers; Prisma schema validation alone does not validate their behavior.

## Passwords and work limits

`@node-rs/argon2` 2.2.2 uses Argon2id v19, memory 19,456 KiB, time cost 2, parallelism 1, output 32 bytes and library-generated random salts. This follows OWASP's minimum Argon2id profile while bounding load on a local workstation. At most two native hash/verify jobs are admitted per API service; excess work returns 429 with Retry-After 2. There is no unbounded password-job queue. Missing/disabled accounts use a dummy hash; their errors match wrong-password errors. Dummy creation is also budgeted and can recover after a busy result.

Creation/replacement accepts 12–128 Unicode code points; surrounding spaces and Unicode bytes are preserved. There is no Unicode normalization or silent truncation. Frontend fields do not impose a truncating UTF-16 maxlength on passwords. Login/current-password inputs have a 256 UTF-16-unit validation ceiling, sufficient for every valid 128-code-point password. JSON bodies on credential/account mutations are bounded to 16 KiB. Long inputs fail validation, never hash a shortened value.

The library ships platform-specific native Node-API binaries through optional dependencies. Windows x64 with bundled Node 24.19.0 was executed. Keep optional dependencies during installation; another OS/architecture needs its own install/runtime verification. No global compiler/service or custom password cryptography is introduced.

## Sessions

Login generates a cryptographically random 32-byte base64url token. Only its SHA-256 digest is persisted. Responses contain the raw token only in the Set-Cookie header. `pommier_session` is HttpOnly, SameSite=Strict, Path=/, has explicit absolute Expires and no Domain. Secure is set for a configured HTTPS PUBLIC_ORIGIN. Local HTTP on loopback needs Secure=false even with NODE_ENV=production; this is an explicit deployment exception. HTTPS cookies were integration-tested; a complete TLS/proxy deployment was not executed.

Sessions expire absolutely after 12 hours; no sliding extension or separate inactivity policy. Every authenticated request checks expiry, revocation and active account against PostgreSQL. Sensitive transactional operations recheck them under the security lock. Login revokes prior sessions for that account and any valid session cookie it replaces. Logout, password change/reset/recovery, disabling and role changes revoke access. Password changes end the current session too. Frontend checks on focus/every minute improve UX; server enforcement is authoritative. No credentials/tokens in localStorage, sessionStorage, URLs, persisted browser state or diagnostic logs.

Startup/hourly cleanup deletes at most 1,000 sessions expired or revoked more than seven days ago. Backlog is removed in subsequent batches. Security audit records are separate and not deleted by this job; retention/export/archival needs an owner-approved later maintenance policy. Active session count is bounded by one per account through serialized login writes; old session history is periodically cleaned.

## Origin/CSRF and setup

All identity/account mutations, including unauthenticated login/setup, pass the same scoped `onRequest` protection before validation/authorization:

1. Host must match the configured public origin host or actual configured API host.
2. Origin must exactly equal PUBLIC_ORIGIN (scheme, hostname, port). Missing, `null`, wildcard, sibling loopback hostname and foreign origins are rejected. Cross-site Sec-Fetch-Site is rejected when present; missing Fetch Metadata is not treated as authorization.
3. Content-Type must be application/json and `X-Pommier-CSRF: 1` must be present.

The header is a required non-simple request header, not a secret synchronizer token. Browser preflight, strict Origin validation and no CORS allowance form the CSRF model; JSON alone or hidden controls do not. SameSite=Strict is defense in depth. No wildcard or credentialed cross-origin CORS is enabled. Read-only requests do not require Origin and disclose protected account data only after authentication. CLI integrations must explicitly supply the configured Origin/header, not disable the protection.

Setup additionally checks the direct TCP peer with trustProxy=false. Only exact 127.0.0.1, ::1 and ::ffff:127.0.0.1 are accepted; other 127/8 aliases are intentionally not accepted. Forwarded/X-Forwarded-For never authorize setup. The key is read once at server startup from a private local file, generated exclusively without overwriting or printing. It is never in metadata. Setup does not automatically authenticate; the installer proceeds to login. The closed installation cannot be publicly reset. Anyone holding privileged OS/database access remains outside the web threat boundary.

PUBLIC_ORIGIN defaults to http://127.0.0.1:5173 in development and the API's local production origin otherwise; HOST=::1 uses brackets. Localhost/IP/IPv6 are distinct origins and must not be mixed. HTTPS/forward proxies must undergo separate review; a proxy that connects locally is a local peer, so do not expose or forward setup to a network. HSTS remains off for loopback HTTP; the existing restrictive CSP is retained without inline-script/style exceptions.

## Authorization and endpoints

Shared `hasPermission` maps roles to `profile.self`, `accounts.manage`, `security.review`. Only OWNER has the last two. The route authorization helper checks the current session; services recheck it in transactions. Future endpoints must reuse/refactor this layer rather than introducing UI-only authorization or unrelated string checks.

| Endpoint                     | Access/purpose                                                      |
| ---------------------------- | ------------------------------------------------------------------- |
| GET /api/auth/state          | Public non-sensitive initialized/setupAvailable booleans            |
| POST /api/auth/setup         | Uninitialized, correct private key, direct loopback and CSRF/origin |
| POST /api/auth/login         | Throttled credentials and CSRF/origin                               |
| GET /api/auth/me             | Authenticated safe account projection and expiry                    |
| POST /api/auth/logout        | Authenticated, revoke current session                               |
| POST /api/auth/password      | Authenticated, verify current password, revoke all own sessions     |
| GET /api/users?page=1        | OWNER, 20 per page, no hashes/digests                               |
| POST /api/users              | OWNER, chosen credentials, maximum five active                      |
| PATCH /api/users/:id         | OWNER, version and reason, last-owner rule                          |
| POST /api/users/:id/password | OWNER reauthentication, target reason, session revocation           |
| GET /api/security/events     | OWNER, latest 50 safe events; no browser audit-review page yet      |

Owner reset of self is rejected in favor of authenticated password change. Local CLI recovery requires explicit confirmation, local DB, stopped app and an existing active OWNER; it neither creates/reactivates accounts nor reopens setup. It checks the configured port, so maintenance isolation of every process is an operator responsibility. `--json-stdin` is an explicit bounded automation interface; normal operator use prompts privately. Do not pass credentials on command lines or enable input capture.

## Throttling and audit

PostgreSQL counters persist across API restarts: fixed 10-minute windows, 60 attempts per direct source, 8 per normalized login identifier (setup has its own shared identifier). Admitted attempts, including successful attempts, consume budget. Rejected identifier attempts still consume the source budget, preventing one source from hammering a blocked identifier without limit. Rejections return 429/Retry-After 600, do not extend the identifier window, and do not permanently disable accounts. The loopback deployment deliberately has a generous source budget for five users sharing one computer. Bound counters to 2,048 keys, prune at most 128 entries older than 20 minutes per admission; capacity exhaustion rejects temporarily. This is single-host protection, not DDoS protection; real-shift tuning may be needed.

LOGIN_SUCCEEDED, admitted LOGIN_FAILED, LOGOUT, SETUP_COMPLETED, account create/update/activation/deactivation, role changes, password changes/resets/recovery and useful authorization denials are audit events. Failures have generic reasons and optional target reference, never submitted login/password bodies. Denials are coalesced once per actor per ten minutes. Audit has type, actor where known, UUID target, timestamp, correlation ID and whitelisted metadata. Do not enter secrets in free-text reasons. Failed-login event growth is rate-limited, not infinitely retained without storage planning. Actor null distinguishes unauthenticated failures/offline maintenance from an authenticated owner action.

Diagnostic logs contain request method, generated correlation ID and safe error/event type. They omit URL/body/cookie/authorization/Set-Cookie values. Audit is an append-only security history in the DB; diagnostic logs are troubleshooting output. Neither is an operational inventory/payment/cash ledger. Business audit entries arrive with later transaction modules.

## Development fixtures

No automatic seed, default administrator or operational demo records. `npm run dev:fixture -- --confirm-dev-fixture` is explicit and requires NODE_ENV=development, ALLOW_DEV_FIXTURES=I_UNDERSTAND_THIS_IS_DISPOSABLE and DEV_FIXTURE_DATABASE_URL pointing to a distinct loopback PostgreSQL database ending in `_dev`. The operational DATABASE_URL is never reused by this command. Create the disposable DB beforehand. Enter chosen credentials at masked prompts; the account is visibly named “Conta de desenvolvimento”. Setup still closes once and existing installations are not reset. Production/missing opt-in/remote/non-dev/same-target checks refuse execution. Database name comparisons decode escaped names and normalize default ports, ignoring credentials/loopback aliases for conservative same-target rejection. Development/test/recovery connections allow only optional schema=public query parameters; host/port or other query overrides are refused. Test fixtures are separate fresh `_test` databases, never this development fixture or store data. Maintenance commands automatically prepare generated Prisma/shared outputs before use.

Native dependency portability, full TLS installation, human usability, audit archival, OS hardening and later operational integrity remain distinct release gates. This document records implemented protections, not an independent penetration-test certification.
