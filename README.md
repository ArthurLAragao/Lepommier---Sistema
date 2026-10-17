# Le Pommier · local store management

An incremental, local-first implementation of the supplied Le Pommier brief. Interface: Brazilian Portuguese. Developer documentation: English. Business timezone: `America/Fortaleza`.

**Current implementation and evidence:** [docs/PROGRESS.md](docs/PROGRESS.md). This is an implementation in progress, not a production-ready release. Do not enter real customer or financial records until the pilot gates pass.

## Start here

1. Install Node.js 24 LTS and Docker Desktop with Compose (initial internet access required).
2. In this directory run `npm ci`.
3. Copy `.env.example` to `.env`, set a unique database password and update `DATABASE_URL` to match. Never commit `.env`.
4. Start the development database with `docker compose up -d db`.
5. Generate the client and apply the foundation migration: `npm run db:generate` then `npm run db:migrate`.
6. Run `npm run dev`. Open **http://127.0.0.1:5173**. The API listens on loopback port 3333; Vite proxies `/api`.

The interface must show a database warning if PostgreSQL is unavailable. A successful frontend build alone does not verify persistence or database behavior.

For a local production-asset preview, run `npm run build` then `npm start` and open **http://127.0.0.1:3333**. The start command selects production asset serving even if the development `.env` is present. This previews the current foundation; it is not a completed production store release.

## Commands

| Command                    | Purpose                                                    |
| -------------------------- | ---------------------------------------------------------- |
| `npm run dev`              | Start local frontend and backend                           |
| `npm run typecheck`        | Check all workspace TypeScript                             |
| `npm run lint`             | ESLint with zero warnings                                  |
| `npm run format:check`     | Check source/document formatting                           |
| `npm test`                 | Unit and API contract tests; no real store data            |
| `npm run test:integration` | Dedicated PostgreSQL integration checks                    |
| `npm run test:e2e`         | Browser checks using Playwright                            |
| `npm run build`            | Build shared contracts, API and local frontend assets      |
| `npm start`                | Serve built app and API on the same local origin           |
| `npm run db:generate`      | Generate Prisma client                                     |
| `npm run db:validate`      | Validate Prisma configuration/schema                       |
| `npm run db:migrate`       | Apply migrations to the configured local database          |
| `npm run db:migrate:test`  | Apply migrations only to a guarded dedicated test database |

Stop development with Ctrl+C. Stop PostgreSQL with `docker compose stop db`; **do not run `down -v` on store data**. The computer must remain on and awake for the app to be available. Initial installation and updates may need internet; installed core operations must not.

No cloud publication, remote authentication, external fonts, CDN, payment-provider verification, fiscal integration, or remote mobile access is included. Proposed colors are provisional, and the text wordmark is not an official logo.

See [implementation plan](docs/IMPLEMENTATION_PLAN.md), [architecture](docs/ARCHITECTURE.md), [business rules](docs/BUSINESS_RULES.md), [permissions](docs/PERMISSIONS.md), [metric definitions](docs/METRIC_DEFINITIONS.md), and [assumptions](docs/ASSUMPTIONS.md).
