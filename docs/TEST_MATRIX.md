# Current Phase 6 coverage

Actual executed results and gate status are in PROGRESS.md. All Phase 0–5 regressions remain enabled; Phase 6 adds six unit/API cases, 38 PostgreSQL cases and 17 production-browser cases.

| Required cash groups                                                           | Evidence                                                                     |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| 1–3 populated upgrade, one active opening, retry                               | cash.integration 1–3; genuine five-migration fixture; browser opening        |
| 4–8 cash amount/tender, methods, current/older refunds                         | Integration 4–8; cash unit formula/methods; browser method detail            |
| 9–15 additions/withdrawals/expenses, validation/floor/retry/append-only        | Integration 9–15; browser movement forms, insufficient outflow               |
| 16–19 immutable counted closing, explanation/stale/concurrency                 | Integration 16–19; browser counted difference/reload; unit signed count      |
| 20–25 payment/checkout/refund/movement close races, closed writes/next session | Integration 20–25 and stock reconciliation 36                                |
| 26–28 overnight/unpaid, review, linked current-session reversal                | Integration 26–28; browser review/reversal and immutable totals              |
| 29–32 roles/revocation/exact guards/key mismatch                               | Integration 29–32; browser OWNER/MANAGER/CASHIER/PRODUCTION and retry/lookup |
| 33–36 drift/direct SQL/privacy/inventory                                       | Integration 33–36; safe DTO/source counters and no repair                    |
| Atomic audit failure / financial source corruption                             | Additional integration 37–38; no product bypass                              |
| Keyboard/Axe/desktop/narrow                                                    | cash browser final case; screenshots visually inspected at checkpoint        |

No full bank/card settlement reconciliation, cash export, accounting, supplier/payables, business dashboard, backup/restore or human pilot acceptance is implied. Phase 7 full reporting, Phase 8 recovery/installation and Phase 9 pilot remain pending.

## Historical Phase 5 coverage (then-future cash statements superseded above)

Acceptance status and actual counts are in PROGRESS.md; coverage alone does not assert a passing gate. All Phase 0–4 regressions remained enabled. Phase 5 adds 5 shared unit cases, 40 real PostgreSQL cases and 18 production-browser cases.

| Required Phase 5 groups                                                                                                 | Evidence                                                                    |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Counter anonymous/linked, price review, discounts, atomic rollback, final units, duplicate retry, multi-product failure | Integration 1–8, 41; browser POS/price/lost-response                        |
| WhatsApp suitable pickup, expiry block, cancellation/recreation, unpaid rejection, pay before/at pickup                 | Integration 9–14; browser draft/confirm/prepare/ready/payment/handover      |
| Concurrent payment, payment/cancel, handover/cancel, double handover, release once                                      | Integration 15–19; browser payment/cancellation                             |
| Paid cancellation full refund/release rollback, fulfilled no-restock refund, concurrent refunds                         | Integration 20–22, 41; browser paid cancellation/refunded fulfilled history |
| Cash prerequisite, one opening, tender/change, electronic exclusion                                                     | Integration 23–26; browser explicit opening and payment fields              |
| Role/PII/cost projections, revocation, CSRF/Origin/Host, stale edits, anonymization, product status                     | Integration 27–32; browser role/stale/history                               |
| Ownership/financial SQL, clean/four-baseline upgrade preservation, Fortaleza boundaries                                 | Integration 33–36/database.ts; deploy/status/diff; Asia/Tokyo browser       |
| Payload mismatch, uncertain lookup, zero-total rejection, ledger reconciliation                                         | Integration 37–40; genuinely committed browser response-loss retry/lookup   |
| Portuguese forms/native dialogs, keyboard, 1366×768/390×844, Axe                                                        | Sales browser layout and retained regression suites                         |

Full counted cash closing/movements/differences/review are Phase 6; reports Phase 7; verified full backup/restore/install Phase 8; human store-day/pilot Phase 9. Historical sections below describe previous checkpoints; then-pending Phase 5 entries are superseded above.

# Required scenario matrix

Status describes executed evidence, not intentions. Phases 0–4 are covered below; sales/payment/cash and later release scenarios remain intentionally unavailable. Current command results and gate status are in PROGRESS.md.

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

## Phase 4 inventory/production evidence

