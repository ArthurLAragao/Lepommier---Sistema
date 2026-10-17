# Dependency decisions

Intended runtime: Node.js 24 LTS. Direct dependencies use exact versions, with an npm lockfile. Dependency metadata and actual checks are recorded at the implementation checkpoint rather than assuming latest packages are compatible.

Primary compatibility references reviewed during setup:

- [Fastify v5 migration guide](https://fastify.dev/docs/v5.4.x/Guides/Migration-Guide-V5/) requires Node 20+.
- [Vite 7 migration guide](https://v7.vite.dev/guide/migration) requires Node 20.19+ or 22.12+.
- [Prisma system requirements](https://www.prisma.io/docs/orm/v6/reference/system-requirements) recommends supported LTS Node releases, including Node 24.

## Selected and verified

| Package group                            | Exact selection                 | Compatibility evidence                                                                               |
| ---------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Runtime / language                       | Node 24.19.0 / TypeScript 5.9.3 | Actual verification runtime; package engine metadata                                                 |
| React / React DOM                        | 19.3.1 / 19.3.1                 | Matching pair; successful production browser tests                                                   |
| Vite / React plugin / Tailwind           | 7.3.7 / 5.2.0 / 4.3.3           | Peer ranges checked; single Vite version enforced for plugins/Vitest                                 |
| Fastify / Helmet / Static                | 5.12.7 / 13.2.0 / 10.1.6        | Fastify 5 plugin compatibility; static entrypoint regression and production browser tests            |
| Fastify Cookie / native Argon2           | 11.1.3 / 2.2.2                  | Fastify 5 cookies and Argon2id executed on Windows x64 / Node 24.19.0                                |
| Prisma CLI / Client / PostgreSQL adapter | 7.10.1 / 7.10.1 / 7.10.1        | Matching generator and runtime, schema validation, real PostgreSQL 17.10 migration/integration tests |
| Zod                                      | 4.6.7                           | Shared contracts and safe request validation tests                                                   |
| csv-parse                                | 7.0.3                           | Strict bounded CSV parser; quoted delimiters, escaped quotes, BOM and multiline records tested       |
| Vitest / Playwright / Axe                | 4.1.12 / 1.64.1 / 4.14.0        | Executed source, database and browser/accessibility checks                                           |
| ESLint / TypeScript ESLint               | 10.13.0 / 8.71.2                | Compatible peer ranges and executed lint                                                             |

Registry engine/peer metadata was inspected before installation; the lockfile pins transitive dependencies. Prisma's available `latest` tag pointed to a major prerelease, so stable major 7 was selected and tested. The static-file plugin was upgraded to the patched Fastify-5-compatible 10.1.6 after the initial audit reported path traversal/route-guard advisories. No force-audit upgrade was applied blindly. The final install reported **0 known vulnerabilities**, which is not a security guarantee.

The browser-native modal dialog avoids inline-style injection under the restrictive Content Security Policy and retains keyboard focus/Escape behavior. No Radix dialog runtime dependency remains. Docker database/deployment validation is separate: Docker execution remains unverified on this host.

No external font, image CDN, runtime analytics or bank/WhatsApp service is required. The interface uses system fonts and bundled icon code. Third-party packages retain their own licenses.

Phase 2 adds only cookie handling and established Argon2 hashing; no external authentication/email service. Native platform packages are optional dependency artifacts required for password hashing, so do not install with optional dependencies omitted. Other platforms require their own install/runtime check. Password parameters and primary security references are in AUTH_SECURITY.md and PHASE_2_DECISIONS.md. The Phase 2 npm install also reported zero known advisories; this is not a security certification.
