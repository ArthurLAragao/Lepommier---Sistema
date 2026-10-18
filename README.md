> Current checkpoint: Phase 7 adds permission-controlled operational reports, the owner dashboard, bounded safe CSV exports and reconciled source drill-downs. See [PROGRESS](docs/PROGRESS.md) for actual verification and [reporting guide](docs/REPORTING_OPERATOR_GUIDE.pt-BR.md). Phases 8–9 remain pending; this is not an operational store release. Use the [Portuguese manual guide](docs/MANUAL_TESTING.pt-BR.md); never point a current build at an unmigrated preserved database.

# Le Pommier · local store management

An incremental, local-first implementation of the supplied Le Pommier brief. Interface: Brazilian Portuguese. Developer documentation: English. Business timezone: `America/Fortaleza`.

**Current implementation and evidence:** [docs/PROGRESS.md](docs/PROGRESS.md). This is an implementation in progress, not a production-ready release. Do not enter real customer or financial records until the pilot gates pass.

## Start here

1. Use Node.js 24 LTS and a local PostgreSQL instance. Development/test Compose is optional when Docker is already available; Docker has not been verified on this host. Initial dependency installation requires internet.
2. In this directory run `npm ci`.
3. Copy `.env.example` to `.env`, set a unique database password and update `DATABASE_URL` to match. Never commit `.env`.
4. Start the local database (or `docker compose up -d db` for the supplied development service).
5. On a fresh dedicated database, run `npm run db:generate`, `npm run db:validate`, then `npm run db:migrate`. All eight migrations are applied additively; do not reset databases or delete earlier migrations. Existing databases require a reviewed upgrade and verified backup/restore procedure first; this computer's preserved Phase 4 manual database is intentionally not upgraded.
6. Run `npm run setup:secret` once before starting the app. It exclusively creates a random key in the private gitignored `data/installation-secret` file without printing it. Restrict local filesystem access; Windows ACLs need operator configuration.
7. Run `npm run dev`. Open **http://127.0.0.1:5173**. The API listens on loopback port 3333; Vite proxies `/api`. The authorized installer reads the private key locally and enters it in the masked first-run form, choosing all owner credentials. Setup closes permanently; continue to login. No public registration/default credentials.

The interface gates access while checking installation/session state and shows an actionable error if PostgreSQL/migrations are unavailable. A frontend build alone does not verify persistence. See the [Portuguese access guide](docs/ACCESS_OPERATOR_GUIDE.pt-BR.md) for setup/accounts/recovery, [registry operator guide](docs/REGISTRY_OPERATOR_GUIDE.pt-BR.md) for customers/catalog, [inventory/production guide](docs/INVENTORY_OPERATOR_GUIDE.pt-BR.md), [CSV workflow](docs/CUSTOMER_CSV.md), [privacy policy](docs/CUSTOMER_PRIVACY.md) and [security policy](docs/AUTH_SECURITY.md). Customers, catalog, finished-unit inventory and production are implemented. Owned order reservations, sales, pickup orders, full manual payments/refunds and complete operational cash control are implemented. Operational reports/dashboard are implemented; verified backup/restore, installation hardening and human pilot remain pending. The current acceptance evidence is in PROGRESS.md.

For a local production-asset preview, run `npm run build` then `npm start` and open **http://127.0.0.1:3333**. The start command selects production asset serving even if the development `.env` is present. This previews the current foundation; it is not a completed production store release.

Leave PUBLIC_ORIGIN unset for these defaults, or set its exact local origin for the selected mode. Do not mix localhost/IP/IPv6 addresses. HTTP loopback uses HttpOnly/SameSite=Strict cookies without Secure; a reviewed HTTPS origin uses Secure. HTTPS/proxy/LAN deployment is not verified. One current session per account expires after 12 absolute hours; password/role/disabling changes revoke sessions. Sales/orders/manual full payments/refunds are implemented in Phase 5; cash movements, counted closing, review and read-only cash reconciliation extend that foundation in Phase 6. See the [cash operator guide](docs/CASH_OPERATOR_GUIDE.pt-BR.md).

## Commands

| Command                                                  | Purpose                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| `npm run dev`                                            | Start local frontend and backend                             |
| `npm run typecheck`                                      | Check all workspace TypeScript                               |
| `npm run lint`                                           | ESLint with zero warnings                                    |
| `npm run format:check`                                   | Check source/document formatting                             |
| `npm test`                                               | Unit and API contract tests; no real store data              |
| `npm run test:integration`                               | Dedicated PostgreSQL integration checks                      |
| `npm run test:e2e`                                       | Browser checks using Playwright                              |
| `npm run build`                                          | Build shared contracts, API and local frontend assets        |
| `npm start`                                              | Serve built app and API on the same local origin             |
| `npm run db:generate`                                    | Generate Prisma client                                       |
| `npm run db:validate`                                    | Validate Prisma configuration/schema                         |
| `npm run db:migrate`                                     | Apply migrations to the configured local database            |
| `npm run db:migrate:test`                                | Apply migrations only to a guarded dedicated test database   |
| `npm run setup:secret`                                   | Create the private initial installation key, never overwrite |
| `npm run auth:recover-owner -- --confirm-local-recovery` | Confirmed offline local owner recovery; see operator guide   |
| `npm run dev:fixture -- --confirm-dev-fixture`           | Explicit guarded disposable development account only         |

Stop development with Ctrl+C. Stop PostgreSQL with `docker compose stop db`; **do not run `down -v` on store data**. The computer must remain on and awake for the app to be available. Initial installation and updates may need internet; installed core operations must not.

No cloud publication, remote authentication, external fonts, CDN, payment-provider verification, fiscal integration, or remote mobile access is included. Proposed colors are provisional, and the text wordmark is not an official logo.

See [implementation plan](docs/IMPLEMENTATION_PLAN.md), [architecture](docs/ARCHITECTURE.md), [business rules](docs/BUSINESS_RULES.md), [permissions](docs/PERMISSIONS.md), [metric definitions](docs/METRIC_DEFINITIONS.md), and [assumptions](docs/ASSUMPTIONS.md).