| Required cases                                | Evidence                                                                                                                                                                                                                    |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–2 opening/duplicate retry                   | Traceable batch/ledger/server time, concurrent identity reuse and unchanged physical total                                                                                                                                  |
| 3–6 planning/actual/completion retry/rollback | Plan/start no stock; actual only, same-key race once; final audit failure rolls back source/batch/ledger/result                                                                                                             |
| 7–9 origins/receipt/cost                      | Produced/purchased restrictions, concurrent receipt once, historical optional cost without catalog overwrite                                                                                                                |
| 10–13 ledger/reserve/FEFO/unknown             | Ledger equals projections; reservation does not remove physical; spans batches; explicit unknown last                                                                                                                       |
| 14–16 expiry/Fortaleza/final units            | Physical retained/blocked, injected-clock midnight/day-end, competing requests cannot overallocate                                                                                                                          |
| 17–21 release/consume/race/expired/future     | Whole terminal actions idempotent, race one outcome, expired allocation remains/rejects consume, future date filters                                                                                                        |
| 22–25 waste/adjustment/races                  | Unreserved bounds, explicit expired disposal, waste-allocation and adjustment-allocation preserve nonnegative state/versions                                                                                                |
| 26–29 privacy/permissions/CSRF/revocation     | Cost omitted from restricted selects, cashier detailed paths denied, production waste scope, every mutation exact guards, revocation under lock                                                                             |
| 30–31 idempotency/multi-product rollback      | Changed payload conflicts, actor-owned lookup; insufficient later line rolls back earlier allocation and operation                                                                                                          |
| 32–34 SQL/history/reconciliation              | Bounds/composite identities/atomic result constraints, ledger and metadata immutability, privileged test-only drift diagnosed without repair                                                                                |
| 35–38 product changes/upgrade/overflow/loss   | Concurrent deactivation/origin policy, foundation/identity/registry preserved, numeric/BigInt string totals, no phantom waste for shortfall/cancellation                                                                    |
| Additional production/corrections/audit       | PRODUCTION positive lifecycle and permitted waste; explicit new-batch positive and compensating adjustment; no supplier/notes payload in audit/result                                                                       |
| Unit                                          | Units, signs, eligibility/FEFO/BigInt, canonical equality, permissions, production state/shortfall, bounded transient classification                                                                                        |
| Browser                                       | 13 new scenarios with lifecycle/details, opening validation/expiry, receipt/cost, waste/adjust/history, unknown expiry, stale review, committed response-loss retry/lookup, roles, filters/page, keyboard/dialog/layout/Axe |

All 41 inventory scenarios execute against real isolated PostgreSQL, alongside 63 retained tests. Browser counts and final gate are recorded in PROGRESS.md, not inferred from this coverage map. Internal reservation tests do not certify real orders, payment prerequisites or cashier consumption.

## Remaining operational release scenarios

| #   | Required scenario                          | Current evidence                                                                                       |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 1   | Anonymous counter sale                     | Pending Phase 5                                                                                        |
| 2   | Customer-linked sale                       | Registry implemented; sale linkage/transaction pending Phase 5                                         |
| 3   | WhatsApp order paid at pickup              | Pending Phase 5                                                                                        |
| 4   | Unpaid handover rejected                   | Pending Phase 5                                                                                        |
| 5   | Payment before pickup                      | Pending Phase 5                                                                                        |
| 6   | Unpaid cancellation releases reservation   | Internal idempotent release verified; genuine order cancellation integration pending Phase 5           |
| 7   | Paid unfulfilled refund/cancellation       | Pending Phases 5/6                                                                                     |
| 8   | Fulfilled refund without automatic restock | Pending Phase 5                                                                                        |
| 9   | Double-click sale idempotency              | Pending Phase 5                                                                                        |
| 10  | Retried production completion              | Verified Phase 4 PostgreSQL same-key concurrency and browser duplicate/uncertain-result flows          |
| 11  | Concurrent final-unit allocation           | Verified Phase 4 real PostgreSQL; genuine order integration remains Phase 5                            |
| 12  | Expired batch blocked                      | Verified Phase 4 controlled-clock PostgreSQL and browser labels                                        |
| 13  | Excess waste rejected                      | Verified Phase 4 real PostgreSQL bounds/races and stale form                                           |
| 14  | Reserved-stock disposal rejected           | Verified Phase 4 real PostgreSQL, no silent release                                                    |
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
