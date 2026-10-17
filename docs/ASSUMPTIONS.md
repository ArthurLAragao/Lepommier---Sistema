# Assumptions and owner decisions

## Confirmed by the supplied brief

- One local host, browser frontend, local backend and PostgreSQL; no cloud core dependency.
- Counter and manually entered WhatsApp orders; pickup, including third-party collection; no store delivery.
- Whole individual units; in-house and ready-made products; finished batches and waste.
- Up to five staff, individual accounts and four roles.
- One full payment before handover; an order can be entered unpaid. No deposits, partial payments, split tender, installments or customer credit.
- No official logo/palette/typeface verified. The interface direction is provisional.

## Initial operational defaults to validate

| Decision                | Initial default                                          | Why / owner validation                                                     |
| ----------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------- |
| Business timezone       | America/Fortaleza                                        | Explicit brief requirement, independent of host/browser                    |
| Cash drawer             | One active store session                                 | Prevent ambiguous payment attribution                                      |
| Discounts               | OWNER/MANAGER with reason                                | Cashier cannot silently alter price                                        |
| Refund approvals        | OWNER only                                               | Explicit sensitive permission                                              |
| Expiry boundary         | Batch blocked after its entered expiry date in Fortaleza | Owner must approve day-end interpretation; no food-safety rule is inferred |
| Stock allocation        | Earliest expiry then oldest receipt/ID                   | Stable FEFO, only eligible unreserved units                                |
| Customer marketing      | UNKNOWN until explicitly recorded                        | Existing records imply no consent                                          |
| Staff access            | Five active accounts enforced initially                  | Owner included; review before pilot, never silently expand                 |
| Network                 | Loopback only                                            | LAN requires a separately reviewed configuration                           |
| Session duration        | Enforced 12 absolute hours, one current session/account  | No inactivity extension; owner to validate against shifts before pilot     |
| Backup retention        | Proposed 14 daily + 4 weekly copies                      | Capacity, privacy and separate-device process to validate                  |
| Personal-data retention | No invented legal duration                               | Owner must approve documented retention and request handling               |

## Unknown, not guessed

Foundation input guards accept business/report dates from 2000 through 2099, amounts from 0 through 99,999,999 centavos and positive quantities up to 100,000 whole units per input. These are not evidence of actual store activity. Phase 3 birthday validation is separate: complete date from 1900 through today's Fortaleza date; incomplete birthdays require an explicitly designed later representation.

Existing customer spreadsheet columns, product catalog, prices, categories, suppliers, shelf lives, official brand assets, recipes, store address/contact information, real employee details and production quantities. No operational data is fabricated or silently imported.

## Phase 3 decisions to validate before real use

No customer file/catalog/prices were supplied; all Phase 3 verification uses synthetic isolated records, not real imports. The empty CSV template and explicit column mapper are implemented; compatibility with an actual store spreadsheet remains a later reviewed migration task. Brazilian numbers only, no automatic digit insertion; full birthdays only; exact normalized-name advisory rather than fuzzy matching. Optional CPF is unique and owner-private. Manager has no CPF/private notes, bulk data or marketing administration; cashier corrects active name/phone only; production sees active catalog without customer information/cost.

Zero selling price is permitted only after explicit confirmation, maximum 99,999,999 centavos. Category deactivation does not cascade product status. No product photos, calculated expiry or stock configuration is added. All selling remains whole units. Estimated cost is not complete profitability.

CSV is UTF-8 only, comma/semicolon, 256 KiB/100 rows/20 columns; atomic create-or-skip without update/merge. Memory previews last 15 minutes with up to 60 seconds cleanup; five global/two per owner. Closed metadata-only jobs retain 30 days with bounded cleanup; long-term audit/backup/customer retention still needs owner decisions, not an invented legal duration. Export is deliberately minimal and not a roundtrip backup. See the Phase 3 decisions/privacy/CSV documents for consequences and operator procedures.

## Environment findings

Phase 4 re-inspection confirmed the verified `af7a819` baseline and preserved the foundation/identity/registry migrations and security/privacy model. Inventory decisions are explicit in PHASE_4_DECISIONS.md: server-recorded instants only, date-only expiry valid through Fortaleza day-end, unknown expiry allowed only with a coded acknowledgement and sorted last, immutable batch metadata, 1–100,000 units per command and 1 trillion per batch, decimal-string totals, lifetime idempotency records and read-only reconciliation. These defaults need owner validation before actual food handling. No real inventory/supplier/production input was supplied; tests are synthetic.

OWNER/MANAGER have opening/receipts/adjustments/reconciliation and explicit purchase-cost visibility. PRODUCTION can complete production and waste only production-source batches, without purchased receipt/opening/adjustments/customer data/cost. CASHIER reads active sellable availability only. This narrows the earlier vague production-receipt wording deliberately; no customer registry permission changes. Reservations are internal, no order FK yet; real source ownership is mandatory Phase 5 work. The security singleton serializes bounded local transactions; large-volume/multi-host throughput is not assumed. Pending UI keys do not survive browser reload.

Phase 2 inspection confirmed the existing strict monorepo, React/Vite, Fastify, shared Zod, Prisma 7 and preserved foundation migration. No stack change was made. The earlier architectural claim of a production DB container with no published port described a future plan; current Compose supplies development/test PostgreSQL only. Identity migration and real PostgreSQL security/browser tests now exist. No real employee/customer or operational records were supplied or invented. Synthetic accounts live only in isolated test databases.

Documented Phase 2 policies: immutable normalized login names, Argon2id 19 MiB/two passes/one lane, two password jobs at once, exact local Origin plus non-simple CSRF header, no missing-Origin mutation exception, permanent installation closure, one current session per account, role/password/disable revocation and seven-day/bounded session cleanup. See PHASE_2_DECISIONS.md for reasoning. TLS/proxy/LAN, audit archival, platform-native binary portability and interactive operator usability need separate verification; none is assumed from automated tests.

At initial foundation creation the provided workspace contained only empty `outputs/` and `work/` directories, with no Git repository, HTML/JavaScript registry or reusable brand asset. The later phase tasks extend the existing repository. Node 25.3.0 is on PATH; bundled Node 24.19.0 is explicitly selected for verification. Docker remains unverified; portable PostgreSQL 17.10 is reused without global installation. A separate persistent manual-testing cluster/database at loopback port 55438 remains distinct from the disposable test harness at 55437; private local configuration is excluded from Git.
