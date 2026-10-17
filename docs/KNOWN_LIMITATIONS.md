# Known limitations

**Phases 0–2 implement the local foundation and identity. This is not an operational store release. Phases 3–9 remain pending.**

- Customer/product CRUD, CSV import/review, production, batches, inventory/reservations, sales, payments/refunds, cash, business dashboards/reports and exports are unavailable. No real or invented operating figures are displayed.
- Only foundation StoreSettings and the necessary identity/security tables are migrated. There is no speculative operational schema, public registration, cloud authentication, email delivery, WhatsApp integration or automatic/default administrator.
- Five active accounts (owners included), one current session per account and a 12-hour absolute lifetime are initial enforced policies to validate against a real shift. No separate inactivity timeout or forced first-login password change is implemented. Owners distribute chosen initial/reset passwords privately.
- Login budgets persist and limit audit/password work but cannot prevent a local malicious process from consuming available attempts. Source budgets reflect a loopback, five-user deployment; LAN/shared-proxy behavior has not been accepted.
- Audit has safe whitelisted metadata and append-only protection, with failed-login rate limits/coalesced denials. Long-term audit retention, archival and disk-capacity policy still need operator decisions. The API exposes the latest 50 events to owners; no browser audit-review page exists yet.
- Local owner recovery is tested through its explicit stdin automation interface on an isolated DB. Its normal interactive password prompt is implemented but has not been validated in a human operator terminal session. Recovery requires an existing active owner and privileged local maintenance; checking one configured port does not discover every possible application process. It does not repair arbitrary direct-SQL corruption or reopen setup.
- Windows filesystem mode flags do not establish an ACL policy. The operator must restrict private key, database, `.env` and backup access. A compromised OS/database administrator is outside the browser security boundary.
- The native Argon2 package was executed on Windows x64/Node 24.19.0 only. Other architectures/OS installations need native dependency verification.
- Local HTTPS cookie attributes were tested through the API; a complete TLS/proxy deployment was not executed. HTTP loopback has an explicit Secure-cookie exception. No public/LAN hosting is authorized. Do not forward setup through a proxy.
- Development PostgreSQL Compose exists, but Docker remains unavailable on this verification path. Docker execution is unverified. Real PostgreSQL 17.10 ran through the existing portable test harness; it is not a production service installation.
- Backup/retention tooling, clean restore, full operational restart/disconnected-operation checks, production Compose/image, update lifecycle and store pilot remain later gates. The current Portuguese guide covers identity/access maintenance only.
- Browser automation used installed Edge in an isolated headless profile at 1366×768 and 390×844, with keyboard, reduced-motion, overflow and automated accessibility checks. Human employee usability and assistive-technology review have not occurred.
- Two existing non-fatal upstream Zod optimization-comment warnings remain in the frontend build. Dependency audit covers known advisories at install time and is not a security guarantee or penetration test.
- Cream/green colors and the text wordmark are provisional. Remote mobile, cloud sync, fiscal/bank integration, store delivery, ingredient costing and messaging are not included.

See PROGRESS.md for executed evidence and TEST_MATRIX.md for remaining release scenarios. Proceed to Phase 3 only after the Phase 2 gate is recorded as passed; do not use this build for daily store operations.
