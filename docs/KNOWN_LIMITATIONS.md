# Known limitations

**This is the Phase 0–1 foundation, not the first operational store release.**

- Authentication, owner setup, sessions, users and role enforcement are not implemented. Only non-sensitive installation/health metadata is exposed. The role matrix is a specification, not a claim of enforced access to future modules.
- Customer/product CRUD, CSV import/review, production, batches, inventory ledger/reservations, sales, payments/refunds, cash closing, operational dashboard/report queries and exports are not implemented. Their navigation entries clearly say they are unavailable.
- No real store data or fake operational figures are displayed. Cards use unavailable markers, not invented zero balances.
- The only migrated table is foundation StoreSettings metadata. Core entities are designed but not yet finalized in schema. No development demo credentials or seed records exist.
- Local uploaded images, backup/retention tooling, visible last-backup status, clean restore, restart persistence of operational records, production application Compose/Docker image, update procedures, complete operator guide and the owner pilot are pending later phases.
- Development PostgreSQL Compose is provided but Docker was not installed on the verification path, so container execution is untested. A portable real PostgreSQL 17.10 process was used for foundation migration/integration evidence.
- Browser automation used installed Edge in an isolated headless profile. Automated accessibility checks, keyboard dialog behavior and overflow checks are covered; a human employee usability session and assistive-technology review have not occurred.
- Production build emits two upstream Zod comment-annotation warnings. They concern removed optimization comments; no type-check or build failure was suppressed.
- Dependency audit reports the registry's known advisories at the check time; it is not a security guarantee. No security review of an operational application is claimed.
- Proposed colors/typography and the wordmark are provisional. The leaf decoration is not represented as an official logo.
- Remote mobile, LAN deployment, cloud sync, fiscal integration, bank verification, delivery, ingredient costing, accounting/profit and messaging are outside the current implementation.

The next implementation phase is **Phase 2: secure owner setup, individual accounts, server-managed sessions, permissions, audit and the core schema**, with real PostgreSQL tests. Do not put the system into daily store use until operational integrity, recovery and pilot gates pass.
