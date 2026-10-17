# Phase 3 decisions

Scope: customer registry, marketing preference provenance, category/product catalog and deliberate customer CSV workflows. No stock, reservations, production, orders, sales, payments, cash, credit or promotional delivery is implemented. No real customer file was supplied or imported. The starting point was the inspected Phase 2 commit `721d303`, not a rebuilt application.

## Data and validation

- `202610170003_registry` is additive: Customer, MarketingPreferenceEvent, Category, Product and ImportJob plus enums, indexes, FKs and SQL safeguards. Foundation and identity migrations remain unchanged. There are no speculative financial/inventory tables.
- Customer registration is a PostgreSQL sequence-backed unique integer, rendered as `CLI-000001`. It is immutable, unrelated to CPF/phone and safe under concurrent creation. Rollbacks/skips can leave gaps; no gapless promise.
- Name is the only mandatory personal field. Trimmed names retain accents and punctuation, accept 2–120 UTF-16 units and at least two Unicode code points, and reject control characters. A separate accent-folded/lowercase/whitespace-collapsed key supports advisory exact-name matches and search. This is not fuzzy identity matching.
- Brazilian phones accept national 10/11 digits with a documented valid DDD set, or explicit country prefix 55 with 12/13 total digits. Fixed lines begin 2–5, mobiles 9. Formatting punctuation is removed, stored form is `+55...`. Missing DDD/ninth digit, unsupported country numbers and ambiguous carrier/trunk prefixes are rejected rather than guessed. Phone is optional and nonunique.
- Optional email is trimmed and lowercased in full, validated and capped at 254 characters. This pragmatic matching policy does not verify ownership. Email is nonunique. Optional CPF is stripped of formatting, validates both check digits and rejects repeated digits; it is nullable and unique even for inactive customers. Validation is not identity verification. A duplicate CPF must be reviewed/skipped, never overridden or merged.
- Birthday is a full date only, `YYYY-MM-DD` over the API/PostgreSQL DATE, from 1900 through today's Fortaleza date. CSV additionally accepts exact `DD/MM/YYYY`. Incomplete day/month is rejected; no birth year is fabricated. Date-only values never pass through the browser's local date conversion for display.
- Optional address/reference is 300 characters, operational notes 1,000, evidence reference 200. Plain text is safely rendered. Staff should avoid unnecessary sensitive information. Notes are not marketing permission.
- Duplicate phone/email or exact advisory name requires an explicit coded reason (`SHARED_CONTACT` or `CONFIRMED_DISTINCT`) when creating/editing separately. Shared contacts do not imply the same person. Review returns at most 20 matches per criterion. No destructive customer delete route exists.

## Authorization, projections and concurrency

Named permissions extend the existing shared map; see PERMISSIONS.md. OWNER controls bulk data, private fields, marketing changes and anonymization. MANAGER handles operational details and catalog but has no CPF/notes/bulk/anonymization. CASHIER handles active customers' name/phone only. PRODUCTION has no customer directory. Only OWNER/MANAGER see estimated product cost. Both list and detail queries select allowed fields in PostgreSQL; hidden fields do not become search/count criteria or duplicate-review criteria for restricted roles.

All registry services acquire the existing database security lock and recheck the actor's active account, session and named permission inside the same transaction. This deliberately serializes short registry work for the local five-account deployment. It also orders account revocation against sensitive operations: revocation committed first prevents completion; an already-authorized transaction holding the lock completes before the later revocation. No claim of cancelling an already committed operation is made. Bounded imports use a 20-second transaction timeout/10-second pool wait, all-or-nothing writes.

Customer, category and product edits require their last observed version. Every edit/status/preference change increments it. Concurrent stale edits return Portuguese `409 STALE_RECORD` with a reload/review path; no silent overwrite. PostgreSQL unique constraints protect CPF, SKU, category normalized name and registrations. No raw SQL sort/query fragments come from clients; whitelisted fields and Prisma parameters are used.

The exact Origin/Host, JSON/non-simple-header CSRF model, HttpOnly opaque session behavior, installation closure, last-owner protection, diagnostic redaction and append-only AuditEvent trigger are preserved. All new mutations are registered inside the existing protected scope. Reads also recheck authorization under the lock. There is no wildcard CORS, browser auth storage or public download route.

