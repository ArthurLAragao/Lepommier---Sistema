# Required scenario matrix

Status describes implemented evidence, not intentions. Most scenarios depend on modules intentionally unavailable in the current foundation.

## Phase 2 acceptance evidence

All tests below execute against real isolated PostgreSQL unless marked unit/browser. See TESTING.md for safe commands and PROGRESS.md for counts/runtime.

| Requirement                                                                              | Evidence                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1–6: setup once, wrong secret, direct loopback, forwarded spoof, race, permanent closure | Auth integration: exactly one concurrent success, IPv6 acceptance, non-loopback/forwarded rejection, trigger reversal rejection, closure even after out-of-app disable                                                               |
| 7–9: valid/invalid/disabled login                                                        | Auth integration: normalized login, matching generic unknown/wrong/disabled error, no default account                                                                                                                                |
| 10: digests only                                                                         | Stored SHA-256 token digest differs from cookie; raw token absent from JSON                                                                                                                                                          |
| 11–14: authentication/logout/expiry/disable                                              | Real session lookup, logout invalidation, controlled-clock absolute expiry and disabled-account revocation                                                                                                                           |
| 15–16: passwords/roles                                                                   | Complete password preserved, all prior sessions revoked; role changes revoke access; owner reset reauth and offline confirmed recovery CLI                                                                                           |
| 17–18: restricted roles                                                                  | MANAGER, CASHIER and PRODUCTION cannot list/create/edit accounts or read audit; denial coalescing verified                                                                                                                           |
| 19–20: owner invariant                                                                   | Last owner's self-disable/demotion refused; concurrent cross-account changes and simultaneous self-disable/self-demotion retain one owner                                                                                            |
| 21–22: CSRF/origin                                                                       | Every setup/login/logout/password/create/edit/reset mutation rejects missing/invalid header, absent/foreign Origin and cross-site metadata                                                                                           |
| 23: throttle                                                                             | Fixed identifier window, Retry-After, source persistence across service instances and bounded stored keys; unit test native job budget and recovery                                                                                  |
| 24: safe data                                                                            | Me/list/state/audit omit password hashes, session digests, submitted passwords and key; unit allowlist/error serialization; append-only audit trigger                                                                                |
| 25: cookies                                                                              | HttpOnly/SameSite=Strict/Path=/, no Domain, local HTTP exception and configured HTTPS Secure attribute                                                                                                                               |
| 26: migrations                                                                           | Clean apply plus original-foundation-only upgrade preserving a pre-existing StoreSettings marker; unchanged foundation migration                                                                                                     |
| Account consistency                                                                      | Stale edits rejected, five-active-account concurrent creation limit enforced, no destructive user API                                                                                                                                |
| Development safeguards                                                                   | Unit guards refuse production, absent opt-in, remote/non-PostgreSQL/non-dev/operational targets, encoded aliases and query overrides; actual fixture CLI production refusal and secret CLI no-overwrite checked                      |
| Browser identity                                                                         | Setup/double-submit, login/invalid feedback/correlation ID, logout, actual expiry, owner account/reset workflows, own password change, restricted navigation/API, initial verification failure/retry and delayed-refresh logout race |
| Browser input/accessibility/layout                                                       | 129-emoji password rejected without truncation; keyboard forms/dialogs, desktop 1366×768, narrow 390×844, Axe, no protected-content flash before resolution                                                                          |
| Foundation regressions                                                                   | Original unit/API/PostgreSQL and all seven browser scenarios retained, including strict CSP, local assets, connection failure/retry and unavailable modules                                                                          |

## Phase 3 acceptance evidence

The registry tests run on real isolated PostgreSQL; helper/browser evidence is identified separately. No actual customer spreadsheet or store records are used. Counts and gate result are in PROGRESS.md.

