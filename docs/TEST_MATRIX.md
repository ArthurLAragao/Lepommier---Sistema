# Required scenario matrix

Status describes implemented evidence, not intentions. Most scenarios depend on modules intentionally unavailable in the current foundation.

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
| 16  | Unauthorized refund                        | Pending Phases 2/5                                                                                     |
| 17  | Unauthorized customer export               | Pending Phases 2/3                                                                                     |
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