## Preferences and privacy

Current marketing state is on Customer, default UNKNOWN, with separate MarketingPreferenceEvent history of previous/new state, actor, time, source, reason and optional evidence reference. Only OWNER changes it. OPTED_IN cannot use NO_EVIDENCE; record-review opt-in requires a reference. No inference comes from imports, phone, birthday, notes or prior purchases. There is no messaging/channel automation or claim that recording preferences establishes legal compliance.

Deactivation is reversible and preserves the profile; anonymization is owner-only, reasoned and requires typing the registration. It replaces the name, clears phone/email/birthday/CPF/address/notes and historical evidence references, disables the record, sets marketing OPTED_OUT and preserves IDs/registration and non-identifying state history. The DB refuses destructive customer deletion, registration mutation and reversal of the anonymization time. SQL checks prevent adding PII back to an anonymized customer. All pending import jobs are cancelled and in-memory previews discarded to avoid retained review copies. See CUSTOMER_PRIVACY.md for retention paths and limits.

Audit events use field names and coded reasons for personal edits, never PII snapshots or CSV rows. Price/cost changes record integer amounts and responsible account/time, visible through OWNER's existing safe audit API. Operational audit is durable business accountability; diagnostic logs are limited technical failure codes/correlation IDs. Neither logs request bodies. Audit archival remains an operator decision.

## Catalog

Categories have a unique normalized name, active flag and version. Deactivation blocks new assignments, retains child product links and does not silently deactivate children. Existing products can retain an inactive category during edits. Read-only roles see active products, including an honest inactive-category label where relevant.

Products have unique uppercase 2–32-character SKU (`A–Z`, digits, dot, underscore, hyphen; first character alphanumeric), name, category, description, PRODUCED/PURCHASED/BOTH origin, integer centavo price/optional estimated cost, active flag, storage instructions, shelf-life reference text and version. Amounts are 0–99,999,999 centavos; zero selling price requires explicit UI/API confirmation. Whole-unit selling only. No photo upload: a neutral placeholder has no broken action. No stock quantity, availability, shelf-life computation or profitability claim. Future order items must snapshot prices; historical sales preservation cannot be end-to-end verified before sales exist.

## CSV design

Uses established `csv-parse` 7.0.3, pinned with its lockfile, for strict quoted CSV parsing. UTF-8 only, explicit comma/semicolon delimiter, no Excel workbook support or guessed encoding. Limits, mapping, transactions, idempotency, cleanup and export columns are in CUSTOMER_CSV.md. Confirmation binds to an opaque server-held review, not client-submitted validated rows. Completed retries with the same choices return the same result; a new file/review is a separate operation.

Only parsed mapped originals/normalized values are held in bounded process memory for review. Raw CSV/filename are never stored in a DB/file or logged. Preview expiry is 15 minutes with memory pruning every 60 seconds (physical removal by approximately 16 minutes plus normal garbage collection). Restart invalidates pending reviews. Completed result metadata contains only row numbers, statuses and internal references; closed jobs are removed after 30 days, at most 100 per minute. Audit counts/references remain. Local user devices/backups remain separate retention responsibilities.

## SQL safeguards beyond Prisma

The migration explicitly defines checks for normalized phone/email, valid CPF function/check, birthday bounds, positive versions/registrations, anonymized PII invariants, SKU/money bounds, preference codes and import bounds; it adds a customer identity/delete trigger. Prisma models represent enums, column types, uniques, indexes and Restrict/NoAction FKs but cannot express these checks/triggers. Migration diff alone is insufficient; direct invalid-write integration tests cover them. Server validation is intentionally stricter than the SQL phone-shape check (DDD set) and zero-price confirmation is an application decision.

## Primary references and verification boundary

CSV parser options/API: [official csv-parse options](https://csv.js.org/parse/options/), [synchronous API](https://csv.js.org/parse/api/sync/). Existing security rationale remains in AUTH_SECURITY.md and PHASE_2_DECISIONS.md. Actual runtime, commands, results and unresolved limitations belong in PROGRESS.md/TESTING.md. Node 24.19.0 and portable real PostgreSQL 17.10 are reused. Docker is unverified; no global services or external publication are authorized.