| Requested coverage                                     | Evidence                                                                                                                                                                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–4 customer creation/optional fields/phone/CPF review | Name-only success, default UNKNOWN, shared phone review without uniqueness, valid CPF conflict without override/merge; unit phone/email/CPF normalization and repeated-digit rejection                      |
| 5 search/filter/pagination                             | Stable whitelisted sorting, name/phone/registration scope, active/inactive filters and page boundaries; browser customer and catalog pagination                                                             |
| 6–8 privacy and denied customer/bulk access            | Owner/manager/cashier database projections on lists/details; manipulated private fields denied; production directory denied; owner-only import/export/anonymize/marketing                                   |
| 9–10 concurrent edits/status                           | Simultaneous updates and deactivation/edit preserve one new version; stale 409; reversible deactivation retains references/preference; browser reload/review workflow                                       |
| 11–14 anonymization/marketing                          | Intended PII/evidence cleared, anonymous terminal DB invariant, pending preview invalidated, safe audits exclude old/new PII; explicit source/actor/time/history; no inferred opt-in                        |
| 15–17 categories/products/code race                    | CRUD/status/version checks, category normalized uniqueness and simultaneous SKU creation; price/cost events, nonnegative integer money, explicit zero confirmation                                          |
| 18–20 money/cost/privacy/references                    | Invalid direct/API money/SKU rejected; no cost on cashier/production list/detail; category deactivation does not cascade products; FK retention/no delete APIs                                              |
| 21–23 CSV validity and duplicates                      | Strict malformed quotes/columns/header/limits/UTF-8 tests; explicit mapping and normalized originals; file and DB contact/CPF review; invalid lines selected for skip                                       |
| 24–25 import retry and drift                           | Atomic rollback, simultaneous same-confirmation retries create once, different choices rejected, DB change since preview cancels, forged client validated rows rejected                                     |
| 26 safe import/export audit                            | Counts/IDs/scope only, no rows/PII; minimal owner export excludes private fields/anonymized records; formula/delimiter/quote/newline escaping tests                                                         |
| 27 authorization revocation                            | Held DB lock orders revocation before customer write/import completion, actor/session rechecked; no stale principal privilege retained                                                                      |
| 28 migration preservation                              | All three clean migrations plus identity-baseline upgrade retaining foundation marker, existing hash/session/audit and permanent closure                                                                    |
| 29 direct SQL constraints                              | CPF/date/registration/anonymized fields, positive versions, SKU and money safeguards; SQL checks/triggers remain alongside Prisma schema                                                                    |
| 30 injection boundaries                                | Search strings remain Prisma parameters; unrecognized sort/fields fail shared strict validation; no client SQL fragments                                                                                    |
| Existing protection on new routes                      | Every registry mutation rejects absent/foreign Origin and missing/invalid CSRF header; Phase 2 Host/session/last-owner/audit regressions retained                                                           |
| Preview retention                                      | Controlled-clock expiry and new-service-instance restart discard review without creating customers; cleanup safe; no raw CSV in job/audit                                                                   |
| Browser customer workflows                             | Empty state, optional-details validation, date-only/safe text/CPF masking, duplicate review, profile, edits/stale review, deactivate/reactivate, marketing and registration-confirmed anonymization         |
| Browser roles/catalog/CSV                              | Restricted customer fields/actions and cost; category/product form/edit/status/price, search/filter/page; template/map/row choices/import result, lost response retry, Escape cancellation, explicit export |
| Browser usability/regressions                          | 1366×768 and 390×844, contained table scrolling, keyboard/dialog focus/Escape, reduced motion, relevant Axe; all foundation/identity tests preserved                                                        |

## Operational release scenarios still pending

| #   | Required scenario                          | Current evidence                                                                                       |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 1   | Anonymous counter sale                     | Pending Phase 5                                                                                        |
| 2   | Customer-linked sale                       | Registry implemented; sale linkage/transaction pending Phase 5                                         |
| 3   | WhatsApp order paid at pickup              | Pending Phase 5                                                                                        |
| 4   | Unpaid handover rejected                   | Pending Phase 5                                                                                        |
| 5   | Payment before pickup                      | Pending Phase 5                                                                                        |
| 6   | Unpaid cancellation releases reservation   | Pending Phases 4/5                                                                                     |
| 7   | Paid unfulfilled refund/cancellation       | Pending Phases 5/6                                                                                     |
| 8   | Fulfilled refund without automatic restock | Pending Phase 5                                                                                        |
| 9   | Double-click sale idempotency              | Pending Phase 5                                                                                        |
| 10  | Retried production completion              | Pending Phase 4                                                                                        |
| 11  | Concurrent final-unit allocation           | Pending PostgreSQL concurrency tests in Phase 4                                                        |
| 12  | Expired batch blocked                      | Pending Phase 4                                                                                        |
| 13  | Excess waste rejected                      | Pending Phase 4                                                                                        |
| 14  | Reserved-stock disposal rejected           | Pending Phase 4                                                                                        |
| 15  | Old order totals survive price changes     | Catalog repricing audited; order item snapshots/end-to-end preservation pending Phase 5                |
| 16  | Unauthorized refund                        | Identity/authorization foundation implemented; refund endpoint and enforcement pending Phase 5         |
| 17  | Unauthorized customer export               | Verified Phase 3 backend denial and role-aware UI; minimal owner-only export                           |
| 18  | Cash tender/change                         | Pending Phase 5; money parser alone does not verify this                                               |
| 19  | Pix/card excluded from drawer              | Pending Phase 6                                                                                        |
| 20  | Closing discrepancy                        | Pending Phase 6                                                                                        |
| 21  | Closed-session changes rejected            | Pending Phase 6                                                                                        |
| 22  | CSV import duplicate review                | Verified Phase 3 unit/PostgreSQL/browser mapping, row/DB duplicates, atomic retry and stale review     |
| 23  | Malformed money/quantity                   | Pure parsers/shared request schemas tested; operational form/API integration pending                   |
| 24  | Fortaleza business-day boundaries          | Pure helper tests pass, including midnight, year change and leap day; report query integration pending |
| 25  | Connection loss after sale                 | Pending Phase 5; only foundation status failure/retry is browser tested                                |
| 26  | Restart preserves operational data         | Registry DB persistence and pending-preview restart behavior tested; full operational restart Phase 8  |
| 27  | Backup restore                             | Pending Phase 8                                                                                        |
| 28  | Dashboard/report reconciliation            | Pending Phase 7                                                                                        |
| 29  | Inactive product retained in history       | Catalog/category references retained; sales-history references pending Phase 5                         |
| 30  | Ordinary operations without internet       | Pending Phase 8; foundation assets load with external browser requests blocked                         |

Additional foundation evidence: real PostgreSQL migration/readiness, production entrypoint regression, safe structured errors, correlation IDs, no public default binding, desktop/mobile overflow, dialog keyboard behavior, settings filters/pagination and automated contrast/accessibility checks. See PROGRESS.md for actual counts and execution results.
