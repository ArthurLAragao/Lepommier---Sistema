# Metric definitions

Current inventory/batch reconciliation, production lists, order/sale history and customer-linked purchase/payment/refund history are implemented through Phase 5. General financial dashboards/reports and cash reconciliation below remain future queries. Customer fulfilled purchase total is the sum of linked FULFILLED order totals after discounts before refunds; last purchase uses fulfillment time. Payments and refunds are separate lifetime sums of their own records, including cancelled orders. Order intake is never added to fulfilled sales. This is only recorded system history. No zero revenue/profit figures substitute for missing modules. Receipt purchase cost is a restricted historical snapshot; no discarded-cost/retail-loss report is calculated in this phase.

## Implemented inventory quantities

Physical = signed ledger sum, including expired units not disposed. Reserved = sum(allocated − released − consumed). Available sellable = sum(physical − reserved) over batches eligible on Fortaleza today; future allocation additionally requires expiry through its requested date. Blocked = physical in expired batches. Expired reserved = outstanding allocations in expired batches, an overlapping exception subset. Do not sum blocked and reserved as disjoint categories. Expiry day itself is eligible; unknown-expiry batches require an explicit acknowledgement and sort last, without a food-safety guarantee.

Production list reports planned and actual received quantities separately; only completed actual units enter stock. Yield shortfall = max(planned − actual, 0), without another stock deduction. Movement time is server recorded time; no backdated effective date is supported. Batch/product reconciliation compares immutable ledger sums, maintained projections and outstanding allocations, returns findings and never repairs automatically. Totals are decimal strings/BigInt with PostgreSQL numeric aggregates, avoiding int32/JavaScript precision loss. See INVENTORY_INVARIANTS.md. Historical sellable availability at arbitrary date X is not claimed.

All daily ranges are **[00:00 of selected America/Fortaleza business date, 00:00 of following business date)**. Store timestamps as UTC instants. Browser timezone must not choose the report day. A refund uses its own recorded timestamp and does not rewrite the original fulfilled-sales day.

| Metric                             | Definition                                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Fulfilled sales count              | Orders whose fulfillment timestamp is in range; each counted once                                     |
| Gross fulfilled sales              | Sum of snapshot unit price × fulfilled item units, before order discounts                             |
| Discounts                          | Sum of discounts on those fulfilled orders                                                            |
| Net fulfilled sales before refunds | Gross fulfilled sales minus those discounts                                                           |
| Refunds recorded                   | Sum of full refunds recorded in range, including refunds of older orders                              |
| Payments received                  | Successful full payments recorded in range, including future pickups                                  |
| Receipts by method                 | Payments grouped by cash/Pix/debit/credit, refund activity shown separately                           |
| Unpaid pickups                     | Confirmed/preparing/ready orders awaiting payment; exclude drafts/cancelled/fulfilled                 |
| Upcoming pickups                   | Unfulfilled confirmed orders ordered by scheduled pickup instant                                      |
| Production                         | Actual units on production records completed in range; never planned units                            |
| Units sold                         | Fulfilled item quantities by snapshot product identity in range                                       |
| Waste                              | Waste ledger units grouped by product, batch and reason in range                                      |
| Estimated discarded cost           | Discarded units × recorded estimated unit cost; unknown cost remains unknown                          |
| Potential retail value discarded   | Discarded units × recorded retail price; not an actual financial loss                                 |
| Stock alert                        | Eligible available stock at or below configured low-stock threshold                                   |
| Customer fulfilled purchase total  | Historical net fulfilled sales before refunds, with refunds shown separately; never open order intake |
| Last customer purchase             | Most recent fulfillment instant, not draft/payment date                                               |

Order intake is separate from fulfilled sales. Receipts are not profit. Do not sum intake with fulfillment. Reliable net profit is unavailable until costs, expenses and accounting policies are modeled.

## Daily product reconciliation

Opening physical on-hand (all movements before range) + production receipts + purchased receipts − fulfillment consumption − waste + eligible returns + signed adjustments + opening entries in range = closing physical on-hand. Report active reservations separately and isolate expired/blocked units from sellable availability. Each row must link to its ledger basis; no hidden mutable product quantity is authoritative.

## Cash reconciliation

Physical expected cash = opening float + cash payment net amounts + cash additions − cash refunds − withdrawals − cash expenses. Gross tender is not receipt value. Pix/cards do not affect physical drawer. Difference = counted closing cash − expected cash. Preserve snapshot at closure.

## Required query checks

Compare dashboard to underlying rows for every metric. Include boundary instants, future paid pickups, past-sale refunds, late movements, deactivated products, anonymous sales and cancelled orders. CSV exports use the same filters/definitions and backend permissions. Introduce charts only after matching tabular queries are implemented and tested.

Phase 5 cash foundation records opening float and current-session payment/refund links; it does not calculate an accepted closing drawer figure. CASH receipts count order amount, not tender; change is tender minus amount. PIX/card never increase physical cash. Full refunds of old payments belong to their new recording session/date. No Phase 7 business reporting or profitability claim is made.
