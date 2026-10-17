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

## Operational release scenarios still pending

| #   | Required scenario                          | Current evidence                                                                                       |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 1   | Anonymous counter sale                     | Pending Phase 5                                                                                        |
| 2   | Customer-linked sale                       | Pending Phases 3/5                                                                                     |
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
| 15  | Old order totals survive price changes     | Pending Phases 3/5                                                                                     |
| 16  | Unauthorized refund                        | Identity/authorization foundation implemented; refund endpoint and enforcement pending Phase 5         |
| 17  | Unauthorized customer export               | Identity/authorization foundation implemented; customer export enforcement pending Phase 3             |
| 18  | Cash tender/change                         | Pending Phase 5; money parser alone does not verify this                                               |
| 19  | Pix/card excluded from drawer              | Pending Phase 6                                                                                        |
| 20  | Closing discrepancy                        | Pending Phase 6                                                                                        |
| 21  | Closed-session changes rejected            | Pending Phase 6                                                                                        |
| 22  | CSV import duplicate review                | Pending Phase 3; only safe CSV cell escaping is currently unit tested                                  |
| 23  | Malformed money/quantity                   | Pure parsers/shared request schemas tested; operational form/API integration pending                   |
| 24  | Fortaleza business-day boundaries          | Pure helper tests pass, including midnight, year change and leap day; report query integration pending |
| 25  | Connection loss after sale                 | Pending Phase 5; only foundation status failure/retry is browser tested                                |
| 26  | Restart preserves operational data         | Pending Phase 8; no operational records exist yet                                                      |
| 27  | Backup restore                             | Pending Phase 8                                                                                        |
| 28  | Dashboard/report reconciliation            | Pending Phase 7                                                                                        |
| 29  | Inactive product retained in history       | Pending Phases 3/5                                                                                     |
| 30  | Ordinary operations without internet       | Pending Phase 8; foundation assets load with external browser requests blocked                         |

Additional foundation evidence: real PostgreSQL migration/readiness, production entrypoint regression, safe structured errors, correlation IDs, no public default binding, desktop/mobile overflow, dialog keyboard behavior, settings filters/pagination and automated contrast/accessibility checks. See PROGRESS.md for actual counts and execution results.
